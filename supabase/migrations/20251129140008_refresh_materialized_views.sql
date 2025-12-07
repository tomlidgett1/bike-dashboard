-- ============================================================
-- Refresh Materialized Views (Without CONCURRENTLY)
-- ============================================================

-- Refresh user_category_preferences
REFRESH MATERIALIZED VIEW user_category_preferences;

-- Refresh trending_products
REFRESH MATERIALIZED VIEW trending_products;

-- Verify they have data
SELECT 
  'Materialized Views Status' as status,
  (SELECT COUNT(*) FROM user_category_preferences) as category_prefs,
  (SELECT COUNT(*) FROM trending_products) as trending_products;

-- Show sample trending products from the view
SELECT 
  product_id,
  LEFT(description, 50) as description,
  price,
  ROUND(trending_score::numeric, 2) as trending_score,
  view_count,
  click_count
FROM trending_products
ORDER BY trending_score DESC
LIMIT 10;

-- Success
SELECT '✅ All materialized views refreshed!' as message;




