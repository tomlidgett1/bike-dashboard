-- ============================================================
-- Products All LS - Complete Lightspeed Inventory Snapshot
-- ============================================================
CREATE TABLE IF NOT EXISTS products_all_ls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Lightspeed IDs
  lightspeed_item_id TEXT NOT NULL,
  lightspeed_account_id TEXT,
  
  -- Item Details
  system_sku TEXT,
  description TEXT,
  model_year TEXT,
  upc TEXT,
  category_id TEXT,
  manufacturer_id TEXT,
  
  -- Stock Information (from ItemShops)
  stock_data JSONB, -- Array of shop inventory records
  total_qoh INTEGER DEFAULT 0, -- Total quantity on hand (from shopID:0)
  total_sellable INTEGER DEFAULT 0, -- Total sellable (from shopID:0)
  
  -- Metadata
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_batch_id UUID, -- To group items from the same sync
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint per user and item
  CONSTRAINT products_all_ls_user_item_key UNIQUE (user_id, lightspeed_item_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS products_all_ls_user_id_idx ON products_all_ls(user_id);
CREATE INDEX IF NOT EXISTS products_all_ls_item_id_idx ON products_all_ls(lightspeed_item_id);
CREATE INDEX IF NOT EXISTS products_all_ls_sync_batch_idx ON products_all_ls(sync_batch_id);
CREATE INDEX IF NOT EXISTS products_all_ls_qoh_idx ON products_all_ls(total_qoh);

-- ============================================================
-- Updated At Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_products_all_ls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_all_ls_updated_at
  BEFORE UPDATE ON products_all_ls
  FOR EACH ROW
  EXECUTE FUNCTION update_products_all_ls_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE products_all_ls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own products"
  ON products_all_ls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products"
  ON products_all_ls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products"
  ON products_all_ls FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products"
  ON products_all_ls FOR DELETE
  USING (auth.uid() = user_id);

