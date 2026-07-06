ALTER TABLE store_nest_conversations
  ADD COLUMN IF NOT EXISTS human_mode_active BOOLEAN NOT NULL DEFAULT FALSE;
