-- Repair: Ensure needs_secondary_review column exists on products table
-- This migration is idempotent and can be run multiple times safely

DO $$
BEGIN
    -- Add needs_secondary_review if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'needs_secondary_review'
    ) THEN
        ALTER TABLE products ADD COLUMN needs_secondary_review BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add secondary_review_flagged_at if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'secondary_review_flagged_at'
    ) THEN
        ALTER TABLE products ADD COLUMN secondary_review_flagged_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_products_needs_secondary_review 
  ON products(needs_secondary_review) 
  WHERE needs_secondary_review = TRUE;

-- Add comments
COMMENT ON COLUMN products.needs_secondary_review IS 'True if product has been flagged for secondary review by another admin';
COMMENT ON COLUMN products.secondary_review_flagged_at IS 'Timestamp when product was flagged for secondary review';

