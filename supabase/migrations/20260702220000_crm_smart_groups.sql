-- CRM smart groups: AI-recommended, rule-backed customer groups that can be
-- refreshed against live Lightspeed data. Manual groups keep rules NULL.

ALTER TABLE crm_contact_groups
  ADD COLUMN IF NOT EXISTS is_smart BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rules JSONB,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai')),
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_contact_groups_user_smart
  ON crm_contact_groups(user_id)
  WHERE is_smart = TRUE;
