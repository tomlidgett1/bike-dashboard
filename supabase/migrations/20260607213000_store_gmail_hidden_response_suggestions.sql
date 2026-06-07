-- Persist hidden and completed Gmail response recommendations from HomeV2.
-- The source email body is not stored; only the preview data and generated draft
-- that was already shown to the store user.

CREATE TABLE IF NOT EXISTS store_gmail_hidden_response_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT 'general_reply',
  priority TEXT NOT NULL DEFAULT 'normal',
  label TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  response_draft TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'hidden',
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, message_id),
  CONSTRAINT store_gmail_hidden_response_action_check
    CHECK (action IN ('hidden', 'drafted')),
  CONSTRAINT store_gmail_hidden_response_priority_check
    CHECK (priority IN ('urgent', 'normal', 'low')),
  CONSTRAINT store_gmail_hidden_response_intent_check
    CHECK (intent IN (
      'service_booking',
      'stock_check',
      'quote_request',
      'warranty',
      'order_status',
      'general_reply'
    ))
);

CREATE INDEX IF NOT EXISTS idx_store_gmail_hidden_response_user_hidden
  ON store_gmail_hidden_response_suggestions(user_id, hidden_at DESC);

ALTER TABLE store_gmail_hidden_response_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_gmail_hidden_response_owner_all"
  ON store_gmail_hidden_response_suggestions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
