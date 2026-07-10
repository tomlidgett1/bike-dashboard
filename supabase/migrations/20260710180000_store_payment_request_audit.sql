-- Audit trail + Lightspeed sync columns for Nest "Request money".
-- Every lifecycle step is logged so the store can see the full process in Yellow Jersey.

ALTER TABLE store_payment_requests
  ADD COLUMN IF NOT EXISTS lightspeed_workorder_id TEXT,
  ADD COLUMN IF NOT EXISTS lightspeed_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS lightspeed_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lightspeed_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS lightspeed_sync_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_payment_requests_lightspeed_sync_status_check'
  ) THEN
    ALTER TABLE store_payment_requests
      ADD CONSTRAINT store_payment_requests_lightspeed_sync_status_check
      CHECK (lightspeed_sync_status IN ('pending', 'synced', 'failed', 'skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_payment_requests_store_created
  ON store_payment_requests(store_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS store_payment_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID NOT NULL REFERENCES store_payment_requests(id) ON DELETE CASCADE,
  store_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_payment_request_events_event_type_check
    CHECK (event_type IN (
      'created',
      'link_sent',
      'checkout_started',
      'checkout_session_created',
      'checkout_failed',
      'stripe_webhook_received',
      'credit_recorded',
      'marked_paid',
      'lightspeed_sync_started',
      'lightspeed_customer_matched',
      'lightspeed_customer_missing',
      'lightspeed_workorder_created',
      'lightspeed_sync_failed',
      'lightspeed_sync_skipped',
      'lightspeed_sync_retried',
      'note'
    ))
);

CREATE INDEX IF NOT EXISTS idx_store_payment_request_events_request
  ON store_payment_request_events(payment_request_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_store_payment_request_events_store
  ON store_payment_request_events(store_user_id, created_at DESC);

ALTER TABLE store_payment_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_payment_request_events_owner_select"
  ON store_payment_request_events FOR SELECT
  USING (auth.uid() = store_user_id);

-- Service role (webhook / checkout) inserts events; store owners read them.
CREATE POLICY "store_payment_request_events_owner_insert"
  ON store_payment_request_events FOR INSERT
  WITH CHECK (auth.uid() = store_user_id);
