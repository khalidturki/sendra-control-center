-- Customer accounts link to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE;

-- Payment configuration
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS payment_recipient text NOT NULL DEFAULT '8101398',
  ADD COLUMN IF NOT EXISTS ussd_template text NOT NULL DEFAULT '*880*8101398*AMOUNT#',
  ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '+252657504834';

-- Payment requests
CREATE TYPE public.payment_request_kind AS ENUM ('PURCHASE','RENEWAL','PLAN_CHANGE');
CREATE TYPE public.review_status AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  kind public.payment_request_kind NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  status public.review_status NOT NULL DEFAULT 'PENDING',
  payer_phone text CHECK (payer_phone IS NULL OR length(payer_phone) <= 30),
  reference text CHECK (reference IS NULL OR length(reference) <= 200),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_requests_one_pending ON public.payment_requests(client_id) WHERE status = 'PENDING';
CREATE INDEX payment_requests_status_idx ON public.payment_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payment requests" ON public.payment_requests FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER payment_requests_updated_at BEFORE UPDATE ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_payment_requests AFTER INSERT OR UPDATE OR DELETE ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Devices
CREATE TYPE public.device_status AS ENUM ('PENDING','APPROVED','REJECTED','REVOKED');
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  installation_id text NOT NULL CHECK (length(installation_id) BETWEEN 8 AND 200),
  device_name text CHECK (device_name IS NULL OR length(device_name) <= 120),
  status public.device_status NOT NULL DEFAULT 'PENDING',
  reviewed_by uuid,
  reviewed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, installation_id)
);
CREATE UNIQUE INDEX devices_one_approved ON public.devices(client_id) WHERE status = 'APPROVED';
CREATE INDEX devices_status_idx ON public.devices(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage devices" ON public.devices FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_devices AFTER INSERT OR UPDATE OR DELETE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Daily summaries (kept 90 days)
CREATE TABLE public.daily_usage_summary (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  success_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, usage_date)
);
CREATE INDEX daily_usage_summary_date_idx ON public.daily_usage_summary(usage_date);
GRANT SELECT ON public.daily_usage_summary TO authenticated;
GRANT ALL ON public.daily_usage_summary TO service_role;
ALTER TABLE public.daily_usage_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read usage summary" ON public.daily_usage_summary FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.daily_usage_summary (client_id, usage_date, success_count)
SELECT client_id, usage_date, count(*) FROM public.usage_records GROUP BY client_id, usage_date;

CREATE FUNCTION public.bump_usage_summary() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.daily_usage_summary (client_id, usage_date, success_count) VALUES (NEW.client_id, NEW.usage_date, 1)
  ON CONFLICT (client_id, usage_date) DO UPDATE SET success_count = daily_usage_summary.success_count + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER usage_records_summary AFTER INSERT ON public.usage_records FOR EACH ROW EXECUTE FUNCTION public.bump_usage_summary();

CREATE FUNCTION public.run_usage_retention() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t date := public.usage_today(); a integer; b integer;
BEGIN
  DELETE FROM public.usage_records WHERE usage_date < t - 30; GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.daily_usage_summary WHERE usage_date < t - 90; GET DIAGNOSTICS b = ROW_COUNT;
  PERFORM public.mark_expired_subscriptions();
  RETURN jsonb_build_object('events_deleted', a, 'summaries_deleted', b);
END $$;
REVOKE EXECUTE ON FUNCTION public.run_usage_retention() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_usage_summary() FROM PUBLIC, anon, authenticated;

