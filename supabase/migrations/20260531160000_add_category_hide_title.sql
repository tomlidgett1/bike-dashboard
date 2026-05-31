-- Add hide_title column to store_categories
-- When a category has a logo, the owner can choose to hide the text title

ALTER TABLE store_categories
  ADD COLUMN IF NOT EXISTS hide_title boolean NOT NULL DEFAULT false;
