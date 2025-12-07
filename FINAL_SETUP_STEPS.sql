-- ============================================================
-- Final Setup Steps - Clear Cache and Verify System
-- ============================================================

-- Step 1: Clear old empty recommendation cache
DELETE FROM recommendation_cache;

-- Step 2: Verify product scores are calculated
SELECT 
  'Product Scores Status' as check,
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE view_count > 0) as products_with_views,
  COUNT(*) FILTER (WHERE popularity_score > 0) as products_with_popularity,
  COUNT(*) FILTER (WHERE trending_score > 0) as products_with_trending,
  ROUND(AVG(popularity_score)::numeric, 2) as avg_popularity_score,
  ROUND(MAX(trending_score)::numeric, 2) as max_trending_score
FROM product_scores;

-- Step 3: Show top 20 trending products
SELECT 
  'Top Trending Products' as section,
  p.id,
  LEFT(p.description, 50) as description,
  p.price,
  ps.view_count,
  ps.click_count,
  ps.like_count,
  ROUND(ps.popularity_score::numeric, 2) as popularity,
  ROUND(ps.trending_score::numeric, 2) as trending
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.trending_score > 0
  AND p.is_active = true
ORDER BY ps.trending_score DESC
LIMIT 20;

-- Step 4: Check tracking data
SELECT 
  'User Interactions' as check,
  COUNT(*) as total_interactions,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
  MIN(created_at) as first_interaction,
  MAX(created_at) as last_interaction
FROM user_interactions;

-- Step 5: Verify all tables are ready
SELECT 
  'System Status' as status,
  (SELECT COUNT(*) FROM products WHERE is_active = true) as active_products,
  (SELECT COUNT(*) FROM product_scores WHERE trending_score > 0) as products_with_scores,
  (SELECT COUNT(*) FROM user_interactions) as total_interactions,
  (SELECT COUNT(*) FROM user_preferences) as users_with_preferences,
  (SELECT COUNT(*) FROM recommendation_cache) as cached_recommendations;

-- SUCCESS MESSAGE
SELECT 
  '✅ Recommendation system is ready!' as message,
  'Visit http://localhost:3000/for-you and click Refresh' as next_step;




