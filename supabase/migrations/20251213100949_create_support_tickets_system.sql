-- ============================================================
-- Support Tickets System
-- ============================================================
-- Creates tables for order help, disputes, and claims management
-- with full audit logging and messaging capabilities

-- ============================================================
-- 1. SUPPORT TICKETS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Human-readable ticket number
  ticket_number TEXT UNIQUE NOT NULL,
  
  -- References
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Issue categorisation
  category TEXT NOT NULL,
  subcategory TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  
  -- Content
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Resolution
  resolution TEXT,
  resolution_type TEXT,
  
  -- Requested resolution by user
  requested_resolution TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_category CHECK (
    category IN (
      'item_not_received',
      'item_not_as_described', 
      'damaged',
      'wrong_item',
      'refund_request',
      'shipping_issue',
      'general_question'
    )
  ),
  CONSTRAINT valid_status CHECK (
    status IN ('open', 'awaiting_response', 'in_review', 'escalated', 'resolved', 'closed')
  ),
  CONSTRAINT valid_priority CHECK (
    priority IN ('low', 'medium', 'high', 'urgent')
  ),
  CONSTRAINT valid_resolution_type CHECK (
    resolution_type IS NULL OR resolution_type IN (
      'refunded', 'partial_refund', 'replaced', 'no_action', 'other'
    )
  )
);

-- ============================================================
-- 2. TICKET MESSAGES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- References
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Sender role
  sender_type TEXT NOT NULL DEFAULT 'buyer',
  
  -- Content
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  
  -- Internal notes flag (hidden from users)
  is_internal BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_sender_type CHECK (
    sender_type IN ('buyer', 'seller', 'support')
  )
);

-- ============================================================
-- 3. TICKET ATTACHMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- References
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- File info
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  
  -- Cloudinary public ID for management
  cloudinary_public_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. TICKET HISTORY TABLE (Audit Log)
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- References
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Action details
  action TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_action CHECK (
    action IN (
      'created',
      'status_changed',
      'assigned',
      'escalated',
      'message_added',
      'attachment_added',
      'resolved',
      'reopened',
      'priority_changed'
    )
  )
);

-- ============================================================
-- 5. INDEXES
-- ============================================================

-- Support tickets indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_purchase_id ON support_tickets(purchase_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number ON support_tickets(ticket_number);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(created_by, status);

-- Ticket messages indexes
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id ON ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages(created_at DESC);

-- Ticket attachments indexes
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id);

-- Ticket history indexes
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_created_at ON ticket_history(created_at DESC);

-- ============================================================
-- 6. FUNCTIONS
-- ============================================================

-- Generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- Auto-update updated_at on support_tickets
CREATE TRIGGER trigger_update_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_updated_at();

-- Auto-create history entry on ticket creation
CREATE OR REPLACE FUNCTION create_ticket_history_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ticket_history (
    ticket_id,
    performed_by,
    action,
    new_value
  ) VALUES (
    NEW.id,
    NEW.created_by,
    'created',
    jsonb_build_object(
      'category', NEW.category,
      'status', NEW.status,
      'priority', NEW.priority,
      'subject', NEW.subject
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_ticket_history
  AFTER INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_history_on_insert();

-- Auto-create history entry on status change
CREATE OR REPLACE FUNCTION create_ticket_history_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO ticket_history (
      ticket_id,
      performed_by,
      action,
      previous_value,
      new_value
    ) VALUES (
      NEW.id,
      COALESCE(NEW.assigned_to, NEW.created_by),
      CASE 
        WHEN NEW.status = 'resolved' THEN 'resolved'
        WHEN NEW.status = 'open' AND OLD.status IN ('resolved', 'closed') THEN 'reopened'
        ELSE 'status_changed'
      END,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'resolution', NEW.resolution, 'resolution_type', NEW.resolution_type)
    );
  END IF;
  
  -- Set resolved_at when status changes to resolved
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = NOW();
  END IF;
  
  -- Clear resolved_at when reopened
  IF NEW.status = 'open' AND OLD.status IN ('resolved', 'closed') THEN
    NEW.resolved_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ticket_status_history
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_history_on_status_change();

-- Auto-create history entry when message added
CREATE OR REPLACE FUNCTION create_ticket_history_on_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log non-internal messages
  IF NOT NEW.is_internal THEN
    INSERT INTO ticket_history (
      ticket_id,
      performed_by,
      action,
      new_value
    ) VALUES (
      NEW.ticket_id,
      NEW.sender_id,
      'message_added',
      jsonb_build_object('sender_type', NEW.sender_type)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ticket_message_history
  AFTER INSERT ON ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_history_on_message();

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_history ENABLE ROW LEVEL SECURITY;

-- Support tickets policies

-- Users can view tickets they created
CREATE POLICY "Users can view their tickets"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Sellers can view tickets about their sales
CREATE POLICY "Sellers can view tickets on their sales"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchases
      WHERE purchases.id = support_tickets.purchase_id
      AND purchases.seller_id = auth.uid()
    )
  );

