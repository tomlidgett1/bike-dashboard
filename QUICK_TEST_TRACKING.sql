-- ============================================================
-- QUICK TRACKING TEST - Run in Supabase SQL Editor
-- ============================================================

-- Step 1: Check if tables exist
SELECT 
  'Tables Check' as test,
  COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user_interactions', 'user_preferences', 'product_scores', 'recommendation_cache');
-- Expected: table_count = 4

-- Step 2: Check if partitions exist
SELECT 
  'Partitions Check' as test,
  COUNT(*) as partition_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'user_interactions_%';
-- Expected: partition_count >= 4

-- Step 3: Check current interaction count
SELECT 
  'Current Interactions' as test,
  COUNT(*) as interaction_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions,
  MAX(created_at) as latest_interaction
FROM user_interactions;

-- Step 4: Check interactions by type
SELECT 
  'Interactions by Type' as test,
  interaction_type,
  COUNT(*) as count
FROM user_interactions
GROUP BY interaction_type
ORDER BY count DESC;

-- Step 5: Insert a test interaction (replace YOUR_USER_ID if you have one)
DO $$
DECLARE
  v_product_id UUID;
  v_user_id UUID;
BEGIN
  -- Get a real product ID
  SELECT id INTO v_product_id FROM products WHERE is_active = true LIMIT 1;
  
  -- Get current user ID (will be NULL if not logged in, which is fine for testing)
  v_user_id := auth.uid();
  
  -- Insert test interaction
  INSERT INTO user_interactions (
    user_id,
    session_id,
    product_id,
    interaction_type,
    dwell_time_seconds,
    metadata,
    created_at
  ) VALUES (
    v_user_id,
    gen_random_uuid(),
    v_product_id,
    'view',
    25,
    '{"test": true, "source": "sql_test"}'::jsonb,
    NOW()
  );
  
  RAISE NOTICE 'Test interaction inserted for product %', v_product_id;
END $$;

-- Step 6: Verify the insert worked
SELECT 
  'Latest Interaction' as test,
  id,
  user_id,
  product_id,
  interaction_type,
  dwell_time_seconds,
  metadata,
  created_at
FROM user_interactions
ORDER BY created_at DESC
LIMIT 1;

-- Step 7: Check product scores
SELECT 
  'Product Scores' as test,
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE view_count > 0) as products_with_views,
  COUNT(*) FILTER (WHERE popularity_score > 0) as products_with_scores,
  SUM(view_count) as total_views,
  SUM(click_count) as total_clicks,
  SUM(like_count) as total_likes
FROM product_scores;

-- Step 8: Initialize product scores for all products (if needed)
INSERT INTO product_scores (product_id)
SELECT id FROM products
WHERE is_active = true
  AND NOT EXISTS (SELECT 1 FROM product_scores WHERE product_id = products.id)
ON CONFLICT (product_id) DO NOTHING;

-- Step 9: Test the increment function
DO $$
DECLARE
  v_product_id UUID;
BEGIN
  -- Get a product
  SELECT id INTO v_product_id FROM products WHERE is_active = true LIMIT 1;
  
  -- Test increment
  PERFORM increment_product_score(v_product_id, 'view');
  PERFORM increment_product_score(v_product_id, 'click');
  PERFORM increment_product_score(v_product_id, 'like');
  
  RAISE NOTICE 'Incremented scores for product %', v_product_id;
END $$;

-- Step 10: Calculate popularity scores
SELECT calculate_popularity_scores();

-- Step 11: Check top products by score
SELECT 
  'Top Products' as test,
  p.id,
  p.description,
  ps.view_count,
  ps.click_count,
  ps.like_count,
  ROUND(ps.popularity_score::numeric, 2) as popularity,
  ROUND(ps.trending_score::numeric, 2) as trending
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.popularity_score > 0
ORDER BY ps.popularity_score DESC
LIMIT 10;

-- Step 12: Check RLS policies
SELECT 
  'RLS Policies' as test,
  tablename,
  policyname,
  cmd,
  CASE WHEN qual IS NOT NULL THEN 'Has USING' ELSE 'No USING' END as using_clause,
  CASE WHEN with_check IS NOT NULL THEN 'Has WITH CHECK' ELSE 'No WITH CHECK' END as check_clause
FROM pg_policies
WHERE tablename IN ('user_interactions', 'product_scores', 'user_preferences', 'recommendation_cache')
ORDER BY tablename, policyname;

-- Step 13: Test API-style insert (simulating what the API does)
DO $$
DECLARE
  v_product_id UUID;
  v_session_id UUID := gen_random_uuid();
BEGIN
  -- Get 5 products
  FOR v_product_id IN 
    SELECT id FROM products WHERE is_active = true LIMIT 5
  LOOP
    -- Insert view
    INSERT INTO user_interactions (
      user_id,
      session_id,
      product_id,
      interaction_type,
      dwell_time_seconds,
      metadata,
      created_at
    ) VALUES (
      auth.uid(),
      v_session_id,
      v_product_id,
      'view',
      (RANDOM() * 60)::INTEGER,
      '{"test": true, "batch": true}'::jsonb,
      NOW() - (RANDOM() * INTERVAL '1 hour')
    );
    
    -- Update score
    PERFORM increment_product_score(v_product_id, 'view');
  END LOOP;
  
  RAISE NOTICE 'Inserted 5 test interactions';
END $$;

-- Step 14: Final summary
SELECT 
  'FINAL SUMMARY' as status,
  (SELECT COUNT(*) FROM user_interactions) as total_interactions,
  (SELECT COUNT(DISTINCT user_id) FROM user_interactions WHERE user_id IS NOT NULL) as unique_users,
  (SELECT COUNT(*) FROM product_scores WHERE view_count > 0) as products_with_activity,
  (SELECT COUNT(*) FROM user_preferences) as users_with_preferences,
  (SELECT COUNT(*) FROM recommendation_cache) as cached_recommendations;

-- ============================================================
-- INTERPRETATION GUIDE
-- ============================================================
/*
EXPECTED RESULTS:
- Step 1: table_count = 4 (all tables exist)
- Step 2: partition_count >= 4 (partitions created)
- Step 3: Shows current interaction data
- Step 6: Should show the test interaction just inserted
- Step 7: Should show product scores are being tracked
- Step 11: Shows top products with scores
- Step 14: Final summary of all data

IF YOU SEE:
- table_count < 4: Run `supabase db push` to create tables
- partition_count = 0: Partitioning failed, check migration
- No interactions in Step 3: API tracking not working yet
- No product_scores: Initialize them with Step 8
- RLS errors: Check policies in Step 12

NEXT STEPS:
1. If tables exist but no data: Test the API endpoints
2. If API works but no data: Check browser console for errors
3. If browser sends data but nothing in DB: Check RLS policies
*/

-- ============================================================
-- SUCCESS!
-- ============================================================
SELECT '✅ Tracking system test complete!' as message;










