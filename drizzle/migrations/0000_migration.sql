
-- ROLES ---------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TYPE public.subscription_status AS ENUM ('PENDING','ACTIVE','EXPIRED','SUSPENDED');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE POLICY "Users read own roles; admins read all" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- First account ever created becomes the initial admin
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role, email) VALUES (NEW.id, 'admin', NEW.email);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_admin AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin();

-- TIMESTAMP helper ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- SETTINGS -------------------------------------------------------------
CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  usage_timezone text NOT NULL DEFAULT 'UTC',
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.app_settings (id) VALUES (true);

CREATE OR REPLACE FUNCTION public.validate_timezone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.usage_timezone) THEN
    RAISE EXCEPTION 'Unknown timezone: %', NEW.usage_timezone;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;
CREATE TRIGGER app_settings_validate BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_timezone();

-- PLANS ----------------------------------------------------------------
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  description text NOT NULL DEFAULT '',
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  daily_limit integer CHECK (daily_limit IS NULL OR daily_limit > 0),
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.plans.daily_limit IS 'NULL = unlimited daily sends';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage plans" ON public.plans FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.plans (name, description, price, daily_limit, sort_order) VALUES
  ('Starter', 'Up to 200 successful sends per day', 10, 200, 1),
  ('Standard', 'Up to 500 successful sends per day', 20, 500, 2),
  ('Professional', 'Up to 1,000 successful sends per day', 35, 1000, 3),
  ('Unlimited', 'No daily send-count limit', 60, NULL, 4);

-- CLIENTS --------------------------------------------------------------
CREATE SEQUENCE public.client_code_seq START 1001;
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code text NOT NULL UNIQUE DEFAULT ('SND-' || nextval('public.client_code_seq')::text),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  email text,
  phone text,
  company text,
  notes text,
  api_key text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SEQUENCE public.client_code_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage clients" ON public.clients FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SUBSCRIPTIONS --------------------------------------------------------
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'PENDING',
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  start_date timestamptz,
  expiry_date timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR start_date IS NULL OR expiry_date > start_date),
  CHECK (status = 'PENDING' OR (start_date IS NOT NULL AND expiry_date IS NOT NULL))
);
CREATE INDEX subscriptions_client_idx ON public.subscriptions(client_id);
CREATE INDEX subscriptions_status_idx ON public.subscriptions(status);
-- one open subscription per client
CREATE UNIQUE INDEX subscriptions_one_open_per_client ON public.subscriptions(client_id)
  WHERE status IN ('PENDING','ACTIVE','SUSPENDED');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PAYMENTS -------------------------------------------------------------
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  note text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- USAGE ----------------------------------------------------------------
CREATE TABLE public.usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  transaction_id text NOT NULL CHECK (length(transaction_id) BETWEEN 1 AND 200),
  usage_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, transaction_id)
);
CREATE INDEX usage_records_client_date_idx ON public.usage_records(client_id, usage_date);
CREATE INDEX usage_records_date_idx ON public.usage_records(usage_date);
GRANT SELECT ON public.usage_records TO authenticated;
GRANT ALL ON public.usage_records TO service_role;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read usage" ON public.usage_records FOR SELECT TO authenticated USING (public.is_admin());

-- AUDIT ----------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs(created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _action text;
  _entity text := TG_TABLE_NAME;
  _old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  _new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
BEGIN
  IF _old IS NOT NULL THEN _old := _old - 'api_key'; END IF;
  IF _new IS NOT NULL THEN _new := _new - 'api_key'; END IF;
  _action := rtrim(_entity, 's') || '.' || CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'DELETE' THEN 'deleted' ELSE 'updated' END;
  IF TG_TABLE_NAME = 'subscriptions' AND TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _action := 'subscription.' || CASE
        WHEN OLD.status = 'PENDING' AND NEW.status = 'ACTIVE' THEN 'approved'
        WHEN OLD.status = 'SUSPENDED' AND NEW.status = 'ACTIVE' THEN 'reactivated'
        WHEN OLD.status = 'EXPIRED' AND NEW.status = 'ACTIVE' THEN 'renewed'
        ELSE lower(NEW.status::text) END;
    ELSIF OLD.expiry_date IS DISTINCT FROM NEW.expiry_date OR OLD.plan_id IS DISTINCT FROM NEW.plan_id THEN
      _action := 'subscription.renewed';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'clients' AND TG_OP = 'UPDATE' AND OLD.api_key IS DISTINCT FROM NEW.api_key THEN
    _action := 'client.api_key_rotated';
  END IF;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.jwt() ->> 'email', _action, _entity,
          COALESCE((_new->>'id')::uuid, (_old->>'id')::uuid),
          jsonb_strip_nulls(jsonb_build_object('old', _old, 'new', _new)));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER audit_plans AFTER INSERT OR UPDATE OR DELETE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_subscriptions AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_payments AFTER INSERT OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_settings AFTER UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- CORE LOGIC -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usage_today()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (now() AT TIME ZONE (SELECT usage_timezone FROM public.app_settings LIMIT 1))::date
