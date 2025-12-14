-- ============================================================
-- Add Marketplace Categories to Canonical Products
-- ============================================================
-- This migration makes canonical_products the master source of truth
-- for all product categorisation. Categories flow down to products
-- via a database trigger.

-- ============================================================
-- Step 1: Add Category Columns to Canonical Products
-- ============================================================

ALTER TABLE canonical_products 
ADD COLUMN IF NOT EXISTS marketplace_category TEXT,
ADD COLUMN IF NOT EXISTS marketplace_subcategory TEXT,
ADD COLUMN IF NOT EXISTS marketplace_level_3_category TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS cleaned BOOLEAN DEFAULT false;

-- ============================================================
-- Step 2: Create Indexes for Category Filtering
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_canonical_marketplace_category 
  ON canonical_products(marketplace_category) 
  WHERE marketplace_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_marketplace_subcategory 
  ON canonical_products(marketplace_subcategory) 
  WHERE marketplace_subcategory IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_marketplace_level_3 
  ON canonical_products(marketplace_level_3_category) 
  WHERE marketplace_level_3_category IS NOT NULL;

-- Composite index for full category hierarchy
CREATE INDEX IF NOT EXISTS idx_canonical_marketplace_categories 
  ON canonical_products(marketplace_category, marketplace_subcategory, marketplace_level_3_category);

-- Index for finding uncategorised products
CREATE INDEX IF NOT EXISTS idx_canonical_cleaned 
  ON canonical_products(cleaned) 
  WHERE cleaned = false;

-- ============================================================
-- Step 3: Add Comments for Documentation
-- ============================================================

COMMENT ON COLUMN canonical_products.marketplace_category IS 'Level 1 marketplace category (e.g., Bicycles, E-Bikes, Parts)';
COMMENT ON COLUMN canonical_products.marketplace_subcategory IS 'Level 2 marketplace category (e.g., Road, Mountain, Gravel)';
COMMENT ON COLUMN canonical_products.marketplace_level_3_category IS 'Level 3 marketplace category (e.g., XC, Trail, Enduro)';
COMMENT ON COLUMN canonical_products.display_name IS 'AI-cleaned product name for customer display';
COMMENT ON COLUMN canonical_products.cleaned IS 'Whether this product has been processed by AI categorisation';

-- ============================================================
-- Step 4: Create Trigger to Copy Categories from Canonical → Products
-- ============================================================

-- Function to sync categories from canonical to products
CREATE OR REPLACE FUNCTION sync_categories_from_canonical()
RETURNS TRIGGER AS $$
BEGIN
  -- When a product is linked to a canonical product (INSERT or UPDATE)
  -- Copy categories and display_name from canonical to product
  IF NEW.canonical_product_id IS NOT NULL THEN
    UPDATE products
    SET 
      marketplace_category = cp.marketplace_category,
      marketplace_subcategory = cp.marketplace_subcategory,
      marketplace_level_3_category = cp.marketplace_level_3_category,
      display_name = COALESCE(cp.display_name, products.description),
      updated_at = NOW()
    FROM canonical_products cp
    WHERE products.id = NEW.id
      AND cp.id = NEW.canonical_product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on products table
DROP TRIGGER IF EXISTS sync_categories_after_canonical_link ON products;
CREATE TRIGGER sync_categories_after_canonical_link
  AFTER INSERT OR UPDATE OF canonical_product_id ON products
  FOR EACH ROW
  WHEN (NEW.canonical_product_id IS NOT NULL)
  EXECUTE FUNCTION sync_categories_from_canonical();

-- ============================================================
-- Step 5: Create Function to Propagate Category Updates to Products
-- ============================================================

-- When categories are updated on canonical_products, 
-- propagate those changes to all linked products
CREATE OR REPLACE FUNCTION propagate_canonical_category_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only propagate if categories actually changed
  IF (NEW.marketplace_category IS DISTINCT FROM OLD.marketplace_category) OR
     (NEW.marketplace_subcategory IS DISTINCT FROM OLD.marketplace_subcategory) OR
     (NEW.marketplace_level_3_category IS DISTINCT FROM OLD.marketplace_level_3_category) OR
     (NEW.display_name IS DISTINCT FROM OLD.display_name) THEN
    
    -- Update all products linked to this canonical product
    UPDATE products
    SET 
      marketplace_category = NEW.marketplace_category,
      marketplace_subcategory = NEW.marketplace_subcategory,
      marketplace_level_3_category = NEW.marketplace_level_3_category,
      display_name = COALESCE(NEW.display_name, products.description),
      updated_at = NOW()
    WHERE canonical_product_id = NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on canonical_products table
DROP TRIGGER IF EXISTS propagate_categories_to_products ON canonical_products;
CREATE TRIGGER propagate_categories_to_products
  AFTER UPDATE OF marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name ON canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION propagate_canonical_category_updates();

-- ============================================================
-- Step 6: Update updated_at Trigger
-- ============================================================

-- Ensure canonical_products has an updated_at trigger
CREATE OR REPLACE FUNCTION update_canonical_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_canonical_products_updated_at ON canonical_products;
CREATE TRIGGER update_canonical_products_updated_at
  BEFORE UPDATE ON canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION update_canonical_updated_at();






