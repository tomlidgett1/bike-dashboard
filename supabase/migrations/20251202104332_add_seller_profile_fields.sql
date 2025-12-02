-- ============================================================
-- Add Seller Profile Fields for Individual Sellers
-- ============================================================
-- This migration adds fields to support Depop-style seller profiles:
-- 1. bio: About me text for the seller
-- 2. cover_image_url: Banner/cover image for profile
-- 3. social_links: JSONB for Instagram, Strava, Facebook, etc.
-- 4. seller_display_name: Custom display name for their store/profile

-- Add bio column
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

-- Add cover_image_url column
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT '';

-- Add social_links column (stores links as JSONB)
-- Structure: {
--   instagram: string,
--   facebook: string,
--   strava: string,
--   twitter: string,
--   website: string
-- }
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

-- Add seller_display_name column (custom store/profile name)
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_display_name TEXT DEFAULT '';

-- Add helpful comments
COMMENT ON COLUMN users.bio IS 'Seller bio/about me text displayed on their profile';
COMMENT ON COLUMN users.cover_image_url IS 'Cover/banner image URL for seller profile';
COMMENT ON COLUMN users.social_links IS 'Social media links stored as JSONB (instagram, facebook, strava, twitter, website)';
COMMENT ON COLUMN users.seller_display_name IS 'Custom display name for seller profile/store';

-- ============================================================
-- Seller Category Overrides Table
-- ============================================================
-- Allows sellers to customise how their auto-generated categories
-- are displayed (rename, reorder, hide)

CREATE TABLE IF NOT EXISTS seller_category_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_category TEXT NOT NULL,
  display_name TEXT,
  display_order INTEGER DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each user can only have one override per category
  CONSTRAINT seller_category_overrides_user_category_key UNIQUE (user_id, original_category)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS seller_category_overrides_user_id_idx ON seller_category_overrides(user_id);
CREATE INDEX IF NOT EXISTS seller_category_overrides_order_idx ON seller_category_overrides(user_id, display_order);

-- Enable Row Level Security
ALTER TABLE seller_category_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own category overrides"
  ON seller_category_overrides
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own category overrides"
  ON seller_category_overrides
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own category overrides"
  ON seller_category_overrides
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own category overrides"
  ON seller_category_overrides
  FOR DELETE
  USING (auth.uid() = user_id);

-- Public read policy for viewing seller profiles
CREATE POLICY "Anyone can view category overrides for public profiles"
  ON seller_category_overrides
  FOR SELECT
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_seller_category_overrides_updated_at
  BEFORE UPDATE ON seller_category_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE seller_category_overrides IS 'Allows sellers to customise display of their auto-generated product categories';
COMMENT ON COLUMN seller_category_overrides.original_category IS 'The original category name from the product listings';
COMMENT ON COLUMN seller_category_overrides.display_name IS 'Custom display name for the category (null = use original)';
COMMENT ON COLUMN seller_category_overrides.display_order IS 'Custom order for displaying categories (lower = first)';
COMMENT ON COLUMN seller_category_overrides.is_hidden IS 'Whether to hide this category from the profile';

