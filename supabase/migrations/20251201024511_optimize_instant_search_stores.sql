-- ============================================================
-- Optimized Store Search Function for Instant Search
-- ============================================================
-- Replaces N+1 query pattern with single efficient query
-- Returns stores matching search term WITH product counts
-- Uses indexed queries and single-pass aggregation
-- ============================================================

CREATE OR REPLACE FUNCTION search_stores_with_product_count(
  search_term TEXT,
  max_results INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  business_name TEXT,
  logo_url TEXT,
  product_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.user_id,
    u.business_name,
    u.logo_url,
    COUNT(p.id) AS product_count
  FROM users u
  LEFT JOIN products p ON p.user_id = u.user_id AND p.is_active = true
  WHERE 
    u.business_name IS NOT NULL
    AND u.business_name ILIKE '%' || search_term || '%'
  GROUP BY u.user_id, u.business_name, u.logo_url
  HAVING COUNT(p.id) > 0  -- Only return stores with active products
  ORDER BY 
    -- Prioritize exact matches and stores with more products
    CASE WHEN u.business_name ILIKE search_term || '%' THEN 0 ELSE 1 END,
    COUNT(p.id) DESC,
    u.business_name ASC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create index on business_name if it doesn't exist for fast ILIKE queries
CREATE INDEX IF NOT EXISTS idx_users_business_name_trgm 
ON users USING gin(business_name gin_trgm_ops)
WHERE business_name IS NOT NULL;

-- Create index on user_id + is_active for fast product counting
CREATE INDEX IF NOT EXISTS idx_products_user_active 
ON products(user_id, is_active)
WHERE is_active = true;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_stores_with_product_count TO anon, authenticated;

-- Performance comment
COMMENT ON FUNCTION search_stores_with_product_count IS 'Optimized store search with product counts - replaces N+1 query pattern for instant search';







