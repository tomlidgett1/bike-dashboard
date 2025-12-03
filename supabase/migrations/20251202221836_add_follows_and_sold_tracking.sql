-- ============================================================
-- User Follows System & Sold Products Tracking
-- ============================================================

-- Create user_follows table for tracking who follows whom
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate follows
  CONSTRAINT user_follows_unique UNIQUE (follower_id, following_id),
  -- Prevent self-follows
  CONSTRAINT user_follows_no_self CHECK (follower_id != following_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS user_follows_follower_idx ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS user_follows_following_idx ON user_follows(following_id);

-- Enable Row Level Security
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_follows
-- Anyone can see follows (public follower counts)
CREATE POLICY "Anyone can view follows"
  ON user_follows
  FOR SELECT
  USING (true);

-- Users can only create their own follows
CREATE POLICY "Users can follow others"
  ON user_follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Users can only delete their own follows
CREATE POLICY "Users can unfollow"
  ON user_follows
  FOR DELETE
  USING (auth.uid() = follower_id);

-- Add comments
COMMENT ON TABLE user_follows IS 'Tracks user follow relationships for the marketplace';
COMMENT ON COLUMN user_follows.follower_id IS 'The user who is following';
COMMENT ON COLUMN user_follows.following_id IS 'The user being followed';

-- ============================================================
-- Sold Products Tracking
-- ============================================================

-- Add sold_at column to products table for tracking when items are sold
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- Create index for efficient sold products queries
CREATE INDEX IF NOT EXISTS products_sold_at_idx ON products(sold_at) WHERE sold_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_user_sold_idx ON products(user_id, sold_at);

-- Add comment
COMMENT ON COLUMN products.sold_at IS 'Timestamp when the product was marked as sold (NULL = still for sale)';

-- ============================================================
-- Helper Functions
-- ============================================================

-- Function to get follower count for a user
CREATE OR REPLACE FUNCTION get_follower_count(user_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM user_follows WHERE following_id = user_uuid;
$$ LANGUAGE SQL STABLE;

-- Function to get following count for a user
CREATE OR REPLACE FUNCTION get_following_count(user_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM user_follows WHERE follower_id = user_uuid;
$$ LANGUAGE SQL STABLE;

-- Function to check if user A follows user B
CREATE OR REPLACE FUNCTION is_following(follower_uuid UUID, following_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM user_follows 
    WHERE follower_id = follower_uuid AND following_id = following_uuid
  );
$$ LANGUAGE SQL STABLE;

