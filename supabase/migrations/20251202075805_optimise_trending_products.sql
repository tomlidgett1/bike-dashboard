-- ============================================================
-- Optimise Trending Products Query
-- Reduces 2 sequential queries → 1 efficient query
-- Expected improvement: 3.00s → ~200ms
-- ============================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_trending_products(INTEGER, TEXT, TEXT);

-- Create optimised function for trending products
-- Combines product_scores lookup with product data in a single query
CREATE OR REPLACE FUNCTION get_trending_products(
  p_limit INTEGER DEFAULT 50,
  p_category TEXT DEFAULT NULL,
  p_listing_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  description TEXT,
  display_name TEXT,
  price NUMERIC,
  marketplace_category TEXT,
  marketplace_subcategory TEXT,
  primary_image_url TEXT,
  user_id UUID,
  listing_type TEXT,
  images JSONB,
  created_at TIMESTAMPTZ,
  trending_score NUMERIC,
  store_name TEXT,
  store_logo_url TEXT,
  use_custom_image BOOLEAN,
  custom_image_url TEXT,
  canonical_product_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.description,
    p.display_name,
    p.price,
    p.marketplace_category,
    p.marketplace_subcategory,
    p.primary_image_url,
    p.user_id,
    p.listing_type,
    p.images,
    p.created_at,
    ps.trending_score,
    u.business_name AS store_name,
    u.logo_url AS store_logo_url,
    p.use_custom_image,
    p.custom_image_url,
    p.canonical_product_id
  FROM products p
  INNER JOIN product_scores ps ON ps.product_id = p.id
  LEFT JOIN users u ON u.user_id = p.user_id
  WHERE p.is_active = true
    AND ps.trending_score > 0
    AND (p_category IS NULL OR p.marketplace_category = p_category)
    AND (p_listing_type IS NULL OR p.listing_type = p_listing_type)
  ORDER BY ps.trending_score DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_trending_products(INTEGER, TEXT, TEXT) TO authenticated, anon;

-- ===========================================
-- Add index for faster trending lookups
-- ===========================================

-- Index on product_scores for trending queries
CREATE INDEX IF NOT EXISTS idx_product_scores_trending 
ON product_scores(trending_score DESC) 
WHERE trending_score > 0;

-- Composite index for product filtering
CREATE INDEX IF NOT EXISTS idx_products_category_listing_active 
ON products(marketplace_category, listing_type) 
WHERE is_active = true;

-- ===========================================
-- Analyse tables for query optimiser
-- ===========================================
ANALYZE product_scores;
ANALYZE products;

