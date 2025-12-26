-- ============================================================
-- Drop Deprecated Image Columns Migration
-- 
-- WARNING: This migration drops columns! Only run after verifying
-- the application works correctly with the new image system.
--
-- Prerequisites:
-- - 20251226120000_simplify_image_system.sql must be applied
-- - Application must be tested and working with product_images table
-- ============================================================

-- ============================================================
-- Step 1: Drop Deprecated Sync Functions
-- ============================================================

-- These functions are no longer used now that triggers are removed
DROP FUNCTION IF EXISTS sync_product_images_to_jsonb(UUID);
DROP FUNCTION IF EXISTS sync_canonical_images_to_products(UUID);

-- ============================================================
-- Step 2: Drop Deprecated Columns from products table
-- ============================================================

-- WARNING: This permanently deletes data!
-- Make sure you have verified the application works before running.

-- Drop the JSONB images column (replaced by product_images table)
ALTER TABLE products DROP COLUMN IF EXISTS images;

-- Drop cached image URLs (replaced by products_with_primary_image view)
ALTER TABLE products DROP COLUMN IF EXISTS cached_image_url;
ALTER TABLE products DROP COLUMN IF EXISTS cached_thumbnail_url;

-- Drop legacy primary_image_url (replaced by product_images table)
ALTER TABLE products DROP COLUMN IF EXISTS primary_image_url;

-- Drop has_displayable_image flag (replaced by products_with_primary_image.has_images)
ALTER TABLE products DROP COLUMN IF EXISTS has_displayable_image;

-- ============================================================
-- Documentation
-- ============================================================

/*
COLUMNS DROPPED:
================

1. images (JSONB)
   - Was a denormalized copy of product_images data
   - Caused sync issues and data inconsistencies
   - Now: Query product_images table directly

2. cached_image_url (TEXT)
   - Was pre-computed for fast card image lookups
   - Now: Use products_with_primary_image view

3. cached_thumbnail_url (TEXT)
   - Was pre-computed for fast thumbnail lookups
   - Now: Use products_with_primary_image view

4. primary_image_url (TEXT)
   - Legacy column for backwards compatibility
   - Now: Use product_images table with is_primary=true

5. has_displayable_image (BOOLEAN)
   - Flag indicating if product has images
   - Now: Use products_with_primary_image.has_images

ROLLBACK:
=========
To rollback this migration, you'll need to:

1. Re-add the columns:
   ALTER TABLE products ADD COLUMN images JSONB DEFAULT '[]';
   ALTER TABLE products ADD COLUMN cached_image_url TEXT;
   ALTER TABLE products ADD COLUMN cached_thumbnail_url TEXT;
   ALTER TABLE products ADD COLUMN primary_image_url TEXT;
   ALTER TABLE products ADD COLUMN has_displayable_image BOOLEAN DEFAULT false;

2. Recreate the sync functions (copy from 20251209042230_sync_product_images_to_jsonb.sql)

3. Backfill the data from product_images table

Note: Data loss will occur for any data that was only in these columns.
*/

