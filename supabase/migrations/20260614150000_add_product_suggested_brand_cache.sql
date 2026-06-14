-- Cache AI / catalogue brand suggestions for products missing a manufacturer.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS suggested_brand_name TEXT,
  ADD COLUMN IF NOT EXISTS suggested_brand_manufacturer_id TEXT,
  ADD COLUMN IF NOT EXISTS suggested_brand_source TEXT,
  ADD COLUMN IF NOT EXISTS suggested_brand_confidence TEXT,
  ADD COLUMN IF NOT EXISTS suggested_brand_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS suggested_brand_at TIMESTAMPTZ;

COMMENT ON COLUMN public.products.suggested_brand_name IS
  'Cached brand suggestion for missing-brand workflow (cleared when manufacturer is set).';
COMMENT ON COLUMN public.products.suggested_brand_fingerprint IS
  'Hash of product title + category; invalidates cache when the product changes.';
