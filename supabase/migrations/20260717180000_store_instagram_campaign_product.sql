-- Optional catalogue product reference for Instagram campaigns.

ALTER TABLE store_instagram_campaigns
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS product_image_url TEXT;
