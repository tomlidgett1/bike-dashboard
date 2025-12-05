-- Add completed field to listing_drafts table
ALTER TABLE listing_drafts 
ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Add completed_at timestamp
ALTER TABLE listing_drafts 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Create index for querying incomplete drafts
CREATE INDEX IF NOT EXISTS idx_listing_drafts_completed ON listing_drafts(completed, last_saved_at DESC);

-- Add comment
COMMENT ON COLUMN listing_drafts.completed IS 'Whether the draft has been completed and published as a listing';
COMMENT ON COLUMN listing_drafts.completed_at IS 'Timestamp when the draft was completed';



