-- ============================================================
-- Lightspeed Connections Table
-- ============================================================
CREATE TABLE IF NOT EXISTS lightspeed_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Connection Status
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'expired')),
  
  -- Account Info
  account_id TEXT,
  account_name TEXT,
  
  -- Encrypted Tokens
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- OAuth State (for CSRF protection)
  oauth_state TEXT,
  oauth_state_expires_at TIMESTAMPTZ,
  
  -- Scopes
  scopes TEXT[] DEFAULT ARRAY['employee:all'],
  
  -- Timestamps
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_token_refresh_at TIMESTAMPTZ,
  
  -- Error Tracking
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One connection per user
  CONSTRAINT lightspeed_connections_user_id_key UNIQUE (user_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS lightspeed_connections_user_id_idx ON lightspeed_connections(user_id);
CREATE INDEX IF NOT EXISTS lightspeed_connections_status_idx ON lightspeed_connections(status);
CREATE INDEX IF NOT EXISTS lightspeed_connections_oauth_state_idx ON lightspeed_connections(oauth_state);

-- ============================================================
-- Updated At Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_lightspeed_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lightspeed_connections_updated_at
  BEFORE UPDATE ON lightspeed_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_lightspeed_connections_updated_at();

-- ============================================================
-- Lightspeed Sync Settings Table
-- ============================================================
CREATE TABLE IF NOT EXISTS lightspeed_sync_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES lightspeed_connections(id) ON DELETE CASCADE,
  
  -- Sync Options
  sync_products BOOLEAN DEFAULT true,
  sync_orders BOOLEAN DEFAULT true,
  sync_customers BOOLEAN DEFAULT false,
  sync_inventory BOOLEAN DEFAULT true,
  
  -- Auto Sync Settings
  auto_sync_enabled BOOLEAN DEFAULT false,
  auto_sync_interval_minutes INTEGER DEFAULT 60,
  
  -- Sync Behavior
  overwrite_local_changes BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One settings record per user
  CONSTRAINT lightspeed_sync_settings_user_id_key UNIQUE (user_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS lightspeed_sync_settings_user_id_idx ON lightspeed_sync_settings(user_id);
CREATE INDEX IF NOT EXISTS lightspeed_sync_settings_connection_id_idx ON lightspeed_sync_settings(connection_id);

-- ============================================================
-- Updated At Trigger
-- ============================================================
CREATE TRIGGER lightspeed_sync_settings_updated_at
  BEFORE UPDATE ON lightspeed_sync_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_lightspeed_connections_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE lightspeed_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightspeed_sync_settings ENABLE ROW LEVEL SECURITY;

-- Policies for lightspeed_connections
CREATE POLICY "Users can view their own connection"
  ON lightspeed_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connection"
  ON lightspeed_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connection"
  ON lightspeed_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connection"
  ON lightspeed_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for lightspeed_sync_settings
CREATE POLICY "Users can view their own sync settings"
  ON lightspeed_sync_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync settings"
  ON lightspeed_sync_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync settings"
  ON lightspeed_sync_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sync settings"
  ON lightspeed_sync_settings FOR DELETE
  USING (auth.uid() = user_id);

