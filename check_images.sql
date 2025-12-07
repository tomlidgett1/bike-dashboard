-- Check if products_all_ls has images
SELECT 
  COUNT(*) as total_products,
  COUNT(CASE WHEN images IS NOT NULL AND images != '[]'::jsonb THEN 1 END) as with_images,
  COUNT(CASE WHEN primary_image_url IS NOT NULL THEN 1 END) as with_primary_url
FROM products_all_ls
WHERE user_id = '1182b0ff-67f2-451f-94c8-19dfdf574459';

-- Sample product to see image data
SELECT 
  description,
  images,
  primary_image_url
FROM products_all_ls
WHERE user_id = '1182b0ff-67f2-451f-94c8-19dfdf574459'
LIMIT 5;
