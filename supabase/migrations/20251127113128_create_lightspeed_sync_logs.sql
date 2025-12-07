-- ============================================================
-- Lightspeed Sync Logs Table
-- ============================================================
CREATE TABLE IF NOT EXISTS lightspeed_sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES lightspeed_connections(id) ON DELETE SET NULL,
  
  -- Sync Info
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental', 'manual', 'products', 'orders', 'customers', 'inventory')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  
  -- Entities Synced
  entities_synced TEXT[],
  
  -- Stats
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Error Info
  error_message TEXT,
  error_details JSONB,
  
  -- Metadata
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS lightspeed_sync_logs_user_id_idx ON lightspeed_sync_logs(user_id);
CREATE INDEX IF NOT EXISTS lightspeed_sync_logs_connection_id_idx ON lightspeed_sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS lightspeed_sync_logs_status_idx ON lightspeed_sync_logs(status);
CREATE INDEX IF NOT EXISTS lightspeed_sync_logs_started_at_idx ON lightspeed_sync_logs(started_at DESC);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE lightspeed_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync logs"
  ON lightspeed_sync_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync logs"
  ON lightspeed_sync_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync logs"
  ON lightspeed_sync_logs FOR UPDATE
  USING (auth.uid() = user_id);

