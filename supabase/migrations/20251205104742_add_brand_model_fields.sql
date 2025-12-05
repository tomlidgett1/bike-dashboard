-- ============================================================
-- Add Brand and Model Fields to Products Table
-- ============================================================
-- Adds brand and model fields for marketplace listings

-- Add brand column (stored in manufacturer_name field historically, but adding dedicated field for clarity)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS brand TEXT;

-- Add model column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS model TEXT;

-- Create indexes for filtering/searching
CREATE INDEX IF NOT EXISTS idx_products_brand 
  ON products(brand) 
  WHERE brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_model 
  ON products(model) 
  WHERE model IS NOT NULL;

-- Composite index for brand + model searches
CREATE INDEX IF NOT EXISTS idx_products_brand_model 
  ON products(brand, model) 
  WHERE brand IS NOT NULL AND model IS NOT NULL;

-- Add comments
COMMENT ON COLUMN products.brand IS 'Brand/manufacturer name for marketplace listings (e.g., Trek, Specialized, Giant)';
COMMENT ON COLUMN products.model IS 'Model name for marketplace listings (e.g., Domane SL6, Stumpjumper)';

