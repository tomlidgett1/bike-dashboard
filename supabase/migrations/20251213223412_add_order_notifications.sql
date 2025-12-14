-- ============================================================
-- ORDER NOTIFICATIONS SYSTEM
-- ============================================================
-- Extends the notifications table to support order-related notifications
-- Creates triggers to automatically generate notifications for order events

-- ============================================================
-- 1. ADD PURCHASE_ID COLUMN TO NOTIFICATIONS
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS purchase_id UUID;

-- Add foreign key constraint for purchase_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_purchase_id_fkey'
  ) THEN
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_purchase_id_fkey 
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for quick lookup by purchase_id
CREATE INDEX IF NOT EXISTS idx_notifications_purchase_id ON notifications(purchase_id);

-- ============================================================
-- 2. UPDATE TYPE CONSTRAINT FOR ORDER NOTIFICATIONS
-- ============================================================

DO $$
BEGIN
  -- Drop existing type constraint
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  -- Add updated constraint with order notification types
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
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update type constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 3. UPDATE CATEGORY CONSTRAINT
-- ============================================================

DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
    notification_category IN ('message', 'offer', 'transaction', 'order', 'system', 'support')
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update category constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 4. UPDATE REFERENCE CHECK CONSTRAINT
-- ============================================================

DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;
  
  -- Updated check: at least one reference must exist
  ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check CHECK (
    conversation_id IS NOT NULL 
    OR offer_id IS NOT NULL 
    OR ticket_id IS NOT NULL
    OR purchase_id IS NOT NULL
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update reference check constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 5. FUNCTION TO CREATE ORDER NOTIFICATION
-- ============================================================

CREATE OR REPLACE FUNCTION create_order_notification(
  p_user_id UUID,
  p_purchase_id UUID,
  p_type TEXT,
  p_priority TEXT DEFAULT 'normal'
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id,
    purchase_id,
    type,
    notification_category,
    priority,
    is_read,
    email_delivery_status
  ) VALUES (
    p_user_id,
    p_purchase_id,
    p_type,
    'order',
    p_priority,
    false,
    'pending'
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. TRIGGER: NOTIFY SELLER ON NEW PURCHASE
-- ============================================================

CREATE OR REPLACE FUNCTION notify_on_purchase_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify seller that a new order was placed
  PERFORM create_order_notification(
    NEW.seller_id,
    NEW.id,
    'order_placed',
    'high'
  );
  
  -- Notify buyer that order is confirmed (payment received)
  IF NEW.status = 'paid' THEN
    PERFORM create_order_notification(
      NEW.buyer_id,
      NEW.id,
      'order_confirmed',
      'normal'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_notify_on_purchase_created ON purchases;
CREATE TRIGGER trigger_notify_on_purchase_created
  AFTER INSERT ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_purchase_created();

-- ============================================================
-- 7. TRIGGER: NOTIFY ON PURCHASE STATUS CHANGES
-- ============================================================

CREATE OR REPLACE FUNCTION notify_on_purchase_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Order shipped: Notify buyer
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'shipped' THEN
    PERFORM create_order_notification(
      NEW.buyer_id,
      NEW.id,
      'order_shipped',
      'high'
    );
  END IF;
  
  -- Order delivered: Notify buyer
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'delivered' THEN
    PERFORM create_order_notification(
      NEW.buyer_id,
      NEW.id,
      'order_delivered',
      'normal'
    );
  END IF;
  
  -- Tracking number added: Notify buyer
  IF OLD.tracking_number IS NULL AND NEW.tracking_number IS NOT NULL THEN
    PERFORM create_order_notification(
      NEW.buyer_id,
      NEW.id,
      'tracking_added',
      'normal'
    );
  END IF;
  
  -- Funds released: Notify seller
  IF OLD.funds_status IS DISTINCT FROM NEW.funds_status AND NEW.funds_status = 'released' THEN
    -- Notify seller about receipt confirmation and funds release
    PERFORM create_order_notification(
      NEW.seller_id,
      NEW.id,
      'receipt_confirmed',
      'high'
    );
    PERFORM create_order_notification(
      NEW.seller_id,
      NEW.id,
      'funds_released',
      'high'
    );
  END IF;
  
  -- Auto-released funds: Notify seller
  IF OLD.funds_status IS DISTINCT FROM NEW.funds_status AND NEW.funds_status = 'auto_released' THEN
    PERFORM create_order_notification(
      NEW.seller_id,
      NEW.id,
      'funds_released',
      'normal'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_notify_on_purchase_status_change ON purchases;
CREATE TRIGGER trigger_notify_on_purchase_status_change
  AFTER UPDATE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_purchase_status_change();

-- ============================================================
-- 8. INDEX FOR ORDER NOTIFICATIONS QUERIES
-- ============================================================

-- Index for fetching user's order notifications
CREATE INDEX IF NOT EXISTS idx_notifications_order_category 
  ON notifications(user_id, notification_category, created_at DESC) 
  WHERE notification_category = 'order';

-- Index for unread order notifications count
CREATE INDEX IF NOT EXISTS idx_notifications_order_unread 
  ON notifications(user_id, is_read, notification_category) 
  WHERE notification_category = 'order' AND is_read = false;

-- ============================================================
-- 9. ENABLE REALTIME FOR NOTIFICATIONS
-- ============================================================

-- Enable realtime on notifications table for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;



