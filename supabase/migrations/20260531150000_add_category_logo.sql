-- Carousel logo: optional brand/product logo shown next to carousel header
-- on the public store profile page.
ALTER TABLE store_categories ADD COLUMN IF NOT EXISTS logo_url TEXT;
