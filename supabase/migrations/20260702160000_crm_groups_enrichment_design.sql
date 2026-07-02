-- CRM v2: Lightspeed enrichment fields, customer groups, design metadata in content JSON.

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS lightspeed_joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_joined
  ON crm_contacts(user_id, lightspeed_joined_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_spend
  ON crm_contacts(user_id, total_spend DESC);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_last_purchase
  ON crm_contacts(user_id, last_purchase_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_sale_count
  ON crm_contacts(user_id, sale_count DESC);

-- Static customer segments
CREATE TABLE IF NOT EXISTS crm_contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS crm_contact_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES crm_contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_group_members_group
  ON crm_contact_group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_crm_contact_group_members_contact
  ON crm_contact_group_members(contact_id);

ALTER TABLE crm_contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_contact_groups_owner_all"
  ON crm_contact_groups FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "crm_contact_group_members_owner_all"
  ON crm_contact_group_members FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
