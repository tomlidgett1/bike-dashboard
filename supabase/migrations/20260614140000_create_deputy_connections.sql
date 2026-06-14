-- ============================================================
-- Deputy Connections Table (mirrors xero_connections)
--
-- Deputy is the store's staff scheduling / time & attendance system. The Genie
-- reads it (read-only) to answer rostering, timesheet, and hours-worked
-- questions. Deputy is multi-tenant by subdomain: the OAuth token response
-- carries an `endpoint` ({install}.{geo}.deputy.com) that is the store-specific
-- API host. We persist it and use it for every API call and token refresh.
-- ============================================================
CREATE TABLE IF NOT EXISTS deputy_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Connection Status
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'expired')),

  -- Per-install API host (returned by Deputy on connect/refresh)
  endpoint TEXT,
  install_name TEXT,
  geo TEXT,

  -- Display / context
  account_name TEXT,
  company_name TEXT,
  deputy_employee_id TEXT,

  -- Encrypted Tokens
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,

  -- OAuth State (for CSRF protection)
  oauth_state TEXT,
  oauth_state_expires_at TIMESTAMPTZ,

  -- Scopes (Deputy only documents longlife_refresh_token; it unlocks refresh)
  scopes TEXT[] DEFAULT ARRAY['longlife_refresh_token'],

  -- Timestamps
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_token_refresh_at TIMESTAMPTZ,

  -- Error Tracking
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One connection per user
  CONSTRAINT deputy_connections_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS deputy_connections_user_id_idx ON deputy_connections(user_id);
CREATE INDEX IF NOT EXISTS deputy_connections_status_idx ON deputy_connections(status);

CREATE OR REPLACE FUNCTION update_deputy_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deputy_connections_updated_at
  BEFORE UPDATE ON deputy_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_deputy_connections_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE deputy_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deputy connection"
  ON deputy_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deputy connection"
  ON deputy_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deputy connection"
  ON deputy_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deputy connection"
  ON deputy_connections FOR DELETE
  USING (auth.uid() = user_id);
