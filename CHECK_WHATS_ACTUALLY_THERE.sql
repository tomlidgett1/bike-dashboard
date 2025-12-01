-- ============================================================
-- Check What's Actually in the Database
-- ============================================================

-- 1. Check product_scores - are they really zero?
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE view_count > 0) as with_views,
  COUNT(*) FILTER (WHERE trending_score > 0) as with_trending,
  MAX(view_count) as max_views,
  MAX(trending_score) as max_trending
FROM product_scores;

-- 2. Show some actual scores
SELECT 
  product_id,
  view_count,
  click_count,
  like_count,
  popularity_score,
  trending_score
FROM product_scores
ORDER BY trending_score DESC
LIMIT 10;

-- 3. Check recommendation cache
SELECT COUNT(*) as cache_count FROM recommendation_cache;

-- 4. Check what the trending algorithm query would return
SELECT 
  ps.product_id,
  ps.trending_score,
  ps.view_count
FROM product_scores ps
WHERE ps.trending_score > 0
ORDER BY ps.trending_score DESC
LIMIT 10;

-- This tells us exactly what's in the database!

