-- Description: Allow Bike from URL imports on products.listing_source
-- Date: 2026-07-16
--
-- The scrape "Bike from URL" flow inserts listing_source = 'bike_url_import'.
-- The previous CHECK constraint only allowed supplier/FE Sports scrape sources.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND constraint_name = 'products_listing_source_check'
  ) THEN
    ALTER TABLE public.products DROP CONSTRAINT products_listing_source_check;
  END IF;
END $$;

ALTER TABLE public.products
  ADD CONSTRAINT products_listing_source_check
  CHECK (
    listing_source IN (
      'lightspeed',
      'manual',
      'facebook_import',
      'scheduled',
      'online_catalog',
      'fesports_scrape',
      'supplier_scrape',
      'bike_url_import'
    )
  );

COMMENT ON CONSTRAINT products_listing_source_check ON public.products IS
  'Valid listing sources: lightspeed, manual, facebook_import, scheduled, online_catalog, fesports_scrape, supplier_scrape, bike_url_import';
