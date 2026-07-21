-- Per-store Instagram Business Login OAuth connections + post history.
-- Tokens encrypted at rest with TOKEN_ENCRYPTION_KEY (AES-256-GCM, same as Lightspeed).

CREATE TABLE IF NOT EXISTS store_instagram_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'error', 'expired')),

  instagram_user_id TEXT,
  username TEXT,
  account_name TEXT,
  account_type TEXT,
  profile_picture_url TEXT,

  access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT ARRAY[
    'instagram_business_basic',
    'instagram_business_content_publish'
  ],

  oauth_state TEXT,
  oauth_state_expires_at TIMESTAMPTZ,

  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_token_refresh_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT store_instagram_connections_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS store_instagram_connections_user_id_idx
  ON store_instagram_connections(user_id);
CREATE INDEX IF NOT EXISTS store_instagram_connections_status_idx
  ON store_instagram_connections(status);
CREATE INDEX IF NOT EXISTS store_instagram_connections_oauth_state_idx
  ON store_instagram_connections(oauth_state);

CREATE OR REPLACE FUNCTION update_store_instagram_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS store_instagram_connections_updated_at
  ON store_instagram_connections;
CREATE TRIGGER store_instagram_connections_updated_at
  BEFORE UPDATE ON store_instagram_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_store_instagram_connections_updated_at();

ALTER TABLE store_instagram_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_instagram_connections_deny_client_access
  ON store_instagram_connections
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE store_instagram_connections TO service_role;

-- Post history for AI-generated Instagram publishes
CREATE TABLE IF NOT EXISTS store_instagram_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES store_instagram_connections(id) ON DELETE SET NULL,

  prompt TEXT,
  caption TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'posted', 'failed')),

  container_id TEXT,
  instagram_media_id TEXT,
  permalink TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_instagram_posts_user_id_idx
  ON store_instagram_posts(user_id);
CREATE INDEX IF NOT EXISTS store_instagram_posts_created_at_idx
  ON store_instagram_posts(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_store_instagram_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS store_instagram_posts_updated_at
  ON store_instagram_posts;
CREATE TRIGGER store_instagram_posts_updated_at
  BEFORE UPDATE ON store_instagram_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_store_instagram_posts_updated_at();

ALTER TABLE store_instagram_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_instagram_posts_deny_client_access
  ON store_instagram_posts
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE store_instagram_posts TO service_role;
