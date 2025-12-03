-- ============================================================
-- Unify Product Images
-- ============================================================
-- All images (Facebook import, manual upload, canonical products)
-- should be stored in product_images table for consistency.
-- The homepage and all views will reference this single source of truth.

-- ============================================================
-- Step 1: Add product_id column to link to products table
-- ============================================================

-- Add nullable product_id for private listings
ALTER TABLE product_images 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;

-- Make canonical_product_id nullable (private listings don't have one)
ALTER TABLE product_images 
ALTER COLUMN canonical_product_id DROP NOT NULL;

-- Make storage_path nullable (Cloudinary images don't need local storage)
ALTER TABLE product_images 
ALTER COLUMN storage_path DROP NOT NULL;

-- Add Cloudinary-specific columns if they don't exist
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS cloudinary_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS card_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS detail_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS external_url TEXT;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS is_downloaded BOOLEAN DEFAULT FALSE;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';

-- Add check constraint: must have either product_id or canonical_product_id
ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_parent_check;
ALTER TABLE product_images ADD CONSTRAINT product_images_parent_check 
  CHECK (product_id IS NOT NULL OR canonical_product_id IS NOT NULL);

-- ============================================================
-- Step 2: Create index for product_id lookups
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_product_images_product_id 
  ON product_images(product_id) WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_images_product_primary 
  ON product_images(product_id, is_primary) 
  WHERE product_id IS NOT NULL AND is_primary = true;

-- ============================================================
-- Step 3: Update the cached images trigger to use product_images
-- ============================================================

CREATE OR REPLACE FUNCTION update_product_cached_images()
RETURNS TRIGGER AS $$
DECLARE
  v_image_url TEXT := NULL;
  v_thumbnail_url TEXT := NULL;
  v_has_image BOOLEAN := FALSE;
BEGIN
  -- Check product_images table first (unified source)
  -- This works for both private listings and canonical products
  
  -- Priority 1: Product images linked by product_id (private listings)
  IF NEW.id IS NOT NULL THEN
    SELECT 
      COALESCE(pi.card_url, pi.cloudinary_url, pi.external_url),
      COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
    INTO v_image_url, v_thumbnail_url
    FROM product_images pi
    WHERE pi.product_id = NEW.id
      AND pi.is_primary = TRUE
      AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
    ORDER BY pi.created_at DESC
    LIMIT 1;
    
    -- If no primary, get any image
    IF v_image_url IS NULL THEN
      SELECT 
        COALESCE(pi.card_url, pi.cloudinary_url, pi.external_url),
        COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
      INTO v_image_url, v_thumbnail_url
      FROM product_images pi
      WHERE pi.product_id = NEW.id
        AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
      ORDER BY pi.sort_order ASC, pi.created_at ASC
      LIMIT 1;
    END IF;
    
    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
    END IF;
  END IF;
  
  -- Priority 2: Canonical product images (for store inventory)
  IF v_image_url IS NULL AND NEW.canonical_product_id IS NOT NULL THEN
    SELECT 
      COALESCE(pi.card_url, pi.cloudinary_url),
      COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
    INTO v_image_url, v_thumbnail_url
    FROM product_images pi
    WHERE pi.canonical_product_id = NEW.canonical_product_id
      AND pi.is_primary = TRUE
      AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
      AND pi.cloudinary_url IS NOT NULL
    LIMIT 1;
    
    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
    END IF;
  END IF;
  
  -- Priority 3: Custom store image (legacy support)
  IF v_image_url IS NULL AND NEW.use_custom_image = TRUE AND NEW.custom_image_url IS NOT NULL THEN
    IF NEW.custom_image_url LIKE '%cloudinary%' THEN
      v_image_url := NEW.custom_image_url;
      v_thumbnail_url := NEW.custom_image_url;
      v_has_image := TRUE;
    END IF;
  END IF;
  
  -- Priority 4: Legacy JSONB images (fallback during migration)
  IF v_image_url IS NULL AND NEW.listing_type = 'private_listing' AND NEW.images IS NOT NULL THEN
    SELECT 
      COALESCE(
        (SELECT img->>'cardUrl' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'cardUrl' LIKE '%cloudinary%' 
         LIMIT 1),
        (SELECT img->>'url' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'url' LIKE '%cloudinary%' 
         LIMIT 1)
      )
    INTO v_image_url;
    
    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
      v_thumbnail_url := v_image_url;
    END IF;
  END IF;
  
  -- Update the cached columns
  NEW.cached_image_url := v_image_url;
  NEW.cached_thumbnail_url := v_thumbnail_url;
  NEW.has_displayable_image := v_has_image;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 4: Create function to update product cached images
-- Called when product_images table changes
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_product_cached_image()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
  v_image_url TEXT;
  v_thumbnail_url TEXT;
BEGIN
  -- Get the product_id (from NEW for insert/update, OLD for delete)
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  
  IF v_product_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Find the best image for this product
  SELECT 
    COALESCE(pi.card_url, pi.cloudinary_url, pi.external_url),
    COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
  INTO v_image_url, v_thumbnail_url
  FROM product_images pi
  WHERE pi.product_id = v_product_id
    AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
  ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
  LIMIT 1;
  
  -- Update the product's cached image columns
  UPDATE products
  SET 
    cached_image_url = v_image_url,
    cached_thumbnail_url = v_thumbnail_url,
    has_displayable_image = (v_image_url IS NOT NULL)
  WHERE id = v_product_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for product_images changes
DROP TRIGGER IF EXISTS refresh_product_image_on_change ON product_images;
CREATE TRIGGER refresh_product_image_on_change
  AFTER INSERT OR UPDATE OR DELETE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION refresh_product_cached_image();

-- ============================================================
-- Step 5: Update primary image trigger to handle product_id
-- ============================================================

CREATE OR REPLACE FUNCTION set_primary_image()
RETURNS TRIGGER AS $$
BEGIN
  -- If this image is being set as primary
  IF NEW.is_primary = true THEN
    -- Set all other images for this product to non-primary
    IF NEW.product_id IS NOT NULL THEN
      UPDATE product_images 
      SET is_primary = false 
      WHERE product_id = NEW.product_id 
        AND id != NEW.id
        AND is_primary = true;
    ELSIF NEW.canonical_product_id IS NOT NULL THEN
      UPDATE product_images 
      SET is_primary = false 
      WHERE canonical_product_id = NEW.canonical_product_id 
        AND id != NEW.id
        AND is_primary = true;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 6: Migrate existing private listing images to product_images
-- ============================================================

-- Function to migrate a single product's images
CREATE OR REPLACE FUNCTION migrate_product_images_from_jsonb(p_product_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_product RECORD;
  v_image RECORD;
  v_count INTEGER := 0;
  v_existing INTEGER;
BEGIN
  -- Get the product
  SELECT id, images, user_id INTO v_product
  FROM products
  WHERE id = p_product_id
    AND listing_type = 'private_listing'
    AND images IS NOT NULL
    AND jsonb_array_length(images) > 0;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Check if already migrated
  SELECT COUNT(*) INTO v_existing
  FROM product_images
  WHERE product_id = p_product_id;
  
  IF v_existing > 0 THEN
    RETURN 0; -- Already migrated
  END IF;
  
  -- Insert each image from JSONB into product_images
  FOR v_image IN 
    SELECT 
      img->>'id' as img_id,
      img->>'url' as url,
      img->>'cardUrl' as card_url,
      img->>'thumbnailUrl' as thumbnail_url,
      COALESCE((img->>'isPrimary')::boolean, false) as is_primary,
      COALESCE((img->>'order')::integer, row_number) as sort_order
    FROM jsonb_array_elements(v_product.images) WITH ORDINALITY AS t(img, row_number)
  LOOP
    INSERT INTO product_images (
      product_id,
      cloudinary_url,
      card_url,
      thumbnail_url,
      external_url,
      is_primary,
      sort_order,
      is_downloaded,
      approval_status,
      uploaded_by
    ) VALUES (
      p_product_id,
      v_image.url,
      v_image.card_url,
      v_image.thumbnail_url,
      v_image.url,
      v_image.is_primary,
      v_image.sort_order,
      TRUE,
      'approved',
      v_product.user_id
    );
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to migrate all private listing images
CREATE OR REPLACE FUNCTION migrate_all_private_listing_images()
RETURNS TABLE(product_id UUID, images_migrated INTEGER) AS $$
DECLARE
  v_product RECORD;
  v_migrated INTEGER;
BEGIN
  FOR v_product IN 
    SELECT p.id
    FROM products p
    WHERE p.listing_type = 'private_listing'
      AND p.images IS NOT NULL
      AND jsonb_array_length(p.images) > 0
      AND NOT EXISTS (
        SELECT 1 FROM product_images pi WHERE pi.product_id = p.id
      )
  LOOP
    v_migrated := migrate_product_images_from_jsonb(v_product.id);
    IF v_migrated > 0 THEN
      product_id := v_product.id;
      images_migrated := v_migrated;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 7: Run the migration for existing data
-- ============================================================

-- Migrate all existing private listing images
SELECT * FROM migrate_all_private_listing_images();

-- Refresh cached images for all products
SELECT refresh_all_cached_images();

-- ============================================================
-- Step 8: Update refresh_all_cached_images to use product_images
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_all_cached_images()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update products with images in product_images table (primary source)
  WITH updated AS (
    UPDATE products p
    SET 
      cached_image_url = sub.image_url,
      cached_thumbnail_url = sub.thumbnail_url,
      has_displayable_image = TRUE
    FROM (
      SELECT DISTINCT ON (pi.product_id)
        pi.product_id,
        COALESCE(pi.card_url, pi.cloudinary_url, pi.external_url) as image_url,
        COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url) as thumbnail_url
      FROM product_images pi
      WHERE pi.product_id IS NOT NULL
        AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
      ORDER BY pi.product_id, pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
    ) sub
    WHERE p.id = sub.product_id
      AND sub.image_url IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  -- Update products with canonical product images
  WITH updated AS (
    UPDATE products p
    SET 
      cached_image_url = COALESCE(pi.card_url, pi.cloudinary_url),
      cached_thumbnail_url = COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url),
      has_displayable_image = TRUE
    FROM product_images pi
    WHERE p.canonical_product_id = pi.canonical_product_id
      AND pi.is_primary = TRUE
      AND (pi.approval_status IS NULL OR pi.approval_status = 'approved')
      AND pi.cloudinary_url IS NOT NULL
      AND p.use_custom_image = FALSE
      AND (p.listing_type IS NULL OR p.listing_type != 'private_listing')
      AND NOT EXISTS (SELECT 1 FROM product_images pi2 WHERE pi2.product_id = p.id)
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;
  
  -- Update products with custom store images (legacy)
  WITH updated AS (
    UPDATE products
    SET 
      cached_image_url = custom_image_url,
      cached_thumbnail_url = custom_image_url,
      has_displayable_image = TRUE
    WHERE use_custom_image = TRUE
      AND custom_image_url LIKE '%cloudinary%'
      AND cached_image_url IS NULL
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;
  
  -- Fallback: Legacy JSONB images (will be removed after full migration)
  WITH updated AS (
    UPDATE products p
    SET 
      cached_image_url = COALESCE(
        (SELECT img->>'cardUrl' 
         FROM jsonb_array_elements(p.images::jsonb) AS img 
         WHERE img->>'cardUrl' LIKE '%cloudinary%' 
         LIMIT 1),
        (SELECT img->>'url' 
         FROM jsonb_array_elements(p.images::jsonb) AS img 
         WHERE img->>'url' LIKE '%cloudinary%' 
         LIMIT 1)
      ),
      cached_thumbnail_url = COALESCE(
        (SELECT img->>'thumbnailUrl' 
         FROM jsonb_array_elements(p.images::jsonb) AS img 
         WHERE img->>'thumbnailUrl' LIKE '%cloudinary%' 
         LIMIT 1),
        (SELECT img->>'cardUrl' 
         FROM jsonb_array_elements(p.images::jsonb) AS img 
         WHERE img->>'cardUrl' LIKE '%cloudinary%' 
         LIMIT 1)
      ),
      has_displayable_image = TRUE
    WHERE p.listing_type = 'private_listing'
      AND p.images IS NOT NULL
      AND p.cached_image_url IS NULL
      AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.images::jsonb) AS img 
        WHERE img->>'url' LIKE '%cloudinary%' OR img->>'cardUrl' LIKE '%cloudinary%'
      )
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;
  
  -- Mark products without displayable images
  UPDATE products
  SET has_displayable_image = FALSE
  WHERE cached_image_url IS NULL;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

