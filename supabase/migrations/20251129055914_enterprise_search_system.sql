-- ============================================================
-- Enterprise-Level Search System for Marketplace
-- ============================================================
-- Implements sophisticated multi-field fuzzy search with:
-- - Full-text search across multiple fields
-- - Trigram similarity for typo tolerance
-- - Weighted relevance ranking
-- - Partial word matching
-- - Fast GIN indexes
-- ============================================================

-- Ensure pg_trgm extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Add Generated Search Column
-- ============================================================
-- Combines all searchable fields into one for efficient full-text search
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS search_text TEXT GENERATED ALWAYS AS (
  COALESCE(display_name, '') || ' ' ||
  COALESCE(description, '') || ' ' ||
  COALESCE(marketplace_category, '') || ' ' ||
  COALESCE(marketplace_subcategory, '') || ' ' ||
  COALESCE(marketplace_level_3_category, '') || ' ' ||
  COALESCE(manufacturer_name, '') || ' ' ||
  COALESCE(category_name, '')
) STORED;

-- ============================================================
-- Create Advanced Search Indexes
-- ============================================================

-- Full-text search index with English configuration
-- Handles stemming, stop words, and proper text search
CREATE INDEX IF NOT EXISTS idx_products_search_fts 
ON products USING gin(to_tsvector('english', search_text))
WHERE is_active = true;

-- Trigram index for fuzzy matching (typo tolerance)
-- Enables similarity searches and LIKE queries
CREATE INDEX IF NOT EXISTS idx_products_search_trgm 
ON products USING gin(search_text gin_trgm_ops)
WHERE is_active = true;

-- Separate trigram index on display_name for exact product name searches
CREATE INDEX IF NOT EXISTS idx_products_display_name_trgm 
ON products USING gin(display_name gin_trgm_ops)
WHERE is_active = true AND display_name IS NOT NULL;

-- Separate trigram index on description for fallback searches
CREATE INDEX IF NOT EXISTS idx_products_description_trgm 
ON products USING gin(description gin_trgm_ops)
WHERE is_active = true;

-- ============================================================
-- Enterprise Search Function
-- ============================================================
-- Returns products matching search query with relevance scoring
-- Combines full-text search and fuzzy matching
CREATE OR REPLACE FUNCTION search_marketplace_products(
  search_query TEXT,
  similarity_threshold FLOAT DEFAULT 0.2
)
RETURNS TABLE (
  product_id UUID,
  relevance_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS product_id,
    -- Calculate relevance score (higher is better)
    (
      -- Full-text search relevance (highest weight)
      COALESCE(ts_rank(to_tsvector('english', p.search_text), websearch_to_tsquery('english', search_query)), 0) * 10 +
      
      -- Trigram similarity on display_name (high weight - cleaned names)
      COALESCE(similarity(p.display_name, search_query) * 5, 0) +
      
      -- Trigram similarity on description (medium weight)
      COALESCE(similarity(p.description, search_query) * 3, 0) +
      
      -- Trigram similarity on full search text (base weight)
      COALESCE(similarity(p.search_text, search_query), 0) +
      
      -- Bonus for exact substring matches in display_name
      CASE WHEN p.display_name ILIKE '%' || search_query || '%' THEN 2 ELSE 0 END +
      
      -- Bonus for exact substring matches in description
      CASE WHEN p.description ILIKE '%' || search_query || '%' THEN 1 ELSE 0 END
    ) AS relevance_score
  FROM products p
  WHERE 
    p.is_active = true
    AND (
      -- Full-text search match
      to_tsvector('english', p.search_text) @@ websearch_to_tsquery('english', search_query)
      OR
      -- Fuzzy match on display_name
      similarity(p.display_name, search_query) > similarity_threshold
      OR
      -- Fuzzy match on description
      similarity(p.description, search_query) > similarity_threshold
      OR
      -- Fuzzy match on full search text
      similarity(p.search_text, search_query) > similarity_threshold
      OR
      -- Substring match in display_name
      p.display_name ILIKE '%' || search_query || '%'
      OR
      -- Substring match in description
      p.description ILIKE '%' || search_query || '%'
    )
  ORDER BY relevance_score DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Quick Search Function (Optimized for Speed)
-- ============================================================
-- Faster version for instant search / autocomplete
CREATE OR REPLACE FUNCTION quick_search_products(
  search_query TEXT,
  max_results INT DEFAULT 20
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  product_price DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS product_id,
    COALESCE(p.display_name, p.description) AS product_name,
    p.price AS product_price
  FROM products p
  WHERE 
    p.is_active = true
    AND (
      p.display_name ILIKE '%' || search_query || '%'
      OR p.description ILIKE '%' || search_query || '%'
      OR similarity(p.display_name, search_query) > 0.3
    )
  ORDER BY 
    -- Prioritize display_name matches
    CASE WHEN p.display_name ILIKE search_query || '%' THEN 1
         WHEN p.display_name ILIKE '%' || search_query || '%' THEN 2
         ELSE 3 END,
    p.price DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Performance Comments
-- ============================================================
COMMENT ON COLUMN products.search_text IS 'Generated column combining all searchable fields for efficient full-text search';
COMMENT ON INDEX idx_products_search_fts IS 'Full-text search index with stemming and stop words';
COMMENT ON INDEX idx_products_search_trgm IS 'Trigram index for fuzzy matching and typo tolerance';
COMMENT ON FUNCTION search_marketplace_products IS 'Enterprise search with relevance scoring across multiple fields';
COMMENT ON FUNCTION quick_search_products IS 'Fast autocomplete search for instant results';

-- ============================================================
-- Update existing products to populate search_text
-- ============================================================
-- The GENERATED column will auto-populate, but we can force a refresh
UPDATE products SET updated_at = updated_at WHERE is_active = true;

