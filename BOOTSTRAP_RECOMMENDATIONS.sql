-- ============================================================
-- Bootstrap Recommendations - Get For You Page Working
-- Run this in Supabase SQL Editor to kickstart recommendations
-- ============================================================

-- Step 1: Initialize product scores for all products
INSERT INTO product_scores (product_id)
SELECT id FROM products
WHERE is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM product_scores WHERE product_id = products.id
  );

-- Step 2: Give products some initial random scores for testing
UPDATE product_scores
SET 
  view_count = (RANDOM() * 50)::INTEGER,
  click_count = (RANDOM() * 20)::INTEGER,
  like_count = (RANDOM() * 10)::INTEGER,
  last_interaction_at = NOW() - (RANDOM() * INTERVAL '7 days')
WHERE view_count = 0;

-- Step 3: Calculate popularity and trending scores
SELECT calculate_popularity_scores();

-- Step 4: Verify scores are calculated
SELECT 
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE view_count > 0) as with_views,
  COUNT(*) FILTER (WHERE popularity_score > 0) as with_scores,
  COUNT(*) FILTER (WHERE trending_score > 0) as with_trending,
  MAX(trending_score) as max_trending_score
FROM product_scores;

-- Step 5: Check top trending products
SELECT 
  p.id,
  p.description,
  p.price,
  ps.view_count,
  ps.click_count,
  ROUND(ps.trending_score::numeric, 2) as trending_score
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.trending_score > 0
  AND p.is_active = true
ORDER BY ps.trending_score DESC
LIMIT 20;

-- Step 6: Check your real interactions (if any)
SELECT 
  interaction_type,
  COUNT(*) as count,
  MIN(created_at) as first,
  MAX(created_at) as last
FROM user_interactions
GROUP BY interaction_type
ORDER BY count DESC;

-- Step 7: Update user preferences if you're logged in
-- Replace YOUR_USER_ID with your actual user ID
-- To find your user ID, run: SELECT id FROM auth.users WHERE email = 'your@email.com';
-- SELECT update_user_preferences_from_interactions('YOUR_USER_ID'::UUID);

-- Success message
SELECT 
  'Recommendations bootstrapped!' as status,
  (SELECT COUNT(*) FROM product_scores WHERE trending_score > 0) as trending_products,
  (SELECT COUNT(*) FROM user_interactions) as total_interactions;






