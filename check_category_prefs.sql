-- Check if products have matching category preferences
SELECT 
  p.id,
  p.description,
  p.category_id as product_category_id,
  p.qoh,
  p.is_active,
  cp.category_id as pref_category_id,
  cp.is_enabled,
  CASE 
    WHEN cp.is_enabled = true THEN 'Should be active'
    WHEN cp.is_enabled = false THEN 'Category disabled'
    WHEN cp.is_enabled IS NULL THEN 'No preference found'
  END as status
FROM products p
LEFT JOIN lightspeed_category_sync_preferences cp 
  ON p.user_id = cp.user_id 
  AND p.category_id = cp.category_id
WHERE p.qoh > 0 
  AND p.is_active = false
ORDER BY p.updated_at DESC
LIMIT 10;
