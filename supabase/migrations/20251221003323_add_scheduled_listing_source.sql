-- ============================================================
-- Add 'scheduled' to listing_source check constraint
-- ============================================================
-- Allows scheduled listings to be published with listing_source = 'scheduled'

-- Drop the existing constraint
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

-- Add the updated constraint with 'scheduled' included
ALTER TABLE products 
ADD CONSTRAINT products_listing_source_check 
CHECK (listing_source IN ('lightspeed', 'manual', 'facebook_import', 'scheduled'));

-- Add comment
COMMENT ON CONSTRAINT products_listing_source_check ON products IS 
  'Allowed listing sources: lightspeed (POS sync), manual (user created), facebook_import (imported from FB), scheduled (admin scheduled upload)';

