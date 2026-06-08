-- Mark store products as complete bicycles and store structured component specs
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bicycle BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bike_specs JSONB;

COMMENT ON COLUMN products.is_bicycle IS 'When true, product uses the bicycle product page layout with structured component specs';
COMMENT ON COLUMN products.bike_specs IS 'Structured bicycle specification sheet: { sections: [{ title, specs: [{ label, value }] }] }';

CREATE INDEX IF NOT EXISTS idx_products_is_bicycle ON products (is_bicycle) WHERE is_bicycle = true;
