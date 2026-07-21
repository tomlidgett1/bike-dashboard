-- World-class AI product page payload (Demo → Publish).
-- When non-null, /marketplace/product/[id] renders the world-class layout
-- instead of the standard or immersive layout.
ALTER TABLE products ADD COLUMN IF NOT EXISTS world_class_page JSONB DEFAULT NULL;

COMMENT ON COLUMN products.world_class_page IS 'Published world-class AI product page JSON. When set, the live PDP uses the world-class template.';
