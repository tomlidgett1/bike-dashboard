-- ============================================================
-- FIX: Allow NULL conversation_id for offer notifications
-- ============================================================
-- The notifications table requires conversation_id but offer
-- notifications don't have a conversation, so we need to allow NULL

-- Make conversation_id nullable
ALTER TABLE notifications 
ALTER COLUMN conversation_id DROP NOT NULL;

-- Add a check constraint to ensure either conversation_id or offer_id is provided
-- (but not necessarily both)
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;
  
  -- For message notifications: conversation_id required
  -- For offer notifications: offer_id required
  -- This ensures at least one reference exists
  ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check CHECK (
    conversation_id IS NOT NULL OR offer_id IS NOT NULL
  );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add reference check constraint: %', SQLERRM;
END $$;

-- Update the create_offer_notification function to be more explicit
CREATE OR REPLACE FUNCTION create_offer_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New offer: notify seller
    INSERT INTO notifications (
      user_id, 
      type, 
      notification_category, 
      priority, 
      offer_id,
      email_delivery_status,
      conversation_id
    )
    VALUES (
      NEW.seller_id, 
      'offer_received', 
      'offer', 
      'high', 
      NEW.id,
      'pending',
      NULL
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Status changed: notify appropriate party
    CASE NEW.status
      WHEN 'accepted' THEN
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status,
          conversation_id
        )
        VALUES (
          NEW.buyer_id, 
          'offer_accepted', 
          'offer', 
          'critical', 
          NEW.id,
          'pending',
          NULL
        );
      WHEN 'rejected' THEN
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status,
          conversation_id
        )
        VALUES (
          NEW.buyer_id, 
          'offer_rejected', 
          'offer', 
          'high', 
          NEW.id,
          'pending',
          NULL
        );
      WHEN 'countered' THEN
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status,
          conversation_id
        )
        VALUES (
          NEW.buyer_id, 
          'offer_countered', 
          'offer', 
          'high', 
          NEW.id,
          'pending',
          NULL
        );
      WHEN 'expired' THEN
        -- Notify both parties when offer expires
        INSERT INTO notifications (
          user_id, 
          type, 
          notification_category, 
          priority, 
          offer_id,
          email_delivery_status,
          conversation_id
        )
        VALUES 
          (NEW.buyer_id, 'offer_expired', 'offer', 'normal', NEW.id, 'pending', NULL),
          (NEW.seller_id, 'offer_expired', 'offer', 'normal', NEW.id, 'pending', NULL);
      ELSE
        -- No notification for other status changes
        NULL;
    END CASE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Fixed notification table to allow NULL conversation_id for offer notifications';
END $$;
