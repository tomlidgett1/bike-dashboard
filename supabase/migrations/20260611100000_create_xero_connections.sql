-- ============================================================
-- Xero Connections Table (mirrors lightspeed_connections)
-- ============================================================
CREATE TABLE IF NOT EXISTS xero_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Connection Status
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'expired')),

  -- Tenant / Organisation Info
  tenant_id TEXT,
  tenant_name TEXT,
  tenant_type TEXT,
  organisation_name TEXT,
  base_currency TEXT,

  -- Encrypted Tokens
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,

  -- OAuth State (for CSRF protection)
  oauth_state TEXT,
  oauth_state_expires_at TIMESTAMPTZ,

  -- Scopes
  scopes TEXT[] DEFAULT ARRAY[
    'openid', 'profile', 'email', 'offline_access',
    'app.connections',
    'accounting.settings.read', 'accounting.contacts.read',
    'accounting.attachments.read', 'accounting.budgets.read',
    'accounting.payments.read', 'accounting.invoices.read',
    'accounting.banktransactions.read', 'accounting.manualjournals.read',
    'accounting.reports.aged.read', 'accounting.reports.balancesheet.read',
    'accounting.reports.banksummary.read', 'accounting.reports.budgetsummary.read',
    'accounting.reports.executivesummary.read', 'accounting.reports.profitandloss.read',
    'accounting.reports.trialbalance.read', 'accounting.reports.taxreports.read',
    'accounting.reports.tenninetynine.read',
    'assets.read', 'files.read', 'projects.read',
    'payroll.employees.read', 'payroll.payruns.read', 'payroll.payslip.read',
    'payroll.settings.read', 'payroll.timesheets.read'
  ],

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
  CONSTRAINT xero_connections_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS xero_connections_user_id_idx ON xero_connections(user_id);
CREATE INDEX IF NOT EXISTS xero_connections_status_idx ON xero_connections(status);

CREATE OR REPLACE FUNCTION update_xero_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER xero_connections_updated_at
  BEFORE UPDATE ON xero_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_xero_connections_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE xero_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own xero connection"
  ON xero_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own xero connection"
  ON xero_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own xero connection"
  ON xero_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own xero connection"
  ON xero_connections FOR DELETE
  USING (auth.uid() = user_id);