$$;

CREATE OR REPLACE FUNCTION public.mark_expired_subscriptions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.subscriptions SET status = 'EXPIRED'
   WHERE status = 'ACTIVE' AND expiry_date <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.mark_expired_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_expired_subscriptions() TO authenticated;

-- Admin actions (atomic, role-checked) ---------------------------------
CREATE OR REPLACE FUNCTION public.admin_activate_subscription(
  _subscription_id uuid, _plan_id uuid DEFAULT NULL, _days integer DEFAULT NULL,
  _record_payment boolean DEFAULT true, _payment_amount numeric DEFAULT NULL)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; p public.plans; _start timestamptz; _base timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  IF s.status = 'SUSPENDED' THEN RAISE EXCEPTION 'Reactivate a suspended subscription instead'; END IF;
  SELECT * INTO p FROM public.plans WHERE id = COALESCE(_plan_id, s.plan_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;
  IF _days IS NOT NULL AND _days <= 0 THEN RAISE EXCEPTION 'Duration must be positive'; END IF;
  -- extend from current expiry if still active, otherwise from now
  _base := CASE WHEN s.status = 'ACTIVE' AND s.expiry_date > now() THEN s.expiry_date ELSE now() END;
  _start := CASE WHEN s.status = 'ACTIVE' AND s.expiry_date > now() THEN s.start_date ELSE now() END;
  UPDATE public.subscriptions SET
    status = 'ACTIVE', plan_id = p.id, price = p.price,
    start_date = _start,
    expiry_date = _base + make_interval(days => COALESCE(_days, p.duration_days)),
    approved_by = COALESCE(approved_by, auth.uid()),
    approved_at = COALESCE(approved_at, now())
  WHERE id = s.id RETURNING * INTO s;
  IF _record_payment THEN
    INSERT INTO public.payments (subscription_id, client_id, amount, note, recorded_by)
    VALUES (s.id, s.client_id, COALESCE(_payment_amount, p.price), p.name || ' plan', auth.uid());
  END IF;
  RETURN s;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_activate_subscription(uuid, uuid, integer, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activate_subscription(uuid, uuid, integer, boolean, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_suspended(_subscription_id uuid, _suspend boolean)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  IF _suspend THEN
    IF s.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Only active subscriptions can be suspended'; END IF;
    UPDATE public.subscriptions SET status = 'SUSPENDED' WHERE id = s.id RETURNING * INTO s;
  ELSE
    IF s.status <> 'SUSPENDED' THEN RAISE EXCEPTION 'Subscription is not suspended'; END IF;
    UPDATE public.subscriptions
       SET status = CASE WHEN expiry_date <= now() THEN 'EXPIRED'::public.subscription_status ELSE 'ACTIVE' END
     WHERE id = s.id RETURNING * INTO s;
  END IF;
  RETURN s;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_suspended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_suspended(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_rotate_api_key(_client_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.clients SET api_key = k WHERE id = _client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;
  RETURN k;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_rotate_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rotate_api_key(uuid) TO authenticated;

-- Android-facing API (credential-checked, server-side truth) ------------
CREATE OR REPLACE FUNCTION public.api_get_plans()
RETURNS TABLE (id uuid, name text, description text, price numeric, daily_limit integer, duration_days integer, unlimited boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, description, price, daily_limit, duration_days, daily_limit IS NULL
  FROM public.plans WHERE is_active ORDER BY sort_order, price
$$;
GRANT EXECUTE ON FUNCTION public.api_get_plans() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.api_check_subscription(_client_code text, _api_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; s public.subscriptions; p public.plans; used integer; today date;
BEGIN
  SELECT * INTO c FROM public.clients WHERE client_code = _client_code AND api_key = _api_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'reason', 'INVALID_CREDENTIALS'); END IF;
  PERFORM public.mark_expired_subscriptions();
  SELECT * INTO s FROM public.subscriptions WHERE client_id = c.id
   ORDER BY (status = 'ACTIVE') DESC, (status IN ('PENDING','SUSPENDED')) DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'reason', 'NO_SUBSCRIPTION', 'client_id', c.client_code); END IF;
  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
  today := public.usage_today();
  SELECT count(*) INTO used FROM public.usage_records WHERE client_id = c.id AND usage_date = today;
  RETURN jsonb_build_object(
    'client_id', c.client_code,
    'status', s.status,
    'plan', p.name,
    'daily_limit', p.daily_limit,
    'unlimited', p.daily_limit IS NULL,
    'used_today', used,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL ELSE greatest(p.daily_limit - used, 0) END,
    'usage_date', today,
    'expiry_date', s.expiry_date,
    'allowed', s.status = 'ACTIVE' AND s.expiry_date > now() AND (p.daily_limit IS NULL OR used < p.daily_limit),
    'reason', CASE
      WHEN s.status = 'PENDING' THEN 'PENDING_APPROVAL'
      WHEN s.status = 'SUSPENDED' THEN 'SUSPENDED'
      WHEN s.status = 'EXPIRED' OR s.expiry_date <= now() THEN 'EXPIRED'
      WHEN p.daily_limit IS NOT NULL AND used >= p.daily_limit THEN 'DAILY_LIMIT_REACHED'
      ELSE 'OK' END);
END $$;
GRANT EXECUTE ON FUNCTION public.api_check_subscription(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.api_record_transaction(_client_code text, _api_key text, _transaction_id text, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; s public.subscriptions; p public.plans; used integer; today date; ins_id uuid;
BEGIN
  SELECT * INTO c FROM public.clients WHERE client_code = _client_code AND api_key = _api_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('counted', false, 'reason', 'INVALID_CREDENTIALS'); END IF;
  IF _transaction_id IS NULL OR length(trim(_transaction_id)) = 0 OR length(_transaction_id) > 200 THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'INVALID_TRANSACTION_ID');
  END IF;
  IF upper(coalesce(_status, '')) <> 'SUCCESS' THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'NOT_SUCCESSFUL');
  END IF;
  IF EXISTS (SELECT 1 FROM public.usage_records WHERE client_id = c.id AND transaction_id = _transaction_id) THEN
    RETURN jsonb_build_object('counted', false, 'duplicate', true, 'reason', 'DUPLICATE');
  END IF;
  PERFORM public.mark_expired_subscriptions();
  -- lock the active subscription so concurrent calls cannot overshoot the limit
  SELECT * INTO s FROM public.subscriptions WHERE client_id = c.id AND status = 'ACTIVE' AND expiry_date > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('counted', false, 'reason', 'NO_ACTIVE_SUBSCRIPTION'); END IF;
  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;
  today := public.usage_today();
  SELECT count(*) INTO used FROM public.usage_records WHERE client_id = c.id AND usage_date = today;
  IF p.daily_limit IS NOT NULL AND used >= p.daily_limit THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'DAILY_LIMIT_REACHED', 'used_today', used, 'daily_limit', p.daily_limit);
  END IF;
  INSERT INTO public.usage_records (client_id, subscription_id, transaction_id, usage_date)
  VALUES (c.id, s.id, _transaction_id, today)
  ON CONFLICT (client_id, transaction_id) DO NOTHING RETURNING id INTO ins_id;
  IF ins_id IS NULL THEN RETURN jsonb_build_object('counted', false, 'duplicate', true, 'reason', 'DUPLICATE'); END IF;
  RETURN jsonb_build_object('counted', true, 'reason', 'OK', 'used_today', used + 1, 'daily_limit', p.daily_limit,
    'remaining_today', CASE WHEN p.daily_limit IS NULL THEN NULL ELSE p.daily_limit - used - 1 END);
END $$;
GRANT EXECUTE ON FUNCTION public.api_record_transaction(text, text, text, text) TO anon, authenticated;
