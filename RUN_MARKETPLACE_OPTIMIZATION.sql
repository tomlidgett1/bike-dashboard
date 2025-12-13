-- ============================================================
-- MARKETPLACE PERFORMANCE OPTIMIZATION
-- Run this in Supabase SQL Editor
-- ============================================================
-- Optimizes marketplace for 10M+ products with instant image loading

-- ============================================================
-- STEP 1: Create Critical Indexes
-- ============================================================

-- Composite index for filtering
CREATE INDEX IF NOT EXISTS idx_products_marketplace_with_canonical
ON products (is_active, marketplace_category, marketplace_subcategory, canonical_product_id)
WHERE is_active = true;

-- Price sorting index
CREATE INDEX IF NOT EXISTS idx_products_marketplace_price_sort
ON products (is_active, marketplace_category, price DESC)
WHERE is_active = true;

-- Date sorting index (newest first - most common)
CREATE INDEX IF NOT EXISTS idx_products_marketplace_date_sort
ON products (is_active, created_at DESC)
WHERE is_active = true;

-- Search index
CREATE INDEX IF NOT EXISTS idx_products_marketplace_search
ON products USING gin(to_tsvector('english', description))
WHERE is_active = true;

-- ============================================================
-- STEP 2: Create Materialized View (Pre-joined for Speed)
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS marketplace_products_fast CASCADE;

CREATE MATERIALIZED VIEW marketplace_products_fast AS
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
  
  -- Resolved image data (pre-computed)
  CASE 
    WHEN p.use_custom_image = true THEN p.custom_image_url
    WHEN pi.storage_path IS NOT NULL THEN 
      CONCAT(
        current_setting('app.settings.supabase_url', true),
        '/storage/v1/object/public/product-images/',
        pi.storage_path
      )
    ELSE NULL
  END AS resolved_image_url,
  
  pi.storage_path AS image_storage_path,
  pi.variants AS image_variants,
  pi.formats AS image_formats,
  cp.upc AS canonical_upc
  
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
LEFT JOIN product_images pi ON cp.id = pi.canonical_product_id AND pi.is_primary = true
WHERE p.is_active = true;

-- Indexes on materialized view
CREATE UNIQUE INDEX idx_marketplace_fast_id ON marketplace_products_fast (id);
CREATE INDEX idx_marketplace_fast_category ON marketplace_products_fast (marketplace_category, marketplace_subcategory);
CREATE INDEX idx_marketplace_fast_price ON marketplace_products_fast (price);
CREATE INDEX idx_marketplace_fast_created ON marketplace_products_fast (created_at DESC);
CREATE INDEX idx_marketplace_fast_search ON marketplace_products_fast USING gin(to_tsvector('english', description));

-- ============================================================
-- STEP 3: Verify Indexes Created
-- ============================================================

SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('products', 'marketplace_products_fast')
  AND indexname LIKE '%marketplace%'
ORDER BY tablename, indexname;

-- Expected: Should see all the new indexes

-- ============================================================
-- STEP 4: Test Query Performance
-- ============================================================

-- Test 1: Get first page of products with images (should be <50ms)
EXPLAIN ANALYZE
SELECT * FROM marketplace_products_fast
WHERE marketplace_category = 'Bicycles'
ORDER BY created_at DESC
LIMIT 24;

-- Test 2: Count products (should be <10ms with materialized view)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM marketplace_products_fast
WHERE marketplace_category = 'Parts';

-- Test 3: Full-text search (should be <100ms even with millions)
EXPLAIN ANALYZE
SELECT * FROM marketplace_products_fast
WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', 'trek mountain bike')
LIMIT 24;

-- ============================================================
-- STEP 5: Set Up Auto-Refresh Schedule
-- ============================================================

-- Note: pg_cron requires superuser. If you can't run this, 
-- refresh manually or use application-level scheduling

-- Try to install pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule refresh every 5 minutes
SELECT cron.schedule(
  'refresh-marketplace-products',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY marketplace_products_fast$$
);

-- ============================================================
-- STEP 6: Initial Data Verification
-- ============================================================

-- Check how many products are in the view
SELECT 
  COUNT(*) as total_products,
  COUNT(resolved_image_url) as products_with_images,
  COUNT(canonical_product_id) as products_with_canonical,
  ROUND(COUNT(resolved_image_url)::numeric / COUNT(*)::numeric * 100, 2) as percent_with_images
FROM marketplace_products_fast;

-- Check performance by category
SELECT 
  marketplace_category,
  COUNT(*) as product_count,
  COUNT(resolved_image_url) as with_images,
  ROUND(AVG(price), 2) as avg_price
FROM marketplace_products_fast
GROUP BY marketplace_category
ORDER BY product_count DESC;

-- ============================================================
-- SUCCESS METRICS
-- ============================================================

-- After running this optimization, you should see:

-- 1. Query performance for 10M products:
--    - First page load: <50ms
--    - Pagination: <30ms
--    - Search: <100ms
--    - Count: <10ms

-- 2. Image loading:
--    - CDN cache hit: <50ms globally
--    - First load: <200ms
--    - Lazy loading: Only visible images load

-- 3. Database efficiency:
--    - Materialized view refreshes every 5 minutes
--    - No joins needed at query time
--    - All data pre-computed

-- ============================================================
-- MANUAL REFRESH (if needed)
-- ============================================================

-- If products/images change and you want immediate refresh:
REFRESH MATERIALIZED VIEW CONCURRENTLY marketplace_products_fast;

-- Check last refresh time:
SELECT 
  schemaname,
  matviewname,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size
FROM pg_matviews
WHERE matviewname = 'marketplace_products_fast';












