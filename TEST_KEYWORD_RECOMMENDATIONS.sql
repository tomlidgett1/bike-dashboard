-- ============================================================
-- Test Keyword-Based Recommendations
-- ============================================================

-- Step 1: Update your user preferences to extract keywords
-- Replace YOUR_USER_ID with your actual user ID
SELECT update_user_preferences_from_interactions('YOUR_USER_ID'::UUID);

-- Step 2: Check what keywords were extracted
SELECT 
  user_id,
  favorite_keywords,
  favorite_brands,
  favorite_categories
FROM user_preferences
WHERE user_id = 'YOUR_USER_ID'::UUID;

-- Step 3: Test keyword extraction directly
SELECT extract_keywords_from_interactions('YOUR_USER_ID'::UUID);

-- Step 4: See sample of what you've clicked on
SELECT 
  p.display_name,
  p.description,
  p.manufacturer_name,
  ui.interaction_type,
  ui.created_at
FROM user_interactions ui
JOIN products p ON ui.product_id = p.id
WHERE ui.user_id = 'YOUR_USER_ID'::UUID
ORDER BY ui.created_at DESC
LIMIT 10;

-- Step 5: Find your user ID if you don't know it
-- SELECT id, email FROM auth.users WHERE email = 'your@email.com';

-- Success!
SELECT '✅ Keyword recommendations ready to test!' as message;



