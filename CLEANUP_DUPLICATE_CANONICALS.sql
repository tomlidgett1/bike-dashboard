-- ============================================================
-- CLEANUP: Remove Duplicate Canonical Products
-- ============================================================
-- This script removes duplicate canonical products created by the bug
-- and consolidates them into single canonical products

-- STEP 1: Check for duplicates
-- ============================================================
SELECT 
  normalized_name,
  COUNT(*) as duplicate_count,
  array_agg(id) as canonical_ids,
  array_agg(upc) as upcs
FROM canonical_products
GROUP BY normalized_name
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- This shows products with multiple canonical entries

-- STEP 2: Check duplicate UPCs (shouldn't exist due to UNIQUE constraint)
-- ============================================================
SELECT 
  upc,
  COUNT(*) as count,
  array_agg(id) as ids
FROM canonical_products
GROUP BY upc
HAVING COUNT(*) > 1;

-- This should return 0 rows (UNIQUE constraint prevents this)
-- If you see rows, something is very wrong

-- STEP 3: Find TEMP UPCs that are duplicates by normalized name
-- ============================================================
SELECT 
  cp1.id as keep_id,
  cp1.upc as keep_upc,
  cp1.normalized_name,
  cp2.id as duplicate_id,
  cp2.upc as duplicate_upc,
  (SELECT COUNT(*) FROM products p WHERE p.canonical_product_id = cp1.id) as keep_product_count,
  (SELECT COUNT(*) FROM products p WHERE p.canonical_product_id = cp2.id) as duplicate_product_count
FROM canonical_products cp1
JOIN canonical_products cp2 ON cp1.normalized_name = cp2.normalized_name AND cp1.id < cp2.id
WHERE cp1.upc LIKE 'TEMP-%' OR cp2.upc LIKE 'TEMP-%'
ORDER BY cp1.normalized_name;

-- Shows which canonical products are duplicates

-- STEP 4: Consolidate duplicates (CAREFUL - run in transaction)
-- ============================================================
BEGIN;

-- For each duplicate, update products to point to the earliest canonical product
UPDATE products p
SET canonical_product_id = earliest.id
FROM (
  SELECT 
    cp1.normalized_name,
    MIN(cp1.id) as id
  FROM canonical_products cp1
  GROUP BY cp1.normalized_name
  HAVING COUNT(*) > 1
) earliest
JOIN canonical_products cp2 ON cp2.normalized_name = earliest.normalized_name
WHERE p.canonical_product_id = cp2.id
  AND cp2.id != earliest.id;

-- Check how many products were updated
SELECT 'Products relinked' as action, COUNT(*) as count
FROM products p
JOIN (
  SELECT normalized_name, MIN(id) as keep_id, array_agg(id) as all_ids
  FROM canonical_products
  GROUP BY normalized_name
  HAVING COUNT(*) > 1
) dups ON p.canonical_product_id = ANY(dups.all_ids);

-- If this looks good, commit. Otherwise, rollback
-- COMMIT;
ROLLBACK; -- Change this to COMMIT when you're ready

-- STEP 5: After committing above, delete orphaned canonical products
-- ============================================================
-- Run this AFTER committing step 4

BEGIN;

-- Delete canonical products with no linked products (and are duplicates)
DELETE FROM canonical_products cp
WHERE cp.id IN (
  SELECT cp2.id
  FROM canonical_products cp2
  WHERE NOT EXISTS (
    SELECT 1 FROM products p WHERE p.canonical_product_id = cp2.id
  )
  AND EXISTS (
    SELECT 1 
    FROM canonical_products cp3 
    WHERE cp3.normalized_name = cp2.normalized_name 
    AND cp3.id != cp2.id
  )
);

-- Check what will be deleted
SELECT 'Orphaned duplicates to delete' as action, COUNT(*) as count
FROM canonical_products cp
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.canonical_product_id = cp.id
)
AND EXISTS (
  SELECT 1 
  FROM canonical_products cp3 
  WHERE cp3.normalized_name = cp.normalized_name 
  AND cp3.id != cp.id
);

-- COMMIT;
ROLLBACK; -- Change to COMMIT when ready

-- STEP 6: Verify cleanup
-- ============================================================
SELECT 
  'After cleanup' as status,
  COUNT(*) as total_canonical_products,
  COUNT(DISTINCT normalized_name) as unique_products,
  COUNT(*) - COUNT(DISTINCT normalized_name) as duplicates_remaining
FROM canonical_products;

-- Expected: duplicates_remaining should be 0

-- STEP 7: Check products are all still linked
-- ============================================================
SELECT 
  COUNT(*) as total_products,
  COUNT(canonical_product_id) as linked_products,
  COUNT(*) - COUNT(canonical_product_id) as unlinked_products
FROM products;

-- Expected: unlinked_products should be 0

-- ============================================================
-- SAFER ALTERNATIVE: Clean duplicates by UPC pattern
-- ============================================================

-- If you want to just clean up TEMP UPCs:

-- Find products with TEMP UPCs that should have real UPCs
SELECT 
  p.id,
  p.description,
  p.upc as product_upc,
  cp.upc as canonical_upc
FROM products p
JOIN canonical_products cp ON p.canonical_product_id = cp.id
WHERE cp.upc LIKE 'TEMP-%'
  AND p.upc IS NOT NULL
  AND p.upc != '';

-- For these, we should:
-- 1. Find or create canonical with real UPC
-- 2. Relink product to that canonical
-- 3. Delete orphaned TEMP canonical

-- Run this to fix them:
DO $$
DECLARE
  product_record RECORD;
  new_canonical_id UUID;
  old_canonical_id UUID;
BEGIN
  FOR product_record IN 
    SELECT 
      p.id as product_id,
      p.upc as product_upc,
      p.description,
      p.category_name,
      p.manufacturer_name,
      p.canonical_product_id as old_canonical_id,
      cp.upc as old_canonical_upc
    FROM products p
    JOIN canonical_products cp ON p.canonical_product_id = cp.id
    WHERE cp.upc LIKE 'TEMP-%'
      AND p.upc IS NOT NULL
      AND p.upc != ''
  LOOP
    -- Try to find existing canonical with real UPC
    SELECT id INTO new_canonical_id
    FROM canonical_products
    WHERE upc = UPPER(TRIM(REGEXP_REPLACE(product_record.product_upc, '\s+', '', 'g')))
    LIMIT 1;
    
    -- If not found, create it
    IF new_canonical_id IS NULL THEN
      INSERT INTO canonical_products (upc, normalized_name, category, manufacturer)
      VALUES (
        UPPER(TRIM(REGEXP_REPLACE(product_record.product_upc, '\s+', '', 'g'))),
        LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(product_record.description, '[^\w\s-]', '', 'g'), '\s+', ' ', 'g'))),
        product_record.category_name,
        product_record.manufacturer_name
      )
      ON CONFLICT (upc) DO UPDATE SET updated_at = NOW()
      RETURNING id INTO new_canonical_id;
    END IF;
    
    -- Relink product to correct canonical
    UPDATE products
    SET canonical_product_id = new_canonical_id
    WHERE id = product_record.product_id;
    
    RAISE NOTICE 'Relinked product % from % to %', 
      product_record.product_id, 
      product_record.old_canonical_upc, 
      UPPER(TRIM(REGEXP_REPLACE(product_record.product_upc, '\s+', '', 'g')));
  END LOOP;
END $$;









