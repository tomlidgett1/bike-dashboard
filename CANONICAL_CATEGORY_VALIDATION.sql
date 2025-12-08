-- ============================================================
-- Canonical Category System Validation Queries
-- ============================================================
-- Use these queries to validate that the canonical category
-- system is working correctly
-- ============================================================

-- ============================================================
-- 1. Overall System Health Check
-- ============================================================

DO $$
DECLARE
  total_canonical INTEGER;
  categorised_canonical INTEGER;
  uncategorised_canonical INTEGER;
  total_products INTEGER;
  products_with_canonical INTEGER;
  products_with_categories INTEGER;
  products_without_categories INTEGER;
  trigger_working BOOLEAN;
BEGIN
  -- Canonical product stats
  SELECT COUNT(*) INTO total_canonical FROM canonical_products;
  SELECT COUNT(*) INTO categorised_canonical 
    FROM canonical_products 
    WHERE marketplace_category IS NOT NULL;
  SELECT COUNT(*) INTO uncategorised_canonical 
    FROM canonical_products 
    WHERE marketplace_category IS NULL;
  
  -- Product stats
  SELECT COUNT(*) INTO total_products FROM products WHERE is_active = true;
  SELECT COUNT(*) INTO products_with_canonical 
    FROM products 
    WHERE is_active = true AND canonical_product_id IS NOT NULL;
  SELECT COUNT(*) INTO products_with_categories 
    FROM products 
    WHERE is_active = true AND marketplace_category IS NOT NULL;
  SELECT COUNT(*) INTO products_without_categories 
    FROM products 
    WHERE is_active = true AND marketplace_category IS NULL;
  
  -- Check if trigger is working
  SELECT COUNT(*) = 0 INTO trigger_working
  FROM products p
  JOIN canonical_products cp ON p.canonical_product_id = cp.id
  WHERE cp.marketplace_category IS NOT NULL
    AND p.marketplace_category IS NULL;
  
  RAISE NOTICE '╔════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║  CANONICAL CATEGORY SYSTEM - HEALTH CHECK             ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Canonical Products:';
  RAISE NOTICE '  ├─ Total: %', total_canonical;
  RAISE NOTICE '  ├─ Categorised: % (%.1f%%)', categorised_canonical, 
    CASE WHEN total_canonical > 0 THEN (categorised_canonical::FLOAT / total_canonical * 100) ELSE 0 END;
  RAISE NOTICE '  └─ Uncategorised: % (%.1f%%)', uncategorised_canonical,
    CASE WHEN total_canonical > 0 THEN (uncategorised_canonical::FLOAT / total_canonical * 100) ELSE 0 END;
  RAISE NOTICE '';
  RAISE NOTICE '🛍️  Products:';
  RAISE NOTICE '  ├─ Total Active: %', total_products;
  RAISE NOTICE '  ├─ With Canonical Link: % (%.1f%%)', products_with_canonical,
    CASE WHEN total_products > 0 THEN (products_with_canonical::FLOAT / total_products * 100) ELSE 0 END;
  RAISE NOTICE '  ├─ With Categories: % (%.1f%%)', products_with_categories,
    CASE WHEN total_products > 0 THEN (products_with_categories::FLOAT / total_products * 100) ELSE 0 END;
  RAISE NOTICE '  └─ Without Categories: % (%.1f%%)', products_without_categories,
    CASE WHEN total_products > 0 THEN (products_without_categories::FLOAT / total_products * 100) ELSE 0 END;
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Trigger Status: %', CASE WHEN trigger_working THEN '✅ WORKING' ELSE '❌ NOT WORKING' END;
  RAISE NOTICE '';
  
  IF products_without_categories > 0 THEN
    RAISE NOTICE '⚠️  WARNING: % products do not have categories!', products_without_categories;
    RAISE NOTICE '   Possible causes:';
    RAISE NOTICE '   - Canonical products not categorised yet';
    RAISE NOTICE '   - Products not linked to canonical';
    RAISE NOTICE '   - Database trigger not working';
  ELSE
    RAISE NOTICE '✅ SUCCESS: All active products have categories!';
  END IF;
END $$;

-- ============================================================
-- 2. Products Without Categories (Should be 0)
-- ============================================================

SELECT 
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ All products have categories'
    ELSE '❌ Products missing categories: ' || COUNT(*)::TEXT
  END as status
FROM products 
WHERE is_active = true 
  AND (marketplace_category IS NULL OR marketplace_category = '');

-- ============================================================
-- 3. Products With Canonical but No Categories
-- ============================================================
-- These indicate canonical products that need categorisation

SELECT 
  p.id,
  LEFT(p.description, 60) as product_name,
  p.canonical_product_id,
  cp.normalized_name as canonical_name,
  cp.cleaned as canonical_cleaned,
  p.listing_source
