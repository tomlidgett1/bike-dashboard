-- ============================================================
-- FIX NOTIFICATION TYPE CONSTRAINT
-- ============================================================
-- The previous migration's constraint update failed because it was
-- wrapped in an exception handler. This migration forces the update.

-- First, update any existing invalid type values to a valid type
UPDATE notifications 
SET type = 'new_message' 
WHERE type NOT IN (
  'new_message', 'new_conversation',
  'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired',
  'purchase_complete', 'listing_sold',
  'order_placed', 'order_confirmed', 'order_shipped', 'order_delivered',
  'receipt_confirmed', 'funds_released', 'issue_reported', 'tracking_added',
  'ticket_created', 'ticket_reply', 'ticket_status_changed'
);

-- Now safely drop and recreate the constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    -- Message types
    'new_message', 'new_conversation',
    -- Offer types
    'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired',
    -- Existing order types
    'purchase_complete', 'listing_sold',
    -- New order notification types
    'order_placed', 'order_confirmed', 'order_shipped', 'order_delivered',
    'receipt_confirmed', 'funds_released', 'issue_reported', 'tracking_added',
    -- Support ticket types
    'ticket_created', 'ticket_reply', 'ticket_status_changed'
  )
);

-- Also ensure the category constraint is updated
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
  notification_category IN ('message', 'offer', 'transaction', 'order', 'system', 'support')
);

-- And the reference check constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check CHECK (
  conversation_id IS NOT NULL 
  OR offer_id IS NOT NULL 
  OR ticket_id IS NOT NULL
  OR purchase_id IS NOT NULL
);



