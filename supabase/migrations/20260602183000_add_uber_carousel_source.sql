-- Add Uber carousel source support to store_categories.
-- Uber carousels dynamically resolve all products with uber_delivery_enabled = true.

ALTER TABLE store_categories
  DROP CONSTRAINT IF EXISTS store_categories_source_check;

ALTER TABLE store_categories
  ADD CONSTRAINT store_categories_source_check
    CHECK (source IN ('lightspeed', 'custom', 'brand', 'uber', 'display_override'));

COMMENT ON COLUMN store_categories.source IS
  'Source of category: lightspeed, custom, brand, uber, or display_override.';
