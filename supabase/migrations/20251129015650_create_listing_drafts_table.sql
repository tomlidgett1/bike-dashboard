-- ============================================================
-- Create listing_drafts table for saving in-progress listings
-- ============================================================

-- Drop table if it exists to start fresh
DROP TABLE IF EXISTS listing_drafts CASCADE;

-- Create the table
CREATE TABLE listing_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Draft metadata
  draft_name TEXT,
  current_step INTEGER NOT NULL DEFAULT 1,
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Form data stored as JSONB for flexibility
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Create indexes for better query performance
CREATE INDEX idx_listing_drafts_user_id ON listing_drafts(user_id);
CREATE INDEX idx_listing_drafts_last_saved ON listing_drafts(last_saved_at DESC);

-- Enable RLS
ALTER TABLE listing_drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own drafts
CREATE POLICY "Users can view their own drafts"
  ON listing_drafts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own drafts"
  ON listing_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drafts"
  ON listing_drafts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drafts"
  ON listing_drafts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON listing_drafts TO authenticated;

-- Add helpful comment
COMMENT ON TABLE listing_drafts IS 'Stores draft listings that users are creating but have not published yet';

