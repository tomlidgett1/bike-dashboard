ALTER TABLE public.optimize_background_jobs
  DROP CONSTRAINT IF EXISTS optimize_background_jobs_job_type_check;

ALTER TABLE public.optimize_background_jobs
  ADD CONSTRAINT optimize_background_jobs_job_type_check
  CHECK (job_type IN ('category_image_preload', 'copy_batch'));

ALTER TABLE public.optimize_background_jobs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
