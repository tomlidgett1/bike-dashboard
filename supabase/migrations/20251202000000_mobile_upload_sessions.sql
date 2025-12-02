-- Mobile Upload Sessions
-- Allows users to scan a QR code and upload photos from their phone
-- Photos sync in real-time to the desktop session

CREATE TABLE IF NOT EXISTS mobile_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(32) UNIQUE NOT NULL,  -- Short token for QR URL
  user_id UUID REFERENCES auth.users(id),
  images JSONB DEFAULT '[]',                   -- Array of {url, uploadedAt}
  status VARCHAR(20) DEFAULT 'pending',        -- pending, uploading, complete, expired
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 minutes'
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_token ON mobile_upload_sessions(session_token);

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_expires ON mobile_upload_sessions(expires_at);

-- Enable RLS
ALTER TABLE mobile_upload_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read sessions by token (for anonymous mobile access)
CREATE POLICY "Anyone can read by token" ON mobile_upload_sessions
  FOR SELECT USING (true);

-- Policy: Anyone can update sessions by token (for mobile photo uploads)
CREATE POLICY "Anyone can update by token" ON mobile_upload_sessions
  FOR UPDATE USING (true);

-- Policy: Authenticated users can create sessions
CREATE POLICY "Authenticated users can create sessions" ON mobile_upload_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own sessions
CREATE POLICY "Users can delete own sessions" ON mobile_upload_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE mobile_upload_sessions;

-- Function to clean up expired sessions (can be called via cron or manually)
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

