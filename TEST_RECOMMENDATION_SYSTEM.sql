-- ============================================================
-- Test Recommendation System
-- Comprehensive testing queries and sample data generation
-- ============================================================

-- ============================================================
-- 1. VERIFY TABLES EXIST
-- ============================================================

-- Check all recommendation tables are created
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN (
  'user_interactions',
  'user_preferences',
  'product_scores',
  'recommendation_cache'
)
ORDER BY tablename;

-- Check partitions for user_interactions
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'user_interactions_%'
ORDER BY tablename;

-- ============================================================
-- 2. GENERATE SAMPLE PRODUCT SCORES
-- ============================================================

-- Initialize product_scores for all active products
INSERT INTO product_scores (product_id)
SELECT id FROM products
WHERE is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM product_scores WHERE product_id = products.id
  );

-- Add random scores for testing (ONLY FOR TESTING!)
UPDATE product_scores
SET 
  view_count = (RANDOM() * 100)::INTEGER,
  click_count = (RANDOM() * 50)::INTEGER,
  like_count = (RANDOM() * 20)::INTEGER,
  last_interaction_at = NOW() - (RANDOM() * INTERVAL '7 days');

-- Calculate scores
SELECT calculate_popularity_scores();

-- Verify product scores
SELECT 
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE view_count > 0) as with_views,
  COUNT(*) FILTER (WHERE popularity_score > 0) as with_scores,
  AVG(view_count) as avg_views,
  MAX(trending_score) as max_trending
FROM product_scores;

-- ============================================================
-- 3. GENERATE SAMPLE USER INTERACTIONS
-- ============================================================

-- Note: Replace 'YOUR_USER_ID' with an actual user UUID from auth.users

-- Generate sample view interactions
DO $$
DECLARE
  v_user_id UUID := 'YOUR_USER_ID'; -- Replace with real user ID
  v_session_id UUID := gen_random_uuid();
  v_product_ids UUID[];
BEGIN
  -- Get random product IDs
  SELECT ARRAY_AGG(id) INTO v_product_ids
  FROM products
  WHERE is_active = true
  LIMIT 20;

  -- Create view interactions
  FOR i IN 1..20 LOOP
    INSERT INTO user_interactions (
      user_id,
      session_id,
      product_id,
      interaction_type,
      dwell_time_seconds,
      created_at
    ) VALUES (
      v_user_id,
      v_session_id,
      v_product_ids[i],
      'view',
      (RANDOM() * 120)::INTEGER, -- 0-120 seconds
      NOW() - (RANDOM() * INTERVAL '7 days')
    );
  END LOOP;

  -- Create some click interactions
  FOR i IN 1..10 LOOP
    INSERT INTO user_interactions (
      user_id,
      session_id,
      product_id,
      interaction_type,
      created_at
    ) VALUES (
      v_user_id,
      v_session_id,
      v_product_ids[i],
      'click',
      NOW() - (RANDOM() * INTERVAL '7 days')
    );
  END LOOP;

  -- Create some like interactions
  FOR i IN 1..5 LOOP
    INSERT INTO user_interactions (
      user_id,
      session_id,
      product_id,
      interaction_type,
      created_at
    ) VALUES (
      v_user_id,
      v_session_id,
      v_product_ids[i],
      'like',
      NOW() - (RANDOM() * INTERVAL '7 days')
    );
  END LOOP;

  RAISE NOTICE 'Generated % interactions for user %', 35, v_user_id;
END $$;

-- Verify interactions
SELECT 
  interaction_type,
  COUNT(*) as count,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM user_interactions
GROUP BY interaction_type;

-- ============================================================
-- 4. UPDATE USER PREFERENCES
-- ============================================================

-- Generate preferences from interactions for a specific user
-- Replace 'YOUR_USER_ID' with actual user ID
SELECT update_user_preferences_from_interactions('YOUR_USER_ID'::UUID);

-- Verify user preferences
SELECT 
  user_id,
  favorite_categories,
  favorite_price_range,
  interaction_count,
  last_active_at
FROM user_preferences
LIMIT 5;

-- ============================================================
-- 5. TEST RECOMMENDATION QUERIES
-- ============================================================

-- Test 1: Trending Products
SELECT 
  p.id,
  p.description,
  p.price,
  ps.trending_score,
  ps.view_count
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.trending_score > 0
  AND p.is_active = true
ORDER BY ps.trending_score DESC
LIMIT 20;

-- Test 2: Popular Products by Category
SELECT 
  p.marketplace_category,
  COUNT(*) as product_count,
  AVG(ps.popularity_score) as avg_score
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE p.is_active = true
  AND ps.popularity_score > 0
GROUP BY p.marketplace_category
ORDER BY avg_score DESC;

-- Test 3: User's Top Categories (replace USER_ID)
SELECT 
  p.marketplace_category,
  COUNT(*) as view_count,
  AVG(ui.dwell_time_seconds) as avg_dwell_time
