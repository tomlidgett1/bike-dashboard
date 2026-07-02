-- CRM 2.0: agentic AI campaign builder, audience presets, scheduled automation.

CREATE TABLE IF NOT EXISTS crm_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  brief JSONB,
  audience_rules JSONB,
  audience_count INT,
  audience_sample JSONB,
  products JSONB,
  campaign_content JSONB,
  subject_variants JSONB,
  reasoning TEXT,
  error_message TEXT,
  campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_agent_runs_user_created
  ON crm_agent_runs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_audience_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  audience_rules JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_crm_audience_presets_user
  ON crm_audience_presets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_scheduled_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT,
  preset_id UUID REFERENCES crm_audience_presets(id) ON DELETE SET NULL,
  schedule_type TEXT NOT NULL DEFAULT 'once'
    CHECK (schedule_type IN ('once', 'weekly', 'monthly')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  auto_send BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_agent_run_id UUID REFERENCES crm_agent_runs(id) ON DELETE SET NULL,
  last_campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_scheduled_campaigns_due
  ON crm_scheduled_campaigns(enabled, scheduled_at)
  WHERE enabled = TRUE;

ALTER TABLE crm_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_audience_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_scheduled_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_agent_runs_owner_all"
  ON crm_agent_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "crm_audience_presets_owner_all"
  ON crm_audience_presets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "crm_scheduled_campaigns_owner_all"
  ON crm_scheduled_campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
