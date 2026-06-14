-- Thread-centric customer inquiries: one row per Gmail thread, cached timeline.

ALTER TABLE store_customer_inquiries
  ADD COLUMN IF NOT EXISTS thread_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS thread_message_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_customer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_shop_reply_at TIMESTAMPTZ;

-- Keep one row per Gmail thread when legacy imports created duplicates.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, gmail_thread_id
      ORDER BY received_at DESC NULLS LAST, updated_at DESC
    ) AS rn
  FROM store_customer_inquiries
  WHERE gmail_thread_id IS NOT NULL
)
DELETE FROM store_customer_inquiries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_customer_inquiries_user_thread
  ON store_customer_inquiries(user_id, gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_customer_inquiries_user_thread_updated
  ON store_customer_inquiries(user_id, gmail_thread_id, updated_at DESC)
  WHERE gmail_thread_id IS NOT NULL;
