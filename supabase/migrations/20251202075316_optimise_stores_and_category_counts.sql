-- ============================================================
-- Optimise Stores and Category Counts Queries
-- Reduces N+1 query problem (50+ queries → 1 query)
-- Expected improvement: 4.89s → ~50ms for stores page
-- ============================================================

-- ===========================================
-- 1. STORES WITH PRODUCT COUNTS (Single Query)
-- ===========================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_stores_with_product_counts();

-- Create optimised function that returns stores with their active product counts
-- This replaces N+1 queries with a single efficient query
CREATE OR REPLACE FUNCTION get_stores_with_product_counts()
RETURNS TABLE (
  user_id UUID,
  business_name TEXT,
  store_type TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ,
  product_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.user_id,
    u.business_name,
    u.store_type,
    u.logo_url,
    u.created_at,
    COALESCE(pc.cnt, 0) AS product_count
  FROM users u
  LEFT JOIN (
    SELECT 
      p.user_id,
      COUNT(*) AS cnt
    FROM products p
    WHERE p.is_active = true
    GROUP BY p.user_id
  ) pc ON pc.user_id = u.user_id
  WHERE COALESCE(pc.cnt, 0) > 0
  ORDER BY u.created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_stores_with_product_counts() TO authenticated, anon;

-- ===========================================
-- 2. CATEGORY COUNTS (Efficient Aggregation)
-- ===========================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_marketplace_category_counts();

-- Create optimised function for category counts
-- Uses direct aggregation instead of fetching all products
CREATE OR REPLACE FUNCTION get_marketplace_category_counts()
RETURNS TABLE (
  category TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.marketplace_category AS category,
    COUNT(*) AS count
  FROM products p
  WHERE p.is_active = true
    AND p.marketplace_category IS NOT NULL
    AND p.marketplace_category != ''
    AND (p.listing_status IS NULL OR p.listing_status = 'active')
  GROUP BY p.marketplace_category
  ORDER BY count DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_marketplace_category_counts() TO authenticated, anon;

-- ===========================================
-- 3. Create Indexes for Performance
-- ===========================================

-- Index for product counts by user (if not exists)
CREATE INDEX IF NOT EXISTS idx_products_user_active 
ON products(user_id) 
WHERE is_active = true;

-- Index for category counts (if not exists)
CREATE INDEX IF NOT EXISTS idx_products_category_active 
ON products(marketplace_category) 
WHERE is_active = true 
  AND marketplace_category IS NOT NULL;

-- Composite index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_products_active_status 
ON products(is_active, listing_status) 
WHERE is_active = true;

-- ===========================================
-- 4. Analyse tables for query optimiser
-- ===========================================
ANALYZE products;
ANALYZE users;

