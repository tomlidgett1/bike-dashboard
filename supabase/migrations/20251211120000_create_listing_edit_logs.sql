-- ============================================================
-- Create listing_edit_logs table for tracking product edits
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_edit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_listing_edit_logs_listing ON listing_edit_logs(listing_id);
CREATE INDEX idx_listing_edit_logs_user ON listing_edit_logs(user_id);
CREATE INDEX idx_listing_edit_logs_created ON listing_edit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE listing_edit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only listing owners can view their edit logs
CREATE POLICY "Users can view their own listing edit logs"
  ON listing_edit_logs
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    listing_id IN (SELECT id FROM products WHERE user_id = auth.uid())
  );

-- Only the system (via service role) can insert logs
CREATE POLICY "Service role can insert edit logs"
  ON listing_edit_logs
  FOR INSERT
  WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT ON listing_edit_logs TO authenticated;
GRANT INSERT ON listing_edit_logs TO service_role;

COMMENT ON TABLE listing_edit_logs IS 'Tracks all changes made to product listings for audit purposes';
COMMENT ON COLUMN listing_edit_logs.field_name IS 'The name of the field that was changed';
COMMENT ON COLUMN listing_edit_logs.old_value IS 'The previous value (as JSONB for flexibility)';
COMMENT ON COLUMN listing_edit_logs.new_value IS 'The new value (as JSONB for flexibility)';
