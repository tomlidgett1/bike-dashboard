-- ============================================================
-- Products Table for Lightspeed Synced Inventory
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Lightspeed IDs
  lightspeed_item_id TEXT NOT NULL,
  lightspeed_category_id TEXT,
  lightspeed_account_id TEXT,
  
  -- Product Info
  system_sku TEXT,
  custom_sku TEXT,
  description TEXT NOT NULL,
  category_name TEXT,
  full_category_path TEXT,
  
  -- Pricing
  price DECIMAL(10, 2) DEFAULT 0,
  default_cost DECIMAL(10, 2) DEFAULT 0,
  avg_cost DECIMAL(10, 2) DEFAULT 0,
  
  -- Inventory
  qoh INTEGER DEFAULT 0,
  sellable INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  
  -- Product Details
  model_year TEXT,
  upc TEXT,
  manufacturer_id TEXT,
  manufacturer_name TEXT,
  
  -- Images
  images JSONB DEFAULT '[]'::jsonb,
  primary_image_url TEXT,
  
  -- Sync Metadata
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lightspeed_updated_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_archived BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint per user and Lightspeed item
  CONSTRAINT products_user_lightspeed_item_key UNIQUE (user_id, lightspeed_item_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS products_user_id_idx ON products(user_id);
CREATE INDEX IF NOT EXISTS products_lightspeed_item_id_idx ON products(lightspeed_item_id);
CREATE INDEX IF NOT EXISTS products_lightspeed_category_id_idx ON products(lightspeed_category_id);
CREATE INDEX IF NOT EXISTS products_qoh_idx ON products(qoh);
CREATE INDEX IF NOT EXISTS products_is_active_idx ON products(is_active);
CREATE INDEX IF NOT EXISTS products_last_synced_at_idx ON products(last_synced_at DESC);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================
CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products"
  ON products FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own products"
  ON products FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Trigger for updated_at
-- ============================================================
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