-- Users can create tickets for their purchases
CREATE POLICY "Buyers can create tickets"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM purchases
      WHERE purchases.id = support_tickets.purchase_id
      AND purchases.buyer_id = auth.uid()
    )
  );

-- Users can update their own tickets (limited)
CREATE POLICY "Users can update their tickets"
  ON support_tickets FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Ticket messages policies

-- Users can view messages on tickets they have access to
CREATE POLICY "Users can view ticket messages"
  ON ticket_messages FOR SELECT
  TO authenticated
  USING (
    NOT is_internal AND
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
      AND (
        support_tickets.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM purchases
          WHERE purchases.id = support_tickets.purchase_id
          AND purchases.seller_id = auth.uid()
        )
      )
    )
  );

-- Users can add messages to their tickets
CREATE POLICY "Users can add messages to their tickets"
  ON ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    NOT is_internal AND
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
      AND (
        support_tickets.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM purchases
          WHERE purchases.id = support_tickets.purchase_id
          AND purchases.seller_id = auth.uid()
        )
      )
    )
  );

-- Ticket attachments policies

-- Users can view attachments on tickets they have access to
CREATE POLICY "Users can view ticket attachments"
  ON ticket_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_attachments.ticket_id
      AND (
        support_tickets.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM purchases
          WHERE purchases.id = support_tickets.purchase_id
          AND purchases.seller_id = auth.uid()
        )
      )
    )
  );

-- Users can upload attachments to their tickets
CREATE POLICY "Users can upload attachments to their tickets"
  ON ticket_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_attachments.ticket_id
      AND (
        support_tickets.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM purchases
          WHERE purchases.id = support_tickets.purchase_id
          AND purchases.seller_id = auth.uid()
        )
      )
    )
  );

-- Ticket history policies

-- Users can view history of tickets they have access to
CREATE POLICY "Users can view ticket history"
  ON ticket_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_history.ticket_id
      AND (
        support_tickets.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM purchases
          WHERE purchases.id = support_tickets.purchase_id
          AND purchases.seller_id = auth.uid()
        )
      )
    )
  );

-- System can insert history (via triggers)
CREATE POLICY "System can insert ticket history"
  ON ticket_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 9. COMMENTS
-- ============================================================

COMMENT ON TABLE support_tickets IS 'Stores support tickets/claims for order disputes and help requests';
COMMENT ON TABLE ticket_messages IS 'Conversation thread within support tickets';
COMMENT ON TABLE ticket_attachments IS 'Evidence files and photos attached to tickets';
COMMENT ON TABLE ticket_history IS 'Complete audit log of all ticket changes';

COMMENT ON COLUMN support_tickets.ticket_number IS 'Human-readable ticket reference (TKT-YYYYMMDD-XXXXX)';
COMMENT ON COLUMN support_tickets.category IS 'Main issue category: item_not_received, item_not_as_described, damaged, wrong_item, refund_request, shipping_issue, general_question';
COMMENT ON COLUMN support_tickets.status IS 'Current status: open, awaiting_response, in_review, escalated, resolved, closed';
COMMENT ON COLUMN support_tickets.resolution_type IS 'How ticket was resolved: refunded, partial_refund, replaced, no_action, other';
COMMENT ON COLUMN ticket_messages.is_internal IS 'Internal support notes not visible to users';
COMMENT ON COLUMN ticket_history.action IS 'Type of action: created, status_changed, assigned, escalated, message_added, attachment_added, resolved, reopened, priority_changed';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Support tickets system created successfully';
  RAISE NOTICE '📊 Tables: support_tickets, ticket_messages, ticket_attachments, ticket_history';
  RAISE NOTICE '🔒 RLS policies enabled';
  RAISE NOTICE '⚡ Triggers and indexes created';
END $$;

