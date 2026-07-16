-- Description: Add Linq Agent Pay (LinkPay) support to store payment requests
-- Date: 2026-07-16
--
-- LinkPay creates a Linq Agent Pay payment_request and stores the hosted
-- checkout_url. Funds still settle to the store's Stripe account via Linq's
-- Stripe Connect orchestration; we reconcile via Linq payment.* webhooks.

ALTER TABLE store_payment_requests
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe';

ALTER TABLE store_payment_requests
  ADD COLUMN IF NOT EXISTS linq_payment_request_id TEXT;

ALTER TABLE store_payment_requests
  ADD COLUMN IF NOT EXISTS checkout_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_payment_requests_provider_check'
  ) THEN
    ALTER TABLE store_payment_requests
      ADD CONSTRAINT store_payment_requests_provider_check
      CHECK (provider IN ('stripe', 'linkpay'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_payment_requests_linq_id
  ON store_payment_requests (linq_payment_request_id)
  WHERE linq_payment_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_payment_requests_provider
  ON store_payment_requests (store_user_id, provider, created_at DESC);

-- Allow LinkPay lifecycle events in the audit trail.
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
    'linkpay_webhook_received',
    'linkpay_create_failed',
    'linkpay_expired',
    'linkpay_canceled',
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
    'confirmation_sms_sent',
    'confirmation_sms_failed',
    'confirmation_email_sent',
    'confirmation_email_failed',
    'note'
  ));
