-- CRM email engine: import Lightspeed customer emails, compose template-based
-- campaigns, send from the Yellow Jersey address, and respect opt-outs.
--
-- Templates live in code (src/lib/crm/templates.ts) — campaigns record the
-- template_key + the customised content JSON, so history is fully replayable
-- without a templates table.

-- ============================================================
-- Contacts — one row per (store, normalized email)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Always stored lowercase + trimmed; deduped by the unique index below.
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  lightspeed_customer_id TEXT,
  source TEXT NOT NULL DEFAULT 'lightspeed',
  -- Unsubscribe: the emailed link carries this unguessable token so the public
  -- endpoint can identify the contact without login or an open update API.
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  opted_out_at TIMESTAMPTZ,
  opt_out_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_unsubscribe_token
  ON crm_contacts(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_opted
  ON crm_contacts(user_id, opted_out, created_at DESC);

ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;

-- Store owner manages their own contacts. The public unsubscribe endpoint
-- updates via the service-role client (bypasses RLS) after token lookup.
CREATE POLICY "crm_contacts_owner_all"
  ON crm_contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  template_key TEXT NOT NULL,
  -- The customised template fields (title, body, CTA, hero image, items, footer).
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  sender_email TEXT,
  -- draft → sending → sent | failed. A campaign only leaves draft once, which
  -- is what prevents accidental duplicate sends.
  status TEXT NOT NULL DEFAULT 'draft',
  intended_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_user_created
  ON crm_campaigns(user_id, created_at DESC);

ALTER TABLE crm_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_campaigns_owner_all"
  ON crm_campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Per-recipient send attempts — who was sent what
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Snapshot of the address at send time (contact email can change later).
  email TEXT NOT NULL,
  -- pending → sent | failed | skipped_opted_out | skipped_invalid
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign
  ON crm_campaign_recipients(campaign_id, status);

ALTER TABLE crm_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_campaign_recipients_owner_all"
  ON crm_campaign_recipients FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
