-- ============================================================
-- Add Shipping Fields to Products Table
-- ============================================================
-- Adds shipping and pickup options for marketplace listings

-- Add shipping_available column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS shipping_available BOOLEAN DEFAULT false;

-- Add shipping_cost column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(10, 2) DEFAULT NULL;

-- Add pickup_location column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS pickup_location TEXT DEFAULT NULL;

-- Add pickup_only column (indicates listing is pickup only, no shipping)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS pickup_only BOOLEAN DEFAULT false;

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_products_shipping_available 
  ON products(shipping_available) 
  WHERE shipping_available = true;

CREATE INDEX IF NOT EXISTS idx_products_pickup_only 
  ON products(pickup_only) 
  WHERE pickup_only = true;

-- Add comments
COMMENT ON COLUMN products.shipping_available IS 'Whether the seller offers shipping for this product';
COMMENT ON COLUMN products.shipping_cost IS 'Seller-defined shipping cost in AUD (null if free or not available)';
COMMENT ON COLUMN products.pickup_location IS 'Location where buyer can pick up the item (suburb/city)';
COMMENT ON COLUMN products.pickup_only IS 'If true, only pickup is available (no shipping options)';


