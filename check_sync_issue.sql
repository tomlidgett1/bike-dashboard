-- Check what's in products_all_ls for a specific user and category
SELECT 
  category_id,
  COUNT(*) as product_count,
  array_agg(description) as product_names
FROM products_all_ls
WHERE category_id = '21'
GROUP BY category_id;

-- Check if any products from category 21 are already synced
SELECT 
  COUNT(*) as already_synced
FROM products
WHERE lightspeed_category_id = '21'
  AND is_active = true;
