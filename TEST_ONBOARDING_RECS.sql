-- ============================================================
-- Test Onboarding-Based Recommendations
-- Run this with YOUR user ID to debug
-- ============================================================

-- Step 1: Check your onboarding preferences
SELECT 
  user_id,
  preferences,
  onboarding_completed
FROM users
WHERE user_id = '1182b0ff-67f2-451f-94c8-19dfdf574459';

-- Step 2: Check interaction count (should be low for new user test)
SELECT COUNT(*) as interaction_count
FROM user_interactions
WHERE user_id = '1182b0ff-67f2-451f-94c8-19dfdf574459';

-- Step 3: Clear cache to force fresh generation
DELETE FROM recommendation_cache 
WHERE user_id = '1182b0ff-67f2-451f-94c8-19dfdf574459';

-- Step 4: Manually test the matching logic
-- Based on preferences: riding_styles=["mountain"], brands=["Shimano","Trek"], budget="500-1500"

-- Test: Find mountain bikes
SELECT 
  id,
  display_name,
  description,
  price,
  bike_type,
  marketplace_category
FROM products
WHERE is_active = true
  AND bike_type = 'Mountain'
  AND price BETWEEN 500 AND 1500
LIMIT 10;

-- Test: Find products with "Shimano" in name
SELECT 
  id,
  display_name,
  description,
  price,
  manufacturer_name
FROM products
WHERE is_active = true
  AND (
    display_name ILIKE '%Shimano%'
    OR description ILIKE '%Shimano%'
    OR manufacturer_name ILIKE '%Shimano%'
  )
  AND price BETWEEN 500 AND 1500
LIMIT 10;

-- Test: Find products with "Trek" in name
SELECT 
  id,
  display_name,
  description,
  price
FROM products
WHERE is_active = true
  AND (
    display_name ILIKE '%Trek%'
    OR description ILIKE '%Trek%'
  )
  AND price BETWEEN 500 AND 1500
LIMIT 10;

-- If these queries return products, the algorithm should work!







