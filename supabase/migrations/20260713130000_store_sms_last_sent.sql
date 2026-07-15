-- Last SMSbroadcast send per phone, per store.
CREATE TABLE IF NOT EXISTS store_sms_last_sent (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_store_sms_last_sent_user_sent
  ON store_sms_last_sent(user_id, last_sent_at DESC);

ALTER TABLE store_sms_last_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_sms_last_sent_select_own
  ON store_sms_last_sent FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY store_sms_last_sent_insert_own
  ON store_sms_last_sent FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY store_sms_last_sent_update_own
  ON store_sms_last_sent FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
