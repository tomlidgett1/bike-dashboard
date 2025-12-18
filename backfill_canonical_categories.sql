-- ============================================================
-- Backfill Canonical Categories from Products
-- ============================================================
-- This script migrates existing product categories to their 
-- linked canonical products. Run this ONCE before running 
-- AI categorisation on all canonical products.
--
-- IMPORTANT: Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- Step 1: Check Current State
-- ============================================================

DO $$
DECLARE
  total_canonical INTEGER;
  canonical_with_categories INTEGER;
  canonical_without_categories INTEGER;
  total_products INTEGER;
  products_with_canonical INTEGER;
  products_with_categories INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_canonical FROM canonical_products;
  SELECT COUNT(*) INTO canonical_with_categories FROM canonical_products WHERE marketplace_category IS NOT NULL;
  SELECT COUNT(*) INTO canonical_without_categories FROM canonical_products WHERE marketplace_category IS NULL;
  
  SELECT COUNT(*) INTO total_products FROM products WHERE is_active = true;
  SELECT COUNT(*) INTO products_with_canonical FROM products WHERE is_active = true AND canonical_product_id IS NOT NULL;
  SELECT COUNT(*) INTO products_with_categories FROM products WHERE is_active = true AND marketplace_category IS NOT NULL;
  
  RAISE NOTICE '📊 Current State:';
  RAISE NOTICE '  Canonical Products:';
  RAISE NOTICE '    - Total: %', total_canonical;
  RAISE NOTICE '    - With categories: %', canonical_with_categories;
  RAISE NOTICE '    - Without categories: %', canonical_without_categories;
  RAISE NOTICE '  ';
  RAISE NOTICE '  Products:';
  RAISE NOTICE '    - Total active: %', total_products;
  RAISE NOTICE '    - With canonical link: %', products_with_canonical;
  RAISE NOTICE '    - With categories: %', products_with_categories;
END $$;

-- ============================================================
-- Step 2: Backfill Categories from Products to Canonical
-- ============================================================
-- Copy categories from products to their linked canonical products
-- This preserves existing categorisation work
-- ============================================================

UPDATE canonical_products cp
SET 
  marketplace_category = p.marketplace_category,
  marketplace_subcategory = p.marketplace_subcategory,
  marketplace_level_3_category = p.marketplace_level_3_category,
  display_name = COALESCE(p.display_name, p.description),
  cleaned = (p.marketplace_category IS NOT NULL),
  updated_at = NOW()
FROM (
  -- Get the first product with categories for each canonical product
  SELECT DISTINCT ON (canonical_product_id)
    canonical_product_id,
    marketplace_category,
    marketplace_subcategory,
    marketplace_level_3_category,
    display_name,
    description
  FROM products
  WHERE canonical_product_id IS NOT NULL
    AND marketplace_category IS NOT NULL
    AND is_active = true
  ORDER BY canonical_product_id, created_at ASC
) p
WHERE cp.id = p.canonical_product_id
  AND cp.marketplace_category IS NULL;

-- ============================================================
-- Step 3: Report Results
-- ============================================================

DO $$
DECLARE
  canonical_with_categories_after INTEGER;
  canonical_without_categories_after INTEGER;
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO canonical_with_categories_after FROM canonical_products WHERE marketplace_category IS NOT NULL;
  SELECT COUNT(*) INTO canonical_without_categories_after FROM canonical_products WHERE marketplace_category IS NULL;
  
  updated_count := canonical_with_categories_after;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Backfill Complete:';
  RAISE NOTICE '  - Canonical products with categories: %', canonical_with_categories_after;
  RAISE NOTICE '  - Canonical products without categories: %', canonical_without_categories_after;
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Next Steps:';
  RAISE NOTICE '  1. Run AI categorisation on remaining % uncategorised canonical products', canonical_without_categories_after;
  RAISE NOTICE '  2. Use the categorise-canonical-products edge function';
  RAISE NOTICE '  3. Verify all products have categories';
END $$;

-- ============================================================
-- Step 4: Verification Queries (for manual checking)
-- ============================================================

-- Show sample of canonical products with categories
SELECT 
  id,
  LEFT(normalized_name, 50) as name,
  marketplace_category,
  marketplace_subcategory,
  marketplace_level_3_category,
  product_count,
  cleaned
FROM canonical_products
WHERE marketplace_category IS NOT NULL
LIMIT 10;

-- Show canonical products still needing categorisation
SELECT 
  id,
  LEFT(normalized_name, 50) as name,
  category,
  manufacturer,
  product_count
FROM canonical_products
WHERE marketplace_category IS NULL
ORDER BY product_count DESC
LIMIT 10;







