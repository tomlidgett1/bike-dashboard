-- Assign store carousels to Products or Bikes storefront tabs
ALTER TABLE store_categories
  ADD COLUMN IF NOT EXISTS store_page TEXT NOT NULL DEFAULT 'products';

ALTER TABLE store_categories
  DROP CONSTRAINT IF EXISTS store_categories_store_page_check;

ALTER TABLE store_categories
  ADD CONSTRAINT store_categories_store_page_check
  CHECK (store_page IN ('products', 'bikes'));

COMMENT ON COLUMN store_categories.store_page IS
  'Storefront tab where this carousel appears: products (default) or bikes';
