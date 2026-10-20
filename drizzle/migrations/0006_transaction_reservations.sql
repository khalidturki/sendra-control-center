CREATE TABLE public.transaction_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  installation_id text NOT NULL CHECK (length(installation_id) BETWEEN 8 AND 200),
  transaction_id text NOT NULL CHECK (transaction_id ~ '^[0-9a-f]{64}$'),
  attempt_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT public.usage_today(),
  status text NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED', 'FINALIZED', 'RELEASED')),
  outcome text CHECK (outcome IS NULL OR outcome IN ('SUCCESS', 'FAILED', 'UNKNOWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (client_id, attempt_id),
  CHECK (
    (status = 'RESERVED' AND resolved_at IS NULL AND (outcome IS NULL OR outcome = 'UNKNOWN'))
    OR (status = 'FINALIZED' AND outcome = 'SUCCESS' AND resolved_at IS NOT NULL)
    OR (status = 'RELEASED' AND outcome = 'FAILED' AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX transaction_reservations_client_transaction_uidx
  ON public.transaction_reservations(client_id, transaction_id);
CREATE INDEX transaction_reservations_client_day_status_idx
  ON public.transaction_reservations(client_id, usage_date, status);

ALTER TABLE public.transaction_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transaction_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transaction_reservations TO authenticated;
GRANT ALL ON public.transaction_reservations TO service_role;
CREATE POLICY "Admins read transaction reservations"
  ON public.transaction_reservations FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public._sub_state(_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.clients;
  s public.subscriptions;
  p public.plans;
  used integer;
  reserved integer;
  today date;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = _client_id;
  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions WHERE client_id = c.id
   ORDER BY (status = 'ACTIVE') DESC, (status IN ('PENDING','SUSPENDED')) DESC, created_at DESC LIMIT 1;
  today := public.usage_today();
  SELECT count(*) INTO used FROM public.usage_records
   WHERE client_id = c.id AND usage_date = today;
  SELECT count(*) INTO reserved FROM public.transaction_reservations
   WHERE client_id = c.id AND usage_date = today AND status = 'RESERVED';
  IF s.id IS NULL THEN
    RETURN jsonb_build_object(
      'client_id', c.client_code, 'status', NULL, 'allowed', false,
      'reason', 'NO_SUBSCRIPTION', 'used_today', used, 'reserved_today', reserved,
      'remaining_today', 0, 'usage_date', today);
  END IF;
  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
  RETURN jsonb_build_object(
    'client_id', c.client_code, 'status', s.status, 'plan_id', p.id, 'plan', p.name,
    'daily_limit', p.daily_limit, 'unlimited', p.daily_limit IS NULL,
    'used_today', used, 'reserved_today', reserved,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL
                            ELSE greatest(p.daily_limit - used - reserved, 0) END,
    'usage_date', today, 'start_date', s.start_date, 'expiry_date', s.expiry_date,
    'allowed', s.status = 'ACTIVE' AND s.expiry_date > now()
      AND (p.daily_limit IS NULL OR used + reserved < p.daily_limit),
    'reason', CASE
      WHEN s.status = 'PENDING' THEN 'PENDING_APPROVAL'
      WHEN s.status = 'SUSPENDED' THEN 'SUSPENDED'
      WHEN s.status = 'EXPIRED' OR s.expiry_date <= now() THEN 'EXPIRED'
      WHEN p.daily_limit IS NOT NULL AND used + reserved >= p.daily_limit THEN 'DAILY_LIMIT_REACHED'
      ELSE 'OK' END);
END $$;

CREATE OR REPLACE FUNCTION public._record_tx(
  _client_id uuid,
  _transaction_id text,
  _status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.subscriptions;
  p public.plans;
  used integer;
  reserved integer;
  today date;
  ins_id uuid;
BEGIN
  IF _transaction_id IS NULL OR length(trim(_transaction_id)) = 0 OR length(_transaction_id) > 200 THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'INVALID_TRANSACTION_ID');
  END IF;
  IF upper(coalesce(_status, '')) <> 'SUCCESS' THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'NOT_SUCCESSFUL');
  END IF;

  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions
   WHERE client_id = _client_id AND status = 'ACTIVE' AND expiry_date > now()
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'NO_ACTIVE_SUBSCRIPTION');
  END IF;
  IF EXISTS (SELECT 1 FROM public.usage_records
             WHERE client_id = _client_id AND transaction_id = _transaction_id) THEN
    RETURN jsonb_build_object('counted', false, 'duplicate', true, 'reason', 'DUPLICATE');
  END IF;
  IF EXISTS (SELECT 1 FROM public.transaction_reservations
             WHERE client_id = _client_id AND transaction_id = _transaction_id) THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'TRANSACTION_RESERVED');
  END IF;
  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
  today := public.usage_today();
  SELECT count(*) INTO used FROM public.usage_records
   WHERE client_id = _client_id AND usage_date = today;
  SELECT count(*) INTO reserved FROM public.transaction_reservations
   WHERE client_id = _client_id AND usage_date = today AND status = 'RESERVED';
  IF p.daily_limit IS NOT NULL AND used + reserved >= p.daily_limit THEN
    RETURN jsonb_build_object(
      'counted', false, 'reason', 'DAILY_LIMIT_REACHED',
      'used_today', used, 'reserved_today', reserved, 'daily_limit', p.daily_limit);
  END IF;

  INSERT INTO public.usage_records (client_id, subscription_id, transaction_id, usage_date)
  VALUES (_client_id, s.id, _transaction_id, today)
  ON CONFLICT (client_id, transaction_id) DO NOTHING RETURNING id INTO ins_id;
  IF ins_id IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'duplicate', true, 'reason', 'DUPLICATE');
  END IF;
  RETURN jsonb_build_object(
    'counted', true, 'reason', 'OK', 'used_today', used + 1,
    'daily_limit', p.daily_limit,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL
                            ELSE greatest(p.daily_limit - used - reserved - 1, 0) END);
END $$;

CREATE OR REPLACE FUNCTION public.customer_record_transaction(
  _installation_id text,
  _transaction_id text,
  _status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.clients;
BEGIN
  c := public._customer_client();
  IF public._device_status(c.id, coalesce(_installation_id, '')) <> 'APPROVED' THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'DEVICE_NOT_APPROVED');
  END IF;
  RETURN jsonb_build_object('counted', false, 'reason', 'RESERVATION_REQUIRED');
END $$;

CREATE FUNCTION public.customer_reserve_transaction(
  _installation_id text,
  _transaction_id text,
  _attempt_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.clients;
  s public.subscriptions;
  p public.plans;
  today date;
  used integer;
  reserved integer;
  reservation public.transaction_reservations;
BEGIN
  c := public._customer_client();
  IF _installation_id IS NULL OR length(_installation_id) NOT BETWEEN 8 AND 200
     OR _transaction_id IS NULL OR _transaction_id !~ '^[0-9a-f]{64}$'
     OR _attempt_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'INVALID_REQUEST');
  END IF;
  IF public._device_status(c.id, _installation_id) <> 'APPROVED' THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'DEVICE_NOT_APPROVED');
  END IF;

  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions
   WHERE client_id = c.id AND status = 'ACTIVE' AND expiry_date > now()
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'NO_ACTIVE_SUBSCRIPTION');
  END IF;

  SELECT * INTO reservation FROM public.transaction_reservations
   WHERE client_id = c.id AND transaction_id = _transaction_id
   FOR UPDATE;
  IF FOUND THEN
    IF reservation.installation_id = _installation_id
       AND reservation.attempt_id = _attempt_id
       AND reservation.status = 'RESERVED' THEN
      SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
      today := public.usage_today();
      SELECT count(*) INTO used FROM public.usage_records
       WHERE client_id = c.id AND usage_date = today;
      SELECT count(*) INTO reserved FROM public.transaction_reservations
       WHERE client_id = c.id AND usage_date = today AND status = 'RESERVED';
      RETURN jsonb_build_object(
        'authorized', true, 'reservation_id', reservation.id,
        'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL
                                ELSE greatest(p.daily_limit - used - reserved, 0) END);
    END IF;
    RETURN jsonb_build_object('authorized', false, 'reason', 'DUPLICATE_TRANSACTION');
  END IF;

  IF EXISTS (SELECT 1 FROM public.usage_records
             WHERE client_id = c.id AND transaction_id = _transaction_id) THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'DUPLICATE_TRANSACTION');
  END IF;
  IF EXISTS (SELECT 1 FROM public.transaction_reservations
             WHERE client_id = c.id AND attempt_id = _attempt_id) THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'ATTEMPT_ALREADY_USED');
  END IF;
  IF EXISTS (SELECT 1 FROM public.transaction_reservations
             WHERE client_id = c.id AND transaction_id = _transaction_id) THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'DUPLICATE_TRANSACTION');
  END IF;

  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
  today := public.usage_today();
  SELECT count(*) INTO used FROM public.usage_records
   WHERE client_id = c.id AND usage_date = today;
  SELECT count(*) INTO reserved FROM public.transaction_reservations
   WHERE client_id = c.id AND usage_date = today AND status = 'RESERVED';
  IF p.daily_limit IS NOT NULL AND used + reserved >= p.daily_limit THEN
    RETURN jsonb_build_object(
      'authorized', false, 'reason', 'DAILY_LIMIT_REACHED',
      'used_today', used, 'reserved_today', reserved, 'daily_limit', p.daily_limit);
  END IF;

  INSERT INTO public.transaction_reservations (
    client_id, subscription_id, installation_id, transaction_id,
    attempt_id, usage_date
  ) VALUES (
    c.id, s.id, _installation_id, _transaction_id, _attempt_id, today
  ) RETURNING * INTO reservation;

  RETURN jsonb_build_object(
    'authorized', true, 'reservation_id', reservation.id,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL
                            ELSE greatest(p.daily_limit - used - reserved - 1, 0) END);
