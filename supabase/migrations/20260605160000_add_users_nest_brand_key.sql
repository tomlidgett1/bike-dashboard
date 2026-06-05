-- Maps a Yellow Jersey store account to its Nest brand portal key for iMessage inbox access.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nest_brand_key TEXT;

COMMENT ON COLUMN users.nest_brand_key IS
  'Nest brand portal key for this store (e.g. ash). Used by Yellow Jersey store settings to load and reply to Nest customer messages.';
