-- ============================================================
-- Add needs_secondary_review column to products table
-- ============================================================
-- Tracks which products have been flagged for secondary review
-- by an admin (to be checked by another person later)

-- Add needs_secondary_review column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS needs_secondary_review BOOLEAN DEFAULT FALSE;

-- Add timestamp for when it was flagged
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS secondary_review_flagged_at TIMESTAMPTZ;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_products_needs_secondary_review 
  ON products(needs_secondary_review) 
  WHERE needs_secondary_review = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN products.needs_secondary_review IS 'True if product has been flagged for secondary review by another admin';
COMMENT ON COLUMN products.secondary_review_flagged_at IS 'Timestamp when product was flagged for secondary review';

