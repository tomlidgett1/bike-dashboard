-- ============================================================
-- RUN THIS IN SUPABASE SQL EDITOR NOW
-- ============================================================

-- 1. Clear old empty cache
DELETE FROM recommendation_cache;

-- 2. Calculate scores if not already done
SELECT calculate_popularity_scores();

-- 3. Check scores are > 0
SELECT 
  COUNT(*) as products_with_trending_score
FROM product_scores 
WHERE trending_score > 0;
-- Should be > 0

-- 4. Show top trending products
SELECT 
  p.id,
  LEFT(p.description, 50) as description,
  ps.trending_score
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.trending_score > 0
ORDER BY ps.trending_score DESC
LIMIT 10;

-- If you see products above, the system is ready!
SELECT '✅ Ready! Visit /for-you and click Refresh' as next_step;