-- Internal helpers (not callable by API roles)
CREATE FUNCTION public._sub_state(_client_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; s public.subscriptions; p public.plans; used integer; today date;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = _client_id;
  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions WHERE client_id = c.id
   ORDER BY (status = 'ACTIVE') DESC, (status IN ('PENDING','SUSPENDED')) DESC, created_at DESC LIMIT 1;
  today := public.usage_today();
  SELECT count(*) INTO used FROM public.usage_records WHERE client_id = c.id AND usage_date = today;
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('client_id', c.client_code, 'status', NULL, 'allowed', false, 'reason', 'NO_SUBSCRIPTION', 'used_today', used, 'usage_date', today);
  END IF;
  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
  RETURN jsonb_build_object(
    'client_id', c.client_code, 'status', s.status, 'plan_id', p.id, 'plan', p.name,
    'daily_limit', p.daily_limit, 'unlimited', p.daily_limit IS NULL, 'used_today', used,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL ELSE greatest(p.daily_limit - used, 0) END,
    'usage_date', today, 'start_date', s.start_date, 'expiry_date', s.expiry_date,
    'allowed', s.status = 'ACTIVE' AND s.expiry_date > now() AND (p.daily_limit IS NULL OR used < p.daily_limit),
    'reason', CASE
      WHEN s.status = 'PENDING' THEN 'PENDING_APPROVAL'
      WHEN s.status = 'SUSPENDED' THEN 'SUSPENDED'
      WHEN s.status = 'EXPIRED' OR s.expiry_date <= now() THEN 'EXPIRED'
      WHEN p.daily_limit IS NOT NULL AND used >= p.daily_limit THEN 'DAILY_LIMIT_REACHED'
      ELSE 'OK' END);
END $$;

CREATE FUNCTION public._record_tx(_client_id uuid, _transaction_id text, _status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; p public.plans; used integer; today date; ins_id uuid;
BEGIN
  IF _transaction_id IS NULL OR length(trim(_transaction_id)) = 0 OR length(_transaction_id) > 200 THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'INVALID_TRANSACTION_ID');
  END IF;
  IF upper(coalesce(_status, '')) <> 'SUCCESS' THEN RETURN jsonb_build_object('counted', false, 'reason', 'NOT_SUCCESSFUL'); END IF;
  IF EXISTS (SELECT 1 FROM public.usage_records WHERE client_id = _client_id AND transaction_id = _transaction_id) THEN
    RETURN jsonb_build_object('counted', false, 'duplicate', true, 'reason', 'DUPLICATE');
  END IF;
  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions WHERE client_id = _client_id AND status = 'ACTIVE' AND expiry_date > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('counted', false, 'reason', 'NO_ACTIVE_SUBSCRIPTION'); END IF;
  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
  today := public.usage_today();
  SELECT count(*) INTO used FROM public.usage_records WHERE client_id = _client_id AND usage_date = today;
  IF p.daily_limit IS NOT NULL AND used >= p.daily_limit THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'DAILY_LIMIT_REACHED', 'used_today', used, 'daily_limit', p.daily_limit);
  END IF;
  INSERT INTO public.usage_records (client_id, subscription_id, transaction_id, usage_date)
  VALUES (_client_id, s.id, _transaction_id, today)
  ON CONFLICT (client_id, transaction_id) DO NOTHING RETURNING id INTO ins_id;
  IF ins_id IS NULL THEN RETURN jsonb_build_object('counted', false, 'duplicate', true, 'reason', 'DUPLICATE'); END IF;
  RETURN jsonb_build_object('counted', true, 'reason', 'OK', 'used_today', used + 1, 'daily_limit', p.daily_limit,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL ELSE p.daily_limit - used - 1 END);
END $$;

CREATE FUNCTION public._customer_client() RETURNS public.clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; m jsonb; e text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO c FROM public.clients WHERE user_id = auth.uid();
  IF FOUND THEN RETURN c; END IF;
  SELECT raw_user_meta_data, email INTO m, e FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.clients (user_id, name, email, phone)
  VALUES (auth.uid(), left(coalesce(nullif(trim(m->>'name'), ''), nullif(trim(m->>'full_name'), ''), split_part(e, '@', 1)), 120), e, left(nullif(trim(m->>'phone'), ''), 30))
  ON CONFLICT (user_id) DO NOTHING RETURNING * INTO c;
  IF c.id IS NULL THEN SELECT * INTO c FROM public.clients WHERE user_id = auth.uid(); END IF;
  RETURN c;
END $$;

CREATE FUNCTION public._device_status(_client_id uuid, _installation_id text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT status::text FROM public.devices WHERE client_id = _client_id AND installation_id = _installation_id), 'UNREGISTERED')
$$;

