-- ============================================================
-- Fix Canonical Products UPC Column to Allow NULL
-- This prevents duplicate canonical products from being created
-- ============================================================

-- Step 1: Drop the NOT NULL constraint on UPC
ALTER TABLE canonical_products 
  ALTER COLUMN upc DROP NOT NULL;

-- Step 2: Create a unique partial index for normalized_name (for products without UPC)
-- This prevents duplicates for products that don't have UPCs
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_normalized_name_unique
  ON canonical_products(normalized_name)
  WHERE upc IS NULL;

-- Step 3: Clean up existing TEMP- UPC products
-- Convert TEMP- UPCs to NULL and merge duplicates
DO $$
DECLARE
  temp_canonical RECORD;
  real_canonical RECORD;
  image_count INTEGER;
BEGIN
  -- Find all canonical products with TEMP- UPCs
  FOR temp_canonical IN 
    SELECT id, upc, normalized_name 
    FROM canonical_products 
    WHERE upc LIKE 'TEMP-%'
  LOOP
    -- Check if a canonical product with same normalized_name but real UPC exists
    SELECT * INTO real_canonical
    FROM canonical_products
    WHERE normalized_name = temp_canonical.normalized_name
      AND upc IS NOT NULL
      AND upc NOT LIKE 'TEMP-%'
    LIMIT 1;
    
    IF FOUND THEN
      -- Merge: Update all references to point to the real canonical product
      RAISE NOTICE 'Merging TEMP canonical % into real canonical %', temp_canonical.id, real_canonical.id;
      
      -- Update products table
      UPDATE products 
      SET canonical_product_id = real_canonical.id
      WHERE canonical_product_id = temp_canonical.id;
      
      -- Update product_images table
      UPDATE product_images
      SET canonical_product_id = real_canonical.id
      WHERE canonical_product_id = temp_canonical.id;
      
      -- Delete the TEMP canonical product
      DELETE FROM canonical_products WHERE id = temp_canonical.id;
    ELSE
      -- No real canonical exists, just convert TEMP UPC to NULL
      UPDATE canonical_products
      SET upc = NULL
      WHERE id = temp_canonical.id;
    END IF;
  END LOOP;
  
  -- Handle duplicates with NULL UPC (keep the one with most images)
  FOR temp_canonical IN
    SELECT normalized_name, COUNT(*) as dup_count
    FROM canonical_products
    WHERE upc IS NULL
    GROUP BY normalized_name
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Found % duplicates for normalized_name: %', temp_canonical.dup_count, temp_canonical.normalized_name;
    
    -- Keep the canonical product with the most images, delete others
    WITH ranked_canonicals AS (
      SELECT 
        cp.id,
        cp.normalized_name,
        COUNT(pi.id) as image_count,
        ROW_NUMBER() OVER (PARTITION BY cp.normalized_name ORDER BY COUNT(pi.id) DESC, cp.created_at ASC) as rn
      FROM canonical_products cp
      LEFT JOIN product_images pi ON pi.canonical_product_id = cp.id
      WHERE cp.normalized_name = temp_canonical.normalized_name
        AND cp.upc IS NULL
      GROUP BY cp.id, cp.normalized_name
    ),
    keeper AS (
      SELECT id FROM ranked_canonicals WHERE rn = 1
    ),
    duplicates AS (
      SELECT id FROM ranked_canonicals WHERE rn > 1
    )
    -- Update all references to point to the keeper
    UPDATE products p
    SET canonical_product_id = (SELECT id FROM keeper LIMIT 1)
    WHERE canonical_product_id IN (SELECT id FROM duplicates);
    
    -- Update product_images to point to keeper
    WITH ranked_canonicals AS (
      SELECT 
        cp.id,
        cp.normalized_name,
        COUNT(pi.id) as image_count,
        ROW_NUMBER() OVER (PARTITION BY cp.normalized_name ORDER BY COUNT(pi.id) DESC, cp.created_at ASC) as rn
      FROM canonical_products cp
      LEFT JOIN product_images pi ON pi.canonical_product_id = cp.id
      WHERE cp.normalized_name = temp_canonical.normalized_name
        AND cp.upc IS NULL
      GROUP BY cp.id, cp.normalized_name
    ),
    keeper AS (
      SELECT id FROM ranked_canonicals WHERE rn = 1
    ),
    duplicates AS (
      SELECT id FROM ranked_canonicals WHERE rn > 1
    )
    UPDATE product_images pi
    SET canonical_product_id = (SELECT id FROM keeper LIMIT 1)
    WHERE canonical_product_id IN (SELECT id FROM duplicates);
    
    -- Delete duplicate canonical products
    WITH ranked_canonicals AS (
      SELECT 
        cp.id,
        cp.normalized_name,
        ROW_NUMBER() OVER (PARTITION BY cp.normalized_name ORDER BY cp.created_at ASC) as rn
      FROM canonical_products cp
      WHERE cp.normalized_name = temp_canonical.normalized_name
        AND cp.upc IS NULL
    )
    DELETE FROM canonical_products
    WHERE id IN (
      SELECT id FROM ranked_canonicals WHERE rn > 1
    );
  END LOOP;
END $$;

-- Step 4: Update the UPC unique index to allow NULLs
DROP INDEX IF EXISTS idx_canonical_upc;
CREATE UNIQUE INDEX idx_canonical_upc ON canonical_products(upc) WHERE upc IS NOT NULL;

-- Step 5: Update image_count and product_count for all canonical products
UPDATE canonical_products cp
SET 
  image_count = (
    SELECT COUNT(*) 
    FROM product_images pi 
    WHERE pi.canonical_product_id = cp.id
  ),
  product_count = (
    SELECT COUNT(*) 
    FROM products p 
    WHERE p.canonical_product_id = cp.id
  );

-- Step 6: Add helpful comment
COMMENT ON COLUMN canonical_products.upc IS 'Universal Product Code - unique when present, NULL for products without UPC (matched by normalized_name)';




