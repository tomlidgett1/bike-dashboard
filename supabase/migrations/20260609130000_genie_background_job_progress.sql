ALTER TABLE public.genie_background_jobs
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS progress_phase text,
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS genie_background_jobs_user_active_idx
  ON public.genie_background_jobs (user_id, status, updated_at DESC);
