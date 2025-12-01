-- ============================================================
-- Disable Automatic Image Discovery Processing
-- ============================================================
-- Disables pg_cron auto-processing of the image discovery queue
-- Images will now only be discovered when manually triggered by admin

-- Unschedule the automatic queue processor (if it exists)
DO $$
BEGIN
  PERFORM cron.unschedule('process-ai-image-discovery');
EXCEPTION
  WHEN OTHERS THEN
    -- Job doesn't exist, which is fine - auto-processing already disabled
    RAISE NOTICE 'Cron job process-ai-image-discovery does not exist (already disabled)';
END $$;

-- Add comment explaining why it's disabled
COMMENT ON TABLE ai_image_discovery_queue IS 'Queue for AI-powered product image discovery. Processing is now MANUAL ONLY via admin panel - auto-processing disabled to enable QA workflow.';

-- Keep the queue table and functions intact for manual triggering

