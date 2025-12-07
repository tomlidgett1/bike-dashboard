-- ============================================================
-- Fix Score Calculation - Add WHERE TRUE for PostgreSQL Safety
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_popularity_scores()
RETURNS void AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Update all product scores with WHERE TRUE to satisfy PostgreSQL requirement
  UPDATE product_scores ps
  SET 
    popularity_score = (
      (ps.view_count * 1.0) +
      (ps.click_count * 2.0) +
      (ps.like_count * 5.0) +
      (ps.conversion_count * 10.0)
    ) / GREATEST(EXTRACT(EPOCH FROM (NOW() - ps.created_at)) / 86400, 0.1),
    trending_score = (
      (ps.view_count * 1.0) +
      (ps.click_count * 2.0) +
      (ps.like_count * 5.0) +
      (ps.conversion_count * 10.0)
    ) * EXP(-0.1 * GREATEST(EXTRACT(EPOCH FROM (NOW() - ps.last_interaction_at)) / 86400, 0)),
    updated_at = NOW()
  WHERE TRUE; -- This satisfies the WHERE clause requirement
    
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % product scores', v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test it works
SELECT calculate_popularity_scores();

-- Verify
SELECT 
  'Score Calculation Test' as test,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE view_count > 0) as with_activity,
  MAX(popularity_score) as max_pop,
  MAX(trending_score) as max_trend
FROM product_scores;




