-- ============================================================
-- Fix sync_canonical_images_to_products function
-- ============================================================

CREATE OR REPLACE FUNCTION sync_canonical_images_to_products(target_canonical_id UUID)
RETURNS VOID AS $$
DECLARE
  image_data JSONB;
  affected_count INTEGER;
BEGIN
  -- Build JSONB array from canonical product images
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pi.id::text,
        'url', pi.cloudinary_url,
        'thumbnailUrl', pi.thumbnail_url,
        'cardUrl', pi.card_url,
        'mobileCardUrl', pi.mobile_card_url,
        'galleryUrl', pi.gallery_url,
        'detailUrl', pi.detail_url,
        'isPrimary', pi.is_primary,
        'order', pi.sort_order,
        'source', 'canonical'
      ) ORDER BY pi.is_primary DESC NULLS LAST, pi.sort_order ASC
    ),
    '[]'::jsonb
  )
  INTO image_data
  FROM product_images pi
  WHERE pi.canonical_product_id = target_canonical_id
    AND pi.approval_status = 'approved'
    AND (pi.cloudinary_url IS NOT NULL OR pi.card_url IS NOT NULL);

  -- Update all products linked to this canonical product
  -- BUT only if they don't already have their own images
  UPDATE products
  SET images = image_data
  WHERE canonical_product_id = target_canonical_id
    AND (images IS NULL OR images = '[]'::jsonb OR jsonb_array_length(images) = 0);
  
  -- Get count of affected rows
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  -- Log for debugging
  RAISE NOTICE 'Synced % canonical images to % products', jsonb_array_length(image_data), affected_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Complete the backfill for canonical products
-- ============================================================
DO $$
DECLARE
  product_record RECORD;
  sync_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Completing backfill of canonical product images...';
  
  -- Sync all canonical products
  FOR product_record IN 
    SELECT DISTINCT cp.id
    FROM canonical_products cp
    INNER JOIN product_images pi ON pi.canonical_product_id = cp.id
    WHERE pi.approval_status = 'approved'
  LOOP
    PERFORM sync_canonical_images_to_products(product_record.id);
    sync_count := sync_count + 1;
    
    IF sync_count % 100 = 0 THEN
      RAISE NOTICE 'Synced % canonical products...', sync_count;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete! Synced % canonical products', sync_count;
END $$;



