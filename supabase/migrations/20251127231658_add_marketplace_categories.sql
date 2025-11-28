-- ============================================================
-- Add Marketplace Categories and Public Access
-- ============================================================

-- Add marketplace category columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS marketplace_category TEXT,
ADD COLUMN IF NOT EXISTS marketplace_subcategory TEXT;

-- ============================================================
-- Category Mapping Function
-- ============================================================
-- Maps Lightspeed categories to standardized marketplace categories
CREATE OR REPLACE FUNCTION map_to_marketplace_category(
  lightspeed_category TEXT,
  lightspeed_path TEXT
) RETURNS TABLE (
  marketplace_category TEXT,
  marketplace_subcategory TEXT
) AS $$
DECLARE
  cat_lower TEXT;
  path_lower TEXT;
BEGIN
  cat_lower := LOWER(COALESCE(lightspeed_category, ''));
  path_lower := LOWER(COALESCE(lightspeed_path, ''));
  
  -- Bicycles Category
  IF cat_lower ~ 'bike|bicycle|cycle' OR path_lower ~ 'bike|bicycle|cycle' THEN
    marketplace_category := 'Bicycles';
    
    -- Subcategories for Bicycles
    IF cat_lower ~ 'road' OR path_lower ~ 'road' THEN
      marketplace_subcategory := 'Road';
    ELSIF cat_lower ~ 'mountain|mtb' OR path_lower ~ 'mountain|mtb' THEN
      marketplace_subcategory := 'Mountain';
    ELSIF cat_lower ~ 'hybrid|commut' OR path_lower ~ 'hybrid|commut' THEN
      marketplace_subcategory := 'Hybrid';
    ELSIF cat_lower ~ 'electric|e-bike|ebike' OR path_lower ~ 'electric|e-bike|ebike' THEN
      marketplace_subcategory := 'Electric';
    ELSIF cat_lower ~ 'kid|child|youth' OR path_lower ~ 'kid|child|youth' THEN
      marketplace_subcategory := 'Kids';
    ELSIF cat_lower ~ 'bmx' OR path_lower ~ 'bmx' THEN
      marketplace_subcategory := 'BMX';
    ELSIF cat_lower ~ 'cruiser|beach' OR path_lower ~ 'cruiser|beach' THEN
      marketplace_subcategory := 'Cruiser';
    ELSE
      marketplace_subcategory := 'Other';
    END IF;
    
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Parts Category
  IF cat_lower ~ 'part|component|accessory' OR path_lower ~ 'part|component' THEN
    marketplace_category := 'Parts';
    
    -- Subcategories for Parts
    IF cat_lower ~ 'frame' OR path_lower ~ 'frame' THEN
      marketplace_subcategory := 'Frames';
    ELSIF cat_lower ~ 'wheel|rim|tire|tyre' OR path_lower ~ 'wheel|rim|tire|tyre' THEN
      marketplace_subcategory := 'Wheels';
    ELSIF cat_lower ~ 'drivetrain|chain|cassette|derailleur|shifter' OR path_lower ~ 'drivetrain|chain|cassette|derailleur' THEN
      marketplace_subcategory := 'Drivetrain';
    ELSIF cat_lower ~ 'brake' OR path_lower ~ 'brake' THEN
      marketplace_subcategory := 'Brakes';
    ELSIF cat_lower ~ 'handlebar|stem|grip' OR path_lower ~ 'handlebar|stem|grip' THEN
      marketplace_subcategory := 'Handlebars';
    ELSIF cat_lower ~ 'saddle|seat' OR path_lower ~ 'saddle|seat' THEN
      marketplace_subcategory := 'Saddles';
    ELSIF cat_lower ~ 'pedal' OR path_lower ~ 'pedal' THEN
      marketplace_subcategory := 'Pedals';
    ELSE
      marketplace_subcategory := 'Other';
    END IF;
    
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Apparel Category
  IF cat_lower ~ 'apparel|clothing|wear|jersey|short|jacket|glove|shoe|helmet' OR path_lower ~ 'apparel|clothing|wear' THEN
    marketplace_category := 'Apparel';
    
    -- Subcategories for Apparel
    IF cat_lower ~ 'jersey|shirt|top' OR path_lower ~ 'jersey|shirt|top' THEN
      marketplace_subcategory := 'Jerseys';
    ELSIF cat_lower ~ 'short|pant|tight|bib' OR path_lower ~ 'short|pant|tight|bib' THEN
      marketplace_subcategory := 'Shorts';
    ELSIF cat_lower ~ 'jacket|coat|vest|windbreaker' OR path_lower ~ 'jacket|coat|vest' THEN
      marketplace_subcategory := 'Jackets';
    ELSIF cat_lower ~ 'glove' OR path_lower ~ 'glove' THEN
      marketplace_subcategory := 'Gloves';
    ELSIF cat_lower ~ 'shoe|cleat|footwear' OR path_lower ~ 'shoe|cleat|footwear' THEN
      marketplace_subcategory := 'Shoes';
    ELSIF cat_lower ~ 'helmet' OR path_lower ~ 'helmet' THEN
      marketplace_subcategory := 'Helmets';
    ELSE
      marketplace_subcategory := 'Other';
    END IF;
    
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Nutrition Category
  IF cat_lower ~ 'nutrition|food|drink|supplement|energy|gel|bar' OR path_lower ~ 'nutrition|food|drink|supplement' THEN
    marketplace_category := 'Nutrition';
    
    -- Subcategories for Nutrition
    IF cat_lower ~ 'bar' OR path_lower ~ 'bar' THEN
      marketplace_subcategory := 'Energy Bars';
    ELSIF cat_lower ~ 'gel' OR path_lower ~ 'gel' THEN
      marketplace_subcategory := 'Gels';
    ELSIF cat_lower ~ 'drink|beverage|hydration' OR path_lower ~ 'drink|beverage|hydration' THEN
      marketplace_subcategory := 'Drinks';
    ELSIF cat_lower ~ 'supplement|vitamin|protein' OR path_lower ~ 'supplement|vitamin|protein' THEN
      marketplace_subcategory := 'Supplements';
    ELSE
      marketplace_subcategory := 'Other';
    END IF;
    
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Default fallback - try to guess based on description
  marketplace_category := 'Parts';
  marketplace_subcategory := 'Other';
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Update Existing Products with Marketplace Categories
-- ============================================================
UPDATE products
SET (marketplace_category, marketplace_subcategory) = (
  SELECT m.marketplace_category, m.marketplace_subcategory
  FROM map_to_marketplace_category(category_name, full_category_path) m
  LIMIT 1
)
WHERE marketplace_category IS NULL;

