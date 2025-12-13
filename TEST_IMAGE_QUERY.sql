-- Test the exact query the API is using

-- First, let's see what products and canonical products exist
SELECT 
  p.id as product_id,
  p.description,
  p.canonical_product_id,
  cp.id as canonical_exists,
  cp.normalized_name
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
LIMIT 5;

-- Now let's see what images exist
SELECT 
  pi.id,
  pi.canonical_product_id,
  pi.storage_path,
  pi.is_primary,
  cp.normalized_name
FROM product_images pi
JOIN canonical_products cp ON pi.canonical_product_id = cp.id
LIMIT 5;

-- Now test the full join the API should be doing
SELECT 
  p.id,
  p.description,
  p.canonical_product_id,
  pi.id as image_id,
  pi.storage_path,
  pi.is_primary
FROM products p
LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
LEFT JOIN product_images pi ON cp.id = pi.canonical_product_id
WHERE p.is_active = true
LIMIT 5;

-- Test what the new API query is doing (with nested select)
SELECT 
  p.*,
  (
    SELECT json_build_object(
      'id', cp.id,
      'upc', cp.upc,
      'normalized_name', cp.normalized_name,
      'product_images', (
        SELECT json_agg(
          json_build_object(
            'id', pi.id,
            'storage_path', pi.storage_path,
            'is_primary', pi.is_primary,
            'variants', pi.variants,
            'formats', pi.formats
          )
        )
        FROM product_images pi
        WHERE pi.canonical_product_id = cp.id
      )
    )
    FROM canonical_products cp
    WHERE cp.id = p.canonical_product_id
  ) as canonical_products
FROM products p
WHERE p.is_active = true
LIMIT 3;












