-- Cache AI / catalogue category suggestions for products missing a Lightspeed category.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS suggested_category_id TEXT,
  ADD COLUMN IF NOT EXISTS suggested_category_label TEXT,
  ADD COLUMN IF NOT EXISTS suggested_category_source TEXT,
  ADD COLUMN IF NOT EXISTS suggested_category_confidence TEXT,
  ADD COLUMN IF NOT EXISTS suggested_category_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS suggested_category_at TIMESTAMPTZ;

COMMENT ON COLUMN public.products.suggested_category_id IS
  'Cached Lightspeed category suggestion for missing-category workflow (cleared when category is set).';
COMMENT ON COLUMN public.products.suggested_category_fingerprint IS
  'Hash of product title + brand; invalidates cache when the product changes.';
