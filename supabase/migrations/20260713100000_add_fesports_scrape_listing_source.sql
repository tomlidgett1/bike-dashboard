-- Add 'fesports_scrape' to the products listing_source CHECK constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'products'
      AND constraint_name = 'products_listing_source_check'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT products_listing_source_check;
  END IF;
END $$;

ALTER TABLE products
ADD CONSTRAINT products_listing_source_check
CHECK (listing_source IN ('lightspeed', 'manual', 'facebook_import', 'scheduled', 'online_catalog', 'fesports_scrape'));

COMMENT ON CONSTRAINT products_listing_source_check ON products IS
  'Valid listing sources: lightspeed (POS sync), manual (store entry), facebook_import, scheduled, online_catalog (screenshot AI), fesports_scrape (FE Sports catalogue import)';
