-- ============================================================
-- Optimise Seller Profile Queries
-- These indexes speed up the seller profile API significantly
-- ============================================================

-- Composite index for active products by user
-- Used when fetching a seller's active listings
CREATE INDEX IF NOT EXISTS idx_products_seller_active 
ON products(user_id, is_active, sold_at) 
WHERE is_active = true AND sold_at IS NULL;

-- Composite index for sold products by user  
-- Used when fetching a seller's sold items
CREATE INDEX IF NOT EXISTS idx_products_seller_sold
ON products(user_id, sold_at)
WHERE sold_at IS NOT NULL;

-- Index for listing status filter (commonly used in OR conditions)
CREATE INDEX IF NOT EXISTS idx_products_listing_status
ON products(listing_status)
WHERE listing_status IS NOT NULL;

-- Composite index for the common seller profile query pattern
CREATE INDEX IF NOT EXISTS idx_products_user_active_status
ON products(user_id, is_active, listing_status, sold_at);

-- Index on seller_category_overrides for faster lookups
CREATE INDEX IF NOT EXISTS idx_seller_category_overrides_user
ON seller_category_overrides(user_id);

-- Optimise user_follows queries (supplement the existing indexes)
CREATE INDEX IF NOT EXISTS idx_user_follows_following_created
ON user_follows(following_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower_created  
ON user_follows(follower_id, created_at DESC);

-- Analyse tables to update statistics for query planner
ANALYSE products;
ANALYSE user_follows;
ANALYSE seller_category_overrides;

