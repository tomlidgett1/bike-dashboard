-- ============================================================
-- Performance Optimization Indexes
-- Adds indexes to improve query performance for product pages
-- ============================================================

-- Index for products table - listing status filtering
-- Speeds up queries that filter by id and listing_status
CREATE INDEX IF NOT EXISTS idx_products_id_listing_status 
ON products(id, listing_status) 
WHERE listing_status = 'active' OR listing_status IS NULL;

-- Index for similar products queries (canonical_product_id)
-- Speeds up finding products with the same canonical product
CREATE INDEX IF NOT EXISTS idx_products_canonical_product_id 
ON products(canonical_product_id) 
WHERE canonical_product_id IS NOT NULL;

-- Index for seller products queries
-- Speeds up finding all products by a specific seller
CREATE INDEX IF NOT EXISTS idx_products_user_id_active 
ON products(user_id, created_at DESC) 
WHERE is_active = true AND (listing_status IS NULL OR listing_status = 'active');

-- Composite index on product_images for fast image lookups
-- Speeds up queries filtering by product_id, approval_status, and ordering by is_primary
CREATE INDEX IF NOT EXISTS idx_product_images_product_approval 
ON product_images(product_id, approval_status, is_primary DESC, sort_order ASC) 
WHERE approval_status = 'approved';

-- Composite index for canonical product images
CREATE INDEX IF NOT EXISTS idx_product_images_canonical_approval 
ON product_images(canonical_product_id, approval_status, is_primary DESC, sort_order ASC) 
WHERE approval_status = 'approved' AND canonical_product_id IS NOT NULL;

-- Index for marketplace category filtering (used in similar products)
CREATE INDEX IF NOT EXISTS idx_products_category_active 
ON products(marketplace_category, marketplace_subcategory) 
WHERE is_active = true AND (listing_status IS NULL OR listing_status = 'active');

-- Index for offers table - speeds up pending offers count
CREATE INDEX IF NOT EXISTS idx_offers_seller_status 
ON offers(seller_id, status) 
WHERE status = 'pending';

-- Index for notifications table - speeds up unread notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
ON notifications(user_id, is_read, created_at DESC);

-- Add comment explaining the optimization
COMMENT ON INDEX idx_products_id_listing_status IS 'Optimizes product lookup by ID with listing status filter';
COMMENT ON INDEX idx_products_canonical_product_id IS 'Speeds up similar product queries using canonical_product_id';
COMMENT ON INDEX idx_products_user_id_active IS 'Optimizes seller product queries with active filter';
COMMENT ON INDEX idx_product_images_product_approval IS 'Speeds up product image lookups with approval filtering';
COMMENT ON INDEX idx_product_images_canonical_approval IS 'Speeds up canonical product image lookups';
COMMENT ON INDEX idx_products_category_active IS 'Optimizes category-based product filtering';
COMMENT ON INDEX idx_offers_seller_status IS 'Optimizes pending offers count queries';
COMMENT ON INDEX idx_notifications_user_read IS 'Optimizes unread notification queries';

