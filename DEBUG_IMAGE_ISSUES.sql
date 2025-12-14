-- ============================================================
-- DEBUG: Image Issues Diagnostic
-- ============================================================
-- Run these queries in Supabase SQL Editor to diagnose the issue

-- STEP 1: Check if products have canonical_product_id
-- ============================================================
SELECT 
  COUNT(*) as total_products,
  COUNT(canonical_product_id) as with_canonical,
  COUNT(*) - COUNT(canonical_product_id) as without_canonical
FROM products;

-- Expected: with_canonical should be > 0
-- If all without_canonical: RUN MANUAL_CANONICAL_FIX.sql first!

-- STEP 2: Check if canonical_products table has data
-- ============================================================
SELECT COUNT(*) as canonical_products_count FROM canonical_products;

-- Expected: Should be > 0
-- If 0: No canonical products created yet - RUN MANUAL_CANONICAL_FIX.sql

-- STEP 3: Check if product_images table has data
-- ============================================================
SELECT COUNT(*) as product_images_count FROM product_images;

-- Expected: Should be > 0 if you've uploaded images
-- If 0: No images uploaded yet OR upload failed

-- STEP 4: Check a specific product
-- ============================================================
SELECT 
  p.id,
  p.description,
  p.upc,
  p.canonical_product_id,
  p.primary_image_url as lightspeed_image,
  (SELECT COUNT(*) 
   FROM product_images pi 
   WHERE pi.canonical_product_id = p.canonical_product_id) as image_count
FROM products p
ORDER BY p.created_at DESC
LIMIT 5;

-- This shows:
-- - Which products have canonical_product_id
-- - How many images each has
-- - Whether they have Lightspeed images

-- STEP 5: Check product_images details
-- ============================================================
SELECT 
  pi.id,
  pi.canonical_product_id,
  pi.storage_path,
  pi.is_primary,
  pi.created_at,
  cp.normalized_name as product_name
FROM product_images pi
LEFT JOIN canonical_products cp ON pi.canonical_product_id = cp.id
ORDER BY pi.created_at DESC
LIMIT 10;

-- This shows actual uploaded images

-- STEP 6: Check RLS policies on product_images
-- ============================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'product_images';

-- Make sure there's a policy allowing SELECT for public/authenticated users

-- STEP 7: Test the join that the API uses
-- ============================================================
SELECT 
  p.id as product_id,
  p.description,
  p.canonical_product_id,
  cp.id as canonical_id,
  cp.normalized_name,
  pi.id as image_id,
  pi.storage_path,
  pi.is_primary
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
LEFT JOIN product_images pi ON cp.id = pi.canonical_product_id AND pi.is_primary = true
WHERE p.is_active = true
ORDER BY p.created_at DESC
LIMIT 5;

-- This is essentially what the API does
-- Check if canonical_product_id, canonical_id, and image_id are populated

-- STEP 8: If images exist but not showing, check storage paths
-- ============================================================
SELECT 
  storage_path,
  CONCAT(
    current_setting('app.settings.supabase_url', true),
    '/storage/v1/object/public/product-images/',
    storage_path
  ) as full_url
FROM product_images
LIMIT 3;

-- Copy one of these URLs and try opening in browser
-- If it doesn't work, storage bucket might not be public

-- ============================================================
-- COMMON ISSUES & SOLUTIONS
-- ============================================================

-- ISSUE 1: All products have canonical_product_id = NULL
-- SOLUTION: Run MANUAL_CANONICAL_FIX.sql

-- ISSUE 2: canonical_products table is empty
-- SOLUTION: Run MANUAL_CANONICAL_FIX.sql

-- ISSUE 3: product_images table is empty
-- SOLUTION: Upload images haven't worked - check upload logs

-- ISSUE 4: Images uploaded but not showing
-- SOLUTION: Check storage bucket is public:
SELECT * FROM storage.buckets WHERE id = 'product-images';
-- Make sure "public" column is TRUE

-- ISSUE 5: "Failed to fetch images" error
-- SOLUTION: Check browser console for actual error
-- Likely causes:
--   a) Product has no canonical_product_id
--   b) RLS policy blocking reads
--   c) API route error

-- ============================================================
-- QUICK FIX: Create test data
-- ============================================================

-- If you want to test with dummy data:

-- 1. Create a canonical product
INSERT INTO canonical_products (upc, normalized_name, category)
VALUES ('TEST123', 'test product', 'Test Category')
RETURNING id;

-- 2. Note the returned ID, then link a product to it
-- UPDATE products 
-- SET canonical_product_id = 'PASTE_ID_HERE'
-- WHERE id = 'PASTE_YOUR_PRODUCT_ID_HERE';

-- 3. Then try uploading an image for that product














