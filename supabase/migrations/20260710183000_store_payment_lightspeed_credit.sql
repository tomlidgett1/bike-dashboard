-- Prefer Lightspeed Credit Account deposits over workorders for Nest payments.

ALTER TABLE store_payment_requests
  ADD COLUMN IF NOT EXISTS lightspeed_sale_id TEXT,
  ADD COLUMN IF NOT EXISTS lightspeed_credit_account_id TEXT;

ALTER TABLE store_payment_request_events
  DROP CONSTRAINT IF EXISTS store_payment_request_events_event_type_check;

ALTER TABLE store_payment_request_events
  ADD CONSTRAINT store_payment_request_events_event_type_check
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
    'lightspeed_credit_account_ready',
    'lightspeed_credit_deposited',
    'lightspeed_workorder_created',
    'lightspeed_sync_failed',
    'lightspeed_sync_skipped',
    'lightspeed_sync_retried',
    'note'
  ));
