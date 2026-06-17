-- Persist closed Nest inbox cases until a newer customer message arrives.

CREATE TABLE IF NOT EXISTS store_nest_conversation_closes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

ALTER TABLE store_nest_conversation_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_nest_conversation_closes_owner_all"
  ON store_nest_conversation_closes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
