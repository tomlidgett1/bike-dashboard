CREATE TABLE IF NOT EXISTS public.optimize_background_jobs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type        text        NOT NULL CHECK (job_type IN ('category_image_preload')),
  status          text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  category_id     text,
  category_name   text,
  done            integer     NOT NULL DEFAULT 0,
  total           integer     NOT NULL DEFAULT 0,
  failed          integer     NOT NULL DEFAULT 0,
  skipped         integer     NOT NULL DEFAULT 0,
  message         text,
  error_message   text,
  force_reload    boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

ALTER TABLE public.optimize_background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own optimize background jobs"
  ON public.optimize_background_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS optimize_background_jobs_user_status_idx
  ON public.optimize_background_jobs (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS optimize_background_jobs_user_created_idx
  ON public.optimize_background_jobs (user_id, created_at DESC);
