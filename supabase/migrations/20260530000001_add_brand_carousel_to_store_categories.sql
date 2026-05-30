-- Add brand carousel support to store_categories
-- Allows stores to create carousels that dynamically show products from a specific brand

-- 1. Add brand_name column
ALTER TABLE store_categories
  ADD COLUMN IF NOT EXISTS brand_name TEXT;

-- 2. Widen the source check constraint to include 'brand'
ALTER TABLE store_categories
  DROP CONSTRAINT IF EXISTS store_categories_source_check;

ALTER TABLE store_categories
  ADD CONSTRAINT store_categories_source_check
    CHECK (source IN ('lightspeed', 'custom', 'brand', 'display_override'));
