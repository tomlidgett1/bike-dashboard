-- ============================================================
-- Enhanced dispute resolution workflow
-- ============================================================
-- Adds structured resolution offers, acceptance metadata, and Stripe refund
-- bookkeeping for buyer/seller support tickets.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS resolution_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS resolution_offered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_offered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_actioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_error TEXT,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_transfer_reversal_id TEXT,
  ADD COLUMN IF NOT EXISTS seller_response_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_response_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB DEFAULT '{}'::jsonb;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS dispute_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_refund_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS stripe_refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_transfer_reversal_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_support_tickets_resolution_offered_by
  ON support_tickets(resolution_offered_by)
  WHERE resolution_offered_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_active_response_due
  ON support_tickets(status, seller_response_due_at, buyer_response_due_at)
  WHERE status IN ('open', 'awaiting_response', 'in_review', 'escalated');

CREATE INDEX IF NOT EXISTS idx_purchases_dispute_opened_at
  ON purchases(dispute_opened_at)
  WHERE dispute_opened_at IS NOT NULL;

-- Keep existing supported values and add explicit resolution workflow actions.
ALTER TABLE ticket_history DROP CONSTRAINT IF EXISTS valid_action;
ALTER TABLE ticket_history ADD CONSTRAINT valid_action CHECK (
  action IN (
    'created',
    'status_changed',
    'assigned',
    'escalated',
    'message_added',
    'attachment_added',
    'resolved',
    'reopened',
    'priority_changed',
    'resolution_offered',
    'resolution_accepted',
    'resolution_actioned',
    'refund_processed',
    'transfer_reversed'
  )
);

-- Merge all notification types currently used by order, offer, message,
-- support, voucher, and dispute-resolution flows.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'new_message',
    'new_conversation',
    'offer_received',
    'offer_accepted',
    'offer_rejected',
    'offer_countered',
    'offer_expired',
    'offer_cancelled',
    'purchase_complete',
    'listing_sold',
    'order_placed',
    'order_confirmed',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'receipt_confirmed',
    'funds_released',
    'issue_reported',
    'tracking_added',
    'ticket_created',
    'ticket_message',
    'ticket_reply',
    'ticket_status_changed',
    'ticket_resolved',
    'ticket_escalated',
    'ticket_resolution_offered',
    'ticket_resolution_accepted',
    'ticket_refunded',
    'ticket_released_to_seller',
    'voucher_received',
    'welcome'
  )
);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
  notification_category IN ('message', 'offer', 'transaction', 'order', 'system', 'support', 'ticket', 'voucher', 'welcome')
);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_reference_check CHECK (
  conversation_id IS NOT NULL
  OR offer_id IS NOT NULL
  OR ticket_id IS NOT NULL
  OR purchase_id IS NOT NULL
  OR voucher_id IS NOT NULL
  OR type = 'welcome'
);

-- Replace the support notification trigger so structured resolution updates
-- generate specific notifications instead of generic duplicate status alerts.
CREATE OR REPLACE FUNCTION create_ticket_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_record RECORD;
  v_resolution_event BOOLEAN := false;
BEGIN
  SELECT p.buyer_id, p.seller_id INTO v_purchase_record
  FROM purchases p
  WHERE p.id = NEW.purchase_id;

  IF TG_OP = 'INSERT' THEN
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
    IF OLD.resolution_offered_at IS DISTINCT FROM NEW.resolution_offered_at
      AND NEW.resolution_offered_at IS NOT NULL THEN
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
        'ticket_resolution_offered',
        'support',
        'high',
        NEW.id,
        'pending'
      );
      v_resolution_event := true;
    END IF;

    IF OLD.stripe_refund_id IS DISTINCT FROM NEW.stripe_refund_id
      AND NEW.stripe_refund_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        type,
        notification_category,
        priority,
        ticket_id,
        email_delivery_status
      )
      VALUES
        (v_purchase_record.buyer_id, 'ticket_refunded', 'support', 'high', NEW.id, 'pending'),
        (v_purchase_record.seller_id, 'ticket_refunded', 'support', 'high', NEW.id, 'pending');
      v_resolution_event := true;
    END IF;

    IF OLD.resolution_accepted_at IS DISTINCT FROM NEW.resolution_accepted_at
      AND NEW.resolution_accepted_at IS NOT NULL
      AND COALESCE(NEW.resolution_type, '') <> 'no_action'
      AND OLD.stripe_refund_id IS NOT DISTINCT FROM NEW.stripe_refund_id THEN
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
        'ticket_resolution_accepted',
        'support',
        'high',
        NEW.id,
        'pending'
      );
      v_resolution_event := true;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status = 'resolved'
      AND NEW.resolution_type = 'no_action' THEN
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
        'ticket_released_to_seller',
        'support',
        'high',
        NEW.id,
        'pending'
      );
      v_resolution_event := true;
    END IF;

    IF v_resolution_event THEN
      RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      CASE NEW.status
        WHEN 'resolved' THEN
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
          NULL;
      END CASE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_ticket_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_ticket_record RECORD;
  v_purchase_record RECORD;
  v_recipient_id UUID;
  v_visible_message_count INTEGER;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;

  SELECT t.id, t.created_by, t.purchase_id INTO v_ticket_record
  FROM support_tickets t
  WHERE t.id = NEW.ticket_id;

  SELECT p.buyer_id, p.seller_id INTO v_purchase_record
  FROM purchases p
  WHERE p.id = v_ticket_record.purchase_id;

  -- The ticket-created notification already tells the seller about a new
  -- claim. Skip a second generic message notification for the initial buyer
  -- description, but keep all later replies.
  SELECT COUNT(*) INTO v_visible_message_count
  FROM ticket_messages tm
  WHERE tm.ticket_id = NEW.ticket_id
    AND tm.is_internal = false;

  IF NEW.sender_type = 'buyer' AND v_visible_message_count <= 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_type = 'buyer' THEN
    v_recipient_id := v_purchase_record.seller_id;
  ELSIF NEW.sender_type = 'seller' THEN
    v_recipient_id := v_purchase_record.buyer_id;
  ELSIF NEW.sender_type = 'support' THEN
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

COMMENT ON COLUMN support_tickets.resolution_amount IS 'Refund amount or other money amount attached to the proposed/final resolution.';
COMMENT ON COLUMN support_tickets.policy_snapshot IS 'Policy terms shown when the dispute was opened or resolved.';
COMMENT ON COLUMN purchases.stripe_refund_id IS 'Stripe refund created for the order, if any.';
COMMENT ON COLUMN purchases.stripe_transfer_reversal_id IS 'Stripe transfer reversal created to recover seller funds, if any.';
