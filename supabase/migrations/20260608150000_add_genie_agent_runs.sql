CREATE TABLE IF NOT EXISTS public.genie_agent_runs (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id            uuid        NOT NULL UNIQUE,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route                 text,
  status                text        NOT NULL CHECK (status IN ('completed', 'error', 'cancelled')),
  orchestration_source  text        CHECK (orchestration_source IN ('deterministic', 'model')),
  router_invoked        boolean     NOT NULL DEFAULT false,
  planner_used          boolean     NOT NULL DEFAULT false,
  executor_model        text,
  first_text_ms         integer,
  total_ms              integer     NOT NULL,
  tool_call_count       integer     NOT NULL DEFAULT 0,
  tool_call_names       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  trace_id              text,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.genie_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own genie agent runs"
  ON public.genie_agent_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS genie_agent_runs_user_created_idx
  ON public.genie_agent_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS genie_agent_runs_route_created_idx
  ON public.genie_agent_runs (route, created_at DESC);

CREATE INDEX IF NOT EXISTS genie_agent_runs_status_created_idx
  ON public.genie_agent_runs (status, created_at DESC);
