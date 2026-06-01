-- ============================================================
-- FIX TYPE AND REFERENCE CONSTRAINTS FOR WELCOME NOTIFICATIONS
-- ============================================================

-- Type check — add 'welcome'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'new_message', 'new_conversation',
    'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired',
    'purchase_complete', 'listing_sold',
    'order_placed', 'order_confirmed', 'order_shipped', 'order_delivered', 'order_cancelled',
    'receipt_confirmed', 'funds_released', 'issue_reported', 'tracking_added',
    'ticket_created', 'ticket_message', 'ticket_reply', 'ticket_status_changed', 'ticket_resolved', 'ticket_escalated',
    'voucher_received',
    'welcome'
  )
);

-- Reference check — welcome notifications have no reference ID
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
  RAISE NOTICE '✅ Type and reference constraints updated for welcome notifications';
END $$;
