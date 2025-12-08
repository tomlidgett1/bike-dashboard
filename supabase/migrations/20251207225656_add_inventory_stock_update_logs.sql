-- ============================================================
-- Inventory Stock Update Logs Table
-- Tracks individual product stock changes from automated sync
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_stock_update_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Product Info
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  lightspeed_item_id TEXT NOT NULL,
  lightspeed_category_id TEXT,
  
  -- Stock Change Details
  old_qoh INTEGER NOT NULL,
  new_qoh INTEGER NOT NULL,
  qoh_change INTEGER NOT NULL, -- new_qoh - old_qoh
  old_sellable INTEGER,
  new_sellable INTEGER,
  
  -- Status Change
  old_is_active BOOLEAN,
  new_is_active BOOLEAN,
  
  -- Sync Context
  sync_type TEXT NOT NULL DEFAULT 'auto' CHECK (sync_type IN ('auto', 'manual', 'initial')),
  sync_source TEXT NOT NULL DEFAULT 'update-inventory-stock' CHECK (sync_source IN ('update-inventory-stock', 'sync-from-cache', 'manual-sync')),
  
  -- Metadata
  metadata JSONB, -- For additional context like batch_id, inventory_log_count, etc.
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for Performance
-- ============================================================
CREATE INDEX IF NOT EXISTS inventory_stock_update_logs_user_id_idx 
  ON inventory_stock_update_logs(user_id);
  
CREATE INDEX IF NOT EXISTS inventory_stock_update_logs_product_id_idx 
  ON inventory_stock_update_logs(product_id);
  
CREATE INDEX IF NOT EXISTS inventory_stock_update_logs_created_at_idx 
  ON inventory_stock_update_logs(created_at DESC);
  
CREATE INDEX IF NOT EXISTS inventory_stock_update_logs_item_id_idx 
  ON inventory_stock_update_logs(lightspeed_item_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE inventory_stock_update_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own inventory update logs"
  ON inventory_stock_update_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert inventory update logs"
  ON inventory_stock_update_logs FOR INSERT
  WITH CHECK (true); -- Allow service role to insert logs

-- ============================================================
-- Helper View for Easy Querying
-- ============================================================
CREATE OR REPLACE VIEW inventory_update_log_summary AS
SELECT 
  l.id,
  l.user_id,
  l.product_id,
  l.product_name,
  l.product_sku,
  l.lightspeed_item_id,
  l.old_qoh,
  l.new_qoh,
  l.qoh_change,
  l.old_is_active,
  l.new_is_active,
  l.sync_type,
  l.sync_source,
  l.created_at,
  -- Friendly labels
  CASE 
    WHEN l.new_is_active = true AND l.old_is_active = false THEN 'Activated'
    WHEN l.new_is_active = false AND l.old_is_active = true THEN 'Deactivated'
    WHEN l.qoh_change > 0 THEN 'Stock Increased'
    WHEN l.qoh_change < 0 THEN 'Stock Decreased'
    ELSE 'Stock Updated'
  END as change_type,
  -- Product link if it still exists
  p.id IS NOT NULL as product_exists
FROM inventory_stock_update_logs l
LEFT JOIN products p ON l.product_id = p.id
ORDER BY l.created_at DESC;

-- Grant access to the view
GRANT SELECT ON inventory_update_log_summary TO authenticated;


