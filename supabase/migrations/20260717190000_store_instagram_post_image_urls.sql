-- Multi-photo carousel support for store Instagram posts.

ALTER TABLE store_instagram_posts
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
