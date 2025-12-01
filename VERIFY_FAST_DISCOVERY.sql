-- ============================================================
-- Verify Fast Image Discovery is Working
-- ============================================================
-- Run this in Supabase SQL Editor after triggering discovery

-- 1. Check if storage_path is now nullable
SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'product_images'
  AND column_name IN ('storage_path', 'external_url', 'is_downloaded');
-- Expected: storage_path = YES, external_url = YES, is_downloaded = YES

-- 2. Check recent images with external URLs (fast discovery)
SELECT 
  id,
  canonical_product_id,
  external_url,
  storage_path,
  is_downloaded,
  approval_status,
  created_at
FROM product_images
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 10;
-- Expected: See images with external_url but storage_path = null

-- 3. Count images by download status
SELECT 
  is_downloaded,
  approval_status,
  COUNT(*) as count
FROM product_images
GROUP BY is_downloaded, approval_status
ORDER BY is_downloaded DESC, approval_status;
-- Expected: Some with is_downloaded=false (fast discovery working!)

-- 4. Find products with external-only images (not downloaded yet)
SELECT 
  cp.normalized_name,
  COUNT(*) FILTER (WHERE pi.is_downloaded = false) as external_only,
  COUNT(*) FILTER (WHERE pi.is_downloaded = true) as downloaded,
  COUNT(*) as total
FROM canonical_products cp
JOIN product_images pi ON pi.canonical_product_id = cp.id
GROUP BY cp.id, cp.normalized_name
HAVING COUNT(*) FILTER (WHERE pi.is_downloaded = false) > 0
ORDER BY external_only DESC
LIMIT 10;

