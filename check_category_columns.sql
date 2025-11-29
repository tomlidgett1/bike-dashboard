-- Check which column has category data in products
SELECT 
  id,
  description,
  category_id,
  lightspeed_category_id,
  CASE 
    WHEN category_id IS NOT NULL THEN 'category_id has data'
    WHEN lightspeed_category_id IS NOT NULL THEN 'lightspeed_category_id has data'
    ELSE 'Both NULL'
  END as which_column_has_data
FROM products
WHERE qoh > 0
LIMIT 10;
