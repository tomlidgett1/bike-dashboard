-- Unified inbox cache: Nest conversations/messages + connection metadata for instant loads.

CREATE TABLE IF NOT EXISTS store_inbox_connection_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_configured BOOLEAN NOT NULL DEFAULT FALSE,
  gmail_connected BOOLEAN NOT NULL DEFAULT FALSE,
  gmail_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  gmail_checked_at TIMESTAMPTZ,
  nest_last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_nest_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_key TEXT NOT NULL DEFAULT '',
  chat_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  display_name TEXT,
  participant_handle TEXT,
  preview TEXT NOT NULL DEFAULT '',
  preview_role TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_customer_message_at TIMESTAMPTZ,
  has_manual_messages BOOLEAN NOT NULL DEFAULT FALSE,
  latest_manual_message_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'customer',
  triggered_by_twilio BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chat_id),
  CONSTRAINT store_nest_conversations_source_check
    CHECK (source IN ('customer', 'portal_test'))
);

CREATE INDEX IF NOT EXISTS idx_store_nest_conversations_user_last_message
  ON store_nest_conversations(user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS store_nest_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  nest_message_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  handle TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chat_id, nest_message_id),
  CONSTRAINT store_nest_messages_role_check
    CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_store_nest_messages_user_chat_created
  ON store_nest_messages(user_id, chat_id, created_at ASC);

CREATE TABLE IF NOT EXISTS store_nest_conversation_reads (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

ALTER TABLE store_inbox_connection_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_nest_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_nest_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_nest_conversation_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_inbox_connection_state_owner_all"
  ON store_inbox_connection_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "store_nest_conversations_owner_all"
  ON store_nest_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "store_nest_messages_owner_all"
  ON store_nest_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "store_nest_conversation_reads_owner_all"
  ON store_nest_conversation_reads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
