-- CRM campaign analytics: Resend delivery/open/click tracking via webhooks.

ALTER TABLE crm_campaign_recipients
  ADD COLUMN IF NOT EXISTS resend_email_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_resend_email_id
  ON crm_campaign_recipients(resend_email_id)
  WHERE resend_email_id IS NOT NULL;

-- Denormalised counters on campaigns for fast list views.
ALTER TABLE crm_campaigns
  ADD COLUMN IF NOT EXISTS delivered_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounced_count INT NOT NULL DEFAULT 0;
