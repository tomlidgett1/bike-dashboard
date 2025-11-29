-- ============================================================
-- Store Categories Table
-- ============================================================
-- This table stores custom categories for bike stores to organize
-- their products on their public store profile page.
-- Categories can be sourced from Lightspeed or created manually.

CREATE TABLE IF NOT EXISTS store_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('lightspeed', 'custom', 'display_override')),
  lightspeed_category_id TEXT,
  product_ids TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_store_categories_user_id ON store_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_store_categories_active ON store_categories(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_categories_order ON store_categories(user_id, display_order);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE store_categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own categories" ON store_categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON store_categories;
DROP POLICY IF EXISTS "Users can update own categories" ON store_categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON store_categories;
DROP POLICY IF EXISTS "Public can view active store categories" ON store_categories;

-- Users can view their own categories
CREATE POLICY "Users can view own categories"
  ON store_categories
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own categories
CREATE POLICY "Users can insert own categories"
  ON store_categories
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own categories
CREATE POLICY "Users can update own categories"
  ON store_categories
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own categories
CREATE POLICY "Users can delete own categories"
  ON store_categories
  FOR DELETE
  USING (auth.uid() = user_id);

-- Public can view active categories for verified stores
CREATE POLICY "Public can view active store categories"
  ON store_categories
  FOR SELECT
  USING (
    is_active = true 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.user_id = store_categories.user_id 
      AND users.bicycle_store = true
    )
  );

-- ============================================================
-- Trigger for updated_at
-- ============================================================
DROP TRIGGER IF EXISTS update_store_categories_updated_at ON store_categories;
CREATE TRIGGER update_store_categories_updated_at
  BEFORE UPDATE ON store_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE store_categories IS 'Custom categories for organizing products on store profile pages';
COMMENT ON COLUMN store_categories.source IS 'Source of category: lightspeed (from Lightspeed API) or custom (manually created)';
COMMENT ON COLUMN store_categories.product_ids IS 'Array of product IDs assigned to this category';

