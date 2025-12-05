-- ============================================================
-- Sync State Table for Resumable Syncs
-- Tracks progress of long-running inventory syncs
-- ============================================================

CREATE TABLE IF NOT EXISTS lightspeed_sync_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sync_log_id UUID REFERENCES lightspeed_sync_logs(id) ON DELETE CASCADE,
  
  -- Sync configuration
  sync_all BOOLEAN NOT NULL DEFAULT false,
  category_ids TEXT[] DEFAULT '{}',
  
  -- Progress tracking
  current_category_index INTEGER DEFAULT 0,
  current_item_cursor TEXT, -- Lightspeed pagination cursor
  current_inventory_cursor TEXT,
  
  -- Counters
  items_fetched INTEGER DEFAULT 0,
  items_processed INTEGER DEFAULT 0,
  items_with_stock INTEGER DEFAULT 0,
  items_inserted INTEGER DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, completed, failed
  phase TEXT NOT NULL DEFAULT 'items', -- items, inventory, categories, inserting
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT lightspeed_sync_state_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS lightspeed_sync_state_user_id_idx ON lightspeed_sync_state(user_id);
CREATE INDEX IF NOT EXISTS lightspeed_sync_state_status_idx ON lightspeed_sync_state(status);

ALTER TABLE lightspeed_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync state" ON lightspeed_sync_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync state" ON lightspeed_sync_state FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sync state" ON lightspeed_sync_state FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sync state" ON lightspeed_sync_state FOR DELETE USING (auth.uid() = user_id);







