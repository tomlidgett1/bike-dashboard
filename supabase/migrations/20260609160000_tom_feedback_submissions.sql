-- Internal product feedback from verified store dashboard users ("Tom feedback").
-- Captures page context for later Cursor automation triage.

CREATE TABLE IF NOT EXISTS tom_feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_path TEXT NOT NULL,
  page_title TEXT,
  page_url TEXT,
  page_search TEXT,
  feedback_text TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(trim(feedback_text)) >= 30),
  CHECK (char_length(feedback_text) <= 8000),
  CHECK (char_length(page_path) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_tom_feedback_submissions_status_created
  ON tom_feedback_submissions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tom_feedback_submissions_user_created
  ON tom_feedback_submissions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tom_feedback_submissions_page_path
  ON tom_feedback_submissions(page_path, created_at DESC);

ALTER TABLE tom_feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own Tom feedback"
  ON tom_feedback_submissions;

CREATE POLICY "Users can insert their own Tom feedback"
  ON tom_feedback_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own Tom feedback"
  ON tom_feedback_submissions;

CREATE POLICY "Users can view their own Tom feedback"
  ON tom_feedback_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage Tom feedback"
  ON tom_feedback_submissions;

CREATE POLICY "Service role can manage Tom feedback"
  ON tom_feedback_submissions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE tom_feedback_submissions IS
  'Store-dashboard product feedback for Tom. Includes page context for Cursor automation.';
