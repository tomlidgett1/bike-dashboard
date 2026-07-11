-- Store Google Business Profile OAuth connections (per bicycle store user).
-- Tokens encrypted at rest with TOKEN_ENCRYPTION_KEY (same AES-256-GCM as Lightspeed).

CREATE TABLE IF NOT EXISTS store_google_business_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'pending_location', 'disconnected', 'error', 'expired')),

  -- Google account email from userinfo / token
  google_email TEXT,
  google_name TEXT,

  -- Selected GBP account + location (numeric ids without resource prefix)
  gbp_account_id TEXT,
  gbp_location_id TEXT,
  gbp_account_name TEXT,
  gbp_location_name TEXT,
  gbp_review_url TEXT,
  gbp_maps_uri TEXT,
  gbp_place_id TEXT,

  -- Encrypted OAuth tokens
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT ARRAY['https://www.googleapis.com/auth/business.manage'],

  -- OAuth CSRF state
  oauth_state TEXT,
  oauth_state_expires_at TIMESTAMPTZ,

  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_token_refresh_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT store_google_business_connections_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS store_google_business_connections_user_id_idx
  ON store_google_business_connections(user_id);
CREATE INDEX IF NOT EXISTS store_google_business_connections_status_idx
  ON store_google_business_connections(status);
CREATE INDEX IF NOT EXISTS store_google_business_connections_oauth_state_idx
  ON store_google_business_connections(oauth_state);

CREATE OR REPLACE FUNCTION update_store_google_business_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS store_google_business_connections_updated_at
  ON store_google_business_connections;
CREATE TRIGGER store_google_business_connections_updated_at
  BEFORE UPDATE ON store_google_business_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_store_google_business_connections_updated_at();

ALTER TABLE store_google_business_connections ENABLE ROW LEVEL SECURITY;

-- Tokens must never be readable from the browser client.
CREATE POLICY store_google_business_connections_deny_client_access
  ON store_google_business_connections
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE store_google_business_connections TO service_role;
