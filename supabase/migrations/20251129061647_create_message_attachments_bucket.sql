-- ============================================================
-- MESSAGE ATTACHMENTS STORAGE BUCKET
-- ============================================================
-- Creates a secure storage bucket for message image attachments
-- with proper RLS policies for authenticated access

-- ============================================================
-- 1. CREATE STORAGE BUCKET
-- ============================================================

-- Create the bucket for message attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false, -- Private bucket, requires authentication
  5242880, -- 5MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE storage.buckets IS 'Storage bucket for message image attachments';

-- ============================================================
-- 2. STORAGE RLS POLICIES
-- ============================================================

-- Policy: Users can upload attachments to their own folders
CREATE POLICY "Users can upload own message attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'message-attachments' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can view attachments in conversations they participate in
CREATE POLICY "Users can view conversation attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'message-attachments' AND
    (
      -- User can view their own uploads
      auth.uid()::text = (storage.foldername(name))[1] OR
      -- OR user is a participant in the conversation
      EXISTS (
        SELECT 1 
        FROM conversation_participants cp
        WHERE cp.conversation_id::text = (storage.foldername(name))[2]
        AND cp.user_id = auth.uid()
      )
    )
  );

-- Policy: Users can update their own attachments (for metadata updates)
CREATE POLICY "Users can update own attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'message-attachments' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can delete their own attachments
CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'message-attachments' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 3. HELPER FUNCTION FOR GENERATING STORAGE PATHS
-- ============================================================

-- Function to generate a standardized storage path for attachments
CREATE OR REPLACE FUNCTION generate_message_attachment_path(
  p_user_id UUID,
  p_conversation_id UUID,
  p_message_id UUID,
  p_filename TEXT
)
RETURNS TEXT AS $$
BEGIN
  -- Path structure: {user_id}/{conversation_id}/{message_id}/{filename}
  RETURN p_user_id::text || '/' || 
         p_conversation_id::text || '/' || 
         p_message_id::text || '/' || 
         p_filename;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generate_message_attachment_path IS 'Generates standardized storage path for message attachments';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Message attachments storage bucket created!';
  RAISE NOTICE '📦 Bucket: message-attachments (private)';
  RAISE NOTICE '📏 File size limit: 5MB per image';
  RAISE NOTICE '🖼️  Allowed types: JPEG, PNG, WebP';
  RAISE NOTICE '🔐 RLS policies configured for secure access';
END $$;

