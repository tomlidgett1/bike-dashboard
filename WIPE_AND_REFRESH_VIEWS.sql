-- ============================================================
-- Wipe and Refresh Materialized Views
-- Run this in Supabase SQL Editor
-- ============================================================

-- Option 1: Truncate the materialized views (fast)
TRUNCATE trending_products;
TRUNCATE user_category_preferences;

-- Option 2: Drop and recreate (if truncate doesn't work)
-- DROP MATERIALIZED VIEW IF EXISTS trending_products;
-- DROP MATERIALIZED VIEW IF EXISTS user_category_preferences;

-- Recreate user_category_preferences
CREATE MATERIALIZED VIEW IF NOT EXISTS user_category_preferences AS
SELECT 
  ui.user_id,
  p.marketplace_category,
  COUNT(*) as interaction_count,
  AVG(ui.dwell_time_seconds) as avg_dwell_time,
  MAX(ui.created_at) as last_interaction
FROM user_interactions ui
JOIN products p ON ui.product_id = p.id
WHERE ui.created_at > NOW() - INTERVAL '30 days'
  AND p.marketplace_category IS NOT NULL
GROUP BY ui.user_id, p.marketplace_category;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_category_prefs_unique 
ON user_category_preferences(user_id, marketplace_category);

CREATE INDEX IF NOT EXISTS idx_user_category_prefs_user 
ON user_category_preferences(user_id);

-- Recreate trending_products
CREATE MATERIALIZED VIEW IF NOT EXISTS trending_products AS
SELECT 
  p.id as product_id,
  p.description,
  p.price,
  p.marketplace_category,
  ps.trending_score,
  ps.view_count,
  ps.click_count,
  ps.like_count
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.last_interaction_at > NOW() - INTERVAL '7 days'
  AND p.is_active = true
ORDER BY ps.trending_score DESC
LIMIT 1000;

CREATE INDEX IF NOT EXISTS idx_trending_products_score 
ON trending_products(trending_score DESC);

CREATE INDEX IF NOT EXISTS idx_trending_products_category 
ON trending_products(marketplace_category);

-- Now refresh them with real data
REFRESH MATERIALIZED VIEW user_category_preferences;
REFRESH MATERIALIZED VIEW trending_products;

-- Check results
SELECT 
  'user_category_preferences' as view_name,
  COUNT(*) as row_count
FROM user_category_preferences
UNION ALL
SELECT 
  'trending_products',
  COUNT(*)
FROM trending_products;

-- Show sample data
SELECT * FROM trending_products ORDER BY trending_score DESC LIMIT 10;

SELECT '✅ Materialized views refreshed with real data!' as status;

