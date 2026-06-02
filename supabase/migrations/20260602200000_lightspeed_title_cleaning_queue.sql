-- ============================================================
-- Lightspeed Title Cleaning Queue
-- ============================================================
-- Durable queue for AI-cleaning Lightspeed product titles. In Lightspeed,
-- Item.description is the product title we write back after cleaning.

CREATE TABLE IF NOT EXISTS lightspeed_title_cleaning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  total_items INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  processing_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lightspeed_title_cleaning_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES lightspeed_title_cleaning_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lightspeed_item_id TEXT NOT NULL,
  original_description TEXT,
  cleaned_description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lightspeed_title_cleaning_queue_job_item_key UNIQUE (job_id, lightspeed_item_id)
);

CREATE INDEX IF NOT EXISTS idx_lightspeed_title_cleaning_jobs_user_created
  ON lightspeed_title_cleaning_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lightspeed_title_cleaning_jobs_status
  ON lightspeed_title_cleaning_jobs(status, created_at ASC)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS idx_lightspeed_title_cleaning_queue_pending
  ON lightspeed_title_cleaning_queue(status, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lightspeed_title_cleaning_queue_processing
  ON lightspeed_title_cleaning_queue(status, processing_started_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_lightspeed_title_cleaning_queue_job
  ON lightspeed_title_cleaning_queue(job_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_lightspeed_title_cleaning_queue_user_item
  ON lightspeed_title_cleaning_queue(user_id, lightspeed_item_id, created_at DESC);

ALTER TABLE lightspeed_title_cleaning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightspeed_title_cleaning_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own title cleaning jobs"
  ON lightspeed_title_cleaning_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own title cleaning queue items"
  ON lightspeed_title_cleaning_queue FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own title cleaning jobs"
  ON lightspeed_title_cleaning_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can create own title cleaning queue items"
  ON lightspeed_title_cleaning_queue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_lightspeed_title_cleaning_jobs_updated_at
  ON lightspeed_title_cleaning_jobs;

CREATE TRIGGER update_lightspeed_title_cleaning_jobs_updated_at
  BEFORE UPDATE ON lightspeed_title_cleaning_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lightspeed_title_cleaning_queue_updated_at
  ON lightspeed_title_cleaning_queue;

CREATE TRIGGER update_lightspeed_title_cleaning_queue_updated_at
  BEFORE UPDATE ON lightspeed_title_cleaning_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION refresh_lightspeed_title_cleaning_job(p_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_pending INTEGER;
  v_processing INTEGER;
  v_completed INTEGER;
  v_failed INTEGER;
  v_status TEXT;
BEGIN
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'processing')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'failed')::INTEGER
  INTO v_total, v_pending, v_processing, v_completed, v_failed
  FROM lightspeed_title_cleaning_queue
  WHERE job_id = p_job_id;

  IF v_total = 0 THEN
    v_status := 'failed';
  ELSIF v_processing > 0 THEN
    v_status := 'processing';
  ELSIF v_pending > 0 AND v_completed = 0 AND v_failed = 0 THEN
    v_status := 'queued';
  ELSIF v_pending > 0 THEN
    v_status := 'processing';
  ELSIF v_failed = 0 THEN
    v_status := 'completed';
  ELSIF v_completed = 0 THEN
    v_status := 'failed';
  ELSE
    v_status := 'completed_with_errors';
  END IF;

  UPDATE lightspeed_title_cleaning_jobs
  SET
    status = v_status,
    total_items = v_total,
    pending_count = v_pending,
    processing_count = v_processing,
    completed_count = v_completed,
    failed_count = v_failed,
    started_at = CASE
      WHEN v_status <> 'queued' THEN COALESCE(started_at, NOW())
      ELSE started_at
    END,
    completed_at = CASE
      WHEN v_status IN ('completed', 'completed_with_errors', 'failed', 'cancelled')
        THEN COALESCE(completed_at, NOW())
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION claim_lightspeed_title_cleaning_items(
  p_batch_size INTEGER DEFAULT 2,
  p_max_attempts INTEGER DEFAULT 3,
  p_stale_after INTERVAL DEFAULT INTERVAL '15 minutes'
)
RETURNS SETOF lightspeed_title_cleaning_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale_job_id UUID;
BEGIN
  FOR v_stale_job_id IN
    WITH stale AS (
      UPDATE lightspeed_title_cleaning_queue
      SET
        status = CASE WHEN attempts >= p_max_attempts THEN 'failed' ELSE 'pending' END,
        error_message = CASE
          WHEN attempts >= p_max_attempts THEN COALESCE(error_message, 'Processing timed out')
          ELSE error_message
        END,
        processing_started_at = NULL,
        processed_at = CASE WHEN attempts >= p_max_attempts THEN NOW() ELSE processed_at END,
        updated_at = NOW()
      WHERE status = 'processing'
        AND processing_started_at < NOW() - p_stale_after
      RETURNING job_id
    )
    SELECT DISTINCT job_id FROM stale
  LOOP
    PERFORM refresh_lightspeed_title_cleaning_job(v_stale_job_id);
  END LOOP;

  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM lightspeed_title_cleaning_queue
    WHERE status = 'pending'
      AND attempts < p_max_attempts
    ORDER BY created_at ASC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE lightspeed_title_cleaning_queue q
    SET
      status = 'processing',
      attempts = q.attempts + 1,
      processing_started_at = NOW(),
      error_message = NULL,
      updated_at = NOW()
    WHERE q.id IN (SELECT id FROM claimed)
    RETURNING q.*
  ),
  refreshed AS (
    SELECT refresh_lightspeed_title_cleaning_job(job_id)
    FROM (SELECT DISTINCT job_id FROM updated) jobs
  ),
  refresh_count AS (
    SELECT COUNT(*) FROM refreshed
  )
  SELECT updated.*
  FROM updated
  LEFT JOIN refresh_count ON true;
END;
$$;

CREATE OR REPLACE FUNCTION complete_lightspeed_title_cleaning_item(
  p_queue_id UUID,
  p_cleaned_description TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  UPDATE lightspeed_title_cleaning_queue
  SET
    status = 'completed',
    cleaned_description = p_cleaned_description,
    error_message = NULL,
    processing_started_at = NULL,
    processed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_queue_id
  RETURNING job_id INTO v_job_id;

  IF v_job_id IS NOT NULL THEN
    PERFORM refresh_lightspeed_title_cleaning_job(v_job_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fail_lightspeed_title_cleaning_item(
  p_queue_id UUID,
  p_error_message TEXT,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
  v_attempts INTEGER;
BEGIN
  SELECT job_id, attempts
  INTO v_job_id, v_attempts
  FROM lightspeed_title_cleaning_queue
  WHERE id = p_queue_id;

  UPDATE lightspeed_title_cleaning_queue
  SET
    status = CASE WHEN v_attempts >= p_max_attempts THEN 'failed' ELSE 'pending' END,
    error_message = p_error_message,
    processing_started_at = NULL,
    processed_at = CASE WHEN v_attempts >= p_max_attempts THEN NOW() ELSE processed_at END,
    updated_at = NOW()
  WHERE id = p_queue_id;

  IF v_job_id IS NOT NULL THEN
    PERFORM refresh_lightspeed_title_cleaning_job(v_job_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_lightspeed_title_cleaning_job(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION claim_lightspeed_title_cleaning_items(INTEGER, INTEGER, INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION complete_lightspeed_title_cleaning_item(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fail_lightspeed_title_cleaning_item(UUID, TEXT, INTEGER) TO service_role;

COMMENT ON TABLE lightspeed_title_cleaning_jobs IS 'Durable title-cleaning jobs created from the Lightspeed inventory grid';
COMMENT ON TABLE lightspeed_title_cleaning_queue IS 'Durable per-item queue for AI-cleaning Lightspeed Item.description values';
