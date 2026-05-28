-- Genie conversation history (logged-in users only)
CREATE TABLE IF NOT EXISTS genie_conversations (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL DEFAULT 'Conversation',
  messages    jsonb       NOT NULL DEFAULT '[]',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE genie_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own genie conversations"
  ON genie_conversations FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX genie_conversations_user_id_idx ON genie_conversations (user_id, updated_at DESC);