FROM products p
JOIN canonical_products cp ON p.canonical_product_id = cp.id
WHERE p.is_active = true
  AND p.marketplace_category IS NULL
  AND cp.marketplace_category IS NULL
ORDER BY p.created_at DESC
LIMIT 20;

-- ============================================================
-- 4. Trigger Validation: Categories Should Match
-- ============================================================
-- Finds products where categories don't match their canonical product
-- (Should be 0 rows - means trigger is working)

SELECT 
  p.id,
  LEFT(p.description, 40) as product_name,
  p.marketplace_category as product_cat,
  cp.marketplace_category as canonical_cat,
  p.marketplace_subcategory as product_subcat,
  cp.marketplace_subcategory as canonical_subcat
FROM products p
JOIN canonical_products cp ON p.canonical_product_id = cp.id
WHERE cp.marketplace_category IS NOT NULL
  AND (
    p.marketplace_category != cp.marketplace_category 
    OR p.marketplace_subcategory != cp.marketplace_subcategory
    OR p.marketplace_level_3_category IS DISTINCT FROM cp.marketplace_level_3_category
  )
LIMIT 20;

-- ============================================================
-- 5. Category Distribution
-- ============================================================
-- Shows how products are distributed across categories

SELECT 
  marketplace_category,
  marketplace_subcategory,
  COUNT(*) as product_count,
  ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () * 100, 2) as percentage
FROM products
WHERE is_active = true
  AND marketplace_category IS NOT NULL
GROUP BY marketplace_category, marketplace_subcategory
ORDER BY product_count DESC
LIMIT 30;

-- ============================================================
-- 6. Canonical Products Needing Categorisation
-- ============================================================

SELECT 
  COUNT(*) as uncategorised_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ All canonical products categorised'
    ELSE '⚠️  Need to categorise: ' || COUNT(*)::TEXT || ' canonical products'
  END as status
FROM canonical_products
WHERE marketplace_category IS NULL OR cleaned = false;

-- ============================================================
-- 7. Sample of Well-Categorised Products
-- ============================================================

SELECT 
  cp.id as canonical_id,
  LEFT(cp.display_name, 50) as display_name,
  cp.marketplace_category,
  cp.marketplace_subcategory,
  cp.marketplace_level_3_category,
  cp.product_count,
  cp.cleaned
FROM canonical_products cp
WHERE cp.marketplace_category IS NOT NULL
ORDER BY cp.product_count DESC
LIMIT 10;

-- ============================================================
-- 8. Products by Source Type
-- ============================================================

SELECT 
  listing_source,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE marketplace_category IS NOT NULL) as with_categories,
  COUNT(*) FILTER (WHERE marketplace_category IS NULL) as without_categories,
  ROUND(COUNT(*) FILTER (WHERE marketplace_category IS NOT NULL)::NUMERIC / COUNT(*) * 100, 2) as category_coverage_pct
FROM products
WHERE is_active = true
GROUP BY listing_source
ORDER BY count DESC;

-- ============================================================
-- 9. Recent Products Check (Last 100)
-- ============================================================

SELECT 
  p.id,
  LEFT(p.description, 50) as name,
  p.marketplace_category,
  p.marketplace_subcategory,
  p.listing_source,
  p.canonical_product_id,
  p.created_at
FROM products p
WHERE p.is_active = true
ORDER BY p.created_at DESC
LIMIT 100;

-- ============================================================
-- 10. Final Validation Summary
-- ============================================================

WITH stats AS (
  SELECT 
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE marketplace_category IS NOT NULL) as categorised_products,
    COUNT(*) FILTER (WHERE canonical_product_id IS NOT NULL) as products_with_canonical
  FROM products
  WHERE is_active = true
),
canonical_stats AS (
  SELECT 
    COUNT(*) as total_canonical,
    COUNT(*) FILTER (WHERE marketplace_category IS NOT NULL) as categorised_canonical
  FROM canonical_products
)
SELECT 
  '🎯 Overall Success Rate' as metric,
  CONCAT(
    ROUND((s.categorised_products::NUMERIC / NULLIF(s.total_products, 0) * 100), 2),
    '% (',
    s.categorised_products,
    '/',
    s.total_products,
    ')'
  ) as value,
  CASE 
    WHEN s.categorised_products = s.total_products THEN '✅ PERFECT'
    WHEN s.categorised_products::FLOAT / NULLIF(s.total_products, 0) >= 0.95 THEN '✅ EXCELLENT'
    WHEN s.categorised_products::FLOAT / NULLIF(s.total_products, 0) >= 0.80 THEN '⚠️  GOOD'
    ELSE '❌ NEEDS WORK'
  END as status
FROM stats s, canonical_stats cs;

