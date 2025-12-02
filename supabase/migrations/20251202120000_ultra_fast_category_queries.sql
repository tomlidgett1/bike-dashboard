-- ============================================================
-- Ultra-Fast Category Queries
-- ============================================================
-- Pre-computes displayable image URLs directly on products table
-- Eliminates expensive JOINs for listing queries
-- Target: <50ms response time for category filtering

-- ============================================================
-- Step 1: Add cached image columns to products table
-- ============================================================

-- Add column to cache the displayable image URL (Cloudinary preferred)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cached_image_url TEXT;

-- Add column to track if product has a displayable image
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_displayable_image BOOLEAN DEFAULT FALSE;

-- Add column for cached thumbnail URL (for instant search)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cached_thumbnail_url TEXT;

-- ============================================================
-- Step 2: Create function to update cached image URLs
-- ============================================================

CREATE OR REPLACE FUNCTION update_product_cached_images()
RETURNS TRIGGER AS $$
DECLARE
  v_image_url TEXT := NULL;
  v_thumbnail_url TEXT := NULL;
  v_has_image BOOLEAN := FALSE;
BEGIN
  -- Priority 1: Private listing images with Cloudinary
  IF NEW.listing_type = 'private_listing' AND NEW.images IS NOT NULL THEN
    -- Check if any image has cloudinary URL
    SELECT 
      COALESCE(
        (SELECT img->>'url' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE img->>'url' LIKE '%cloudinary%' 
         LIMIT 1),
        (SELECT img->>'url' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         WHERE (img->>'isPrimary')::boolean = true 
         LIMIT 1),
        (SELECT img->>'url' 
         FROM jsonb_array_elements(NEW.images::jsonb) AS img 
         LIMIT 1)
      )
    INTO v_image_url;
    
    IF v_image_url IS NOT NULL AND v_image_url LIKE '%cloudinary%' THEN
      v_has_image := TRUE;
      v_thumbnail_url := v_image_url;
    END IF;
  
  -- Priority 2: Custom store image with Cloudinary
  ELSIF NEW.use_custom_image = TRUE AND NEW.custom_image_url IS NOT NULL THEN
    IF NEW.custom_image_url LIKE '%cloudinary%' THEN
      v_image_url := NEW.custom_image_url;
      v_thumbnail_url := NEW.custom_image_url;
      v_has_image := TRUE;
    END IF;
  
  -- Priority 3: Canonical product images (check product_images table)
  ELSIF NEW.canonical_product_id IS NOT NULL THEN
    SELECT 
      COALESCE(pi.card_url, pi.cloudinary_url),
      COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
    INTO v_image_url, v_thumbnail_url
    FROM product_images pi
    WHERE pi.canonical_product_id = NEW.canonical_product_id
      AND pi.is_primary = TRUE
      AND pi.approval_status = 'approved'
      AND pi.cloudinary_url IS NOT NULL
    LIMIT 1;
    
    IF v_image_url IS NOT NULL THEN
      v_has_image := TRUE;
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
-- Step 3: Create trigger to auto-update on product changes
-- ============================================================

DROP TRIGGER IF EXISTS trg_update_product_cached_images ON products;
CREATE TRIGGER trg_update_product_cached_images
  BEFORE INSERT OR UPDATE OF images, use_custom_image, custom_image_url, canonical_product_id, listing_type
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_product_cached_images();

-- ============================================================
-- Step 4: Create function to refresh all cached images
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_all_product_cached_images()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update products with private listing images
  WITH updated AS (
    UPDATE products p
    SET 
      cached_image_url = (
        SELECT img->>'url' 
        FROM jsonb_array_elements(p.images::jsonb) AS img 
        WHERE img->>'url' LIKE '%cloudinary%' 
        LIMIT 1
      ),
      cached_thumbnail_url = (
        SELECT img->>'url' 
        FROM jsonb_array_elements(p.images::jsonb) AS img 
        WHERE img->>'url' LIKE '%cloudinary%' 
        LIMIT 1
      ),
      has_displayable_image = TRUE
    WHERE p.listing_type = 'private_listing'
      AND p.images IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.images::jsonb) AS img 
        WHERE img->>'url' LIKE '%cloudinary%'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  -- Update products with custom store images
  WITH updated AS (
    UPDATE products
    SET 
      cached_image_url = custom_image_url,
      cached_thumbnail_url = custom_image_url,
      has_displayable_image = TRUE
    WHERE use_custom_image = TRUE
      AND custom_image_url LIKE '%cloudinary%'
      AND (listing_type IS NULL OR listing_type != 'private_listing')
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;
  
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
      AND pi.approval_status = 'approved'
      AND pi.cloudinary_url IS NOT NULL
      AND p.use_custom_image = FALSE
      AND (p.listing_type IS NULL OR p.listing_type != 'private_listing')
    RETURNING 1
  )
  SELECT updated_count + COUNT(*) INTO updated_count FROM updated;
  
  -- Mark products without displayable images
  UPDATE products
  SET has_displayable_image = FALSE, cached_image_url = NULL, cached_thumbnail_url = NULL
  WHERE has_displayable_image IS NULL OR (cached_image_url IS NULL AND has_displayable_image = TRUE);
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 5: Run initial population of cached images
-- ============================================================

