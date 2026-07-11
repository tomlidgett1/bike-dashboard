-- ============================================================
-- Lifecycle CRM machine — autonomous customer lifecycle engine
--
-- Continuous loop per store: classify every CRM contact into a
-- lifecycle stage (RFM + engagement over the Lightspeed mirror)
-- → record transitions → per-stage programs plan personalised
-- email touches (frequency-capped, holdout-split) → execute over
-- the existing CRM campaign rails → attribute POS revenue back
-- against the holdout baseline → learn and adjust.
-- ============================================================

-- ------------------------------------------------------------
-- Per-store engine settings
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  -- One marketing email per contact per N days across ALL systems
  -- (lifecycle + manual campaigns + Domestique).
  frequency_cap_days INTEGER NOT NULL DEFAULT 7 CHECK (frequency_cap_days BETWEEN 1 AND 60),
  holdout_percent INTEGER NOT NULL DEFAULT 10 CHECK (holdout_percent BETWEEN 0 AND 50),
  attribution_window_days INTEGER NOT NULL DEFAULT 21 CHECK (attribution_window_days BETWEEN 1 AND 90),
  -- Stage boundary overrides; empty = auto-computed from store data.
  thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Learned adjustments (preferred send hour, cadence tweaks…).
  learned JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_classified_at TIMESTAMPTZ,
  last_planned_at TIMESTAMPTZ,
  last_attributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Current lifecycle state per contact
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (
    stage IN ('prospect', 'new', 'active', 'vip', 'at_risk', 'dormant', 'churned', 'reactivated')
  ),
  previous_stage TEXT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Classification snapshot: recency_days, frequency, monetary, aov, opens…
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_states_stage
  ON crm_lifecycle_states(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_states_entered
  ON crm_lifecycle_states(user_id, stage, entered_at);

-- ------------------------------------------------------------
-- Transition log — every stage movement, the audit trail
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_transitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_transitions_user
  ON crm_lifecycle_transitions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_transitions_contact
  ON crm_lifecycle_transitions(user_id, contact_id, occurred_at DESC);

-- ------------------------------------------------------------
-- Programs — one automated play per lifecycle stage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  stage TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- review = actions wait for approval; auto = send without approval.
  mode TEXT NOT NULL DEFAULT 'review' CHECK (mode IN ('review', 'auto')),
  -- Days after entering the stage before the first touch.
  entry_delay_days INTEGER NOT NULL DEFAULT 0 CHECK (entry_delay_days BETWEEN 0 AND 90),
  -- Days before the same program may touch the same contact again.
  cooldown_days INTEGER NOT NULL DEFAULT 60 CHECK (cooldown_days BETWEEN 7 AND 365),
  offer_policy TEXT NOT NULL DEFAULT 'none' CHECK (offer_policy IN ('none', 'soft', 'winback')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_programs_user
  ON crm_lifecycle_programs(user_id, stage);

-- ------------------------------------------------------------
-- Actions — each planned/sent program batch, with reasoning
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID REFERENCES crm_lifecycle_programs(id) ON DELETE SET NULL,
  program_key TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_approval' CHECK (
    status IN ('awaiting_approval', 'approved', 'executing', 'sent', 'skipped', 'expired', 'failed')
  ),
  status_detail TEXT,
  subject TEXT NOT NULL,
  -- Why this action exists, shop-facing ("32 customers entered At risk…").
  reasoning TEXT NOT NULL DEFAULT '',
  -- Composed email + target contact ids + holdout split.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_count INTEGER NOT NULL DEFAULT 0,
  holdout_count INTEGER NOT NULL DEFAULT 0,
  campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_actions_user
  ON crm_lifecycle_actions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_actions_status
  ON crm_lifecycle_actions(user_id, status);

-- ------------------------------------------------------------
-- Touches — attribution ledger (mirrors domestique_touches)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_touches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id UUID REFERENCES crm_lifecycle_actions(id) ON DELETE SET NULL,
  program_key TEXT NOT NULL,
  -- Stage the contact was in when touched — powers reactivation stats.
  stage_at_touch TEXT NOT NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  lightspeed_customer_id TEXT,
  is_holdout BOOLEAN NOT NULL DEFAULT false,
  touched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attributed_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  attributed_sale_count INTEGER NOT NULL DEFAULT 0,
  unsubscribed BOOLEAN NOT NULL DEFAULT false,
  reactivated BOOLEAN NOT NULL DEFAULT false,
  last_attributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_touches_user
  ON crm_lifecycle_touches(user_id, touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_touches_contact
  ON crm_lifecycle_touches(user_id, contact_id, touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_touches_action
  ON crm_lifecycle_touches(action_id);

-- ------------------------------------------------------------
-- Daily snapshots — stage distribution over time (trend charts)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  stage_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_daily_user
  ON crm_lifecycle_daily(user_id, day DESC);

-- ------------------------------------------------------------
-- Insights — what the engine learned from results
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lifecycle_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_key TEXT,
  kind TEXT NOT NULL DEFAULT 'lesson' CHECK (kind IN ('lesson', 'timing', 'cadence', 'alert')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_insights_user
  ON crm_lifecycle_insights(user_id, status, created_at DESC);

-- ------------------------------------------------------------
-- RLS — owner + service role, matching the Domestique pattern
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_lifecycle_settings',
    'crm_lifecycle_states',
    'crm_lifecycle_transitions',
    'crm_lifecycle_programs',
    'crm_lifecycle_actions',
    'crm_lifecycle_touches',
    'crm_lifecycle_daily',
    'crm_lifecycle_insights'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_owner_all" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_owner_all" ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS "%s_service_all" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_service_all" ON %I FOR ALL USING (auth.jwt() ->> ''role'' = ''service_role'') WITH CHECK (auth.jwt() ->> ''role'' = ''service_role'')',
      t, t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_crm_lifecycle_settings_updated_at ON crm_lifecycle_settings;
CREATE TRIGGER update_crm_lifecycle_settings_updated_at
  BEFORE UPDATE ON crm_lifecycle_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_lifecycle_states_updated_at ON crm_lifecycle_states;
CREATE TRIGGER update_crm_lifecycle_states_updated_at
  BEFORE UPDATE ON crm_lifecycle_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_lifecycle_programs_updated_at ON crm_lifecycle_programs;
CREATE TRIGGER update_crm_lifecycle_programs_updated_at
  BEFORE UPDATE ON crm_lifecycle_programs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_lifecycle_actions_updated_at ON crm_lifecycle_actions;
CREATE TRIGGER update_crm_lifecycle_actions_updated_at
  BEFORE UPDATE ON crm_lifecycle_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE crm_lifecycle_settings IS 'Per-store settings for the autonomous lifecycle CRM engine';
COMMENT ON TABLE crm_lifecycle_states IS 'Current lifecycle stage per CRM contact';
COMMENT ON TABLE crm_lifecycle_transitions IS 'Every lifecycle stage movement';
COMMENT ON TABLE crm_lifecycle_programs IS 'Automated per-stage outreach programs';
COMMENT ON TABLE crm_lifecycle_actions IS 'Planned/sent program batches with reasoning and payload';
COMMENT ON TABLE crm_lifecycle_touches IS 'Per-contact touch ledger (incl. holdouts) for attribution';
COMMENT ON TABLE crm_lifecycle_daily IS 'Daily stage distribution snapshots';
COMMENT ON TABLE crm_lifecycle_insights IS 'Lessons the engine learned from campaign results';
