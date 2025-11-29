-- ============================================================
-- Marketplace Performance Optimization for 10M+ Products
-- ============================================================

-- ============================================================
-- 1. Critical Indexes for Fast Marketplace Queries
-- ============================================================

-- Composite index for marketplace filtering with images
CREATE INDEX IF NOT EXISTS idx_products_marketplace_with_images
ON products (is_active, marketplace_category, marketplace_subcategory, canonical_product_id)
WHERE is_active = true;

-- Index for price sorting
CREATE INDEX IF NOT EXISTS idx_products_marketplace_price
ON products (is_active, marketplace_category, price DESC)
WHERE is_active = true;

-- Index for date sorting (newest first)
CREATE INDEX IF NOT EXISTS idx_products_marketplace_newest
ON products (is_active, created_at DESC)
WHERE is_active = true;

-- Covering index for marketplace list queries (includes all columns needed)
CREATE INDEX IF NOT EXISTS idx_products_marketplace_covering
ON products (
  is_active,
  marketplace_category,
  marketplace_subcategory,
  created_at DESC
)
INCLUDE (
  id,
  description,
  price,
  qoh,
  model_year,
  canonical_product_id,
  use_custom_image,
  custom_image_url
)
WHERE is_active = true;

-- ============================================================
-- 2. Materialized View for Ultra-Fast Marketplace Queries
-- ============================================================

-- Drop existing view if exists
DROP MATERIALIZED VIEW IF EXISTS marketplace_products_optimized CASCADE;

-- Create optimized materialized view with pre-joined image data
CREATE MATERIALIZED VIEW marketplace_products_optimized AS
SELECT 
  p.id,
  p.description,
  p.price,
  p.marketplace_category,
  p.marketplace_subcategory,
  p.qoh,
  p.model_year,
  p.created_at,
  p.user_id,
  p.canonical_product_id,
  p.use_custom_image,
  p.custom_image_url,
  
  -- Pre-compute resolved image data
  CASE 
    WHEN p.use_custom_image THEN p.custom_image_url
    ELSE pi.storage_path
  END AS resolved_image_path,
  
  pi.variants AS image_variants,
  pi.formats AS image_formats,
  pi.is_primary AS image_is_primary,
  
  -- Metadata for sorting/filtering
  cp.upc AS canonical_upc,
  cp.normalized_name AS canonical_name
  
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
LEFT JOIN product_images pi ON cp.id = pi.canonical_product_id AND pi.is_primary = true
WHERE p.is_active = true;

-- Indexes on materialized view for lightning-fast queries
CREATE UNIQUE INDEX idx_marketplace_optimized_id ON marketplace_products_optimized (id);
CREATE INDEX idx_marketplace_optimized_category ON marketplace_products_optimized (marketplace_category, marketplace_subcategory);
CREATE INDEX idx_marketplace_optimized_price ON marketplace_products_optimized (price);
CREATE INDEX idx_marketplace_optimized_created ON marketplace_products_optimized (created_at DESC);
CREATE INDEX idx_marketplace_optimized_search ON marketplace_products_optimized USING gin(to_tsvector('english', description));

-- ============================================================
-- 3. Function to Refresh Materialized View
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_marketplace_products()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW marketplace_products_optimized;
  RAISE NOTICE 'Marketplace products view refreshed at %', NOW();
END;
$$;

-- ============================================================
-- 4. Automatic Refresh on Product/Image Changes (Trigger)
-- ============================================================

-- Function to queue materialized view refresh
CREATE OR REPLACE FUNCTION queue_marketplace_refresh()
RETURNS TRIGGER AS $$
BEGIN
  -- Use pg_notify to trigger async refresh (prevents blocking)
  PERFORM pg_notify('marketplace_refresh', json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'timestamp', NOW()
  )::text);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger on products table
DROP TRIGGER IF EXISTS trigger_marketplace_refresh_products ON products;
CREATE TRIGGER trigger_marketplace_refresh_products
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH STATEMENT
  EXECUTE FUNCTION queue_marketplace_refresh();

