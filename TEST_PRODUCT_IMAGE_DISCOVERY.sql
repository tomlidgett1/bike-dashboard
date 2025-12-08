-- ============================================================
-- Test Product Image Discovery Flow
-- ============================================================
-- This script tests the complete image discovery workflow

-- Step 1: Check if product has canonical_product_id
-- Replace 'YOUR_PRODUCT_ID' with actual product ID
SELECT 
  p.id as product_id,
  p.description,
  p.canonical_product_id,
  p.cached_image_url,
  p.has_displayable_image,
  cp.normalized_name as canonical_name,
  cp.upc as canonical_upc
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
WHERE p.id = 'YOUR_PRODUCT_ID';

-- Step 2: Check images for the canonical product
-- Replace 'YOUR_CANONICAL_PRODUCT_ID' with the canonical_product_id from Step 1
SELECT 
  id,
  canonical_product_id,
  external_url,
  cloudinary_url,
  card_url,
  is_primary,
  approval_status,
  is_downloaded,
  sort_order,
  created_at
FROM product_images
WHERE canonical_product_id = 'YOUR_CANONICAL_PRODUCT_ID'
ORDER BY is_primary DESC, sort_order ASC, created_at DESC;

-- Step 3: Check if trigger updated cached_image_url after approval
-- This should show ALL products that reference the same canonical_product_id
SELECT 
  p.id,
  p.description,
  p.canonical_product_id,
  p.cached_image_url,
  p.cached_thumbnail_url,
  p.has_displayable_image,
  p.user_id,
  u.business_name as store_name
FROM products p
LEFT JOIN users u ON p.user_id = u.id
WHERE p.canonical_product_id = 'YOUR_CANONICAL_PRODUCT_ID';

-- Step 4: Verify the primary image matches cached_image_url
SELECT 
  'Primary Image' as source,
  pi.card_url as image_url,
  pi.is_primary,
  pi.approval_status
FROM product_images pi
WHERE pi.canonical_product_id = 'YOUR_CANONICAL_PRODUCT_ID'
  AND pi.is_primary = true
  AND pi.approval_status = 'approved'

UNION ALL

SELECT 
  'Cached URL' as source,
  p.cached_image_url as image_url,
  null as is_primary,
  null as approval_status
FROM products p
WHERE p.canonical_product_id = 'YOUR_CANONICAL_PRODUCT_ID'
LIMIT 1;

-- Expected results:
-- Both rows should have the same image_url

-- Step 5: Test the trigger manually (if needed)
-- This simulates what happens when you approve an image
DO $$
DECLARE
  test_canonical_id UUID := 'YOUR_CANONICAL_PRODUCT_ID';
  test_image_id UUID := 'YOUR_IMAGE_ID';
BEGIN
  -- Update an image to approved and primary
  UPDATE product_images
  SET 
    approval_status = 'approved',
    is_primary = true
  WHERE id = test_image_id;
  
  RAISE NOTICE 'Updated image %. Check if cached_image_url updated...', test_image_id;
END $$;

-- Step 6: Verify the trigger executed successfully
SELECT 
  p.id,
  p.description,
  p.cached_image_url,
  p.updated_at,
  pi.card_url as primary_image_card_url,
  CASE 
    WHEN p.cached_image_url = pi.card_url THEN '✅ MATCH'
    WHEN p.cached_image_url = pi.cloudinary_url THEN '✅ MATCH (cloudinary_url)'
    WHEN p.cached_image_url = pi.external_url THEN '✅ MATCH (external_url)'
    ELSE '❌ MISMATCH'
  END as status
FROM products p
JOIN product_images pi ON p.canonical_product_id = pi.canonical_product_id
WHERE p.canonical_product_id = 'YOUR_CANONICAL_PRODUCT_ID'
  AND pi.is_primary = true
  AND pi.approval_status = 'approved';

-- ============================================================
-- Common Issues to Check
-- ============================================================

-- Issue 1: Products without canonical_product_id cannot use discovery
SELECT 
  COUNT(*) as products_without_canonical,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM products), 2) as percentage
FROM products
WHERE canonical_product_id IS NULL;

-- Issue 2: Check for orphaned product_images (no parent)
SELECT COUNT(*) as orphaned_images
FROM product_images
WHERE canonical_product_id IS NULL AND product_id IS NULL;

-- Issue 3: Check for products with pending images still
SELECT 
  cp.normalized_name,
  cp.id as canonical_id,
  COUNT(*) as pending_image_count
FROM canonical_products cp
JOIN product_images pi ON cp.id = pi.canonical_product_id
WHERE pi.approval_status = 'pending'
GROUP BY cp.id, cp.normalized_name
ORDER BY pending_image_count DESC
LIMIT 10;

-- Issue 4: Verify trigger function exists
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'refresh_product_image_on_change';

