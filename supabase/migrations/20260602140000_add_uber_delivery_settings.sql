-- Per-store Uber delivery controls.
-- Products opt in individually, and verified bike stores can configure the
-- mobile numbers that receive Uber order alerts.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS uber_delivery_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS uber_notification_phones TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_products_user_uber_delivery_enabled
  ON products(user_id, uber_delivery_enabled)
  WHERE uber_delivery_enabled = true;

COMMENT ON COLUMN products.uber_delivery_enabled IS
  'Store-controlled flag: product can be purchased with Uber Express delivery when sold by a verified bicycle store.';

COMMENT ON COLUMN users.uber_notification_phones IS
  'SMS recipients for Uber Express order notifications. Empty falls back to the store phone number when present.';
