-- ============================================================
-- Add Marketplace Level 3 Category
-- ============================================================
-- Adds marketplace_level_3_category column for granular categorization
-- e.g., "Bicycles" > "Mountain" > "Trail"

-- Add level 3 category column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS marketplace_level_3_category TEXT;

-- Add index for filtering by level 3
CREATE INDEX IF NOT EXISTS idx_products_marketplace_level_3 
  ON products(marketplace_level_3_category) 
  WHERE marketplace_level_3_category IS NOT NULL;

-- Add composite index for full category hierarchy
CREATE INDEX IF NOT EXISTS idx_products_marketplace_categories 
  ON products(marketplace_category, marketplace_subcategory, marketplace_level_3_category);

-- Add comment
COMMENT ON COLUMN products.marketplace_level_3_category IS 'Third level of marketplace categorization (e.g., XC, Trail, Enduro for Mountain bikes)';










