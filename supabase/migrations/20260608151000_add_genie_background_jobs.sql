CREATE TABLE IF NOT EXISTS public.genie_background_jobs (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id     uuid        REFERENCES public.genie_conversations(id) ON DELETE SET NULL,
  route               text,
  status              text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  prompt              text        NOT NULL,
  messages            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  openai_response_id  text,
  result              jsonb,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  completed_at        timestamptz
);

ALTER TABLE public.genie_background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own genie background jobs"
  ON public.genie_background_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS genie_background_jobs_user_created_idx
  ON public.genie_background_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS genie_background_jobs_status_idx
  ON public.genie_background_jobs (status, updated_at DESC);
