-- ============================================================
-- SETUP STORE TABLES - Run this in Supabase SQL Editor
-- ============================================================
-- This creates the store_categories and store_services tables
-- Run this if you're getting "Failed to load store profile" errors

-- ============================================================
-- Store Categories Table
-- ============================================================
CREATE TABLE IF NOT EXISTS store_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('lightspeed', 'custom')),
  lightspeed_category_id TEXT,
  product_ids TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_store_categories_user_id ON store_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_store_categories_active ON store_categories(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_categories_order ON store_categories(user_id, display_order);

-- Enable RLS
ALTER TABLE store_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own categories" ON store_categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON store_categories;
DROP POLICY IF EXISTS "Users can update own categories" ON store_categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON store_categories;
DROP POLICY IF EXISTS "Public can view active store categories" ON store_categories;

-- RLS Policies
CREATE POLICY "Users can view own categories"
  ON store_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON store_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON store_categories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON store_categories FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view active store categories"
  ON store_categories FOR SELECT
  USING (
    is_active = true 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.user_id = store_categories.user_id 
      AND users.bicycle_store = true
    )
  );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_store_categories_updated_at ON store_categories;
CREATE TRIGGER update_store_categories_updated_at
  BEFORE UPDATE ON store_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Store Services Table
-- ============================================================
CREATE TABLE IF NOT EXISTS store_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_store_services_user_id ON store_services(user_id);
CREATE INDEX IF NOT EXISTS idx_store_services_active ON store_services(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_services_order ON store_services(user_id, display_order);

-- Enable RLS
ALTER TABLE store_services ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own services" ON store_services;
DROP POLICY IF EXISTS "Users can insert own services" ON store_services;
DROP POLICY IF EXISTS "Users can update own services" ON store_services;
DROP POLICY IF EXISTS "Users can delete own services" ON store_services;
DROP POLICY IF EXISTS "Public can view active store services" ON store_services;

-- RLS Policies
CREATE POLICY "Users can view own services"
  ON store_services FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own services"
  ON store_services FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own services"
  ON store_services FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own services"
  ON store_services FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view active store services"
  ON store_services FOR SELECT
  USING (
    is_active = true 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.user_id = store_services.user_id 
      AND users.bicycle_store = true
    )
  );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_store_services_updated_at ON store_services;
CREATE TRIGGER update_store_services_updated_at
  BEFORE UPDATE ON store_services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Verify Tables Were Created
-- ============================================================
SELECT 
  'store_categories' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name = 'store_categories'
UNION ALL
SELECT 
  'store_services' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name = 'store_services';

-- You should see:
-- table_name         | column_count
-- store_categories   | 10
-- store_services     | 7