-- Trigger on product_images table
DROP TRIGGER IF EXISTS trigger_marketplace_refresh_images ON product_images;
CREATE TRIGGER trigger_marketplace_refresh_images
  AFTER INSERT OR UPDATE OR DELETE ON product_images
  FOR EACH STATEMENT
  EXECUTE FUNCTION queue_marketplace_refresh();

-- ============================================================
-- 5. Scheduled Refresh (Every 5 minutes) using pg_cron
-- ============================================================

-- Install pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule materialized view refresh every 5 minutes
SELECT cron.schedule(
  'refresh-marketplace-products',
  '*/5 * * * *', -- Every 5 minutes
  $$SELECT refresh_marketplace_products()$$
);

-- ============================================================
-- 6. Fast Count Function (for pagination)
-- ============================================================

-- Much faster than COUNT(*) for large tables
CREATE OR REPLACE FUNCTION get_marketplace_product_count(
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result INTEGER;
BEGIN
  -- Use materialized view for speed
  SELECT COUNT(*)::INTEGER INTO result
  FROM marketplace_products_optimized
  WHERE (p_category IS NULL OR marketplace_category = p_category)
    AND (p_subcategory IS NULL OR marketplace_subcategory = p_subcategory);
    
  RETURN result;
END;
$$;

-- ============================================================
-- 7. Optimized Query Function for Marketplace
-- ============================================================

CREATE OR REPLACE FUNCTION get_marketplace_products(
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_min_price DECIMAL DEFAULT NULL,
  p_max_price DECIMAL DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'newest',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 24
)
RETURNS TABLE (
  id UUID,
  description TEXT,
  price DECIMAL,
  marketplace_category TEXT,
  marketplace_subcategory TEXT,
  qoh INTEGER,
  model_year TEXT,
  created_at TIMESTAMPTZ,
  user_id UUID,
  resolved_image_path TEXT,
  image_variants JSONB,
  image_formats JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INTEGER;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  
  RETURN QUERY
  SELECT 
    m.id,
    m.description,
    m.price,
    m.marketplace_category,
    m.marketplace_subcategory,
    m.qoh,
    m.model_year,
    m.created_at,
    m.user_id,
    m.resolved_image_path,
    m.image_variants,
    m.image_formats
  FROM marketplace_products_optimized m
  WHERE 
    (p_category IS NULL OR m.marketplace_category = p_category)
    AND (p_subcategory IS NULL OR m.marketplace_subcategory = p_subcategory)
    AND (p_min_price IS NULL OR m.price >= p_min_price)
    AND (p_max_price IS NULL OR m.price <= p_max_price)
    AND (p_search IS NULL OR to_tsvector('english', m.description) @@ websearch_to_tsquery('english', p_search))
  ORDER BY
    CASE 
      WHEN p_sort_by = 'price_asc' THEN m.price
      ELSE NULL
    END ASC NULLS LAST,
    CASE 
      WHEN p_sort_by = 'price_desc' THEN m.price
      ELSE NULL
    END DESC NULLS LAST,
    CASE 
      WHEN p_sort_by = 'oldest' THEN m.created_at
      ELSE NULL
    END ASC NULLS LAST,
    CASE 
      WHEN p_sort_by = 'newest' THEN m.created_at
      ELSE NULL
    END DESC NULLS LAST,
    m.created_at DESC -- Default sort
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_marketplace_products TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_marketplace_product_count TO anon, authenticated;

-- ============================================================
-- 8. Database Statistics for Query Planner
-- ============================================================

-- Analyze tables for optimal query planning
ANALYZE products;
ANALYZE canonical_products;
ANALYZE product_images;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON MATERIALIZED VIEW marketplace_products_optimized IS 'Pre-joined marketplace data for ultra-fast queries on 10M+ products';
COMMENT ON FUNCTION get_marketplace_products IS 'Optimized function for marketplace product queries with filtering and pagination';
COMMENT ON FUNCTION refresh_marketplace_products IS 'Refreshes marketplace materialized view, scheduled every 5 minutes';

-- ============================================================
-- Initial Refresh
-- ============================================================

SELECT refresh_marketplace_products();

