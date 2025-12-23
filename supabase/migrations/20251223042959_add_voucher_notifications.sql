-- ============================================================
-- VOUCHER NOTIFICATIONS
-- ============================================================
-- Adds notification support for voucher awards

-- ============================================================
-- 1. ADD VOUCHER_ID COLUMN TO NOTIFICATIONS
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS voucher_id UUID;

-- Add foreign key constraint for voucher_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_voucher_id_fkey'
  ) THEN
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_voucher_id_fkey 
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for quick lookup by voucher_id
CREATE INDEX IF NOT EXISTS idx_notifications_voucher_id ON notifications(voucher_id);

-- Note: Function update is in migration 20251223043631_fix_voucher_notification_function.sql

