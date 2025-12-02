-- ============================================================
-- Mobile Upload Sessions Setup
-- Run this SQL in your Supabase SQL Editor to enable QR code mobile uploads
-- ============================================================

-- Create the mobile_upload_sessions table
CREATE TABLE IF NOT EXISTS mobile_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(32) UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  images JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 minutes'
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_token ON mobile_upload_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_expires ON mobile_upload_sessions(expires_at);

-- Enable RLS
ALTER TABLE mobile_upload_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-runs)
DROP POLICY IF EXISTS "Anyone can read by token" ON mobile_upload_sessions;
DROP POLICY IF EXISTS "Anyone can update by token" ON mobile_upload_sessions;
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON mobile_upload_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON mobile_upload_sessions;

-- Create RLS policies
CREATE POLICY "Anyone can read by token" ON mobile_upload_sessions
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update by token" ON mobile_upload_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Authenticated users can create sessions" ON mobile_upload_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON mobile_upload_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime (run this separately if it fails)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mobile_upload_sessions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_mobile_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM mobile_upload_sessions
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic JSONB array append function (prevents race conditions)
-- This ensures parallel uploads don't overwrite each other
CREATE OR REPLACE FUNCTION append_mobile_upload_image(
  p_token VARCHAR(32),
  p_image JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE mobile_upload_sessions
  SET 
    images = COALESCE(images, '[]'::jsonb) || p_image,
    status = 'pending'
  WHERE session_token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success message
SELECT 'Mobile upload sessions table created successfully!' as status;

