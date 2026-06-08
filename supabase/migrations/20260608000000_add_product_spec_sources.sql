-- Official source citations for AI-generated product copy (titles, descriptions, specs).
-- Stored as an array of { url, title, is_official_brand } objects, mirroring
-- bike_specs.metadata.sources so the same UI can render either.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_spec_sources JSONB;

COMMENT ON COLUMN products.product_spec_sources IS
  'Official manufacturer source citations captured during AI copy generation (Product Optimise). Array of { url, title, is_official_brand }.';
