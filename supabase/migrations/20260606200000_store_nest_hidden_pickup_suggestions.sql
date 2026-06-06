-- Persist hidden Nest pickup suggestions so stores can dismiss them on HomeV2
-- and restore them from the Nest settings page.

CREATE TABLE IF NOT EXISTS store_nest_hidden_pickup_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workorder_id TEXT NOT NULL,
  customer_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  mobile TEXT,
  work_summary TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  message_draft TEXT NOT NULL DEFAULT '',
  finished_at TIMESTAMPTZ,
  status_name TEXT NOT NULL DEFAULT '',
  can_send BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, workorder_id)
);

CREATE INDEX IF NOT EXISTS idx_store_nest_hidden_pickup_user_hidden
  ON store_nest_hidden_pickup_suggestions(user_id, hidden_at DESC);

ALTER TABLE store_nest_hidden_pickup_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_nest_hidden_pickup_owner_all"
  ON store_nest_hidden_pickup_suggestions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