SELECT refresh_all_product_cached_images();

-- ============================================================
-- Step 6: Create ultra-fast covering indexes
-- ============================================================

-- Drop older less efficient indexes
DROP INDEX IF EXISTS idx_products_level1_covering;
DROP INDEX IF EXISTS idx_products_level1_level2_covering;
DROP INDEX IF EXISTS idx_products_full_hierarchy_covering;

-- Ultra-fast index for Level 1 queries (with displayable image filter)
CREATE INDEX IF NOT EXISTS idx_products_fast_level1 
  ON products (
    marketplace_category,
    created_at DESC
  )
  INCLUDE (id, display_name, price, cached_image_url, cached_thumbnail_url, user_id, listing_type)
  WHERE is_active = true 
    AND has_displayable_image = true
    AND (listing_status IS NULL OR listing_status = 'active');

-- Ultra-fast index for Level 1 + Level 2 queries
CREATE INDEX IF NOT EXISTS idx_products_fast_level1_level2 
  ON products (
    marketplace_category,
    marketplace_subcategory,
    created_at DESC
  )
  INCLUDE (id, display_name, price, cached_image_url, cached_thumbnail_url, user_id, listing_type)
  WHERE is_active = true 
    AND has_displayable_image = true
    AND (listing_status IS NULL OR listing_status = 'active');

-- Ultra-fast index for full hierarchy
CREATE INDEX IF NOT EXISTS idx_products_fast_full_hierarchy 
  ON products (
    marketplace_category,
    marketplace_subcategory,
    marketplace_level_3_category,
    created_at DESC
  )
  INCLUDE (id, display_name, price, cached_image_url, cached_thumbnail_url, user_id, listing_type)
  WHERE is_active = true 
    AND has_displayable_image = true
    AND (listing_status IS NULL OR listing_status = 'active');

-- ============================================================
-- Step 7: Create trigger to update cache when product_images change
-- ============================================================

CREATE OR REPLACE FUNCTION update_products_on_image_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When a product_image is inserted, updated, or deleted, refresh the related products
  IF TG_OP = 'DELETE' THEN
    UPDATE products p
    SET 
      cached_image_url = (
        SELECT COALESCE(pi.card_url, pi.cloudinary_url)
        FROM product_images pi
        WHERE pi.canonical_product_id = OLD.canonical_product_id
          AND pi.is_primary = TRUE
          AND pi.approval_status = 'approved'
          AND pi.cloudinary_url IS NOT NULL
        LIMIT 1
      ),
      cached_thumbnail_url = (
        SELECT COALESCE(pi.thumbnail_url, pi.card_url, pi.cloudinary_url)
        FROM product_images pi
        WHERE pi.canonical_product_id = OLD.canonical_product_id
          AND pi.is_primary = TRUE
          AND pi.approval_status = 'approved'
          AND pi.cloudinary_url IS NOT NULL
        LIMIT 1
      ),
      has_displayable_image = EXISTS (
        SELECT 1 FROM product_images pi
        WHERE pi.canonical_product_id = OLD.canonical_product_id
          AND pi.is_primary = TRUE
          AND pi.approval_status = 'approved'
          AND pi.cloudinary_url IS NOT NULL
      )
    WHERE p.canonical_product_id = OLD.canonical_product_id
      AND p.use_custom_image = FALSE
      AND (p.listing_type IS NULL OR p.listing_type != 'private_listing');
    RETURN OLD;
  ELSE
    UPDATE products p
    SET 
      cached_image_url = COALESCE(NEW.card_url, NEW.cloudinary_url),
      cached_thumbnail_url = COALESCE(NEW.thumbnail_url, NEW.card_url, NEW.cloudinary_url),
      has_displayable_image = TRUE
    WHERE p.canonical_product_id = NEW.canonical_product_id
      AND p.use_custom_image = FALSE
      AND (p.listing_type IS NULL OR p.listing_type != 'private_listing')
      AND NEW.is_primary = TRUE
      AND NEW.approval_status = 'approved'
      AND NEW.cloudinary_url IS NOT NULL;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_products_on_image_change ON product_images;
CREATE TRIGGER trg_update_products_on_image_change
  AFTER INSERT OR UPDATE OR DELETE
  ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION update_products_on_image_change();

-- ============================================================
-- Step 8: Analyse tables for optimal query planning
-- ============================================================

ANALYZE products;
ANALYZE product_images;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON COLUMN products.cached_image_url IS 'Pre-computed Cloudinary image URL for fast listing queries';
COMMENT ON COLUMN products.cached_thumbnail_url IS 'Pre-computed thumbnail URL for instant search';
COMMENT ON COLUMN products.has_displayable_image IS 'Boolean flag for fast filtering - only show products with images';
COMMENT ON INDEX idx_products_fast_level1 IS 'Ultra-fast covering index for L1 category queries (~10ms)';
COMMENT ON INDEX idx_products_fast_level1_level2 IS 'Ultra-fast covering index for L1+L2 queries (~10ms)';
COMMENT ON INDEX idx_products_fast_full_hierarchy IS 'Ultra-fast covering index for full hierarchy (~10ms)';