CREATE FUNCTION public._payment_config() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('recipient', payment_recipient, 'ussd_template', ussd_template, 'whatsapp_number', whatsapp_number, 'currency', currency, 'usage_timezone', usage_timezone)
  FROM public.app_settings LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public._sub_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._record_tx(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._customer_client() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._device_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._payment_config() FROM PUBLIC, anon, authenticated;

-- Customer (signed-in Android) functions
CREATE FUNCTION public.customer_register_device(_installation_id text, _device_name text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; d public.devices;
BEGIN
  c := public._customer_client();
  IF _installation_id IS NULL OR length(_installation_id) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid installation id'; END IF;
  SELECT * INTO d FROM public.devices WHERE client_id = c.id AND installation_id = _installation_id;
  IF NOT FOUND THEN
    INSERT INTO public.devices (client_id, installation_id, device_name) VALUES (c.id, _installation_id, left(_device_name, 120)) RETURNING * INTO d;
  ELSIF d.status IN ('REJECTED','REVOKED') THEN
    UPDATE public.devices SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL, device_name = coalesce(left(_device_name, 120), device_name) WHERE id = d.id RETURNING * INTO d;
  END IF;
  UPDATE public.devices SET last_seen_at = now() WHERE id = d.id;
  RETURN jsonb_build_object('device_id', d.id, 'device_status', d.status);
END $$;

CREATE FUNCTION public.customer_status(_installation_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; st jsonb; dev text; pr public.payment_requests;
BEGIN
  c := public._customer_client();
  st := public._sub_state(c.id);
  dev := public._device_status(c.id, coalesce(_installation_id, ''));
  IF dev <> 'UNREGISTERED' THEN UPDATE public.devices SET last_seen_at = now() WHERE client_id = c.id AND installation_id = _installation_id; END IF;
  SELECT * INTO pr FROM public.payment_requests WHERE client_id = c.id AND status = 'PENDING';
  RETURN st || jsonb_build_object(
    'name', c.name, 'email', c.email, 'phone', c.phone,
    'device_status', dev,
    'allowed', (st->>'allowed')::boolean AND dev = 'APPROVED',
    'reason', CASE WHEN (st->>'allowed')::boolean AND dev <> 'APPROVED' THEN 'DEVICE_NOT_APPROVED' ELSE st->>'reason' END,
    'pending_payment_request', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('id', pr.id, 'kind', pr.kind, 'amount', pr.amount, 'plan_id', pr.plan_id, 'created_at', pr.created_at) END,
    'payment', public._payment_config());
END $$;

CREATE FUNCTION public.customer_request_plan(_plan_id uuid, _payer_phone text DEFAULT NULL, _reference text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; p public.plans; s public.subscriptions; k public.payment_request_kind; r public.payment_requests; cfg jsonb; amt text;
BEGIN
  c := public._customer_client();
  SELECT * INTO p FROM public.plans WHERE id = _plan_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not available'; END IF;
  IF EXISTS (SELECT 1 FROM public.payment_requests WHERE client_id = c.id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'You already have a payment request awaiting review';
  END IF;
  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions WHERE client_id = c.id AND status IN ('PENDING','ACTIVE','SUSPENDED');
  IF s.status = 'SUSPENDED' THEN RAISE EXCEPTION 'Your subscription is suspended. Contact the admin.'; END IF;
  IF s.id IS NULL THEN
    SELECT * INTO s FROM public.subscriptions WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1;
    IF s.id IS NULL THEN
      INSERT INTO public.subscriptions (client_id, plan_id, price, status) VALUES (c.id, p.id, p.price, 'PENDING') RETURNING * INTO s;
      k := 'PURCHASE';
    ELSE
      k := CASE WHEN s.plan_id = p.id THEN 'RENEWAL' ELSE 'PLAN_CHANGE' END;
    END IF;
  ELSIF s.status = 'PENDING' THEN
    UPDATE public.subscriptions SET plan_id = p.id, price = p.price WHERE id = s.id RETURNING * INTO s;
    k := 'PURCHASE';
  ELSE
    k := CASE WHEN s.plan_id = p.id THEN 'RENEWAL' ELSE 'PLAN_CHANGE' END;
  END IF;
  INSERT INTO public.payment_requests (client_id, plan_id, subscription_id, kind, amount, payer_phone, reference)
  VALUES (c.id, p.id, s.id, k, p.price, left(nullif(trim(_payer_phone), ''), 30), left(nullif(trim(_reference), ''), 200)) RETURNING * INTO r;
  cfg := public._payment_config();
  amt := trim_scale(p.price)::text;
  RETURN jsonb_build_object(
    'request_id', r.id, 'kind', r.kind, 'status', r.status, 'plan', p.name, 'amount', r.amount,
    'ussd_code', replace(cfg->>'ussd_template', 'AMOUNT', amt),
    'recipient', cfg->>'recipient', 'whatsapp_number', cfg->>'whatsapp_number', 'currency', cfg->>'currency',
    'whatsapp_message', 'Sendra payment: ' || c.client_code || ' (' || c.name || ') paid ' || amt || ' ' || (cfg->>'currency') || ' for ' || p.name || ' [' || r.kind || '] ref ' || r.id);
END $$;

CREATE FUNCTION public.customer_record_transaction(_installation_id text, _transaction_id text, _status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients;
BEGIN
  c := public._customer_client();
  IF public._device_status(c.id, coalesce(_installation_id, '')) <> 'APPROVED' THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'DEVICE_NOT_APPROVED');
  END IF;
  RETURN public._record_tx(c.id, _transaction_id, _status);
END $$;

REVOKE EXECUTE ON FUNCTION public.customer_register_device(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.customer_status(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.customer_request_plan(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.customer_record_transaction(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_register_device(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_request_plan(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_record_transaction(text, text, text) TO authenticated;

-- Admin review functions
CREATE FUNCTION public.admin_review_payment(_request_id uuid, _approve boolean, _note text DEFAULT NULL) RETURNS public.payment_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payment_requests; s public.subscriptions; p public.plans;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO r FROM public.payment_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'PENDING' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;
  IF NOT _approve THEN
    UPDATE public.payment_requests SET status = 'REJECTED', admin_note = _note, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = r.id RETURNING * INTO r;
    RETURN r;
  END IF;
  SELECT * INTO p FROM public.plans WHERE id = r.plan_id;
  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions WHERE client_id = r.client_id AND status IN ('PENDING','ACTIVE','SUSPENDED');
  IF s.status = 'SUSPENDED' THEN RAISE EXCEPTION 'Reactivate the suspended subscription first'; END IF;
  IF s.id IS NULL THEN
    SELECT * INTO s FROM public.subscriptions WHERE client_id = r.client_id ORDER BY created_at DESC LIMIT 1;
    IF s.id IS NULL THEN
      INSERT INTO public.subscriptions (client_id, plan_id, price) VALUES (r.client_id, p.id, p.price) RETURNING * INTO s;
    END IF;
  END IF;
  IF s.status = 'ACTIVE' AND s.plan_id <> p.id THEN
    -- plan change: switch plan and start a fresh period now
    UPDATE public.subscriptions SET plan_id = p.id, price = p.price, start_date = now(),
      expiry_date = now() + make_interval(days => p.duration_days) WHERE id = s.id RETURNING * INTO s;
    INSERT INTO public.payments (subscription_id, client_id, amount, note, recorded_by)
    VALUES (s.id, s.client_id, r.amount, p.name || ' plan change', auth.uid());
  ELSE
    s := public.admin_activate_subscription(s.id, p.id, NULL, true, r.amount);
  END IF;
  UPDATE public.payment_requests SET status = 'APPROVED', subscription_id = s.id, admin_note = _note, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = r.id RETURNING * INTO r;
  RETURN r;
END $$;

CREATE FUNCTION public.admin_review_device(_device_id uuid, _approve boolean) RETURNS public.devices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.devices;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO d FROM public.devices WHERE id = _device_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Device not found'; END IF;
  IF _approve THEN
    UPDATE public.devices SET status = 'REVOKED', reviewed_by = auth.uid(), reviewed_at = now()
     WHERE client_id = d.client_id AND status = 'APPROVED' AND id <> d.id;
    UPDATE public.devices SET status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = d.id RETURNING * INTO d;
  ELSE
    UPDATE public.devices SET status = CASE WHEN d.status = 'APPROVED' THEN 'REVOKED'::public.device_status ELSE 'REJECTED' END,
      reviewed_by = auth.uid(), reviewed_at = now() WHERE id = d.id RETURNING * INTO d;
  END IF;
  RETURN d;
END $$;

-- Nightly cleanup just after midnight Africa/Mogadishu (21:05 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('sendra-usage-retention', '5 21 * * *', 'SELECT public.run_usage_retention()');
