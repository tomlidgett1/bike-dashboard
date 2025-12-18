-- Add seller_notes column to products table
-- This field stores the seller's personal notes about the item (condition, wear, why selling, etc.)
-- Separate from description which is the product description (features, specs, what it is)

ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN products.seller_notes IS 'Seller personal notes about the item - condition, wear, why selling, etc.';


