-- Add price and cost columns to products_all_ls table
ALTER TABLE products_all_ls 
ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS default_cost DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_cost DECIMAL(10, 2) DEFAULT 0;

-- Add index for price queries
CREATE INDEX IF NOT EXISTS products_all_ls_price_idx ON products_all_ls(price);

COMMENT ON COLUMN products_all_ls.price IS 'Default selling price from Lightspeed';
COMMENT ON COLUMN products_all_ls.default_cost IS 'Default cost from Lightspeed';
COMMENT ON COLUMN products_all_ls.avg_cost IS 'Average cost from Lightspeed';