END $$;

CREATE FUNCTION public.customer_finalize_transaction(
  _installation_id text,
  _reservation_id uuid,
  _transaction_id text,
  _outcome text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.clients;
  reservation public.transaction_reservations;
  ins_id uuid;
  p public.plans;
  used integer;
BEGIN
  c := public._customer_client();
  IF _installation_id IS NULL OR length(_installation_id) NOT BETWEEN 8 AND 200
     OR _reservation_id IS NULL OR _transaction_id IS NULL
     OR _transaction_id !~ '^[0-9a-f]{64}$'
     OR upper(coalesce(_outcome, '')) NOT IN ('SUCCESS', 'UNKNOWN') THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'INVALID_REQUEST');
  END IF;

  SELECT * INTO reservation FROM public.transaction_reservations
   WHERE id = _reservation_id AND client_id = c.id
     AND installation_id = _installation_id AND transaction_id = _transaction_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'RESERVATION_NOT_FOUND');
  END IF;
  IF upper(_outcome) = 'UNKNOWN' THEN
    UPDATE public.transaction_reservations
       SET outcome = 'UNKNOWN'
     WHERE id = reservation.id AND status = 'RESERVED';
    RETURN jsonb_build_object(
      'finalized', false, 'reserved', reservation.status = 'RESERVED',
      'reason', CASE WHEN reservation.status = 'RESERVED' THEN 'OUTCOME_UNKNOWN'
                     ELSE 'RESERVATION_ALREADY_RESOLVED' END);
  END IF;
  IF reservation.status = 'FINALIZED' AND reservation.outcome = 'SUCCESS' THEN
    RETURN jsonb_build_object('finalized', true, 'counted', true, 'already_finalized', true);
  END IF;
  IF reservation.status <> 'RESERVED' THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'RESERVATION_ALREADY_RESOLVED');
  END IF;

  INSERT INTO public.usage_records (client_id, subscription_id, transaction_id, usage_date)
  VALUES (
    reservation.client_id, reservation.subscription_id,
    reservation.transaction_id, reservation.usage_date
  ) ON CONFLICT (client_id, transaction_id) DO NOTHING
  RETURNING id INTO ins_id;

  UPDATE public.transaction_reservations
     SET status = 'FINALIZED', outcome = 'SUCCESS',
         resolved_at = now(), resolved_by = auth.uid()
   WHERE id = reservation.id;

  SELECT count(*) INTO used FROM public.usage_records
   WHERE client_id = reservation.client_id AND usage_date = reservation.usage_date;
  SELECT plans.* INTO p
    FROM public.plans AS plans
    JOIN public.subscriptions AS subscriptions ON subscriptions.plan_id = plans.id
   WHERE subscriptions.id = reservation.subscription_id;

  RETURN jsonb_build_object(
    'finalized', true, 'counted', ins_id IS NOT NULL,
    'already_counted', ins_id IS NULL, 'used_today', used,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL
                            ELSE greatest(p.daily_limit - used, 0) END);
