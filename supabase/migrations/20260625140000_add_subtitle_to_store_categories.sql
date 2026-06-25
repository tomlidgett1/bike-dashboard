-- Optional subtitle shown under carousel titles on the storefront (e.g. specials tagline).
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS subtitle TEXT;

COMMENT ON COLUMN public.store_categories.subtitle IS
  'Optional subtitle rendered beneath the carousel title on the storefront home and products pages.';

-- Backfill specials carousel subtitles from config.
UPDATE public.store_categories sc
SET subtitle = ssc.carousel_subtitle
FROM public.store_specials_config ssc
WHERE sc.id = ssc.carousel_category_id
  AND sc.user_id = ssc.user_id
  AND ssc.carousel_subtitle IS NOT NULL;
