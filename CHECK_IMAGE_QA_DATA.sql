-- ============================================================
-- Diagnostic Query for Image QA System
-- ============================================================
-- Run this in Supabase SQL Editor to see what data exists

-- 1. Check how many canonical products exist
SELECT 'Total Canonical Products' as check_name, COUNT(*) as count
FROM canonical_products;

-- 2. Check how many product images exist (by status)
SELECT 'Product Images by Status' as check_name, 
       approval_status, 
       COUNT(*) as count
FROM product_images
GROUP BY approval_status;

-- 3. Check products with images (grouped by status)
SELECT 
  'Products by Image Status' as check_name,
  CASE 
    WHEN pending_count > 0 THEN 'Has Pending Images'
    WHEN approved_count > 0 THEN 'Has Approved Images Only'
    ELSE 'No Images'
  END as status,
  COUNT(*) as product_count
FROM (
  SELECT 
    cp.id,
    COUNT(*) FILTER (WHERE pi.approval_status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE pi.approval_status = 'approved') as approved_count
  FROM canonical_products cp
  LEFT JOIN product_images pi ON pi.canonical_product_id = cp.id
  GROUP BY cp.id
) subq
GROUP BY status;

-- 4. Show first 10 products with their image counts
SELECT 
  cp.id,
  cp.normalized_name,
  cp.upc,
  COUNT(*) FILTER (WHERE pi.approval_status = 'pending') as pending_images,
  COUNT(*) FILTER (WHERE pi.approval_status = 'approved') as approved_images,
  COUNT(*) FILTER (WHERE pi.approval_status = 'rejected') as rejected_images
FROM canonical_products cp
LEFT JOIN product_images pi ON pi.canonical_product_id = cp.id
GROUP BY cp.id, cp.normalized_name, cp.upc
ORDER BY cp.created_at DESC
LIMIT 10;

-- 5. Check if approval_status column exists
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'product_images'
  AND column_name = 'approval_status';



