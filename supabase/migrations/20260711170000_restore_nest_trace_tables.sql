-- Restore Nest trace tables excluded from the business-portal schema cutover but still
-- referenced by deployed linq-webhook RPCs (get_recent_tool_traces, insert_tool_trace)
-- and direct inserts (turn_traces).

CREATE TABLE IF NOT EXISTS public.tool_traces (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id text NOT NULL,
  message_id bigint,
  engagement_scope text NOT NULL DEFAULT 'nest',
  engagement_brand_key text,
  tool_name text NOT NULL,
  outcome text NOT NULL,
  safe_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_traces_engagement_scope_check CHECK (engagement_scope = ANY (ARRAY['nest'::text, 'brand'::text]))
);

CREATE INDEX IF NOT EXISTS idx_tool_traces_chat_created
  ON public.tool_traces (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_traces_brand_chat_created
  ON public.tool_traces (chat_id, engagement_brand_key, created_at DESC)
  WHERE engagement_scope = 'brand';

ALTER TABLE public.tool_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY tool_traces_deny_client_access
  ON public.tool_traces
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.tool_traces TO service_role;

CREATE TABLE IF NOT EXISTS public.turn_traces (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  turn_id uuid NOT NULL,
  chat_id text NOT NULL,
  sender_handle text,
  user_message text,
  timezone_resolved text,
  route_agent text,
  route_mode text,
  route_confidence numeric,
  route_fast_path boolean,
  route_latency_ms integer,
  route_namespaces jsonb,
  system_prompt_length integer,
  system_prompt_hash text,
  memory_items_loaded integer,
  summaries_loaded integer,
  rag_evidence_blocks integer,
  connected_accounts_count integer,
  history_messages_count integer,
  context_build_latency_ms integer,
  agent_name text,
  model_used text,
  agent_loop_rounds integer,
  agent_loop_latency_ms integer,
  tool_calls jsonb,
  tool_calls_blocked jsonb,
  tool_call_count integer,
  tool_total_latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  response_text text,
  response_length integer,
  total_latency_ms integer,
  system_prompt text,
  initial_messages jsonb,
  available_tool_names jsonb,
  context_sub_timings jsonb,
  round_traces jsonb,
  prompt_compose_ms integer,
  tool_filter_ms integer,
  router_context_ms integer,
  context_path text,
  pending_action_debug jsonb,
  error_message text,
  error_stage text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turn_traces_chat_created
  ON public.turn_traces (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_turn_traces_turn_id
  ON public.turn_traces (turn_id);

ALTER TABLE public.turn_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY turn_traces_deny_client_access
  ON public.turn_traces
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.turn_traces TO service_role;
