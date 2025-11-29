-- Add performance indexes for marketplace product queries
-- These indexes significantly speed up the main marketplace page and infinite scroll

-- Index for the main marketplace query filter (is_active + listing_status)
-- This covers the most common WHERE clause in the marketplace API
CREATE INDEX IF NOT EXISTS idx_products_marketplace_active 
ON products (is_active, listing_status) 
WHERE is_active = true;

-- Composite index for category filtering (most common filter)
CREATE INDEX IF NOT EXISTS idx_products_marketplace_category 
ON products (marketplace_category, is_active, created_at DESC) 
WHERE is_active = true;

-- Index for price sorting queries
CREATE INDEX IF NOT EXISTS idx_products_price_sort 
ON products (price, is_active) 
WHERE is_active = true;

-- Index for created_at sorting (newest/oldest)
CREATE INDEX IF NOT EXISTS idx_products_created_sort 
ON products (created_at DESC, is_active) 
WHERE is_active = true;

-- Index for user_id (for store profile pages)
CREATE INDEX IF NOT EXISTS idx_products_user_inventory 
ON products (user_id, is_active, qoh) 
WHERE is_active = true AND qoh > 0;

-- Composite index for category + subcategory filtering
CREATE INDEX IF NOT EXISTS idx_products_category_subcategory 
ON products (marketplace_category, marketplace_subcategory, is_active, created_at DESC) 
WHERE is_active = true;

-- Index for canonical_product_id joins (speeds up image loading)
CREATE INDEX IF NOT EXISTS idx_products_canonical_lookup 
ON products (canonical_product_id) 
WHERE canonical_product_id IS NOT NULL;

-- Index for product_images primary image lookups
CREATE INDEX IF NOT EXISTS idx_product_images_primary 
ON product_images (canonical_product_id, is_primary) 
WHERE is_primary = true;

-- Add comment explaining the indexes
COMMENT ON INDEX idx_products_marketplace_active IS 'Speeds up main marketplace listing query';
COMMENT ON INDEX idx_products_marketplace_category IS 'Optimizes category filtering with sorting';
COMMENT ON INDEX idx_products_price_sort IS 'Improves price-based sorting performance';
COMMENT ON INDEX idx_products_created_sort IS 'Optimizes newest/oldest sorting';
COMMENT ON INDEX idx_products_user_inventory IS 'Speeds up store profile product loading';
COMMENT ON INDEX idx_products_category_subcategory IS 'Optimizes subcategory filtering';
COMMENT ON INDEX idx_products_canonical_lookup IS 'Speeds up canonical product joins';
COMMENT ON INDEX idx_product_images_primary IS 'Optimizes primary image lookups';

