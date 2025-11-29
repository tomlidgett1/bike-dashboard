-- ============================================================
-- Setup Automatic Refresh for Category Counts
-- ============================================================
-- Refreshes the marketplace_category_counts materialized view
-- every 15 minutes to keep category badges up to date

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing job if it exists (safe to ignore if doesn't exist)
DO $$ 
BEGIN
  PERFORM cron.unschedule('refresh-marketplace-category-counts');
EXCEPTION
  WHEN others THEN
    NULL; -- Job doesn't exist yet, that's fine
END $$;

-- Schedule the materialized view refresh every 15 minutes
-- This ensures category counts are always fresh without slowing down queries
SELECT cron.schedule(
  'refresh-marketplace-category-counts',
  '*/15 * * * *', -- Every 15 minutes
  $$SELECT refresh_marketplace_category_counts()$$
);

-- Also refresh it now to populate initial data
SELECT refresh_marketplace_category_counts();

-- Add comment
COMMENT ON EXTENSION pg_cron IS 'Enables scheduled jobs for automatic materialized view refresh';

