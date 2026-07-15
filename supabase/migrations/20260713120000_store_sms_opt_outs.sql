-- SMS opt-outs synced from SMSbroadcast (STOP / opt-out webhook).
-- Separate from crm_contacts.opted_out which is email marketing only.

CREATE TABLE IF NOT EXISTS store_sms_opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'smsbroadcast',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_store_sms_opt_outs_user_phone
  ON store_sms_opt_outs(user_id, phone);

ALTER TABLE store_sms_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_sms_opt_outs_select_own
  ON store_sms_opt_outs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY store_sms_opt_outs_insert_own
  ON store_sms_opt_outs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY store_sms_opt_outs_delete_own
  ON store_sms_opt_outs FOR DELETE
  USING (auth.uid() = user_id);