-- ============================================================
-- Update RLS Policies for Public Access
-- ============================================================

-- Drop existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view own products" ON products;

-- Drop if exists to avoid conflicts
DROP POLICY IF EXISTS "Public can view active marketplace products" ON products;

-- Create new public SELECT policy for active products
CREATE POLICY "Public can view active marketplace products"
  ON products FOR SELECT
  USING (is_active = true);

-- Keep user-scoped policies for INSERT/UPDATE/DELETE
-- (these already exist, just ensuring they're correct)

-- ============================================================
-- Performance Indexes
-- ============================================================

-- Composite index for marketplace filtering
CREATE INDEX IF NOT EXISTS idx_products_marketplace_category 
  ON products(is_active, marketplace_category, marketplace_subcategory) 
  WHERE is_active = true;

-- Price filtering index
CREATE INDEX IF NOT EXISTS idx_products_price_filter 
  ON products(is_active, price) 
  WHERE is_active = true;

-- Full-text search index on description
CREATE INDEX IF NOT EXISTS idx_products_description_search 
  ON products USING gin(to_tsvector('english', description));

-- Composite index for sorting by price
CREATE INDEX IF NOT EXISTS idx_products_price_sort 
  ON products(marketplace_category, price DESC) 
  WHERE is_active = true;

-- Composite index for sorting by date
CREATE INDEX IF NOT EXISTS idx_products_created_sort 
  ON products(marketplace_category, created_at DESC) 
  WHERE is_active = true;

-- Index for user's own products (dashboard view)
CREATE INDEX IF NOT EXISTS idx_products_user_active 
  ON products(user_id, is_active);

-- ============================================================
-- Comments for Documentation
-- ============================================================
COMMENT ON COLUMN products.marketplace_category IS 'Standardized marketplace category: Bicycles, Parts, Apparel, or Nutrition';
COMMENT ON COLUMN products.marketplace_subcategory IS 'Marketplace subcategory within main category';
COMMENT ON FUNCTION map_to_marketplace_category IS 'Maps Lightspeed categories to standardized marketplace categories using pattern matching';

