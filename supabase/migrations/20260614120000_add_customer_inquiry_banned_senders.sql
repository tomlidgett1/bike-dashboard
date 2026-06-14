-- Banned sender addresses: excluded from future customer inquiry imports.

CREATE TABLE IF NOT EXISTS store_customer_inquiry_banned_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  note TEXT,
  banned_from_inquiry_id UUID REFERENCES store_customer_inquiries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sender_email)
);

CREATE INDEX IF NOT EXISTS idx_store_customer_inquiry_banned_senders_user
  ON store_customer_inquiry_banned_senders(user_id);

ALTER TABLE store_customer_inquiry_banned_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_customer_inquiry_banned_senders_owner_all"
  ON store_customer_inquiry_banned_senders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
