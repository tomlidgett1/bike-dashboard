-- ============================================================
-- Backfill product_images.cloudinary_public_id
-- ============================================================
-- Goal: make cloudinary_public_id the single source of truth for image URLs.
-- Every variant (thumbnail/card/mobile_card/hero/zoom) is computable from the
-- public_id at render time, so the *_url columns become redundant once every
-- row that lives on Cloudinary has a public_id.
--
-- This migration is SAFE and idempotent: it only fills NULLs and never drops
-- anything. The destructive column cleanup is deliberately deferred — see
-- FUTURE_drop_deprecated_image_columns.sql.bak and the note at the bottom.
--
-- The `cloudinary_url` column stores the Cloudinary secure_url (the original,
-- transform-free delivery URL), shaped like:
--   https://res.cloudinary.com/<cloud>/image/upload/v1700000000/<public_id>.<ext>
-- So the public_id is: everything after "/upload/", minus the "vNNNN/" version
-- prefix, minus the trailing file extension.
-- ============================================================

UPDATE product_images
SET cloudinary_public_id = regexp_replace(
      regexp_replace(
        split_part(cloudinary_url, '/upload/', 2),  -- after "/upload/"
        '^v[0-9]+/', ''                              -- strip "vNNNN/" version
      ),
      '\.[a-zA-Z0-9]+$', ''                          -- strip ".jpg"/".webp"/...
    )
WHERE cloudinary_public_id IS NULL
  AND cloudinary_url IS NOT NULL
  AND cloudinary_url LIKE '%res.cloudinary.com/%/upload/%';

-- Partial index to quickly find any rows still missing a public_id but having a
-- Cloudinary URL (should be ~0 after this runs; useful for monitoring drift).
CREATE INDEX IF NOT EXISTS idx_product_images_missing_public_id
  ON product_images (id)
  WHERE cloudinary_public_id IS NULL AND cloudinary_url IS NOT NULL;

-- ============================================================
-- Verification (run manually after applying):
--
--   -- Rows on Cloudinary that still lack a public_id (target: 0):
--   SELECT count(*) FROM product_images
--   WHERE cloudinary_public_id IS NULL AND cloudinary_url IS NOT NULL;
--
--   -- Images with NO Cloudinary identity at all (external_url / legacy storage).
--   -- These must be migrated to Cloudinary BEFORE dropping *_url columns,
--   -- otherwise they lose their only URL:
--   SELECT count(*) FROM product_images
--   WHERE cloudinary_public_id IS NULL AND cloudinary_url IS NULL;
--
-- NEXT STEPS (separate migrations, only after the above is verified in prod):
--   1. Upload remaining external_url / storage_path images to Cloudinary so
--      every row has a cloudinary_public_id.
--   2. Then apply FUTURE_drop_deprecated_image_columns.sql.bak (extended to also
--      drop product_images.{thumbnail_url,card_url,mobile_card_url,gallery_url,
--      detail_url,cloudinary_url} once nothing reads them).
-- ============================================================
