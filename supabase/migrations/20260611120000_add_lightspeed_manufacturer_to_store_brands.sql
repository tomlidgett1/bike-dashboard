-- Link store brand logos to Lightspeed manufacturers for product-page overlays

ALTER TABLE store_brands
  ADD COLUMN IF NOT EXISTS lightspeed_manufacturer_id TEXT,
  ADD COLUMN IF NOT EXISTS lightspeed_manufacturer_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS store_brands_user_lightspeed_manufacturer_idx
  ON store_brands (user_id, lightspeed_manufacturer_id)
  WHERE lightspeed_manufacturer_id IS NOT NULL;
