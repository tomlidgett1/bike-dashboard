-- Store payment requests + customer credit ledger.
-- A store owner sends a customer a payment link from a Nest conversation.
-- When the customer pays via Stripe Checkout, the webhook marks the request
-- paid and records the amount as store credit against the customer.

CREATE TABLE IF NOT EXISTS store_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nest_chat_id TEXT,
  customer_name TEXT,
  customer_handle TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'aud',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_payment_requests_status_check
    CHECK (status IN ('pending', 'paid', 'canceled'))
);

CREATE INDEX IF NOT EXISTS idx_store_payment_requests_store_chat
  ON store_payment_requests(store_user_id, nest_chat_id, created_at DESC);

-- Credit ledger: positive amounts add credit (payments), negative amounts
-- redeem it (manual adjustments at the counter). Balance = SUM(amount_cents).
CREATE TABLE IF NOT EXISTS store_customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_handle TEXT NOT NULL,
  customer_name TEXT,
  amount_cents INTEGER NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'payment',
  note TEXT,
  -- UNIQUE = one credit entry per payment request (webhook idempotency);
  -- Postgres allows multiple NULLs for manual ledger entries.
  payment_request_id UUID UNIQUE REFERENCES store_payment_requests(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_customer_credits_entry_type_check
    CHECK (entry_type IN ('payment', 'redeem', 'adjustment'))
);

CREATE INDEX IF NOT EXISTS idx_store_customer_credits_store_handle
  ON store_customer_credits(store_user_id, customer_handle, created_at DESC);

ALTER TABLE store_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_customer_credits ENABLE ROW LEVEL SECURITY;

-- Store owners manage their own rows. The public /pay page and the Stripe
-- webhook use the service-role client, which bypasses RLS.
CREATE POLICY "store_payment_requests_owner_all"
  ON store_payment_requests FOR ALL
  USING (auth.uid() = store_user_id)
  WITH CHECK (auth.uid() = store_user_id);

CREATE POLICY "store_customer_credits_owner_all"
  ON store_customer_credits FOR ALL
  USING (auth.uid() = store_user_id)
  WITH CHECK (auth.uid() = store_user_id);
