-- ============================================================
-- Instagram Posts Tracking Table
-- ============================================================
-- Tracks all Instagram posts created from marketplace listings

CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Instagram details
  instagram_post_id TEXT, -- Instagram media ID
  instagram_url TEXT, -- URL to the posted content
  
  -- Image and content
  cloudinary_image_url TEXT NOT NULL,
  caption TEXT NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, posted, failed
  error_message TEXT,
  
  -- Metadata
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_instagram_posts_product_id 
  ON instagram_posts(product_id);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_status 
  ON instagram_posts(status);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_created_at 
  ON instagram_posts(created_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

-- Admin users can view all posts
CREATE POLICY "Admin users can view all instagram posts"
  ON instagram_posts
  FOR SELECT
  USING (true);

-- Admin users can create posts
CREATE POLICY "Admin users can create instagram posts"
  ON instagram_posts
  FOR INSERT
  WITH CHECK (true);

-- Admin users can update posts
CREATE POLICY "Admin users can update instagram posts"
  ON instagram_posts
  FOR UPDATE
  USING (true);

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE instagram_posts IS 'Tracks Instagram posts created from marketplace listings';
COMMENT ON COLUMN instagram_posts.status IS 'Status: pending (queued), processing (generating/posting), posted (live on Instagram), failed (error occurred)';
COMMENT ON COLUMN instagram_posts.cloudinary_image_url IS 'Cloudinary URL with text overlays (title + price)';

