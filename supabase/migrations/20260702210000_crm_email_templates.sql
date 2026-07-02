-- CRM 3.0: saved email templates for the agentic campaign builder.
-- A template captures a liked campaign design (subject + content JSONB incl.
-- agent-authored HTML) so it can be browsed and reused in later campaigns.

CREATE TABLE IF NOT EXISTS crm_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  template_key TEXT NOT NULL DEFAULT 'store_announcement',
  content JSONB NOT NULL,
  source_campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL,
  use_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_crm_email_templates_user
  ON crm_email_templates(user_id, updated_at DESC);

ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_email_templates_owner_all"
  ON crm_email_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
