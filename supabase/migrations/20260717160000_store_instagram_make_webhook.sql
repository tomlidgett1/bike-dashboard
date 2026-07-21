-- Per-store Make.com webhook for Instagram posting (no Meta Graph OAuth).

ALTER TABLE store_instagram_connections
  ADD COLUMN IF NOT EXISTS make_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS make_webhook_secret TEXT;
