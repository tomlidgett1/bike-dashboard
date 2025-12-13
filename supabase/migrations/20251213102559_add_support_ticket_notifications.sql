-- ============================================================
-- SUPPORT TICKET NOTIFICATIONS
-- ============================================================
-- Adds notification types and triggers for support tickets/claims

-- ============================================================
-- 1. ADD TICKET_ID COLUMN TO NOTIFICATIONS
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ticket_id UUID;

-- Add foreign key for ticket_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'notifications_ticket_id_fkey'
  ) THEN
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_ticket_id_fkey 
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for ticket notifications
CREATE INDEX IF NOT EXISTS idx_notifications_ticket_id 
  ON notifications(ticket_id) 
  WHERE ticket_id IS NOT NULL;

-- ============================================================
-- 2. UPDATE NOTIFICATION TYPE CONSTRAINT
-- ============================================================

-- Drop and recreate the type constraint to include ticket types
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      -- Message types
      'new_message', 'new_conversation',
      -- Offer types
      'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired',
      -- Transaction types
      'purchase_complete', 'listing_sold',
      -- Support ticket types
      'ticket_created', 'ticket_message', 'ticket_status_changed', 'ticket_resolved', 'ticket_escalated'
    )
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update type constraint: %', SQLERRM;
END $$;

-- Update category constraint to include 'support'
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
    notification_category IN ('message', 'offer', 'transaction', 'system', 'support')
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update category constraint: %', SQLERRM;
END $$;

-- ============================================================
-- 3. SUPPORT TICKET NOTIFICATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION create_ticket_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_record RECORD;
  v_other_party_id UUID;
BEGIN
  -- Get purchase info for context
  SELECT p.buyer_id, p.seller_id INTO v_purchase_record
  FROM purchases p
  WHERE p.id = NEW.purchase_id;

  IF TG_OP = 'INSERT' THEN
    -- New ticket created: notify seller that buyer raised an issue
    INSERT INTO notifications (
      user_id, 
      type, 
      notification_category, 
      priority, 
      ticket_id,
      email_delivery_status
    )
    VALUES (
      v_purchase_record.seller_id, 
      'ticket_created', 
      'support', 
      'high', 
      NEW.id,
      'pending'
    );
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      CASE NEW.status
        WHEN 'resolved' THEN
          -- Notify the ticket creator that it's resolved
          INSERT INTO notifications (
            user_id, 
            type, 
            notification_category, 
            priority, 
            ticket_id,
            email_delivery_status
          )
          VALUES (
            NEW.created_by, 
            'ticket_resolved', 
            'support', 
            'high', 
            NEW.id,
            'pending'
          );
          
        WHEN 'escalated' THEN
          -- Notify both parties
          INSERT INTO notifications (
            user_id, 
            type, 
            notification_category, 
            priority, 
            ticket_id,
            email_delivery_status
          )
          VALUES 
            (v_purchase_record.buyer_id, 'ticket_escalated', 'support', 'high', NEW.id, 'pending'),
            (v_purchase_record.seller_id, 'ticket_escalated', 'support', 'high', NEW.id, 'pending');
            
        WHEN 'awaiting_response' THEN
          -- Notify seller they need to respond
          INSERT INTO notifications (
            user_id, 
            type, 
            notification_category, 
            priority, 
            ticket_id,
            email_delivery_status
          )
          VALUES (
            v_purchase_record.seller_id, 
            'ticket_status_changed', 
            'support', 
            'normal', 
            NEW.id,
            'pending'
          );
          
        WHEN 'in_review' THEN
          -- Notify buyer that seller responded
          INSERT INTO notifications (
            user_id, 
            type, 
            notification_category, 
            priority, 
            ticket_id,
            email_delivery_status
          )
          VALUES (
            v_purchase_record.buyer_id, 
            'ticket_status_changed', 
            'support', 
            'normal', 
            NEW.id,
            'pending'
          );
          
        ELSE
          -- Generic status change notification
          NULL;
      END CASE;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_ticket_notification ON support_tickets;
CREATE TRIGGER trigger_ticket_notification
  AFTER INSERT OR UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_notification();

-- ============================================================
-- 4. TICKET MESSAGE NOTIFICATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION create_ticket_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_ticket_record RECORD;
  v_purchase_record RECORD;
  v_recipient_id UUID;
BEGIN
  -- Skip internal messages
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;

  -- Get ticket and purchase info
  SELECT t.id, t.created_by, t.purchase_id INTO v_ticket_record
  FROM support_tickets t
  WHERE t.id = NEW.ticket_id;

  SELECT p.buyer_id, p.seller_id INTO v_purchase_record
  FROM purchases p
  WHERE p.id = v_ticket_record.purchase_id;

  -- Determine recipient (the party who DIDN'T send the message)
  IF NEW.sender_type = 'buyer' THEN
    v_recipient_id := v_purchase_record.seller_id;
  ELSIF NEW.sender_type = 'seller' THEN
    v_recipient_id := v_purchase_record.buyer_id;
  ELSIF NEW.sender_type = 'support' THEN
    -- Support messages go to both parties
    INSERT INTO notifications (
      user_id, 
      type, 
      notification_category, 
      priority, 
      ticket_id,
      email_delivery_status
    )
    VALUES 
      (v_purchase_record.buyer_id, 'ticket_message', 'support', 'high', NEW.ticket_id, 'pending'),
      (v_purchase_record.seller_id, 'ticket_message', 'support', 'high', NEW.ticket_id, 'pending');
    RETURN NEW;
  END IF;

  -- Create notification for the recipient
  IF v_recipient_id IS NOT NULL THEN
    INSERT INTO notifications (
      user_id, 
      type, 
      notification_category, 
      priority, 
      ticket_id,
      email_delivery_status
    )
    VALUES (
      v_recipient_id, 
      'ticket_message', 
      'support', 
      'normal', 
      NEW.ticket_id,
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_ticket_message_notification ON ticket_messages;
CREATE TRIGGER trigger_ticket_message_notification
  AFTER INSERT ON ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_message_notification();

-- ============================================================
-- 5. COMMENTS
-- ============================================================

COMMENT ON COLUMN notifications.ticket_id IS 'Reference to support ticket for ticket-related notifications';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Support ticket notifications added successfully';
  RAISE NOTICE '📧 Notification types: ticket_created, ticket_message, ticket_status_changed, ticket_resolved, ticket_escalated';
  RAISE NOTICE '⚡ Triggers created for automatic notifications';
END $$;

