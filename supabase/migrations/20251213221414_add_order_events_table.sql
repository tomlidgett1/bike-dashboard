-- Add order_events table to track all status changes and events for orders
-- This provides a complete timeline/audit log of order activity

CREATE TABLE IF NOT EXISTS order_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Reference to the purchase/order
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  
  -- Event details
  event_type TEXT NOT NULL,
  -- Event types: 'created', 'paid', 'shipped', 'delivered', 'receipt_confirmed', 
  -- 'funds_released', 'cancelled', 'refunded', 'tracking_added', 'note_added'
  
  -- Previous and new status (for status changes)
  previous_status TEXT,
  new_status TEXT,
  
  -- Additional event data (JSON for flexibility)
  event_data JSONB DEFAULT '{}',
  -- Can contain: tracking_number, notes, shipping_carrier, etc.
  
  -- Who triggered the event (null for system events)
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by_role TEXT, -- 'buyer', 'seller', 'system'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS order_events_purchase_id_idx ON order_events(purchase_id);
CREATE INDEX IF NOT EXISTS order_events_created_at_idx ON order_events(created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_event_type_idx ON order_events(event_type);

-- RLS Policies
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- Buyers and sellers can view events for their orders
CREATE POLICY "Users can view events for their orders"
  ON order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM purchases p
      WHERE p.id = order_events.purchase_id
      AND (p.buyer_id = auth.uid() OR p.seller_id = auth.uid())
    )
  );

-- Only authenticated users can insert events (via API)
CREATE POLICY "Authenticated users can insert events"
  ON order_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Create a function to automatically log order creation
CREATE OR REPLACE FUNCTION log_purchase_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO order_events (purchase_id, event_type, new_status, triggered_by, triggered_by_role)
  VALUES (NEW.id, 'created', NEW.status, NEW.buyer_id, 'buyer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log order creation
CREATE TRIGGER on_purchase_created
  AFTER INSERT ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION log_purchase_created();

-- Create a function to automatically log status changes
CREATE OR REPLACE FUNCTION log_purchase_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_events (purchase_id, event_type, previous_status, new_status, triggered_by_role)
    VALUES (NEW.id, 'status_changed', OLD.status, NEW.status, 'system');
  END IF;
  
  -- Log if tracking number was added
  IF OLD.tracking_number IS NULL AND NEW.tracking_number IS NOT NULL THEN
    INSERT INTO order_events (purchase_id, event_type, event_data, triggered_by_role)
    VALUES (NEW.id, 'tracking_added', jsonb_build_object('tracking_number', NEW.tracking_number), 'seller');
  END IF;
  
  -- Log if funds status changed to released
  IF OLD.funds_status IS DISTINCT FROM NEW.funds_status AND NEW.funds_status = 'released' THEN
    INSERT INTO order_events (purchase_id, event_type, triggered_by, triggered_by_role)
    VALUES (NEW.id, 'receipt_confirmed', NEW.buyer_id, 'buyer');
  END IF;
  
  -- Log if funds status changed to auto_released
  IF OLD.funds_status IS DISTINCT FROM NEW.funds_status AND NEW.funds_status = 'auto_released' THEN
    INSERT INTO order_events (purchase_id, event_type, triggered_by_role)
    VALUES (NEW.id, 'funds_auto_released', 'system');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log status changes
CREATE TRIGGER on_purchase_status_change
  AFTER UPDATE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION log_purchase_status_change();

-- Backfill existing orders with creation events
INSERT INTO order_events (purchase_id, event_type, new_status, triggered_by, triggered_by_role, created_at)
SELECT 
  id, 
  'created', 
  status, 
  buyer_id, 
  'buyer',
  created_at
FROM purchases
WHERE NOT EXISTS (
  SELECT 1 FROM order_events oe WHERE oe.purchase_id = purchases.id AND oe.event_type = 'created'
);

-- Backfill paid events for orders that have been paid
INSERT INTO order_events (purchase_id, event_type, previous_status, new_status, triggered_by_role, created_at)
SELECT 
  id, 
  'status_changed', 
  'pending',
  'paid', 
  'system',
  created_at + interval '1 minute'
FROM purchases
WHERE status IN ('paid', 'shipped', 'delivered')
AND NOT EXISTS (
  SELECT 1 FROM order_events oe WHERE oe.purchase_id = purchases.id AND oe.event_type = 'status_changed' AND oe.new_status = 'paid'
);

-- Backfill shipped events
INSERT INTO order_events (purchase_id, event_type, previous_status, new_status, triggered_by_role, created_at)
SELECT 
  id, 
  'status_changed', 
  'paid',
  'shipped', 
  'seller',
  COALESCE(shipped_at, created_at + interval '2 minutes')
FROM purchases
WHERE status IN ('shipped', 'delivered')
AND shipped_at IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM order_events oe WHERE oe.purchase_id = purchases.id AND oe.event_type = 'status_changed' AND oe.new_status = 'shipped'
);

-- Backfill tracking added events
INSERT INTO order_events (purchase_id, event_type, event_data, triggered_by_role, created_at)
SELECT 
  id, 
  'tracking_added', 
  jsonb_build_object('tracking_number', tracking_number),
  'seller',
  COALESCE(shipped_at, created_at + interval '2 minutes')
FROM purchases
WHERE tracking_number IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM order_events oe WHERE oe.purchase_id = purchases.id AND oe.event_type = 'tracking_added'
);

-- Backfill delivered events
INSERT INTO order_events (purchase_id, event_type, previous_status, new_status, triggered_by_role, created_at)
SELECT 
  id, 
  'status_changed', 
  'shipped',
  'delivered', 
  'system',
  COALESCE(delivered_at, created_at + interval '3 minutes')
FROM purchases
WHERE status = 'delivered'
AND NOT EXISTS (
  SELECT 1 FROM order_events oe WHERE oe.purchase_id = purchases.id AND oe.event_type = 'status_changed' AND oe.new_status = 'delivered'
);

-- Backfill receipt confirmed events
INSERT INTO order_events (purchase_id, event_type, triggered_by, triggered_by_role, created_at)
SELECT 
  id, 
  'receipt_confirmed', 
  buyer_id,
  'buyer',
  COALESCE(delivered_at, created_at + interval '4 minutes')
FROM purchases
WHERE funds_status IN ('released', 'auto_released')
AND NOT EXISTS (
  SELECT 1 FROM order_events oe WHERE oe.purchase_id = purchases.id AND oe.event_type = 'receipt_confirmed'
);

