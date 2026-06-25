-- Per-carousel logo display width (px). Null uses the storefront default (96).
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS logo_max_width INTEGER;

COMMENT ON COLUMN public.store_categories.logo_max_width IS
  'Maximum rendered width in pixels for the carousel header logo on the storefront.';
