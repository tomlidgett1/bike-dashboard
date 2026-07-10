-- Workorder dictation note templates.
-- Each staff member can save a note format (e.g. "WORK DONE / PARTS / NEXT
-- SERVICE") and the dictation flow reshapes the transcript to match the
-- selected template before it is appended to the Lightspeed workorder note.

CREATE TABLE IF NOT EXISTS workorder_note_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workorder_note_templates_user
  ON workorder_note_templates(user_id, created_at);

ALTER TABLE workorder_note_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workorder_note_templates_owner_all" ON workorder_note_templates;
CREATE POLICY "workorder_note_templates_owner_all"
  ON workorder_note_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
