-- ============================================================
-- Canonical Products Table
-- ============================================================
-- This table stores the global product catalog with deduplicated products
-- based on UPC codes. Multiple stores can reference the same canonical product.

-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable fuzzystrmatch for Levenshtein distance
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

CREATE TABLE IF NOT EXISTS canonical_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Product Identifiers
  upc TEXT UNIQUE NOT NULL,
  normalized_name TEXT NOT NULL,
  
  -- Product Details
  category TEXT,
  manufacturer TEXT,
  model_year TEXT,
  
  -- Metadata
  image_count INTEGER DEFAULT 0,
  product_count INTEGER DEFAULT 0, -- Number of store products linked to this
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for Fast Lookups
-- ============================================================

-- Primary UPC lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_canonical_upc ON canonical_products(upc);

-- Full-text search on normalized name
CREATE INDEX IF NOT EXISTS idx_canonical_normalized_name 
  ON canonical_products USING gin(to_tsvector('english', normalized_name));

-- Trigram index for fuzzy name matching
CREATE INDEX IF NOT EXISTS idx_canonical_name_trgm 
  ON canonical_products USING gin(normalized_name gin_trgm_ops);

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_canonical_category ON canonical_products(category);

-- Manufacturer filtering
CREATE INDEX IF NOT EXISTS idx_canonical_manufacturer ON canonical_products(manufacturer);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_canonical_category_manufacturer 
  ON canonical_products(category, manufacturer);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE canonical_products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies - Public Read, Authenticated Write
-- ============================================================

-- Anyone can view canonical products (needed for marketplace)
CREATE POLICY "Public can view canonical products"
  ON canonical_products FOR SELECT
  USING (true);

-- Authenticated users can insert canonical products
CREATE POLICY "Authenticated users can insert canonical products"
  ON canonical_products FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update canonical products
CREATE POLICY "Authenticated users can update canonical products"
  ON canonical_products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only service role can delete (prevent accidental deletion)
CREATE POLICY "Service role can delete canonical products"
  ON canonical_products FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- Trigger for updated_at
-- ============================================================
CREATE TRIGGER update_canonical_products_updated_at
  BEFORE UPDATE ON canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Helper Function: Normalize Product Name
-- ============================================================
-- Normalizes product names for consistent matching
CREATE OR REPLACE FUNCTION normalize_product_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRIM(name),
        '\s+', ' ', 'g'  -- Replace multiple spaces with single space
      ),
      '[^\w\s-]', '', 'g'  -- Remove special characters except hyphens
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Comments for Documentation
-- ============================================================
COMMENT ON TABLE canonical_products IS 'Global product catalog indexed by UPC for image deduplication across stores';
COMMENT ON COLUMN canonical_products.upc IS 'Universal Product Code - unique identifier across all stores';
COMMENT ON COLUMN canonical_products.normalized_name IS 'Lowercase, normalized product name for fuzzy matching';
COMMENT ON COLUMN canonical_products.image_count IS 'Number of images associated with this product';
COMMENT ON COLUMN canonical_products.product_count IS 'Number of store products linked to this canonical product';