FROM user_interactions ui
JOIN products p ON ui.product_id = p.id
WHERE ui.user_id = 'YOUR_USER_ID'::UUID
  AND ui.interaction_type = 'view'
  AND ui.created_at > NOW() - INTERVAL '30 days'
GROUP BY p.marketplace_category
ORDER BY view_count DESC;

-- ============================================================
-- 6. TEST RECOMMENDATION CACHE
-- ============================================================

-- Manually insert a test cache entry (replace USER_ID)
DO $$
DECLARE
  v_user_id UUID := 'YOUR_USER_ID'::UUID;
  v_product_ids UUID[];
BEGIN
  -- Get top trending products
  SELECT ARRAY_AGG(p.id) INTO v_product_ids
  FROM products p
  JOIN product_scores ps ON p.id = ps.product_id
  WHERE ps.trending_score > 0
    AND p.is_active = true
  ORDER BY ps.trending_score DESC
  LIMIT 50;

  -- Insert cache entry
  INSERT INTO recommendation_cache (
    user_id,
    recommended_products,
    recommendation_type,
    score,
    expires_at
  ) VALUES (
    v_user_id,
    v_product_ids,
    'personalized',
    1.0,
    NOW() + INTERVAL '15 minutes'
  );

  RAISE NOTICE 'Created cache entry with % products', array_length(v_product_ids, 1);
END $$;

-- Verify cache
SELECT 
  user_id,
  recommendation_type,
  array_length(recommended_products, 1) as product_count,
  score,
  expires_at,
  created_at,
  expires_at > NOW() as is_valid
FROM recommendation_cache
ORDER BY created_at DESC;

-- ============================================================
-- 7. PERFORMANCE TESTING
-- ============================================================

-- Test query performance
EXPLAIN ANALYZE
SELECT p.*
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.trending_score > 0
  AND p.is_active = true
ORDER BY ps.trending_score DESC
LIMIT 50;

-- Test interaction insert performance
EXPLAIN ANALYZE
INSERT INTO user_interactions (
  user_id,
  session_id,
  product_id,
  interaction_type,
  created_at
)
SELECT 
  'YOUR_USER_ID'::UUID,
  gen_random_uuid(),
  id,
  'view',
  NOW()
FROM products
WHERE is_active = true
LIMIT 1;

-- ============================================================
-- 8. MONITORING QUERIES
-- ============================================================

-- Active users in last 24 hours
SELECT COUNT(DISTINCT user_id) as active_users_24h
FROM user_interactions
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Interactions by hour (last 24 hours)
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  interaction_type,
  COUNT(*) as count
FROM user_interactions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), interaction_type
ORDER BY hour DESC;

-- Top viewed products
SELECT 
  p.id,
  p.description,
  ps.view_count,
  ps.click_count,
  ps.like_count,
  ps.popularity_score
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
ORDER BY ps.view_count DESC
LIMIT 20;

-- Cache statistics
SELECT 
  recommendation_type,
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as valid_entries,
  AVG(array_length(recommended_products, 1)) as avg_products,
  MIN(created_at) as oldest_entry,
  MAX(created_at) as newest_entry
FROM recommendation_cache
GROUP BY recommendation_type;

-- User preference statistics
SELECT 
  COUNT(*) as total_users,
  AVG(interaction_count) as avg_interactions,
  MAX(interaction_count) as max_interactions,
  COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '24 hours') as active_24h,
  COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '7 days') as active_7d
FROM user_preferences;

-- ============================================================
-- 9. CLEANUP TEST DATA (USE WITH CAUTION!)
-- ============================================================

-- Uncomment to delete test data
/*
DELETE FROM user_interactions WHERE user_id = 'YOUR_USER_ID'::UUID;
DELETE FROM user_preferences WHERE user_id = 'YOUR_USER_ID'::UUID;
DELETE FROM recommendation_cache WHERE user_id = 'YOUR_USER_ID'::UUID;
-- Reset product scores
UPDATE product_scores SET 
  view_count = 0, 
  click_count = 0, 
  like_count = 0,
  popularity_score = 0,
  trending_score = 0;
*/

-- ============================================================
-- 10. VALIDATION CHECKS
-- ============================================================

-- Check for orphaned records
SELECT 'Orphaned product scores' as issue, COUNT(*) as count
FROM product_scores ps
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ps.product_id)
UNION ALL
SELECT 'Orphaned cache entries', COUNT(*)
FROM recommendation_cache rc
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = rc.user_id)
UNION ALL
SELECT 'Invalid cache entries', COUNT(*)
FROM recommendation_cache
WHERE expires_at < NOW() - INTERVAL '1 day';

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans
FROM pg_stat_user_indexes
WHERE tablename IN ('user_interactions', 'product_scores', 'user_preferences', 'recommendation_cache')
ORDER BY tablename, idx_scan DESC;

-- Check table sizes
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE tablename IN ('user_interactions', 'product_scores', 'user_preferences', 'recommendation_cache')
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

-- ============================================================
-- SUCCESS! 
-- All tests completed. Review results above.
-- ============================================================

SELECT 
  'Recommendation system is ready!' as status,
  NOW() as tested_at;




