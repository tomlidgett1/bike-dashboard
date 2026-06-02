-- Per-product opt-in to the full-bleed "Immersive" product page layout.
-- When true, /marketplace/product/[id] renders the cinematic immersive layout
-- instead of the standard two-column layout. Toggled from
-- Store Settings → Products.
ALTER TABLE products ADD COLUMN IF NOT EXISTS immersive_page BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN products.immersive_page IS 'When true, this product renders using the Immersive full-bleed product page layout.';
