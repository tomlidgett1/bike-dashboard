-- ============================================================
-- The Domestique — background revenue agent for bike stores
--
-- Nightly loop: detect opportunities from Lightspeed mirrors →
-- score → propose (or auto-execute) plays over CRM email, Nest
-- texts and storefront discounts → record every customer touch →
-- attribute POS revenue back against a holdout baseline.
-- ============================================================

-- ------------------------------------------------------------
-- Per-store agent configuration
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domestique_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  -- suggest = draft only; copilot = propose + one-tap approve; autopilot = per-playbook auto-send
  mode TEXT NOT NULL DEFAULT 'copilot' CHECK (mode IN ('suggest', 'copilot', 'autopilot')),
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  run_hour INTEGER NOT NULL DEFAULT 3 CHECK (run_hour BETWEEN 0 AND 23),
  -- Which playbooks may propose, and which may execute without approval.
  enabled_playbooks TEXT[] NOT NULL DEFAULT '{service_chase,first_service_rescue,vip_winback,dead_stock_mover,consumables_cadence}',
  autopilot_playbooks TEXT[] NOT NULL DEFAULT '{}',
  -- Guardrails
  max_plays_per_day INTEGER NOT NULL DEFAULT 3 CHECK (max_plays_per_day BETWEEN 1 AND 10),
  contact_cooldown_days INTEGER NOT NULL DEFAULT 14 CHECK (contact_cooldown_days BETWEEN 1 AND 90),
  holdout_percent INTEGER NOT NULL DEFAULT 10 CHECK (holdout_percent BETWEEN 0 AND 50),
  attribution_window_days INTEGER NOT NULL DEFAULT 14 CHECK (attribution_window_days BETWEEN 1 AND 60),
  max_sms_per_play INTEGER NOT NULL DEFAULT 25 CHECK (max_sms_per_play BETWEEN 0 AND 200),
  -- Discount guardrails (dead-stock plays)
  max_discount_percent INTEGER NOT NULL DEFAULT 30 CHECK (max_discount_percent BETWEEN 5 AND 70),
  min_margin_floor_percent INTEGER NOT NULL DEFAULT 15 CHECK (min_margin_floor_percent BETWEEN 0 AND 60),
  -- Morning brief over Nest (owner's phone)
  send_brief_via_nest BOOLEAN NOT NULL DEFAULT false,
  brief_phone TEXT,
  last_run_at TIMESTAMPTZ,
  last_brief_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Nightly run log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domestique_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  trigger TEXT NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron', 'manual')),
  detectors_run INTEGER NOT NULL DEFAULT 0,
  opportunities_found INTEGER NOT NULL DEFAULT 0,
  opportunities_proposed INTEGER NOT NULL DEFAULT 0,
  auto_executed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domestique_runs_user ON domestique_runs(user_id, started_at DESC);

-- ------------------------------------------------------------
-- Opportunities (plays) — the agent's proposals with evidence
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domestique_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id UUID REFERENCES domestique_runs(id) ON DELETE SET NULL,
  playbook_key TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  -- Evidence trail: detector metrics, matched customers/products, reasoning.
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The concrete plan: channel payloads (email content, sms body, discounts).
  action_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  customer_count INTEGER NOT NULL DEFAULT 0,
  product_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'approved', 'executing', 'executed', 'skipped', 'failed', 'expired')
  ),
  status_detail TEXT,
  -- Execution results: campaign id, sms sent counts, discounted product ids.
  result JSONB,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domestique_opportunities_user
  ON domestique_opportunities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domestique_opportunities_status
  ON domestique_opportunities(user_id, status);
CREATE INDEX IF NOT EXISTS idx_domestique_opportunities_playbook
  ON domestique_opportunities(user_id, playbook_key, created_at DESC);

-- ------------------------------------------------------------
-- Touches — every customer contact the agent makes (or withholds
-- as holdout). This is the attribution ledger.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domestique_touches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES domestique_opportunities(id) ON DELETE SET NULL,
  playbook_key TEXT NOT NULL,
  contact_id UUID,
  lightspeed_customer_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'holdout')),
  is_holdout BOOLEAN NOT NULL DEFAULT false,
  touched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Attribution (refreshed by the attribution cron inside the window)
  attributed_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  attributed_sale_count INTEGER NOT NULL DEFAULT 0,
  last_attributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domestique_touches_user
  ON domestique_touches(user_id, touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_domestique_touches_contact
  ON domestique_touches(user_id, contact_id, touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_domestique_touches_customer
  ON domestique_touches(user_id, lightspeed_customer_id);
CREATE INDEX IF NOT EXISTS idx_domestique_touches_opportunity
  ON domestique_touches(opportunity_id);

-- ------------------------------------------------------------
-- Weekly receipts — the honest revenue statement
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domestique_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  touches_count INTEGER NOT NULL DEFAULT 0,
  holdout_count INTEGER NOT NULL DEFAULT 0,
  plays_executed INTEGER NOT NULL DEFAULT 0,
  attributed_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  holdout_baseline NUMERIC(12, 2) NOT NULL DEFAULT 0,
  incremental_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  breakdown JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_domestique_receipts_user
  ON domestique_receipts(user_id, week_start DESC);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE domestique_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE domestique_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE domestique_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE domestique_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE domestique_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domestique_config_owner_all" ON domestique_config;
CREATE POLICY "domestique_config_owner_all"
  ON domestique_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "domestique_config_service_all" ON domestique_config;
CREATE POLICY "domestique_config_service_all"
  ON domestique_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "domestique_runs_owner_all" ON domestique_runs;
CREATE POLICY "domestique_runs_owner_all"
  ON domestique_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "domestique_runs_service_all" ON domestique_runs;
CREATE POLICY "domestique_runs_service_all"
  ON domestique_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "domestique_opportunities_owner_all" ON domestique_opportunities;
CREATE POLICY "domestique_opportunities_owner_all"
  ON domestique_opportunities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "domestique_opportunities_service_all" ON domestique_opportunities;
CREATE POLICY "domestique_opportunities_service_all"
  ON domestique_opportunities FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "domestique_touches_owner_all" ON domestique_touches;
CREATE POLICY "domestique_touches_owner_all"
  ON domestique_touches FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "domestique_touches_service_all" ON domestique_touches;
CREATE POLICY "domestique_touches_service_all"
  ON domestique_touches FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "domestique_receipts_owner_all" ON domestique_receipts;
CREATE POLICY "domestique_receipts_owner_all"
  ON domestique_receipts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "domestique_receipts_service_all" ON domestique_receipts;
CREATE POLICY "domestique_receipts_service_all"
  ON domestique_receipts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_domestique_config_updated_at ON domestique_config;
CREATE TRIGGER update_domestique_config_updated_at
  BEFORE UPDATE ON domestique_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_domestique_opportunities_updated_at ON domestique_opportunities;
CREATE TRIGGER update_domestique_opportunities_updated_at
  BEFORE UPDATE ON domestique_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE domestique_config IS 'Per-store configuration for the Domestique background revenue agent';
COMMENT ON TABLE domestique_runs IS 'Nightly Domestique run log';
COMMENT ON TABLE domestique_opportunities IS 'Agent-proposed plays with evidence, action plan and execution result';
COMMENT ON TABLE domestique_touches IS 'Every customer touch (or holdout) — the revenue attribution ledger';
COMMENT ON TABLE domestique_receipts IS 'Weekly attributed-revenue receipts net of holdout baseline';
