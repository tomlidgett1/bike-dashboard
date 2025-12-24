-- ============================================================
-- Add bike_surface Field to Canonical Products and Products
-- ============================================================
-- Categorises products by the type of bike they're related to:
-- Road Bike, Mountain Bike, Kids Bike, Triathlon, Time Trial, 
-- City/Commuter, Electric Bike, or All (for universal accessories)

-- ============================================================
-- Step 1: Add bike_surface column to canonical_products
-- ============================================================

ALTER TABLE canonical_products 
ADD COLUMN IF NOT EXISTS bike_surface TEXT;

-- Add check constraint for valid values
ALTER TABLE canonical_products
ADD CONSTRAINT canonical_products_bike_surface_check 
CHECK (bike_surface IS NULL OR bike_surface IN (
  'Road Bike', 
  'Mountain Bike', 
  'Kids Bike', 
  'Triathlon', 
  'Time Trial', 
  'City/Commuter', 
  'Electric Bike', 
  'Gravel/CX',
  'BMX',
  'All'
));

COMMENT ON COLUMN canonical_products.bike_surface IS 'Type of bike this product is designed for (Road, MTB, Kids, etc.) or All for universal products';

-- ============================================================
-- Step 2: Add bike_surface column to products table
-- ============================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS bike_surface TEXT;

-- Add check constraint for valid values
ALTER TABLE products
ADD CONSTRAINT products_bike_surface_check 
CHECK (bike_surface IS NULL OR bike_surface IN (
  'Road Bike', 
  'Mountain Bike', 
  'Kids Bike', 
  'Triathlon', 
  'Time Trial', 
  'City/Commuter', 
  'Electric Bike', 
  'Gravel/CX',
  'BMX',
  'All'
));

COMMENT ON COLUMN products.bike_surface IS 'Type of bike this product is designed for, synced from canonical_products';

-- ============================================================
-- Step 3: Create index for filtering by bike_surface
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_canonical_bike_surface 
  ON canonical_products(bike_surface) 
  WHERE bike_surface IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_bike_surface 
  ON products(bike_surface) 
  WHERE bike_surface IS NOT NULL;

-- ============================================================
-- Step 4: Update sync trigger to include bike_surface
-- ============================================================

-- Update the function that syncs from canonical to products when product is linked
CREATE OR REPLACE FUNCTION sync_categories_from_canonical()
RETURNS TRIGGER AS $$
BEGIN
  -- When a product is linked to a canonical product (INSERT or UPDATE)
  -- Copy categories, display_name, product_description, and bike_surface from canonical to product
  -- BUT ONLY if canonical has values set (don't overwrite with NULL)
  IF NEW.canonical_product_id IS NOT NULL THEN
    UPDATE products
    SET 
      marketplace_category = COALESCE(cp.marketplace_category, products.marketplace_category),
      marketplace_subcategory = COALESCE(cp.marketplace_subcategory, products.marketplace_subcategory),
      marketplace_level_3_category = COALESCE(cp.marketplace_level_3_category, products.marketplace_level_3_category),
      display_name = COALESCE(cp.display_name, products.display_name, products.description),
      product_description = COALESCE(cp.product_description, products.product_description),
      bike_surface = COALESCE(cp.bike_surface, products.bike_surface),
      updated_at = NOW()
    FROM canonical_products cp
    WHERE products.id = NEW.id
      AND cp.id = NEW.canonical_product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update the function that propagates changes from canonical to all linked products
CREATE OR REPLACE FUNCTION propagate_canonical_category_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only propagate if categories, description, or bike_surface actually changed
  IF (NEW.marketplace_category IS DISTINCT FROM OLD.marketplace_category) OR
     (NEW.marketplace_subcategory IS DISTINCT FROM OLD.marketplace_subcategory) OR
     (NEW.marketplace_level_3_category IS DISTINCT FROM OLD.marketplace_level_3_category) OR
     (NEW.display_name IS DISTINCT FROM OLD.display_name) OR
     (NEW.product_description IS DISTINCT FROM OLD.product_description) OR
     (NEW.bike_surface IS DISTINCT FROM OLD.bike_surface) THEN
    
    -- Update all products linked to this canonical product
    UPDATE products
    SET 
      marketplace_category = NEW.marketplace_category,
      marketplace_subcategory = NEW.marketplace_subcategory,
      marketplace_level_3_category = NEW.marketplace_level_3_category,
      display_name = COALESCE(NEW.display_name, products.description),
      product_description = NEW.product_description,
      bike_surface = NEW.bike_surface,
      updated_at = NOW()
    WHERE canonical_product_id = NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger to include bike_surface in the watched columns
DROP TRIGGER IF EXISTS propagate_categories_to_products ON canonical_products;
CREATE TRIGGER propagate_categories_to_products
  AFTER UPDATE OF marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name, product_description, bike_surface ON canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION propagate_canonical_category_updates();

-- ============================================================
-- Step 5: Comments for documentation
-- ============================================================

COMMENT ON FUNCTION sync_categories_from_canonical() IS 'Syncs categories, display_name, product_description, and bike_surface from canonical_products to products';
COMMENT ON FUNCTION propagate_canonical_category_updates() IS 'Propagates category, description, and bike_surface updates from canonical_products to all linked products';

