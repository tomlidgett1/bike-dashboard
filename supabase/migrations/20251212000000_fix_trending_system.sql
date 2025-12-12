-- ============================================================
-- Fix Trending System
-- 
-- This migration fixes the trending products system by:
-- 1. Adding a trigger to auto-create product_scores entries for new products
-- 2. Bootstrapping missing product_scores entries for existing products
-- 3. Setting initial view counts so products can appear in trending
-- ============================================================

-- ============================================================
-- 1. CREATE TRIGGER FOR AUTO-CREATING PRODUCT SCORES
-- ============================================================

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS auto_create_product_score ON products;
DROP FUNCTION IF EXISTS create_product_score_on_insert();

-- Create the trigger function
CREATE OR REPLACE FUNCTION create_product_score_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a new product_scores entry with initial values
  -- Give a baseline view_count of 1 so the product can appear in trending
  INSERT INTO product_scores (
    product_id, 
    view_count, 
    click_count, 
    like_count, 
    conversion_count,
    popularity_score,
    trending_score,
    last_interaction_at,
    created_at
  )
  VALUES (
    NEW.id, 
    1,  -- Start with 1 view so trending_score > 0
    0, 
    0, 
    0,
    1.0,  -- Initial popularity score
    1.0,  -- Initial trending score so it can appear
    NOW(),
    NOW()
  )
  ON CONFLICT (product_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on products table
CREATE TRIGGER auto_create_product_score
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION create_product_score_on_insert();

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION create_product_score_on_insert() TO authenticated, anon;

-- ============================================================
-- 2. BOOTSTRAP MISSING PRODUCT SCORES
-- ============================================================

-- Insert product_scores entries for all active products that don't have one
-- Give them a baseline view_count of 1 so they can appear in trending
INSERT INTO product_scores (
  product_id, 
  view_count, 
  click_count, 
  like_count, 
  conversion_count,
  popularity_score,
  trending_score,
  last_interaction_at,
  created_at
)
SELECT 
  p.id,
  1,  -- Baseline view count
  0,
  0,
  0,
  1.0,  -- Initial popularity
  1.0,  -- Initial trending score
  NOW(),
  NOW()
FROM products p
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM product_scores ps WHERE ps.product_id = p.id
  );

-- Also ensure existing product_scores with 0 view_count get a baseline
UPDATE product_scores
SET 
  view_count = GREATEST(view_count, 1),
  last_interaction_at = COALESCE(last_interaction_at, NOW())
WHERE view_count = 0;

-- ============================================================
-- 3. RECALCULATE ALL SCORES
-- ============================================================

-- Run the score calculation function to update popularity and trending scores
SELECT calculate_popularity_scores();

-- ============================================================
-- 4. VERIFY THE FIX
-- ============================================================

-- Output diagnostics
DO $$
DECLARE
  v_total_products INTEGER;
  v_with_scores INTEGER;
  v_with_trending INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_products FROM products WHERE is_active = true;
  SELECT COUNT(*) INTO v_with_scores FROM product_scores;
  SELECT COUNT(*) INTO v_with_trending FROM product_scores WHERE trending_score > 0;
  
  RAISE NOTICE '=== Trending System Fix Results ===';
  RAISE NOTICE 'Total active products: %', v_total_products;
  RAISE NOTICE 'Products with score entries: %', v_with_scores;
  RAISE NOTICE 'Products with trending_score > 0: %', v_with_trending;
  
  IF v_with_trending > 0 THEN
    RAISE NOTICE '✅ SUCCESS: Trending system should now show products';
  ELSE
    RAISE NOTICE '⚠️  WARNING: No products with trending scores. Check if calculate_popularity_scores() ran correctly.';
  END IF;
END $$;

-- Show top 10 trending products for verification
SELECT 
  p.id,
  LEFT(p.description, 50) as description,
  p.price,
  ps.view_count,
  ps.click_count,
  ROUND(ps.trending_score::numeric, 4) as trending_score,
  CASE 
    WHEN p.primary_image_url LIKE '%cloudinary%' THEN 'YES'
    WHEN p.custom_image_url LIKE '%cloudinary%' THEN 'YES'
    WHEN p.images::text LIKE '%cloudinary%' THEN 'YES'
    ELSE 'NO'
  END as has_cloudinary
FROM products p
JOIN product_scores ps ON p.id = ps.product_id
WHERE p.is_active = true
  AND ps.trending_score > 0
ORDER BY ps.trending_score DESC
LIMIT 10;
