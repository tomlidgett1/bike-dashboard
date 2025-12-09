-- ============================================================
-- MANUAL FIX: Create Canonical Products & Link Existing Products
-- ============================================================
-- Run this SQL directly in Supabase SQL Editor to manually create
-- canonical products from your existing products

-- STEP 1: Check current state
-- ============================================================
SELECT 
  COUNT(*) as total_products,
  COUNT(canonical_product_id) as products_with_canonical,
  COUNT(*) - COUNT(canonical_product_id) as products_without_canonical
FROM products;

-- Expected: You should see many products_without_canonical

-- STEP 2: Create canonical products from existing products (deduplicated by UPC)
-- ============================================================
INSERT INTO canonical_products (upc, normalized_name, category, manufacturer)
SELECT DISTINCT ON (COALESCE(upc, 'NO_UPC_' || id::text))
  COALESCE(
    UPPER(TRIM(REGEXP_REPLACE(upc, '\s+', '', 'g'))), 
    'TEMP-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || substr(md5(random()::text), 1, 9)
  ) as upc,
  LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(description, '[^\w\s-]', '', 'g'), '\s+', ' ', 'g'))) as normalized_name,
  category_name as category,
  manufacturer_name as manufacturer
FROM products
WHERE is_active = true
ON CONFLICT (upc) DO NOTHING;

-- This creates one canonical product per unique UPC
-- Products without UPC get a temporary UPC

-- STEP 3: Link products to their canonical products (by UPC match)
-- ============================================================
UPDATE products p
SET canonical_product_id = cp.id
FROM canonical_products cp
WHERE p.canonical_product_id IS NULL
  AND p.upc IS NOT NULL
  AND UPPER(TRIM(REGEXP_REPLACE(p.upc, '\s+', '', 'g'))) = cp.upc;

-- STEP 4: Link products without UPC to canonical (by exact name match)
-- ============================================================
UPDATE products p
SET canonical_product_id = cp.id
FROM canonical_products cp
WHERE p.canonical_product_id IS NULL
  AND LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p.description, '[^\w\s-]', '', 'g'), '\s+', ' ', 'g'))) = cp.normalized_name;

-- STEP 5: Create canonical products for remaining unmatched products
-- ============================================================
INSERT INTO canonical_products (upc, normalized_name, category, manufacturer)
SELECT DISTINCT
  'TEMP-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || substr(md5(p.id::text || random()::text), 1, 9) as upc,
  LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p.description, '[^\w\s-]', '', 'g'), '\s+', ' ', 'g'))) as normalized_name,
  p.category_name as category,
  p.manufacturer_name as manufacturer
FROM products p
WHERE p.canonical_product_id IS NULL
  AND p.is_active = true
ON CONFLICT (upc) DO NOTHING
RETURNING *;

-- STEP 6: Link the remaining products to their new canonical products
-- ============================================================
UPDATE products p
SET canonical_product_id = cp.id
FROM canonical_products cp
WHERE p.canonical_product_id IS NULL
  AND LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p.description, '[^\w\s-]', '', 'g'), '\s+', ' ', 'g'))) = cp.normalized_name;

-- STEP 7: Verify the fix
-- ============================================================
SELECT 
  'AFTER FIX' as status,
  COUNT(*) as total_products,
  COUNT(canonical_product_id) as products_with_canonical,
  COUNT(*) - COUNT(canonical_product_id) as products_without_canonical,
  ROUND(COUNT(canonical_product_id)::numeric / COUNT(*)::numeric * 100, 2) as percent_linked
FROM products;

-- Expected: products_with_canonical should equal total_products

-- STEP 8: Check canonical products created
-- ============================================================
SELECT 
  COUNT(*) as total_canonical_products,
  COUNT(*) FILTER (WHERE upc LIKE 'TEMP-%') as temp_upcs,
  COUNT(*) FILTER (WHERE upc NOT LIKE 'TEMP-%') as real_upcs
FROM canonical_products;

-- STEP 9: View sample of linked products
-- ============================================================
SELECT 
  p.description,
  p.upc,
  p.canonical_product_id,
  cp.normalized_name as canonical_name,
  cp.upc as canonical_upc
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
ORDER BY p.created_at DESC
LIMIT 10;

-- ============================================================
-- TROUBLESHOOTING QUERIES
-- ============================================================

-- Find products still without canonical_product_id
SELECT id, description, upc, category_name
FROM products
WHERE canonical_product_id IS NULL
LIMIT 20;

-- Find duplicate canonical products (shouldn't exist)
SELECT upc, COUNT(*) as count
FROM canonical_products
GROUP BY upc
HAVING COUNT(*) > 1;

-- Count products per canonical product
SELECT 
  cp.upc,
  cp.normalized_name,
  COUNT(p.id) as product_count
FROM canonical_products cp
LEFT JOIN products p ON p.canonical_product_id = cp.id
GROUP BY cp.id, cp.upc, cp.normalized_name
ORDER BY product_count DESC
LIMIT 20;










