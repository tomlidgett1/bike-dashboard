-- ============================================================
-- ADD WELCOME NOTIFICATION SUPPORT
-- ============================================================
-- Welcome notifications have no reference ID (no conversation,
-- offer, purchase, etc.) so all three constraints need updating.

-- 1. Category check — add 'welcome'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
  notification_category IN (
    'message', 'offer', 'transaction', 'order',
    'system', 'support', 'ticket', 'voucher', 'welcome'
  )
);

-- 2. Type check — add 'welcome'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
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
    'voucher_received',
    -- Welcome
    'welcome'
  )
);

-- 3. Reference check — welcome notifications have no reference ID
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check CHECK (
  notification_category = 'welcome'
  OR conversation_id IS NOT NULL
  OR offer_id IS NOT NULL
  OR ticket_id IS NOT NULL
  OR purchase_id IS NOT NULL
  OR voucher_id IS NOT NULL
);

DO $$
BEGIN
  RAISE NOTICE '✅ All notification constraints updated for welcome type';
END $$;
