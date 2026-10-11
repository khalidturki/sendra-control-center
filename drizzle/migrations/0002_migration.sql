
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _action text;
  _entity text := TG_TABLE_NAME;
  _old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  _new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  _os text; _ns text;
BEGIN
  _action := rtrim(_entity, 's') || '.' || CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'DELETE' THEN 'deleted' ELSE 'updated' END;
  IF _entity = 'subscriptions' AND TG_OP = 'UPDATE' THEN
    _os := _old->>'status'; _ns := _new->>'status';
    IF _os IS DISTINCT FROM _ns THEN
      _action := 'subscription.' || CASE
        WHEN _os = 'PENDING' AND _ns = 'ACTIVE' THEN 'approved'
        WHEN _os = 'SUSPENDED' AND _ns = 'ACTIVE' THEN 'reactivated'
        WHEN _os = 'EXPIRED' AND _ns = 'ACTIVE' THEN 'renewed'
        ELSE lower(_ns) END;
    ELSIF (_old->>'expiry_date') IS DISTINCT FROM (_new->>'expiry_date') OR (_old->>'plan_id') IS DISTINCT FROM (_new->>'plan_id') THEN
      _action := 'subscription.renewed';
    END IF;
  END IF;
  IF _entity = 'clients' AND TG_OP = 'UPDATE' AND (_old->>'api_key') IS DISTINCT FROM (_new->>'api_key') THEN
    _action := 'client.api_key_rotated';
  END IF;
  IF _old IS NOT NULL THEN _old := _old - 'api_key'; END IF;
  IF _new IS NOT NULL THEN _new := _new - 'api_key'; END IF;
  INSERT INTO public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.jwt() ->> 'email', _action, _entity,
          COALESCE((_new->>'id')::uuid, (_old->>'id')::uuid),
          jsonb_strip_nulls(jsonb_build_object('old', _old, 'new', _new)));
  RETURN COALESCE(NEW, OLD);
END $$;
