-- Multi-day Instagram feed campaigns and scheduled publishing.

CREATE TABLE IF NOT EXISTS store_instagram_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  style_bible JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_days INTEGER NOT NULL CHECK (duration_days IN (5, 10)),
  destination TEXT NOT NULL DEFAULT 'post' CHECK (destination = 'post'),
  aspect TEXT NOT NULL DEFAULT 'square' CHECK (aspect IN ('square', 'portrait')),
  include_logo BOOLEAN NOT NULL DEFAULT FALSE,
  start_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN (
      'generating',
      'ready',
      'scheduled',
      'posting',
      'completed',
      'cancelled',
      'failed'
    )),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_instagram_campaigns_user_created_idx
  ON store_instagram_campaigns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS store_instagram_campaigns_status_idx
  ON store_instagram_campaigns(status);

CREATE OR REPLACE FUNCTION update_store_instagram_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS store_instagram_campaigns_updated_at
  ON store_instagram_campaigns;
CREATE TRIGGER store_instagram_campaigns_updated_at
  BEFORE UPDATE ON store_instagram_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_store_instagram_campaigns_updated_at();

ALTER TABLE store_instagram_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_instagram_campaigns_deny_client_access
  ON store_instagram_campaigns
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE store_instagram_campaigns TO service_role;

ALTER TABLE store_instagram_posts
  ADD COLUMN IF NOT EXISTS campaign_id UUID
    REFERENCES store_instagram_campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS day_index INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destination TEXT NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS aspect TEXT NOT NULL DEFAULT 'square';

-- Planned campaign days do not have an image until their generation step.
ALTER TABLE store_instagram_posts
  ALTER COLUMN image_url DROP NOT NULL;

ALTER TABLE store_instagram_posts
  DROP CONSTRAINT IF EXISTS store_instagram_posts_status_check;
ALTER TABLE store_instagram_posts
  ADD CONSTRAINT store_instagram_posts_status_check
    CHECK (status IN ('draft', 'scheduled', 'processing', 'posted', 'failed'));

ALTER TABLE store_instagram_posts
  DROP CONSTRAINT IF EXISTS store_instagram_posts_day_index_check;
ALTER TABLE store_instagram_posts
  ADD CONSTRAINT store_instagram_posts_day_index_check
    CHECK (day_index IS NULL OR day_index BETWEEN 1 AND 10);

ALTER TABLE store_instagram_posts
  DROP CONSTRAINT IF EXISTS store_instagram_posts_destination_check;
ALTER TABLE store_instagram_posts
  ADD CONSTRAINT store_instagram_posts_destination_check
    CHECK (destination IN ('post', 'story'));

ALTER TABLE store_instagram_posts
  DROP CONSTRAINT IF EXISTS store_instagram_posts_aspect_check;
ALTER TABLE store_instagram_posts
  ADD CONSTRAINT store_instagram_posts_aspect_check
    CHECK (aspect IN ('square', 'portrait', 'story'));

CREATE UNIQUE INDEX IF NOT EXISTS store_instagram_posts_campaign_day_idx
  ON store_instagram_posts(campaign_id, day_index)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS store_instagram_posts_due_idx
  ON store_instagram_posts(status, scheduled_at)
  WHERE status = 'scheduled';
