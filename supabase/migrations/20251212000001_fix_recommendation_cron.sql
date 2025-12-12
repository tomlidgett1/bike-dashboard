-- ============================================================
-- Fix Recommendation Cron Job
-- 
-- The previous cron job failed because 'app.settings.supabase_url' 
-- and 'app.settings.service_role_key' were not configured.
--
-- This migration fixes the issue by:
-- 1. Unscheduling the broken cron job
-- 2. Creating a new cron job that runs score calculation directly in SQL
--    (more efficient than calling an edge function via HTTP)
-- ============================================================

-- ============================================================
-- 1. UNSCHEDULE THE BROKEN CRON JOB
-- ============================================================

-- Safely unschedule if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('generate-recommendations-every-15min');
  RAISE NOTICE 'Unscheduled broken cron job: generate-recommendations-every-15min';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cron job generate-recommendations-every-15min does not exist or already removed';
END $$;

-- ============================================================
-- 2. CREATE IMPROVED SCORE CALCULATION FUNCTION
-- ============================================================

-- Drop if exists for idempotency
DROP FUNCTION IF EXISTS refresh_product_scores();

-- This function calculates scores and cleans up in one call
CREATE OR REPLACE FUNCTION refresh_product_scores()
RETURNS void AS $$
DECLARE
  v_updated INTEGER;
  v_new_products INTEGER;
BEGIN
  -- Step 1: Create product_scores entries for any new products
  INSERT INTO product_scores (product_id, view_count, click_count, like_count, trending_score, popularity_score, last_interaction_at)
  SELECT 
    p.id,
    1,  -- Baseline view count
    0,
    0,
    1.0,  -- Initial trending score
    1.0,  -- Initial popularity score
    NOW()
  FROM products p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM product_scores ps WHERE ps.product_id = p.id);
  
  GET DIAGNOSTICS v_new_products = ROW_COUNT;
  
  IF v_new_products > 0 THEN
    RAISE NOTICE 'Created score entries for % new products', v_new_products;
  END IF;

  -- Step 2: Update all product scores using the formula
  UPDATE product_scores ps
  SET 
    popularity_score = (
      (ps.view_count * 1.0) +
      (ps.click_count * 2.0) +
      (ps.like_count * 5.0) +
      (ps.conversion_count * 10.0)
    ) / GREATEST(EXTRACT(EPOCH FROM (NOW() - ps.created_at)) / 86400, 0.1),
    trending_score = (
      (ps.view_count * 1.0) +
      (ps.click_count * 2.0) +
      (ps.like_count * 5.0) +
      (ps.conversion_count * 10.0)
    ) * EXP(-0.1 * GREATEST(EXTRACT(EPOCH FROM (NOW() - ps.last_interaction_at)) / 86400, 0)),
    updated_at = NOW()
  WHERE EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = ps.product_id AND p.is_active = true
  );
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % product scores', v_updated;

  -- Step 3: Clean up expired recommendation cache
  DELETE FROM recommendation_cache
  WHERE expires_at < NOW();
  
  -- Step 4: Refresh materialized views if they exist
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY trending_products;
    RAISE NOTICE 'Refreshed trending_products materialized view';
  EXCEPTION WHEN OTHERS THEN
    -- View might not exist or not support concurrent refresh
    BEGIN
      REFRESH MATERIALIZED VIEW trending_products;
      RAISE NOTICE 'Refreshed trending_products materialized view (non-concurrent)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'trending_products materialized view refresh skipped';
    END;
  END;
  
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_category_preferences;
    RAISE NOTICE 'Refreshed user_category_preferences materialized view';
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      REFRESH MATERIALIZED VIEW user_category_preferences;
      RAISE NOTICE 'Refreshed user_category_preferences materialized view (non-concurrent)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'user_category_preferences materialized view refresh skipped';
    END;
  END;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_product_scores() TO authenticated, anon;

-- ============================================================
-- 3. CREATE NEW CRON JOB THAT RUNS SQL DIRECTLY
-- ============================================================

-- Schedule the score refresh to run every 15 minutes
-- This runs directly in SQL, no HTTP calls needed
SELECT cron.schedule(
  'refresh-product-scores-every-15min',
  '*/15 * * * *',  -- Every 15 minutes
  $$SELECT refresh_product_scores();$$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Created new cron job: refresh-product-scores-every-15min (runs every 15 minutes)';
END $$;

-- ============================================================
-- 4. RUN IMMEDIATELY TO VERIFY
-- ============================================================

-- Run the function now to verify it works
SELECT refresh_product_scores();

-- ============================================================
-- 5. VERIFY CRON JOBS
-- ============================================================

-- Show all active cron jobs for verification
DO $$
DECLARE
  job_record RECORD;
BEGIN
  RAISE NOTICE '=== Active Cron Jobs ===';
  FOR job_record IN 
    SELECT jobname, schedule, command 
    FROM cron.job 
    WHERE active = true
    ORDER BY jobname
  LOOP
    RAISE NOTICE 'Job: % | Schedule: % | Command: %...', 
      job_record.jobname, 
      job_record.schedule, 
      LEFT(job_record.command, 50);
  END LOOP;
END $$;
