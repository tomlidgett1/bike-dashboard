-- ============================================================
-- NUCLEAR RESET - Clear ALL Recommendation Data
-- ============================================================

-- 1. Wipe recommendation cache
DELETE FROM recommendation_cache;

-- 2. Reset ALL product scores to absolute zero
UPDATE product_scores SET 
  view_count = 0,
  click_count = 0,
  like_count = 0,
  conversion_count = 0,
  popularity_score = 0,
  trending_score = 0,
  last_interaction_at = NOW(),
  updated_at = NOW();

-- 3. Verify EVERYTHING is zero
SELECT 
  COUNT(*) as total_products,
  SUM(view_count) as total_views,
  SUM(click_count) as total_clicks,
  SUM(like_count) as total_likes,
  MAX(popularity_score) as max_popularity,
  MAX(trending_score) as max_trending
FROM product_scores;
-- ALL should be 0!

-- 4. Check recommendation cache is empty
SELECT COUNT(*) as cache_entries FROM recommendation_cache;
-- Should be 0

SELECT '🗑️ Everything wiped clean!' as status;

