-- Extend Instagram connections for Instagram API with Facebook Login.
-- Stores Facebook Page linkage + optional user token for page re-selection.

ALTER TABLE store_instagram_connections
  DROP CONSTRAINT IF EXISTS store_instagram_connections_status_check;

ALTER TABLE store_instagram_connections
  ADD CONSTRAINT store_instagram_connections_status_check
  CHECK (status IN ('connected', 'pending_page', 'disconnected', 'error', 'expired'));

ALTER TABLE store_instagram_connections
  ADD COLUMN IF NOT EXISTS facebook_page_id TEXT,
  ADD COLUMN IF NOT EXISTS facebook_page_name TEXT,
  ADD COLUMN IF NOT EXISTS user_access_token_encrypted TEXT;