END $$;

CREATE FUNCTION public.admin_reconcile_transaction(
  _reservation_id uuid,
  _outcome text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reservation public.transaction_reservations;
  ins_id uuid;
  p public.plans;
  used integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF _reservation_id IS NULL OR upper(coalesce(_outcome, '')) NOT IN ('SUCCESS', 'FAILED') THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'INVALID_REQUEST');
  END IF;

  SELECT * INTO reservation FROM public.transaction_reservations
   WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'RESERVATION_NOT_FOUND');
  END IF;
  IF reservation.status = 'FINALIZED' AND reservation.outcome = 'SUCCESS'
     AND upper(_outcome) = 'SUCCESS' THEN
    RETURN jsonb_build_object('finalized', true, 'already_finalized', true, 'counted', true);
  END IF;
  IF reservation.status = 'RELEASED' AND reservation.outcome = 'FAILED'
     AND upper(_outcome) = 'FAILED' THEN
    RETURN jsonb_build_object('finalized', true, 'already_finalized', true, 'released', true);
  END IF;
  IF reservation.status <> 'RESERVED' THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'RESERVATION_ALREADY_RESOLVED');
  END IF;

  IF upper(_outcome) = 'FAILED' THEN
    UPDATE public.transaction_reservations
       SET status = 'RELEASED', outcome = 'FAILED',
           resolved_at = now(), resolved_by = auth.uid()
     WHERE id = reservation.id;
    RETURN jsonb_build_object('finalized', true, 'released', true, 'reason', 'OK');
  END IF;

  INSERT INTO public.usage_records (client_id, subscription_id, transaction_id, usage_date)
  VALUES (
    reservation.client_id, reservation.subscription_id,
    reservation.transaction_id, reservation.usage_date
  ) ON CONFLICT (client_id, transaction_id) DO NOTHING
  RETURNING id INTO ins_id;
  UPDATE public.transaction_reservations
     SET status = 'FINALIZED', outcome = 'SUCCESS',
         resolved_at = now(), resolved_by = auth.uid()
   WHERE id = reservation.id;
  SELECT count(*) INTO used FROM public.usage_records
   WHERE client_id = reservation.client_id AND usage_date = reservation.usage_date;
  SELECT plans.* INTO p
    FROM public.plans AS plans
    JOIN public.subscriptions AS subscriptions ON subscriptions.plan_id = plans.id
   WHERE subscriptions.id = reservation.subscription_id;
  RETURN jsonb_build_object(
    'finalized', true, 'counted', ins_id IS NOT NULL,
    'already_counted', ins_id IS NULL, 'used_today', used,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL
                            ELSE greatest(p.daily_limit - used, 0) END);
END $$;

CREATE FUNCTION public.admin_list_pending_transaction_reservations(
  _limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) INTO result
    FROM (
      SELECT id AS reservation_id, client_id, subscription_id, installation_id,
             transaction_id, attempt_id, usage_date, outcome, created_at
        FROM public.transaction_reservations
       WHERE status = 'RESERVED'
       ORDER BY created_at
       LIMIT greatest(1, least(coalesce(_limit, 100), 500))
    ) AS rows;
  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION public.customer_reserve_transaction(text, text, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.customer_finalize_transaction(text, uuid, text, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reconcile_transaction(uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_pending_transaction_reservations(integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_reserve_transaction(text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_finalize_transaction(text, uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_transaction(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_transaction_reservations(integer)
  TO authenticated;
