-- Preserve the original Lightspeed category label when a carousel is renamed.
ALTER TABLE store_categories
  ADD COLUMN IF NOT EXISTS lightspeed_category_name TEXT;

COMMENT ON COLUMN store_categories.lightspeed_category_name IS
  'Original Lightspeed category name at import time; display name may differ via name column.';
