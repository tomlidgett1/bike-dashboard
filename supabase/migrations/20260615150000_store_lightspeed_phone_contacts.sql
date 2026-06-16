-- Persist Lightspeed customer names by normalised AU mobile for instant inbox display.

CREATE TABLE IF NOT EXISTS store_lightspeed_phone_contacts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_normalized TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT NOT NULL,
  lightspeed_customer_id TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, phone_normalized)
);

CREATE INDEX IF NOT EXISTS idx_store_lightspeed_phone_contacts_user_updated
  ON store_lightspeed_phone_contacts(user_id, updated_at DESC);

ALTER TABLE store_customer_inquiries
  ADD COLUMN IF NOT EXISTS lightspeed_customer_name TEXT;

ALTER TABLE store_lightspeed_phone_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_lightspeed_phone_contacts_owner_all"
  ON store_lightspeed_phone_contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
