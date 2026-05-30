-- Add carousel_size to store_categories
-- Controls how many products are shown per category on the public store profile:
--   featured → 4 products, 4-column row (prominent)
--   normal   → 6 products, standard 6-column grid
--   compact  → 8 products, tight 8-column grid

ALTER TABLE store_categories
  ADD COLUMN IF NOT EXISTS carousel_size TEXT NOT NULL DEFAULT 'normal'
    CHECK (carousel_size IN ('featured', 'normal', 'compact'));
