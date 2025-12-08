-- ============================================================
-- Optimise Category Filtering for Enterprise Scale
-- ============================================================
-- Adds covering indexes and optimizations for 10M+ user scale
-- Focuses on marketplace_category, marketplace_subcategory, and marketplace_level_3_category

-- ============================================================
-- Drop old indexes that are less efficient
-- ============================================================

-- These will be replaced with better covering indexes
DROP INDEX IF EXISTS idx_products_marketplace_level_3;
DROP INDEX IF EXISTS idx_products_marketplace_categories;

-- ============================================================
-- Create optimised covering indexes for category filtering
-- ============================================================

-- Covering index for Level 1 only queries (most common)
-- Includes commonly needed columns to avoid table lookups
CREATE INDEX IF NOT EXISTS idx_products_level1_covering 
  ON products (
    marketplace_category,
    is_active,
    created_at DESC,
    price
  )
  WHERE is_active = true 
    AND (listing_status IS NULL OR listing_status = 'active')
    AND marketplace_category IS NOT NULL;

-- Covering index for Level 1 + Level 2 queries
CREATE INDEX IF NOT EXISTS idx_products_level1_level2_covering 
  ON products (
    marketplace_category,
    marketplace_subcategory,
    is_active,
    created_at DESC,
    price
  )
  WHERE is_active = true 
    AND (listing_status IS NULL OR listing_status = 'active')
    AND marketplace_category IS NOT NULL
    AND marketplace_subcategory IS NOT NULL;

-- Covering index for full hierarchy (Level 1 + Level 2 + Level 3)
CREATE INDEX IF NOT EXISTS idx_products_full_hierarchy_covering 
  ON products (
    marketplace_category,
    marketplace_subcategory,
    marketplace_level_3_category,
    is_active,
    created_at DESC,
    price
  )
  WHERE is_active = true 
    AND (listing_status IS NULL OR listing_status = 'active')
    AND marketplace_category IS NOT NULL
    AND marketplace_subcategory IS NOT NULL
    AND marketplace_level_3_category IS NOT NULL;

-- ============================================================
-- Add GIN index for fast text search on category values
-- ============================================================
-- Helps with fuzzy matching and case-insensitive searches

CREATE INDEX IF NOT EXISTS idx_products_categories_gin 
  ON products USING gin (
    to_tsvector('english', 
      COALESCE(marketplace_category, '') || ' ' ||
      COALESCE(marketplace_subcategory, '') || ' ' ||
      COALESCE(marketplace_level_3_category, '')
    )
  )
  WHERE is_active = true;

-- ============================================================
-- Create materialized view for category counts (optional)
-- ============================================================
-- Pre-computed counts for extremely fast category badge loading

CREATE MATERIALIZED VIEW IF NOT EXISTS marketplace_category_counts AS
SELECT 
  marketplace_category as category,
  COUNT(*) as product_count
FROM products
WHERE is_active = true
  AND (listing_status IS NULL OR listing_status = 'active')
  AND marketplace_category IS NOT NULL
  AND primary_image_url IS NOT NULL -- Only count products with images
GROUP BY marketplace_category;

-- Add index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_category_counts 
  ON marketplace_category_counts (category);

-- ============================================================
-- Create function to refresh category counts
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_marketplace_category_counts()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY marketplace_category_counts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Add statistics for better query planning
-- ============================================================

-- Increase statistics target for category columns to help query planner
ALTER TABLE products ALTER COLUMN marketplace_category SET STATISTICS 1000;
ALTER TABLE products ALTER COLUMN marketplace_subcategory SET STATISTICS 1000;
ALTER TABLE products ALTER COLUMN marketplace_level_3_category SET STATISTICS 1000;

-- ============================================================
-- Add table comments
-- ============================================================

COMMENT ON INDEX idx_products_level1_covering IS 
  'Covering index for Level 1 category filtering with common columns';
  
COMMENT ON INDEX idx_products_level1_level2_covering IS 
  'Covering index for Level 1+2 category filtering with common columns';
  
COMMENT ON INDEX idx_products_full_hierarchy_covering IS 
  'Covering index for full 3-level category hierarchy filtering';
  
COMMENT ON INDEX idx_products_categories_gin IS 
  'GIN index for fast text search across all category levels';
  
COMMENT ON MATERIALIZED VIEW marketplace_category_counts IS 
  'Pre-computed product counts per category for fast badge loading. Refresh periodically.';

-- ============================================================
-- Performance tuning notes
-- ============================================================
-- 
-- For production with 10M+ users:
-- 1. Set up a cron job to refresh the materialized view every 5-15 minutes
-- 2. Enable query caching at CDN level (Vercel/CloudFlare)
-- 3. Consider partitioning products table by marketplace_category
-- 4. Use read replicas for category counting queries
-- 5. Implement Redis caching for category counts
-- 
-- Example cron job:
-- SELECT cron.schedule(
--   'refresh-category-counts',
--   '*/15 * * * *', -- Every 15 minutes
--   $$SELECT refresh_marketplace_category_counts()$$
-- );





