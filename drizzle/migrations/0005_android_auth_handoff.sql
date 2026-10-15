ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS android_package_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS android_cert_sha256 text NOT NULL DEFAULT '';

CREATE TABLE public.auth_handoff_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  code_challenge text NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_handoff_codes TO service_role;
ALTER TABLE public.auth_handoff_codes ENABLE ROW LEVEL SECURITY;
-- No policies: only server code (service role) may read or write handoff codes.
CREATE INDEX auth_handoff_codes_expires_idx ON public.auth_handoff_codes (expires_at);