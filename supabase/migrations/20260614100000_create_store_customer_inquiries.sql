-- Customer inquiry automation: Gmail inbox sync, draft generation, human approval.

CREATE TABLE IF NOT EXISTS store_customer_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  connected_account_id TEXT,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body_preview TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ,
  intent TEXT NOT NULL DEFAULT 'general_reply',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'new',
  draft_body TEXT NOT NULL DEFAULT '',
  draft_subject TEXT,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  lightspeed_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_profile_version INTEGER,
  reasoning TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  draft_generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  ignored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, gmail_message_id),
  CONSTRAINT store_customer_inquiries_status_check
    CHECK (status IN ('new', 'processing', 'draft_ready', 'sent', 'ignored', 'error')),
  CONSTRAINT store_customer_inquiries_priority_check
    CHECK (priority IN ('urgent', 'normal', 'low')),
  CONSTRAINT store_customer_inquiries_intent_check
    CHECK (intent IN (
      'service_booking',
      'stock_check',
      'quote_request',
      'warranty',
      'order_status',
      'technical_question',
      'general_reply'
    ))
);

CREATE INDEX IF NOT EXISTS idx_store_customer_inquiries_user_status_received
  ON store_customer_inquiries(user_id, status, received_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_store_customer_inquiries_user_updated
  ON store_customer_inquiries(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_customer_inquiries_processing
  ON store_customer_inquiries(status, updated_at)
  WHERE status IN ('new', 'processing', 'error');

CREATE TABLE IF NOT EXISTS store_customer_inquiry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES store_customer_inquiries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_customer_inquiry_events_inquiry
  ON store_customer_inquiry_events(inquiry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS store_email_style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_message_ids TEXT[] NOT NULL DEFAULT '{}',
  sample_message_hashes TEXT[] NOT NULL DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE store_customer_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_customer_inquiry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_email_style_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_customer_inquiries_owner_all"
  ON store_customer_inquiries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "store_customer_inquiry_events_owner_all"
  ON store_customer_inquiry_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "store_email_style_profiles_owner_all"
  ON store_email_style_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
