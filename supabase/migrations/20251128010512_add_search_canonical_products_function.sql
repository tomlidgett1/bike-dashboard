-- ============================================================
-- RPC Function for Fuzzy Name Search
-- ============================================================

CREATE OR REPLACE FUNCTION search_canonical_products_by_name(
  search_term TEXT,
  min_similarity DECIMAL DEFAULT 0.3,
  result_limit INTEGER DEFAULT 5,
  filter_category TEXT DEFAULT NULL,
  filter_manufacturer TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  upc TEXT,
  normalized_name TEXT,
  category TEXT,
  manufacturer TEXT,
  image_count INTEGER,
  similarity DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cp.id,
    cp.upc,
    cp.normalized_name,
    cp.category,
    cp.manufacturer,
    cp.image_count,
    similarity(cp.normalized_name, search_term) AS similarity
  FROM canonical_products cp
  WHERE 
    similarity(cp.normalized_name, search_term) >= min_similarity
    AND (filter_category IS NULL OR cp.category = filter_category)
    AND (filter_manufacturer IS NULL OR cp.manufacturer ILIKE '%' || filter_manufacturer || '%')
  ORDER BY similarity DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_canonical_products_by_name TO authenticated;

COMMENT ON FUNCTION search_canonical_products_by_name IS 'Searches canonical products using trigram similarity matching on product names';














