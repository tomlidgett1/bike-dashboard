-- ============================================================
-- Fix Score Calculation Function
-- Remove the 15-minute filter so it calculates all scores
-- ============================================================

-- Replace the calculate_popularity_scores function
CREATE OR REPLACE FUNCTION calculate_popularity_scores()
RETURNS void AS $$
BEGIN
  UPDATE product_scores ps
  SET 
    popularity_score = (
      (ps.view_count * 1.0) +
      (ps.click_count * 2.0) +
      (ps.like_count * 5.0) +
      (ps.conversion_count * 10.0)
    ) / GREATEST(EXTRACT(EPOCH FROM (NOW() - ps.created_at)) / 86400, 0.1), -- Days since created, min 0.1
    trending_score = (
      (ps.view_count * 1.0) +
      (ps.click_count * 2.0) +
      (ps.like_count * 5.0) +
      (ps.conversion_count * 10.0)
    ) * EXP(-0.1 * GREATEST(EXTRACT(EPOCH FROM (NOW() - ps.last_interaction_at)) / 86400, 0)), -- Exponential decay
    updated_at = NOW();
  
  RAISE NOTICE 'Updated % product scores', (SELECT COUNT(*) FROM product_scores);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run it immediately to calculate all scores
SELECT calculate_popularity_scores();

-- Verify scores were calculated
SELECT 
  'Score Calculation' as test,
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE view_count > 0) as with_views,
  COUNT(*) FILTER (WHERE popularity_score > 0) as with_popularity,
  COUNT(*) FILTER (WHERE trending_score > 0) as with_trending,
  ROUND(AVG(popularity_score)::numeric, 2) as avg_popularity,
  ROUND(MAX(trending_score)::numeric, 2) as max_trending
FROM product_scores;

-- Show top 10 trending products
SELECT 
  p.id,
  p.description,
  p.price,
  ps.view_count,
  ps.click_count,
  ROUND(ps.popularity_score::numeric, 2) as popularity,
  ROUND(ps.trending_score::numeric, 2) as trending
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE ps.trending_score > 0
ORDER BY ps.trending_score DESC
LIMIT 10;







