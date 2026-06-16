-- Per-user read state for Gmail customer enquiries (unified inbox).

CREATE TABLE IF NOT EXISTS store_customer_inquiry_reads (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inquiry_id UUID NOT NULL REFERENCES store_customer_inquiries(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, inquiry_id)
);

ALTER TABLE store_customer_inquiry_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_customer_inquiry_reads_owner_all"
  ON store_customer_inquiry_reads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
