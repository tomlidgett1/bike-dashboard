-- ============================================================
-- Add Facebook Source URL to Products Table
-- ============================================================
-- Adds facebook_source_url column to track listings imported from Facebook Marketplace
-- This allows us to preserve the original Facebook listing link for reference

-- Add facebook_source_url column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS facebook_source_url TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_facebook_source_url 
  ON products(facebook_source_url) 
  WHERE facebook_source_url IS NOT NULL;

-- Add comment
COMMENT ON COLUMN products.facebook_source_url IS 'Original Facebook Marketplace URL if listing was imported from Facebook';

-- Update listing_source check to include 'facebook_import' option
-- First, check if the constraint exists and drop it if it does
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'products_listing_source_check'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT products_listing_source_check;
  END IF;
END $$;

-- Add the updated constraint
ALTER TABLE products 
ADD CONSTRAINT products_listing_source_check 
CHECK (listing_source IN ('lightspeed', 'manual', 'facebook_import'));







