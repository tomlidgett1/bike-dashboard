-- ============================================================
-- UPDATE NOTIFICATION CONSTRAINTS FOR VOUCHERS
-- ============================================================
-- Updates constraints to allow voucher notifications

-- ============================================================
-- 1. UPDATE NOTIFICATION CATEGORY CONSTRAINT
-- ============================================================

-- Drop existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;

-- Add new constraint including 'voucher' and all existing categories
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check 
CHECK (notification_category IN ('message', 'offer', 'transaction', 'order', 'system', 'support', 'ticket', 'voucher'));

-- ============================================================
-- 2. UPDATE NOTIFICATION TYPE CONSTRAINT
-- ============================================================

-- Drop existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new constraint including 'voucher_received' and all existing types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
CHECK (
  type IN (
    -- Message types
    'new_message', 'new_conversation',
    -- Offer types
    'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired',
    -- Transaction types
    'purchase_complete', 'listing_sold',
    -- Order types
    'order_placed', 'order_confirmed', 'order_shipped', 'order_delivered', 'order_cancelled',
    'receipt_confirmed', 'funds_released', 'issue_reported', 'tracking_added',
    -- Support ticket types
    'ticket_created', 'ticket_message', 'ticket_reply', 'ticket_status_changed', 'ticket_resolved', 'ticket_escalated',
    -- Voucher types
    'voucher_received'
  )
);

-- ============================================================
-- 3. UPDATE REFERENCE CHECK CONSTRAINT
-- ============================================================

-- Drop existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;

-- Add new constraint including voucher_id
ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check 
CHECK (
  conversation_id IS NOT NULL 
  OR offer_id IS NOT NULL 
  OR ticket_id IS NOT NULL
  OR purchase_id IS NOT NULL
  OR voucher_id IS NOT NULL
);

COMMENT ON CONSTRAINT notifications_category_check ON notifications IS 
  'Valid notification categories including voucher';

COMMENT ON CONSTRAINT notifications_type_check ON notifications IS 
  'Valid notification types including voucher_received';

