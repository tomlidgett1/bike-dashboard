-- Audit log for workorder voice dictations: raw speech, AI transcript, and saved note.

CREATE TABLE IF NOT EXISTS workorder_dictation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workorder_id TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  template_name TEXT,
  raw_transcript TEXT NOT NULL,
  formatted_note TEXT NOT NULL,
  saved_note TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workorder_dictation_logs_user_created
  ON workorder_dictation_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workorder_dictation_logs_workorder
  ON workorder_dictation_logs(user_id, workorder_id, created_at DESC);

ALTER TABLE workorder_dictation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workorder_dictation_logs_owner_all" ON workorder_dictation_logs;
CREATE POLICY "workorder_dictation_logs_owner_all"
  ON workorder_dictation_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
