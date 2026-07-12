-- Yellow Jersey bike-store CRM foundation.
--
-- Adds a store/team boundary, a canonical rider record, deterministic identity
-- aliases, channel-purpose consent, bikes, mirrored work orders, a common
-- timeline, ranked tasks, governed agent actions, programme enrolments,
-- performance telemetry and sync watermarks.

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  extension_schema TEXT;
BEGIN
  SELECT namespace.nspname
  INTO extension_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';

  IF extension_schema IS NULL THEN
    CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
  ELSIF extension_schema <> 'extensions' THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION crm_normalize_phone(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NULLIF(REGEXP_REPLACE(COALESCE(value, ''), '\D', '', 'g'), '') IS NULL THEN NULL
    WHEN REGEXP_REPLACE(value, '\D', '', 'g') LIKE '61%'
      AND LENGTH(REGEXP_REPLACE(value, '\D', '', 'g')) >= 11
      THEN '0' || SUBSTRING(REGEXP_REPLACE(value, '\D', '', 'g') FROM 3)
    ELSE REGEXP_REPLACE(value, '\D', '', 'g')
  END;
$$;

GRANT EXECUTE ON FUNCTION crm_normalize_phone(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Store and team boundary
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Bike store',
  crm_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'sales', 'service', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_store_memberships_user_active
  ON store_memberships(user_id, store_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION private.is_store_member(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_memberships membership
    WHERE membership.store_id = p_store_id
      AND membership.user_id = auth.uid()
      AND membership.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_memberships membership
    WHERE membership.store_id = p_store_id
      AND membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_store_member_for_owner(p_owner_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores store
    JOIN public.store_memberships membership ON membership.store_id = store.id
    WHERE store.owner_user_id = p_owner_user_id
      AND membership.user_id = auth.uid()
      AND membership.status = 'active'
  );
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_store_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_store(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_store_member_for_owner(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Canonical customer graph
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS store_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Owner key retained while existing source tables remain owner-scoped.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Customer',
  first_name TEXT,
  last_name TEXT,
  primary_email TEXT,
  primary_phone TEXT,
  lightspeed_customer_id TEXT,
  lifecycle_stage TEXT CHECK (
    lifecycle_stage IS NULL OR lifecycle_stage IN
      ('prospect', 'new', 'active', 'vip', 'at_risk', 'dormant', 'churned', 'reactivated')
  ),
  total_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sale_count INTEGER NOT NULL DEFAULT 0,
  average_sale NUMERIC(14, 2) NOT NULL DEFAULT 0,
  last_purchase_at TIMESTAMPTZ,
  last_interaction_at TIMESTAMPTZ,
  next_service_due_at TIMESTAMPTZ,
  data_freshness_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'lightspeed',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'merged')),
  merged_into_customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_customers_store_lightspeed
  ON store_customers(store_id, lightspeed_customer_id)
  WHERE lightspeed_customer_id IS NOT NULL AND status <> 'merged';
CREATE INDEX IF NOT EXISTS idx_store_customers_store_recent
  ON store_customers(store_id, updated_at DESC, id DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_store_customers_store_stage
  ON store_customers(store_id, lifecycle_stage, updated_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_store_customers_store_spend
  ON store_customers(store_id, total_spend DESC, id DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_store_customers_search_name_trgm
  ON store_customers USING GIN (lower(display_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_store_customers_search_email_trgm
  ON store_customers USING GIN (lower(COALESCE(primary_email, '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_store_customers_search_phone_trgm
  ON store_customers USING GIN (COALESCE(primary_phone, '') extensions.gin_trgm_ops);

CREATE TABLE IF NOT EXISTS store_customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  identity_type TEXT NOT NULL CHECK (
    identity_type IN ('lightspeed_customer_id', 'email', 'phone', 'nest_handle', 'gmail_sender', 'instagram_thread')
  ),
  normalized_value TEXT NOT NULL,
  display_value TEXT,
  source TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'observed' CHECK (
    verification_status IN ('observed', 'verified', 'disputed')
  ),
  match_confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000 CHECK (
    match_confidence >= 0 AND match_confidence <= 1
  ),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, identity_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_store_customer_identities_customer
  ON store_customer_identities(store_id, customer_id, identity_type);
CREATE INDEX IF NOT EXISTS idx_store_customer_identities_lookup
  ON store_customer_identities(store_id, normalized_value);

CREATE TABLE IF NOT EXISTS store_customer_merge_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  left_customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  right_customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'awaiting_approval' CHECK (
    status IN ('awaiting_approval', 'approved', 'rejected', 'expired')
  ),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (left_customer_id <> right_customer_id),
  UNIQUE (store_id, id),
  UNIQUE (store_id, left_customer_id, right_customer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_customer_merge_proposals_unordered
  ON store_customer_merge_proposals(
    store_id,
    LEAST(left_customer_id, right_customer_id),
    GREATEST(left_customer_id, right_customer_id)
  );

CREATE TABLE IF NOT EXISTS store_customer_merge_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  retained_customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE RESTRICT,
  merged_customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE RESTRICT,
  proposal_id UUID REFERENCES store_customer_merge_proposals(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL,
  merged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS store_customer_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'voice', 'push')),
  purpose TEXT NOT NULL CHECK (purpose IN ('marketing', 'service', 'transactional', 'community')),
  status TEXT NOT NULL CHECK (status IN ('granted', 'denied', 'withdrawn', 'unknown')),
  lawful_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (
    lawful_basis IN ('express', 'inferred', 'contract', 'legitimate_service', 'unknown')
  ),
  source TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, customer_id, channel, purpose)
);

CREATE INDEX IF NOT EXISTS idx_store_customer_consents_eligibility
  ON store_customer_consents(store_id, channel, purpose, status, customer_id);

CREATE TABLE IF NOT EXISTS store_customer_bikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  lightspeed_serialized_id TEXT,
  serial_number TEXT,
  brand TEXT,
  model TEXT,
  model_year INTEGER,
  colour TEXT,
  category TEXT,
  is_ebike BOOLEAN NOT NULL DEFAULT FALSE,
  ebike_system TEXT,
  battery_serial TEXT,
  warranty_expires_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ,
  last_service_at TIMESTAMPTZ,
  next_service_due_at TIMESTAMPTZ,
  service_interval_days INTEGER,
  fit_notes TEXT,
  component_notes TEXT,
  source TEXT NOT NULL DEFAULT 'lightspeed',
  source_confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000 CHECK (
    source_confidence >= 0 AND source_confidence <= 1
  ),
  data_freshness_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_customer_bikes_serialized
  ON store_customer_bikes(store_id, lightspeed_serialized_id)
  WHERE lightspeed_serialized_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_customer_bikes_customer
  ON store_customer_bikes(store_id, customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_customer_bikes_service_due
  ON store_customer_bikes(store_id, next_service_due_at, customer_id)
  WHERE next_service_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_customer_bikes_serial_trgm
  ON store_customer_bikes USING GIN (lower(COALESCE(serial_number, '')) extensions.gin_trgm_ops);

CREATE TABLE IF NOT EXISTS store_customer_workorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL,
  bike_id UUID REFERENCES store_customer_bikes(id) ON DELETE SET NULL,
  lightspeed_workorder_id TEXT NOT NULL,
  workorder_number TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  status_label TEXT,
  title TEXT NOT NULL DEFAULT 'Workshop job',
  description TEXT,
  estimate_cents INTEGER,
  total_cents INTEGER,
  promised_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  data_freshness_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, lightspeed_workorder_id),
  UNIQUE (store_id, id)
);

CREATE INDEX IF NOT EXISTS idx_store_customer_workorders_customer
  ON store_customer_workorders(store_id, customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_customer_workorders_status
  ON store_customer_workorders(store_id, status, promised_at);

-- ---------------------------------------------------------------------------
-- Common timeline, next-best actions and governed agents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS store_customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  channel TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('customer', 'staff', 'agent', 'system')),
  actor_id TEXT,
  direction TEXT CHECK (direction IS NULL OR direction IN ('inbound', 'outbound', 'internal')),
  match_confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000 CHECK (
    match_confidence >= 0 AND match_confidence <= 1
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, source_type, source_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_store_customer_events_timeline
  ON store_customer_events(store_id, customer_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_store_customer_events_store_recent
  ON store_customer_events(store_id, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS store_customer_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES store_customers(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'in_progress', 'completed', 'dismissed', 'snoozed', 'cancelled')
  ),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  expected_value NUMERIC(12, 2),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  due_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_customer_tasks_today
  ON store_customer_tasks(store_id, status, priority DESC, due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_customer_tasks_customer
  ON store_customer_tasks(store_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS store_agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL,
  agent_key TEXT NOT NULL,
  programme_key TEXT,
  dedupe_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  action_type TEXT NOT NULL,
  channel TEXT,
  risk_tier TEXT NOT NULL DEFAULT 'approval' CHECK (
    risk_tier IN ('autonomous', 'approval', 'strict')
  ),
  status TEXT NOT NULL DEFAULT 'awaiting_approval' CHECK (
    status IN (
      'draft', 'awaiting_approval', 'approved', 'executing', 'completed',
      'dismissed', 'snoozed', 'failed', 'expired', 'cancelled'
    )
  ),
  title TEXT NOT NULL,
  reasoning TEXT NOT NULL DEFAULT '',
  supporting_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash TEXT,
  expected_value NUMERIC(12, 2),
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  policy_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  agent_version TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_agent_actions_dedupe
  ON store_agent_actions(store_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_store_agent_actions_queue
  ON store_agent_actions(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_agent_actions_customer
  ON store_agent_actions(store_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS store_agent_action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES store_agent_actions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT,
  payload_hash TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_agent_action_audit_action
  ON store_agent_action_audit(store_id, action_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS store_agent_trust_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  programme_key TEXT,
  action_type TEXT NOT NULL,
  channel TEXT,
  parameter_constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_recipients INTEGER,
  daily_limit INTEGER,
  granted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_store_agent_trust_grants_active
  ON store_agent_trust_grants(store_id, agent_key, programme_key, action_type, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS store_customer_programme_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  bike_id UUID REFERENCES store_customer_bikes(id) ON DELETE CASCADE,
  programme_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  next_action_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, customer_id, programme_key, bike_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_customer_programme_without_bike
  ON store_customer_programme_enrolments(store_id, customer_id, programme_key)
  WHERE bike_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_store_customer_programme_due
  ON store_customer_programme_enrolments(store_id, status, next_action_at)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Community and customer-facing "My Garage"
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS store_community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('group_ride', 'clinic', 'fit_session', 'community', 'other')),
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, id)
);

CREATE INDEX IF NOT EXISTS idx_store_community_events_upcoming
  ON store_community_events(store_id, starts_at)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS store_community_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES store_community_events(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled', 'no_show')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,
  UNIQUE (event_id, customer_id)
);

CREATE TABLE IF NOT EXISTS store_loyalty_programmes (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  programme_name TEXT NOT NULL DEFAULT 'Rider rewards',
  points_per_dollar NUMERIC(8, 3) NOT NULL DEFAULT 1 CHECK (points_per_dollar >= 0),
  service_multiplier NUMERIC(8, 3) NOT NULL DEFAULT 1.5 CHECK (service_multiplier >= 0),
  points_expiry_days INTEGER CHECK (points_expiry_days IS NULL OR points_expiry_days BETWEEN 30 AND 3650),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('purchase', 'service', 'community', 'referral', 'redeem', 'adjustment', 'expiry')),
  points INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_loyalty_ledger_customer
  ON store_loyalty_ledger(store_id, customer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_loyalty_ledger_source
  ON store_loyalty_ledger(store_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS store_customer_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT[] NOT NULL DEFAULT '{profile,bikes,workorders,consent}',
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite foreign keys make store ownership part of referential integrity.
-- A valid UUID from another store must never be linkable to the current row.
ALTER TABLE store_customers
  ADD CONSTRAINT store_customers_merged_same_store_fk
  FOREIGN KEY (store_id, merged_into_customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE SET NULL (merged_into_customer_id);
ALTER TABLE store_customer_identities
  ADD CONSTRAINT store_customer_identities_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_customer_merge_proposals
  ADD CONSTRAINT store_customer_merge_left_same_store_fk
  FOREIGN KEY (store_id, left_customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT store_customer_merge_right_same_store_fk
  FOREIGN KEY (store_id, right_customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_customer_merge_audit
  ADD CONSTRAINT store_customer_merge_audit_retained_same_store_fk
  FOREIGN KEY (store_id, retained_customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT store_customer_merge_audit_merged_same_store_fk
  FOREIGN KEY (store_id, merged_customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT store_customer_merge_audit_proposal_same_store_fk
  FOREIGN KEY (store_id, proposal_id)
  REFERENCES store_customer_merge_proposals(store_id, id) ON DELETE SET NULL (proposal_id);
ALTER TABLE store_customer_consents
  ADD CONSTRAINT store_customer_consents_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_customer_bikes
  ADD CONSTRAINT store_customer_bikes_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_customer_workorders
  ADD CONSTRAINT store_customer_workorders_customer_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE SET NULL (customer_id),
  ADD CONSTRAINT store_customer_workorders_bike_same_store_fk
  FOREIGN KEY (store_id, bike_id)
  REFERENCES store_customer_bikes(store_id, id) ON DELETE SET NULL (bike_id);
ALTER TABLE store_customer_events
  ADD CONSTRAINT store_customer_events_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_customer_tasks
  ADD CONSTRAINT store_customer_tasks_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_agent_actions
  ADD CONSTRAINT store_agent_actions_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE SET NULL (customer_id);
ALTER TABLE store_agent_action_audit
  ADD CONSTRAINT store_agent_action_audit_same_store_fk
  FOREIGN KEY (store_id, action_id)
  REFERENCES store_agent_actions(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_customer_programme_enrolments
  ADD CONSTRAINT store_programme_customer_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT store_programme_bike_same_store_fk
  FOREIGN KEY (store_id, bike_id)
  REFERENCES store_customer_bikes(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_community_attendance
  ADD CONSTRAINT store_community_event_same_store_fk
  FOREIGN KEY (store_id, event_id)
  REFERENCES store_community_events(store_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT store_community_customer_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_loyalty_ledger
  ADD CONSTRAINT store_loyalty_customer_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;
ALTER TABLE store_customer_portal_tokens
  ADD CONSTRAINT store_customer_portal_same_store_fk
  FOREIGN KEY (store_id, customer_id)
  REFERENCES store_customers(store_id, id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Telemetry and source freshness
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS store_crm_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('lightspeed_customers', 'lightspeed_workorders', 'lightspeed_bikes', 'timeline')),
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'completed', 'failed')),
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  last_successful_at TIMESTAMPTZ,
  last_error TEXT,
  records_processed INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, source)
);

CREATE TABLE IF NOT EXISTS store_crm_performance_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (
    metric IN (
      'LCP', 'INP', 'CLS', 'route', 'api', 'search',
      'customer_summary', 'timeline', 'today', 'agent_first_token', 'agent_action'
    )
  ),
  value_ms NUMERIC(12, 3) NOT NULL CHECK (value_ms >= 0),
  rating TEXT CHECK (rating IS NULL OR rating IN ('good', 'needs-improvement', 'poor')),
  route TEXT,
  operation TEXT,
  navigation_type TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_crm_performance_recent
  ON store_crm_performance_events(store_id, metric, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- Bridges from existing production systems
-- ---------------------------------------------------------------------------

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;
ALTER TABLE store_customer_inquiries
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;
ALTER TABLE store_nest_conversations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;
ALTER TABLE crm_lifecycle_touches
  ADD COLUMN IF NOT EXISTS store_customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;
ALTER TABLE domestique_touches
  ADD COLUMN IF NOT EXISTS store_customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;
ALTER TABLE store_payment_requests
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;
ALTER TABLE store_customer_credits
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_customer_id ON crm_contacts(user_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_store_customer_inquiries_customer_id
  ON store_customer_inquiries(user_id, customer_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_nest_conversations_customer_id
  ON store_nest_conversations(user_id, customer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_lifecycle_touches_store_customer
  ON crm_lifecycle_touches(user_id, store_customer_id, touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_domestique_touches_store_customer
  ON domestique_touches(user_id, store_customer_id, touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_payment_requests_customer
  ON store_payment_requests(store_user_id, customer_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Owner/store/customer backfill
-- ---------------------------------------------------------------------------

INSERT INTO stores (owner_user_id, name)
SELECT
  profile.user_id,
  COALESCE(NULLIF(BTRIM(profile.business_name), ''), 'Bike store')
FROM users profile
JOIN auth.users auth_account ON auth_account.id = profile.user_id
WHERE profile.account_type = 'bicycle_store'
  AND profile.bicycle_store IS TRUE
  AND COALESCE(
    auth_account.raw_app_meta_data ->> 'bicycle_store_verified',
    'false'
  ) = 'true'
ON CONFLICT (owner_user_id) DO UPDATE
  SET name = EXCLUDED.name;

INSERT INTO store_memberships (store_id, user_id, role, status)
SELECT store.id, store.owner_user_id, 'owner', 'active'
FROM stores store
ON CONFLICT (store_id, user_id) DO UPDATE
  SET role = 'owner', status = 'active';

WITH ranked_contacts AS (
  SELECT
    store.id AS store_id,
    contact.*,
    NULLIF(BTRIM(contact.lightspeed_customer_id), '') AS normalized_lightspeed_customer_id,
    ROW_NUMBER() OVER (
      PARTITION BY
        store.id,
        COALESCE(
          'lightspeed:' || NULLIF(BTRIM(contact.lightspeed_customer_id), ''),
          'email:' || LOWER(NULLIF(BTRIM(contact.email), '')),
          'contact:' || contact.id::text
        )
      ORDER BY contact.updated_at DESC, contact.id
    ) AS identity_rank
  FROM crm_contacts contact
  JOIN stores store ON store.owner_user_id = contact.user_id
)
INSERT INTO store_customers (
  store_id,
  user_id,
  display_name,
  first_name,
  last_name,
  primary_email,
  primary_phone,
  lightspeed_customer_id,
  total_spend,
  sale_count,
  average_sale,
  last_purchase_at,
  data_freshness_at,
  source,
  created_at,
  updated_at
)
SELECT
  contact.store_id,
  contact.user_id,
  COALESCE(
    NULLIF(BTRIM(CONCAT_WS(' ', contact.first_name, contact.last_name)), ''),
    NULLIF(BTRIM(contact.email), ''),
    'Customer'
  ),
  contact.first_name,
  contact.last_name,
  LOWER(NULLIF(BTRIM(contact.email), '')),
  NULLIF(BTRIM(contact.phone), ''),
  contact.normalized_lightspeed_customer_id,
  COALESCE(contact.total_spend, 0),
  COALESCE(contact.sale_count, 0),
  CASE
    WHEN COALESCE(contact.sale_count, 0) > 0
      THEN COALESCE(contact.total_spend, 0) / contact.sale_count
    ELSE 0
  END,
  contact.last_purchase_at,
  contact.enriched_at,
  contact.source,
  contact.created_at,
  contact.updated_at
FROM ranked_contacts contact
WHERE contact.identity_rank = 1
  AND NOT EXISTS (
  SELECT 1
  FROM store_customers customer
  WHERE customer.store_id = contact.store_id
    AND (
      (
        contact.normalized_lightspeed_customer_id IS NOT NULL
        AND customer.lightspeed_customer_id = contact.normalized_lightspeed_customer_id
      )
      OR (
        NULLIF(BTRIM(contact.email), '') IS NOT NULL
        AND customer.primary_email = LOWER(NULLIF(BTRIM(contact.email), ''))
      )
    )
);

UPDATE crm_contacts contact
SET customer_id = customer.id
FROM stores store
JOIN store_customers customer ON customer.store_id = store.id
WHERE store.owner_user_id = contact.user_id
  AND contact.customer_id IS NULL
  AND (
    (
      NULLIF(BTRIM(contact.lightspeed_customer_id), '') IS NOT NULL
      AND customer.lightspeed_customer_id = NULLIF(BTRIM(contact.lightspeed_customer_id), '')
    )
    OR (
      contact.email IS NOT NULL
      AND customer.primary_email = LOWER(BTRIM(contact.email))
    )
  );

INSERT INTO store_customer_identities (
  store_id,
  customer_id,
  identity_type,
  normalized_value,
  display_value,
  source,
  verification_status
)
SELECT
  customer.store_id,
  customer.id,
  'email',
  LOWER(BTRIM(customer.primary_email)),
  customer.primary_email,
  customer.source,
  'observed'
FROM store_customers customer
WHERE customer.primary_email IS NOT NULL
ON CONFLICT (store_id, identity_type, normalized_value) DO NOTHING;

INSERT INTO store_customer_identities (
  store_id,
  customer_id,
  identity_type,
  normalized_value,
  display_value,
  source,
  verification_status
)
SELECT
  customer.store_id,
  customer.id,
  'phone',
  crm_normalize_phone(customer.primary_phone),
  customer.primary_phone,
  customer.source,
  'observed'
FROM store_customers customer
WHERE crm_normalize_phone(customer.primary_phone) IS NOT NULL
ON CONFLICT (store_id, identity_type, normalized_value) DO NOTHING;

INSERT INTO store_customer_identities (
  store_id,
  customer_id,
  identity_type,
  normalized_value,
  display_value,
  source,
  verification_status
)
SELECT
  customer.store_id,
  customer.id,
  'lightspeed_customer_id',
  customer.lightspeed_customer_id,
  customer.lightspeed_customer_id,
  'lightspeed',
  'verified'
FROM store_customers customer
WHERE customer.lightspeed_customer_id IS NOT NULL
ON CONFLICT (store_id, identity_type, normalized_value) DO NOTHING;

INSERT INTO store_customer_consents (
  store_id,
  customer_id,
  channel,
  purpose,
  status,
  lawful_basis,
  source,
  evidence,
  captured_at,
  withdrawn_at
)
SELECT
  store.id,
  contact.customer_id,
  'email',
  'marketing',
  CASE WHEN contact.opted_out THEN 'withdrawn' ELSE 'unknown' END,
  'unknown',
  'crm_contact_import',
  jsonb_build_object(
    'crm_contact_id', contact.id,
    'opt_out_reason', contact.opt_out_reason
  ),
  COALESCE(contact.opted_out_at, contact.created_at),
  contact.opted_out_at
FROM crm_contacts contact
JOIN stores store ON store.owner_user_id = contact.user_id
WHERE contact.customer_id IS NOT NULL
ON CONFLICT (store_id, customer_id, channel, purpose) DO NOTHING;

-- Link existing channel records through deterministic exact identities.
UPDATE store_customer_inquiries inquiry
SET customer_id = identity.customer_id
FROM stores store
JOIN store_customer_identities identity
  ON identity.store_id = store.id
 AND identity.identity_type = 'email'
WHERE store.owner_user_id = inquiry.user_id
  AND inquiry.customer_id IS NULL
  AND LOWER(NULLIF(BTRIM(inquiry.sender_email), '')) = identity.normalized_value;

UPDATE store_nest_conversations conversation
SET customer_id = identity.customer_id
FROM stores store
JOIN store_customer_identities identity
  ON identity.store_id = store.id
 AND identity.identity_type = 'phone'
WHERE store.owner_user_id = conversation.user_id
  AND conversation.customer_id IS NULL
  AND crm_normalize_phone(conversation.participant_handle) = identity.normalized_value;

UPDATE store_payment_requests payment
SET customer_id = identity.customer_id
FROM stores store
JOIN store_customer_identities identity
  ON identity.store_id = store.id
 AND identity.identity_type = 'phone'
WHERE store.owner_user_id = payment.store_user_id
  AND payment.customer_id IS NULL
  AND crm_normalize_phone(payment.customer_handle) = identity.normalized_value;

UPDATE store_customer_credits credit
SET customer_id = identity.customer_id
FROM stores store
JOIN store_customer_identities identity
  ON identity.store_id = store.id
 AND identity.identity_type = 'phone'
WHERE store.owner_user_id = credit.store_user_id
  AND credit.customer_id IS NULL
  AND crm_normalize_phone(credit.customer_handle) = identity.normalized_value;

UPDATE crm_lifecycle_touches touch
SET store_customer_id = contact.customer_id
FROM crm_contacts contact
WHERE contact.id = touch.contact_id
  AND contact.user_id = touch.user_id
  AND touch.store_customer_id IS NULL
  AND contact.customer_id IS NOT NULL;

UPDATE domestique_touches touch
SET store_customer_id = contact.customer_id
FROM crm_contacts contact
WHERE contact.id = touch.contact_id
  AND contact.user_id = touch.user_id
  AND touch.store_customer_id IS NULL
  AND contact.customer_id IS NOT NULL;

-- Project historical source rows before live triggers are installed.
INSERT INTO store_customer_events (
  store_id, customer_id, event_type, channel, source_type, source_id,
  title, summary, occurred_at, actor_type, direction, metadata
)
SELECT
  store.id,
  inquiry.customer_id,
  CASE WHEN inquiry.status = 'sent' THEN 'email_reply' ELSE 'email_inquiry' END,
  'email',
  'customer_inquiry',
  inquiry.id::text,
  COALESCE(NULLIF(inquiry.subject, ''), 'Customer enquiry'),
  COALESCE(NULLIF(inquiry.snippet, ''), inquiry.intent || ' · ' || inquiry.status),
  COALESCE(inquiry.sent_at, inquiry.received_at, inquiry.updated_at),
  CASE WHEN inquiry.status = 'sent' THEN 'staff' ELSE 'customer' END,
  CASE WHEN inquiry.status = 'sent' THEN 'outbound' ELSE 'inbound' END,
  jsonb_build_object('status', inquiry.status, 'intent', inquiry.intent, 'priority', inquiry.priority)
FROM store_customer_inquiries inquiry
JOIN stores store ON store.owner_user_id = inquiry.user_id
WHERE inquiry.customer_id IS NOT NULL
ON CONFLICT (store_id, source_type, source_id, event_type) DO NOTHING;

INSERT INTO store_customer_events (
  store_id, customer_id, event_type, channel, source_type, source_id,
  title, summary, occurred_at, actor_type, direction, metadata
)
SELECT
  store.id,
  conversation.customer_id,
  'nest_conversation',
  COALESCE(conversation.channel, 'sms'),
  'nest_conversation',
  conversation.chat_id,
  COALESCE(NULLIF(conversation.display_name, ''), 'Nest conversation'),
  COALESCE(conversation.preview, ''),
  conversation.last_message_at,
  CASE WHEN conversation.has_manual_messages THEN 'staff' ELSE 'customer' END,
  CASE WHEN conversation.has_manual_messages THEN 'outbound' ELSE 'inbound' END,
  jsonb_build_object('source', conversation.source)
FROM store_nest_conversations conversation
JOIN stores store ON store.owner_user_id = conversation.user_id
WHERE conversation.customer_id IS NOT NULL
ON CONFLICT (store_id, source_type, source_id, event_type) DO NOTHING;

INSERT INTO store_customer_events (
  store_id, customer_id, event_type, channel, source_type, source_id,
  title, summary, occurred_at, actor_type, direction, metadata
)
SELECT
  store.id,
  contact.customer_id,
  'campaign_email',
  'email',
  'crm_campaign_recipient',
  recipient.id::text,
  campaign.subject,
  'Campaign ' || recipient.status,
  COALESCE(recipient.sent_at, recipient.created_at),
  'agent',
  'outbound',
  jsonb_build_object('status', recipient.status, 'campaign_id', recipient.campaign_id)
FROM crm_campaign_recipients recipient
JOIN crm_contacts contact
  ON contact.id = recipient.contact_id
 AND contact.user_id = recipient.user_id
JOIN crm_campaigns campaign
  ON campaign.id = recipient.campaign_id
 AND campaign.user_id = recipient.user_id
JOIN stores store ON store.owner_user_id = recipient.user_id
WHERE contact.customer_id IS NOT NULL
ON CONFLICT (store_id, source_type, source_id, event_type) DO NOTHING;

INSERT INTO store_customer_events (
  store_id, customer_id, event_type, channel, source_type, source_id,
  title, summary, occurred_at, actor_type, direction, metadata
)
SELECT
  store.id,
  touch.store_customer_id,
  'lifecycle_touch',
  CASE WHEN touch.is_holdout THEN NULL ELSE 'email' END,
  'crm_lifecycle_touch',
  touch.id::text,
  touch.program_key,
  CASE WHEN touch.is_holdout THEN 'Held out from contact' ELSE 'Lifecycle message sent' END,
  touch.touched_at,
  'agent',
  'outbound',
  jsonb_build_object('stage', touch.stage_at_touch, 'holdout', touch.is_holdout)
FROM crm_lifecycle_touches touch
JOIN stores store ON store.owner_user_id = touch.user_id
WHERE touch.store_customer_id IS NOT NULL
ON CONFLICT (store_id, source_type, source_id, event_type) DO NOTHING;

INSERT INTO store_customer_events (
  store_id, customer_id, event_type, channel, source_type, source_id,
  title, summary, occurred_at, actor_type, direction, metadata
)
SELECT
  store.id,
  touch.store_customer_id,
  'domestique_touch',
  CASE WHEN touch.is_holdout THEN NULL ELSE touch.channel END,
  'domestique_touch',
  touch.id::text,
  touch.playbook_key,
  CASE WHEN touch.is_holdout THEN 'Held out from contact' ELSE 'Revenue play sent' END,
  touch.touched_at,
  'agent',
  'outbound',
  jsonb_build_object('holdout', touch.is_holdout)
FROM domestique_touches touch
JOIN stores store ON store.owner_user_id = touch.user_id
WHERE touch.store_customer_id IS NOT NULL
ON CONFLICT (store_id, source_type, source_id, event_type) DO NOTHING;

INSERT INTO store_customer_events (
  store_id, customer_id, event_type, channel, source_type, source_id,
  title, summary, occurred_at, actor_type, direction, metadata
)
SELECT
  store.id,
  payment.customer_id,
  CASE WHEN payment.status = 'paid' THEN 'payment_received' ELSE 'payment_request' END,
  'payment',
  'store_payment_request',
  payment.id::text,
  CASE WHEN payment.status = 'paid' THEN 'Payment received' ELSE 'Payment requested' END,
  COALESCE(payment.description, ''),
  COALESCE(payment.paid_at, payment.created_at),
  'staff',
  'outbound',
  jsonb_build_object('status', payment.status, 'amount_cents', payment.amount_cents)
FROM store_payment_requests payment
JOIN stores store ON store.owner_user_id = payment.store_user_id
WHERE payment.customer_id IS NOT NULL
ON CONFLICT (store_id, source_type, source_id, event_type) DO NOTHING;

UPDATE store_customers customer
SET last_interaction_at = latest.occurred_at
FROM (
  SELECT store_id, customer_id, MAX(occurred_at) AS occurred_at
  FROM store_customer_events
  GROUP BY store_id, customer_id
) latest
WHERE customer.store_id = latest.store_id
  AND customer.id = latest.customer_id;

INSERT INTO store_crm_sync_state (store_id, source)
SELECT store.id, source.name
FROM stores store
CROSS JOIN (
  VALUES
    ('lightspeed_customers'),
    ('lightspeed_workorders'),
    ('lightspeed_bikes'),
    ('timeline')
) AS source(name)
ON CONFLICT (store_id, source) DO NOTHING;

INSERT INTO store_loyalty_programmes (store_id)
SELECT store.id
FROM stores store
ON CONFLICT (store_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.bootstrap_bike_store_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_store_id UUID;
BEGIN
  IF NEW.account_type IS DISTINCT FROM 'bicycle_store' OR NEW.bicycle_store IS NOT TRUE THEN
    UPDATE public.stores
    SET crm_enabled = FALSE
    WHERE owner_user_id = NEW.user_id
    RETURNING id INTO resolved_store_id;

    IF resolved_store_id IS NOT NULL THEN
      UPDATE public.store_memberships
      SET status = 'suspended'
      WHERE store_id = resolved_store_id;
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.stores (owner_user_id, name)
  VALUES (
    NEW.user_id,
    COALESCE(NULLIF(BTRIM(NEW.business_name), ''), 'Bike store')
  )
  ON CONFLICT (owner_user_id) DO UPDATE
    SET name = EXCLUDED.name,
        crm_enabled = TRUE
  RETURNING id INTO resolved_store_id;

  INSERT INTO public.store_memberships (store_id, user_id, role, status)
  VALUES (resolved_store_id, NEW.user_id, 'owner', 'active')
  ON CONFLICT (store_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active';

  INSERT INTO public.store_crm_sync_state (store_id, source)
  SELECT resolved_store_id, source.name
  FROM (
    VALUES
      ('lightspeed_customers'),
      ('lightspeed_workorders'),
      ('lightspeed_bikes'),
      ('timeline')
  ) AS source(name)
  ON CONFLICT (store_id, source) DO NOTHING;

  INSERT INTO public.store_loyalty_programmes (store_id)
  VALUES (resolved_store_id)
  ON CONFLICT (store_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.protect_store_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  trusted BOOLEAN;
BEGIN
  trusted :=
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';

  IF TG_OP = 'INSERT' THEN
    IF NOT trusted AND (
      NEW.bicycle_store IS TRUE
      OR NEW.account_type = 'bicycle_store'
    ) THEN
      RAISE EXCEPTION 'Bike-store verification requires an administrator.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT trusted AND (
    NEW.bicycle_store IS DISTINCT FROM OLD.bicycle_store
    OR NEW.account_type IS DISTINCT FROM OLD.account_type
  ) THEN
    RAISE EXCEPTION 'Bike-store verification fields are administrator-controlled.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.protect_crm_enablement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.crm_enabled IS TRUE AND OLD.crm_enabled IS DISTINCT FROM TRUE THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.users profile
      WHERE profile.user_id = NEW.owner_user_id
        AND profile.account_type = 'bicycle_store'
        AND profile.bicycle_store IS TRUE
    ) THEN
      RAISE EXCEPTION 'CRM cannot be enabled for an unverified store.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_protect_store_verification_insert ON users;
CREATE TRIGGER users_protect_store_verification_insert
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_store_verification();
DROP TRIGGER IF EXISTS users_protect_store_verification_update ON users;
CREATE TRIGGER users_protect_store_verification_update
  BEFORE UPDATE OF bicycle_store, account_type ON users
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_store_verification();
DROP TRIGGER IF EXISTS stores_protect_crm_enablement ON stores;
CREATE TRIGGER stores_protect_crm_enablement
  BEFORE UPDATE OF crm_enabled ON stores
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_crm_enablement();

DROP TRIGGER IF EXISTS users_bootstrap_bike_store_crm ON users;
CREATE TRIGGER users_bootstrap_bike_store_crm
  AFTER INSERT OR UPDATE OF account_type, bicycle_store, business_name ON users
  FOR EACH ROW
  EXECUTE FUNCTION private.bootstrap_bike_store_crm();

-- ---------------------------------------------------------------------------
-- Fast, RLS-protected read functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION crm_search_customers(
  p_store_id UUID,
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
  p_cursor_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF store_customers
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT customer.*
  FROM store_customers customer
  WHERE customer.store_id = p_store_id
    AND customer.status = 'active'
    AND (
      NULLIF(BTRIM(p_query), '') IS NULL
      OR LOWER(customer.display_name) % LOWER(BTRIM(p_query))
      OR LOWER(COALESCE(customer.primary_email, '')) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
      OR (
        crm_normalize_phone(p_query) IS NOT NULL
        AND crm_normalize_phone(customer.primary_phone)
          LIKE '%' || crm_normalize_phone(p_query) || '%'
      )
      OR EXISTS (
        SELECT 1
        FROM store_customer_bikes bike
        WHERE bike.store_id = customer.store_id
          AND bike.customer_id = customer.id
          AND (
            LOWER(COALESCE(bike.serial_number, '')) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
            OR LOWER(CONCAT_WS(' ', bike.brand, bike.model)) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
          )
      )
    )
    AND (
      p_filter = 'all'
      OR (p_filter = 'vip' AND customer.lifecycle_stage = 'vip')
      OR (p_filter = 'at_risk' AND customer.lifecycle_stage = 'at_risk')
      OR (p_filter = 'no_email' AND customer.primary_email IS NULL)
      OR (
        p_filter = 'opted_in'
        AND EXISTS (
          SELECT 1
          FROM store_customer_consents consent
          WHERE consent.store_id = customer.store_id
            AND consent.customer_id = customer.id
            AND consent.channel = 'email'
            AND consent.purpose = 'marketing'
            AND consent.status = 'granted'
            AND consent.withdrawn_at IS NULL
            AND (consent.expires_at IS NULL OR consent.expires_at > NOW())
        )
      )
    )
    AND (
      p_cursor_updated_at IS NULL
      OR (customer.updated_at, customer.id) < (p_cursor_updated_at, p_cursor_id)
    )
  ORDER BY customer.updated_at DESC, customer.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

CREATE OR REPLACE FUNCTION crm_customer_timeline(
  p_store_id UUID,
  p_customer_id UUID,
  p_cursor_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF store_customer_events
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT event.*
  FROM store_customer_events event
  WHERE event.store_id = p_store_id
    AND event.customer_id = p_customer_id
    AND (
      p_cursor_occurred_at IS NULL
      OR (event.occurred_at, event.id) < (p_cursor_occurred_at, p_cursor_id)
    )
  ORDER BY event.occurred_at DESC, event.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

CREATE OR REPLACE FUNCTION crm_store_insights(
  p_store_id UUID,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days'
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH store_owner AS (
    SELECT owner_user_id
    FROM stores
    WHERE id = p_store_id
  ),
  customer_totals AS (
    SELECT
      COUNT(*)::integer AS customer_count,
      COALESCE(SUM(total_spend), 0) AS customer_value
    FROM store_customers
    WHERE store_id = p_store_id
      AND status = 'active'
  ),
  stage_counts AS (
    SELECT COALESCE(jsonb_object_agg(stage, count), '{}'::jsonb) AS value
    FROM (
      SELECT COALESCE(lifecycle_stage, 'unknown') AS stage, COUNT(*)::integer AS count
      FROM store_customers
      WHERE store_id = p_store_id
        AND status = 'active'
      GROUP BY COALESCE(lifecycle_stage, 'unknown')
    ) grouped
  ),
  event_channel_counts AS (
    SELECT COALESCE(jsonb_object_agg(channel_key, count), '{}'::jsonb) AS value
    FROM (
      SELECT COALESCE(channel, 'unknown') AS channel_key, COUNT(*)::integer AS count
      FROM store_customer_events
      WHERE store_id = p_store_id
        AND occurred_at >= p_since
      GROUP BY COALESCE(channel, 'unknown')
    ) grouped
  ),
  event_type_counts AS (
    SELECT COALESCE(jsonb_object_agg(event_type, count), '{}'::jsonb) AS value
    FROM (
      SELECT event_type, COUNT(*)::integer AS count
      FROM store_customer_events
      WHERE store_id = p_store_id
        AND occurred_at >= p_since
      GROUP BY event_type
    ) grouped
  ),
  workorder_counts AS (
    SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) AS value
    FROM (
      SELECT status, COUNT(*)::integer AS count
      FROM store_customer_workorders
      WHERE store_id = p_store_id
        AND updated_at >= p_since
      GROUP BY status
    ) grouped
  ),
  consent_counts AS (
    SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) AS value
    FROM (
      SELECT status, COUNT(*)::integer AS count
      FROM store_customer_consents
      WHERE store_id = p_store_id
      GROUP BY status
    ) grouped
  ),
  task_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('open', 'in_progress', 'snoozed'))::integer AS open_count,
      COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= p_since)::integer AS completed_count
    FROM store_customer_tasks
    WHERE store_id = p_store_id
  ),
  activity_totals AS (
    SELECT COUNT(*)::integer AS interactions
    FROM store_customer_events
    WHERE store_id = p_store_id
      AND occurred_at >= p_since
  ),
  workorder_totals AS (
    SELECT COUNT(*) FILTER (WHERE status = 'completed')::integer AS completed
    FROM store_customer_workorders
    WHERE store_id = p_store_id
      AND updated_at >= p_since
  ),
  revenue_totals AS (
    SELECT
      COALESCE((
        SELECT SUM(touch.attributed_revenue)
        FROM crm_lifecycle_touches touch
        WHERE touch.user_id = (SELECT owner_user_id FROM store_owner)
          AND touch.touched_at >= p_since
      ), 0)
      + COALESCE((
        SELECT SUM(touch.attributed_revenue)
        FROM domestique_touches touch
        WHERE touch.user_id = (SELECT owner_user_id FROM store_owner)
          AND touch.touched_at >= p_since
      ), 0) AS attributed_revenue
  ),
  performance_values AS (
    SELECT
      metric,
      COUNT(*)::integer AS samples,
      ROUND(AVG(value_ms))::integer AS average_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value_ms))::integer AS p95_ms
    FROM store_crm_performance_events
    WHERE store_id = p_store_id
      AND recorded_at >= p_since
      AND metric IN ('LCP', 'INP', 'search', 'customer_summary', 'today')
    GROUP BY metric
  ),
  performance_summary AS (
    SELECT COALESCE(
      jsonb_object_agg(
        metric,
        jsonb_build_object('samples', samples, 'averageMs', average_ms, 'p95Ms', p95_ms)
      ),
      '{}'::jsonb
    ) AS value
    FROM performance_values
  )
  SELECT jsonb_build_object(
    'periodDays', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (NOW() - p_since)) / 86400.0)::integer),
    'kpis', jsonb_build_object(
      'customers', customer_totals.customer_count,
      'customerValue', customer_totals.customer_value,
      'attributedRevenue', revenue_totals.attributed_revenue,
      'openTasks', task_counts.open_count,
      'completedTasks', task_counts.completed_count,
      'completedWorkorders', workorder_totals.completed,
      'interactions', activity_totals.interactions
    ),
    'lifecycleStages', stage_counts.value,
    'activityByChannel', event_channel_counts.value,
    'activityByType', event_type_counts.value,
    'workordersByStatus', workorder_counts.value,
    'consentHealth', consent_counts.value,
    'performance', performance_summary.value
  )
  FROM customer_totals
  CROSS JOIN stage_counts
  CROSS JOIN event_channel_counts
  CROSS JOIN event_type_counts
  CROSS JOIN workorder_counts
  CROSS JOIN consent_counts
  CROSS JOIN task_counts
  CROSS JOIN activity_totals
  CROSS JOIN workorder_totals
  CROSS JOIN revenue_totals
  CROSS JOIN performance_summary;
$$;

GRANT EXECUTE ON FUNCTION crm_search_customers(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION crm_customer_timeline(UUID, UUID, TIMESTAMPTZ, UUID, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION crm_store_insights(UUID, TIMESTAMPTZ)
  TO authenticated;

-- Keep the common timeline current as production source rows change. The
-- projection is idempotent by (store, source type, source id, event type).
CREATE OR REPLACE FUNCTION private.upsert_customer_event(
  p_user_id UUID,
  p_customer_id UUID,
  p_event_type TEXT,
  p_channel TEXT,
  p_source_type TEXT,
  p_source_id TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_actor_type TEXT,
  p_direction TEXT,
  p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_store_id UUID;
  previous_customer_id UUID;
BEGIN
  IF p_customer_id IS NULL OR p_source_id IS NULL THEN
    RETURN;
  END IF;

  SELECT store.id
  INTO resolved_store_id
  FROM public.stores store
  WHERE store.owner_user_id = p_user_id;

  IF resolved_store_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.store_customers customer
    WHERE customer.store_id = resolved_store_id
      AND customer.id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'Customer % does not belong to store %', p_customer_id, resolved_store_id;
  END IF;

  SELECT event.customer_id
  INTO previous_customer_id
  FROM public.store_customer_events event
  WHERE event.store_id = resolved_store_id
    AND event.source_type = p_source_type
    AND event.source_id = p_source_id
    AND event.event_type = p_event_type;

  INSERT INTO public.store_customer_events (
    store_id,
    customer_id,
    event_type,
    channel,
    source_type,
    source_id,
    title,
    summary,
    occurred_at,
    actor_type,
    direction,
    metadata
  )
  VALUES (
    resolved_store_id,
    p_customer_id,
    p_event_type,
    p_channel,
    p_source_type,
    p_source_id,
    COALESCE(NULLIF(p_title, ''), 'Customer activity'),
    COALESCE(p_summary, ''),
    COALESCE(p_occurred_at, NOW()),
    p_actor_type,
    p_direction,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (store_id, source_type, source_id, event_type) DO UPDATE
    SET customer_id = EXCLUDED.customer_id,
        channel = EXCLUDED.channel,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        occurred_at = EXCLUDED.occurred_at,
        actor_type = EXCLUDED.actor_type,
        direction = EXCLUDED.direction,
        metadata = EXCLUDED.metadata;

  UPDATE public.store_customers
  SET last_interaction_at = GREATEST(
    COALESCE(last_interaction_at, '-infinity'::timestamptz),
    COALESCE(p_occurred_at, NOW())
  )
  WHERE id = p_customer_id
    AND store_id = resolved_store_id;

  IF previous_customer_id IS NOT NULL AND previous_customer_id <> p_customer_id THEN
    UPDATE public.store_customers customer
    SET last_interaction_at = (
      SELECT MAX(event.occurred_at)
      FROM public.store_customer_events event
      WHERE event.store_id = resolved_store_id
        AND event.customer_id = previous_customer_id
    )
    WHERE customer.store_id = resolved_store_id
      AND customer.id = previous_customer_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_customer_inquiry_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.upsert_customer_event(
    NEW.user_id,
    NEW.customer_id,
    CASE WHEN NEW.status = 'sent' THEN 'email_reply' ELSE 'email_inquiry' END,
    'email',
    'customer_inquiry',
    NEW.id::text,
    COALESCE(NULLIF(NEW.subject, ''), 'Customer enquiry'),
    COALESCE(NULLIF(NEW.snippet, ''), NEW.intent || ' · ' || NEW.status),
    COALESCE(NEW.sent_at, NEW.received_at, NEW.updated_at),
    CASE WHEN NEW.status = 'sent' THEN 'staff' ELSE 'customer' END,
    CASE WHEN NEW.status = 'sent' THEN 'outbound' ELSE 'inbound' END,
    jsonb_build_object('status', NEW.status, 'intent', NEW.intent, 'priority', NEW.priority)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_nest_conversation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.upsert_customer_event(
    NEW.user_id,
    NEW.customer_id,
    'nest_conversation',
    COALESCE(NEW.channel, 'sms'),
    'nest_conversation',
    NEW.chat_id,
    COALESCE(NULLIF(NEW.display_name, ''), 'Nest conversation'),
    COALESCE(NEW.preview, ''),
    NEW.last_message_at,
    CASE WHEN NEW.has_manual_messages THEN 'staff' ELSE 'customer' END,
    CASE WHEN NEW.has_manual_messages THEN 'outbound' ELSE 'inbound' END,
    jsonb_build_object('source', NEW.source, 'last_customer_message_at', NEW.last_customer_message_at)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_payment_request_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.upsert_customer_event(
    NEW.store_user_id,
    NEW.customer_id,
    CASE WHEN NEW.status = 'paid' THEN 'payment_received' ELSE 'payment_request' END,
    'payment',
    'store_payment_request',
    NEW.id::text,
    CASE WHEN NEW.status = 'paid' THEN 'Payment received' ELSE 'Payment requested' END,
    COALESCE(NEW.description, ''),
    COALESCE(NEW.paid_at, NEW.created_at),
    'staff',
    'outbound',
    jsonb_build_object('status', NEW.status, 'amount_cents', NEW.amount_cents, 'currency', NEW.currency)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_lifecycle_touch_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.upsert_customer_event(
    NEW.user_id,
    NEW.store_customer_id,
    'lifecycle_touch',
    CASE WHEN NEW.is_holdout THEN NULL ELSE 'email' END,
    'crm_lifecycle_touch',
    NEW.id::text,
    NEW.program_key,
    CASE WHEN NEW.is_holdout THEN 'Held out from contact' ELSE 'Lifecycle message sent' END,
    NEW.touched_at,
    'agent',
    'outbound',
    jsonb_build_object(
      'stage', NEW.stage_at_touch,
      'holdout', NEW.is_holdout,
      'attributed_revenue', NEW.attributed_revenue
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.bridge_lifecycle_touch_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.store_customer_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT contact.customer_id
    INTO NEW.store_customer_id
    FROM public.crm_contacts contact
    WHERE contact.id = NEW.contact_id
      AND contact.user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_domestique_touch_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.upsert_customer_event(
    NEW.user_id,
    NEW.store_customer_id,
    'domestique_touch',
    CASE WHEN NEW.is_holdout THEN NULL ELSE NEW.channel END,
    'domestique_touch',
    NEW.id::text,
    NEW.playbook_key,
    CASE WHEN NEW.is_holdout THEN 'Held out from contact' ELSE 'Revenue play sent' END,
    NEW.touched_at,
    'agent',
    'outbound',
    jsonb_build_object('holdout', NEW.is_holdout, 'attributed_revenue', NEW.attributed_revenue)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.bridge_domestique_touch_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.store_customer_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT contact.customer_id
    INTO NEW.store_customer_id
    FROM public.crm_contacts contact
    WHERE contact.id = NEW.contact_id
      AND contact.user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_campaign_recipient_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_customer_id UUID;
  resolved_subject TEXT;
BEGIN
  SELECT contact.customer_id
  INTO resolved_customer_id
  FROM public.crm_contacts contact
  WHERE contact.id = NEW.contact_id
    AND contact.user_id = NEW.user_id;

  SELECT campaign.subject
  INTO resolved_subject
  FROM public.crm_campaigns campaign
  WHERE campaign.id = NEW.campaign_id
    AND campaign.user_id = NEW.user_id;

  PERFORM private.upsert_customer_event(
    NEW.user_id,
    resolved_customer_id,
    'campaign_email',
    'email',
    'crm_campaign_recipient',
    NEW.id::text,
    COALESCE(resolved_subject, 'Campaign email'),
    'Campaign ' || NEW.status,
    COALESCE(NEW.sent_at, NEW.created_at),
    'agent',
    'outbound',
    jsonb_build_object('status', NEW.status, 'email', NEW.email, 'campaign_id', NEW.campaign_id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_legacy_email_suppression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.channel = 'email' AND NEW.purpose = 'marketing' THEN
    UPDATE public.crm_contacts
    SET opted_out = NEW.status IN ('denied', 'withdrawn'),
        opted_out_at = CASE
          WHEN NEW.status IN ('denied', 'withdrawn') THEN COALESCE(NEW.withdrawn_at, NOW())
          ELSE NULL
        END,
        opt_out_reason = CASE
          WHEN NEW.status IN ('denied', 'withdrawn') THEN NEW.source
          ELSE NULL
        END
    WHERE customer_id = NEW.customer_id
      AND opted_out IS DISTINCT FROM (NEW.status IN ('denied', 'withdrawn'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_consent_from_legacy_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_store_id UUID;
BEGIN
  IF NEW.customer_id IS NULL OR NEW.opted_out IS NOT DISTINCT FROM OLD.opted_out THEN
    RETURN NEW;
  END IF;
  SELECT store.id INTO resolved_store_id
  FROM public.stores store
  WHERE store.owner_user_id = NEW.user_id;
  IF resolved_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.store_customer_consents (
    store_id,
    customer_id,
    channel,
    purpose,
    status,
    lawful_basis,
    source,
    evidence,
    captured_at,
    withdrawn_at
  )
  VALUES (
    resolved_store_id,
    NEW.customer_id,
    'email',
    'marketing',
    CASE WHEN NEW.opted_out THEN 'withdrawn' ELSE 'granted' END,
    CASE WHEN NEW.opted_out THEN 'unknown' ELSE 'express' END,
    COALESCE(NEW.opt_out_reason, 'legacy_crm'),
    jsonb_build_object('crm_contact_id', NEW.id),
    COALESCE(NEW.opted_out_at, NOW()),
    CASE WHEN NEW.opted_out THEN COALESCE(NEW.opted_out_at, NOW()) ELSE NULL END
  )
  ON CONFLICT (store_id, customer_id, channel, purpose) DO UPDATE
    SET status = EXCLUDED.status,
        lawful_basis = EXCLUDED.lawful_basis,
        source = EXCLUDED.source,
        evidence = EXCLUDED.evidence,
        captured_at = EXCLUDED.captured_at,
        withdrawn_at = EXCLUDED.withdrawn_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_owner_customer_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_user_id UUID;
  linked_customer_id UUID;
BEGIN
  v_owner_user_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
  linked_customer_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[1], '')::uuid;
  IF linked_customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stores store
    JOIN public.store_customers customer ON customer.store_id = store.id
    WHERE store.owner_user_id = v_owner_user_id
      AND customer.id = linked_customer_id
  ) THEN
    RAISE EXCEPTION 'Customer % does not belong to owner %', linked_customer_id, v_owner_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_customer_inquiry_event ON store_customer_inquiries;
DROP TRIGGER IF EXISTS validate_crm_contact_customer_link ON crm_contacts;
CREATE TRIGGER validate_crm_contact_customer_link
  BEFORE INSERT OR UPDATE OF customer_id ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_owner_customer_link('user_id', 'customer_id');
DROP TRIGGER IF EXISTS validate_inquiry_customer_link ON store_customer_inquiries;
CREATE TRIGGER validate_inquiry_customer_link
  BEFORE INSERT OR UPDATE OF customer_id ON store_customer_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_owner_customer_link('user_id', 'customer_id');
DROP TRIGGER IF EXISTS validate_nest_customer_link ON store_nest_conversations;
CREATE TRIGGER validate_nest_customer_link
  BEFORE INSERT OR UPDATE OF customer_id ON store_nest_conversations
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_owner_customer_link('user_id', 'customer_id');
DROP TRIGGER IF EXISTS validate_lifecycle_customer_link ON crm_lifecycle_touches;
CREATE TRIGGER validate_lifecycle_customer_link
  BEFORE INSERT OR UPDATE OF store_customer_id ON crm_lifecycle_touches
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_owner_customer_link('user_id', 'store_customer_id');
DROP TRIGGER IF EXISTS validate_domestique_customer_link ON domestique_touches;
CREATE TRIGGER validate_domestique_customer_link
  BEFORE INSERT OR UPDATE OF store_customer_id ON domestique_touches
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_owner_customer_link('user_id', 'store_customer_id');
DROP TRIGGER IF EXISTS validate_payment_customer_link ON store_payment_requests;
CREATE TRIGGER validate_payment_customer_link
  BEFORE INSERT OR UPDATE OF customer_id ON store_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_owner_customer_link('store_user_id', 'customer_id');
DROP TRIGGER IF EXISTS validate_credit_customer_link ON store_customer_credits;
CREATE TRIGGER validate_credit_customer_link
  BEFORE INSERT OR UPDATE OF customer_id ON store_customer_credits
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_owner_customer_link('store_user_id', 'customer_id');

CREATE TRIGGER project_customer_inquiry_event
  AFTER INSERT OR UPDATE OF customer_id, status, sent_at, updated_at ON store_customer_inquiries
  FOR EACH ROW
  WHEN (NEW.customer_id IS NOT NULL)
  EXECUTE FUNCTION private.project_customer_inquiry_event();

DROP TRIGGER IF EXISTS project_nest_conversation_event ON store_nest_conversations;
CREATE TRIGGER project_nest_conversation_event
  AFTER INSERT OR UPDATE OF customer_id, preview, last_message_at, has_manual_messages ON store_nest_conversations
  FOR EACH ROW
  WHEN (NEW.customer_id IS NOT NULL)
  EXECUTE FUNCTION private.project_nest_conversation_event();

DROP TRIGGER IF EXISTS project_payment_request_event ON store_payment_requests;
CREATE TRIGGER project_payment_request_event
  AFTER INSERT OR UPDATE OF customer_id, status, paid_at ON store_payment_requests
  FOR EACH ROW
  WHEN (NEW.customer_id IS NOT NULL)
  EXECUTE FUNCTION private.project_payment_request_event();

DROP TRIGGER IF EXISTS project_lifecycle_touch_event ON crm_lifecycle_touches;
DROP TRIGGER IF EXISTS bridge_lifecycle_touch_customer ON crm_lifecycle_touches;
CREATE TRIGGER bridge_lifecycle_touch_customer
  BEFORE INSERT OR UPDATE OF contact_id, store_customer_id ON crm_lifecycle_touches
  FOR EACH ROW
  EXECUTE FUNCTION private.bridge_lifecycle_touch_customer();
CREATE TRIGGER project_lifecycle_touch_event
  AFTER INSERT OR UPDATE OF contact_id, store_customer_id, attributed_revenue, reactivated ON crm_lifecycle_touches
  FOR EACH ROW
  WHEN (NEW.store_customer_id IS NOT NULL)
  EXECUTE FUNCTION private.project_lifecycle_touch_event();

DROP TRIGGER IF EXISTS project_domestique_touch_event ON domestique_touches;
DROP TRIGGER IF EXISTS bridge_domestique_touch_customer ON domestique_touches;
CREATE TRIGGER bridge_domestique_touch_customer
  BEFORE INSERT OR UPDATE OF contact_id, store_customer_id ON domestique_touches
  FOR EACH ROW
  EXECUTE FUNCTION private.bridge_domestique_touch_customer();
CREATE TRIGGER project_domestique_touch_event
  AFTER INSERT OR UPDATE OF contact_id, store_customer_id, attributed_revenue ON domestique_touches
  FOR EACH ROW
  WHEN (NEW.store_customer_id IS NOT NULL)
  EXECUTE FUNCTION private.project_domestique_touch_event();

DROP TRIGGER IF EXISTS project_campaign_recipient_event ON crm_campaign_recipients;
CREATE TRIGGER project_campaign_recipient_event
  AFTER INSERT OR UPDATE OF status, sent_at ON crm_campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION private.project_campaign_recipient_event();

DROP TRIGGER IF EXISTS sync_legacy_email_suppression ON store_customer_consents;
CREATE TRIGGER sync_legacy_email_suppression
  AFTER INSERT OR UPDATE OF status, withdrawn_at ON store_customer_consents
  FOR EACH ROW
  WHEN (NEW.channel = 'email' AND NEW.purpose = 'marketing')
  EXECUTE FUNCTION private.sync_legacy_email_suppression();

DROP TRIGGER IF EXISTS sync_consent_from_legacy_email ON crm_contacts;
CREATE TRIGGER sync_consent_from_legacy_email
  AFTER UPDATE OF opted_out ON crm_contacts
  FOR EACH ROW
  WHEN (NEW.customer_id IS NOT NULL AND NEW.opted_out IS DISTINCT FROM OLD.opted_out)
  EXECUTE FUNCTION private.sync_consent_from_legacy_email();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.guard_trust_grant_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'A revoked trust grant is immutable.';
  END IF;
  IF (
    NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.agent_key IS DISTINCT FROM OLD.agent_key
    OR NEW.programme_key IS DISTINCT FROM OLD.programme_key
    OR NEW.action_type IS DISTINCT FROM OLD.action_type
    OR NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.parameter_constraints IS DISTINCT FROM OLD.parameter_constraints
    OR NEW.max_recipients IS DISTINCT FROM OLD.max_recipients
    OR NEW.daily_limit IS DISTINCT FROM OLD.daily_limit
    OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
    OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  ) THEN
    RAISE EXCEPTION 'Trust-grant scope is immutable; revoke and create a new grant.';
  END IF;
  NEW.revoked_at := COALESCE(NEW.revoked_at, NOW());
  NEW.revoked_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_trust_grant_revoke ON store_agent_trust_grants;
CREATE TRIGGER guard_trust_grant_revoke
  BEFORE UPDATE ON store_agent_trust_grants
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_trust_grant_revoke();

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stores_member_select" ON stores;
CREATE POLICY "stores_member_select"
  ON stores FOR SELECT
  USING (owner_user_id = auth.uid() OR private.is_store_member(id));
DROP POLICY IF EXISTS "stores_owner_insert" ON stores;
CREATE POLICY "stores_owner_insert"
  ON stores FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'bicycle_store_verified',
      'false'
    ) = 'true'
    AND EXISTS (
      SELECT 1
      FROM users profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_type = 'bicycle_store'
        AND profile.bicycle_store IS TRUE
    )
  );
DROP POLICY IF EXISTS "stores_owner_update" ON stores;
CREATE POLICY "stores_owner_update"
  ON stores FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'bicycle_store_verified',
      'false'
    ) = 'true'
    AND EXISTS (
      SELECT 1
      FROM users profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_type = 'bicycle_store'
        AND profile.bicycle_store IS TRUE
    )
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'bicycle_store_verified',
      'false'
    ) = 'true'
    AND EXISTS (
      SELECT 1
      FROM users profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_type = 'bicycle_store'
        AND profile.bicycle_store IS TRUE
    )
  );

DROP POLICY IF EXISTS "store_memberships_member_select" ON store_memberships;
CREATE POLICY "store_memberships_member_select"
  ON store_memberships FOR SELECT
  USING (user_id = auth.uid() OR private.can_manage_store(store_id));
DROP POLICY IF EXISTS "store_memberships_manager_insert" ON store_memberships;
CREATE POLICY "store_memberships_manager_insert"
  ON store_memberships FOR INSERT
  WITH CHECK (private.can_manage_store(store_id) AND role <> 'owner');
DROP POLICY IF EXISTS "store_memberships_manager_update" ON store_memberships;
CREATE POLICY "store_memberships_manager_update"
  ON store_memberships FOR UPDATE
  USING (private.can_manage_store(store_id) AND role <> 'owner')
  WITH CHECK (private.can_manage_store(store_id) AND role <> 'owner');
DROP POLICY IF EXISTS "store_memberships_manager_delete" ON store_memberships;
CREATE POLICY "store_memberships_manager_delete"
  ON store_memberships FOR DELETE
  USING (private.can_manage_store(store_id) AND role <> 'owner');

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_customers',
    'store_customer_identities',
    'store_customer_merge_proposals',
    'store_customer_merge_audit',
    'store_customer_consents',
    'store_customer_bikes',
    'store_customer_workorders',
    'store_customer_events',
    'store_customer_tasks',
    'store_agent_actions',
    'store_agent_action_audit',
    'store_agent_trust_grants',
    'store_customer_programme_enrolments',
    'store_community_events',
    'store_community_attendance',
    'store_loyalty_programmes',
    'store_loyalty_ledger',
    'store_crm_sync_state',
    'store_crm_performance_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_customers',
    'store_customer_identities',
    'store_customer_consents',
    'store_customer_bikes',
    'store_customer_tasks',
    'store_customer_programme_enrolments',
    'store_community_events',
    'store_community_attendance'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "%s_member_all" ON %I FOR ALL USING (private.is_store_member(store_id)) WITH CHECK (private.is_store_member(store_id))',
      table_name,
      table_name
    );
  END LOOP;
END
$$;

CREATE POLICY "store_customer_workorders_member_select"
  ON store_customer_workorders FOR SELECT
  USING (private.is_store_member(store_id));

CREATE POLICY "store_customer_events_member_select"
  ON store_customer_events FOR SELECT
  USING (private.is_store_member(store_id));
CREATE POLICY "store_customer_events_member_insert"
  ON store_customer_events FOR INSERT
  WITH CHECK (private.is_store_member(store_id));

CREATE POLICY "store_customer_merge_proposals_member_select"
  ON store_customer_merge_proposals FOR SELECT
  USING (private.is_store_member(store_id));
CREATE POLICY "store_customer_merge_proposals_manager_all"
  ON store_customer_merge_proposals FOR ALL
  USING (private.can_manage_store(store_id))
  WITH CHECK (private.can_manage_store(store_id));

CREATE POLICY "store_customer_merge_audit_member_select"
  ON store_customer_merge_audit FOR SELECT
  USING (private.is_store_member(store_id));

CREATE POLICY "store_agent_actions_member_select"
  ON store_agent_actions FOR SELECT
  USING (private.is_store_member(store_id));

CREATE POLICY "store_agent_action_audit_member_select"
  ON store_agent_action_audit FOR SELECT
  USING (private.is_store_member(store_id));

CREATE POLICY "store_agent_trust_grants_member_select"
  ON store_agent_trust_grants FOR SELECT
  USING (private.is_store_member(store_id));
CREATE POLICY "store_agent_trust_grants_manager_insert"
  ON store_agent_trust_grants FOR INSERT
  WITH CHECK (
    private.can_manage_store(store_id)
    AND granted_by = auth.uid()
    AND revoked_at IS NULL
    AND revoked_by IS NULL
  );
CREATE POLICY "store_agent_trust_grants_manager_revoke"
  ON store_agent_trust_grants FOR UPDATE
  USING (private.can_manage_store(store_id))
  WITH CHECK (private.can_manage_store(store_id));

CREATE POLICY "store_loyalty_programmes_member_select"
  ON store_loyalty_programmes FOR SELECT
  USING (private.is_store_member(store_id));
CREATE POLICY "store_loyalty_programmes_manager_all"
  ON store_loyalty_programmes FOR ALL
  USING (private.can_manage_store(store_id))
  WITH CHECK (private.can_manage_store(store_id));

CREATE POLICY "store_loyalty_ledger_member_select"
  ON store_loyalty_ledger FOR SELECT
  USING (private.is_store_member(store_id));
CREATE POLICY "store_loyalty_ledger_manager_insert"
  ON store_loyalty_ledger FOR INSERT
  WITH CHECK (private.can_manage_store(store_id));

CREATE POLICY "store_crm_sync_state_member_select"
  ON store_crm_sync_state FOR SELECT
  USING (private.is_store_member(store_id));

CREATE POLICY "store_crm_performance_events_manager_select"
  ON store_crm_performance_events FOR SELECT
  USING (private.can_manage_store(store_id));
CREATE POLICY "store_crm_performance_events_member_insert"
  ON store_crm_performance_events FOR INSERT
  WITH CHECK (
    private.is_store_member(store_id)
    AND user_id = auth.uid()
  );

-- Existing inbox/payment tables remain owner-keyed during the staged migration.
-- Active store members may operate rows scoped to that owner; existing owner
-- policies remain in place.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_customer_inquiries',
    'store_customer_inquiry_events',
    'store_email_style_profiles',
    'store_customer_inquiry_reads',
    'store_customer_inquiry_banned_senders',
    'store_inbox_connection_state',
    'store_nest_conversations',
    'store_nest_messages',
    'store_nest_conversation_reads',
    'store_nest_conversation_closes',
    'store_nest_hidden_pickup_suggestions',
    'store_gmail_hidden_response_suggestions',
    'store_google_business_connections'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "%s_store_member_all" ON %I FOR ALL USING (private.is_store_member_for_owner(user_id)) WITH CHECK (private.is_store_member_for_owner(user_id))',
      table_name,
      table_name
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'crm_contacts',
    'crm_campaigns',
    'crm_campaign_recipients',
    'crm_contact_groups',
    'crm_contact_group_members',
    'crm_email_templates',
    'crm_agent_runs',
    'crm_audience_presets',
    'crm_scheduled_campaigns',
    'crm_lifecycle_settings',
    'crm_lifecycle_states',
    'crm_lifecycle_transitions',
    'crm_lifecycle_programs',
    'crm_lifecycle_touches',
    'crm_lifecycle_daily',
    'crm_lifecycle_insights',
    'domestique_config',
    'domestique_runs',
    'domestique_touches',
    'domestique_receipts'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "%s_store_member_all" ON %I FOR ALL USING (private.is_store_member_for_owner(user_id)) WITH CHECK (private.is_store_member_for_owner(user_id))',
      table_name,
      table_name
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "crm_lifecycle_actions_owner_all" ON crm_lifecycle_actions;
CREATE POLICY "crm_lifecycle_actions_owner_select"
  ON crm_lifecycle_actions FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "crm_lifecycle_actions_store_member_select"
  ON crm_lifecycle_actions FOR SELECT
  USING (private.is_store_member_for_owner(user_id));

DROP POLICY IF EXISTS "domestique_opportunities_owner_all" ON domestique_opportunities;
CREATE POLICY "domestique_opportunities_owner_select"
  ON domestique_opportunities FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "domestique_opportunities_store_member_select"
  ON domestique_opportunities FOR SELECT
  USING (private.is_store_member_for_owner(user_id));

CREATE POLICY "store_payment_requests_store_member_all"
  ON store_payment_requests FOR ALL
  USING (private.is_store_member_for_owner(store_user_id))
  WITH CHECK (private.is_store_member_for_owner(store_user_id));
CREATE POLICY "store_customer_credits_store_member_all"
  ON store_customer_credits FOR ALL
  USING (private.is_store_member_for_owner(store_user_id))
  WITH CHECK (private.is_store_member_for_owner(store_user_id));

-- Portal tokens contain bearer credentials: only privileged server code may
-- access them. RLS is enabled with no authenticated policy.
ALTER TABLE store_customer_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Keep updated_at consistent across mutable CRM records.
DROP TRIGGER IF EXISTS stores_updated_at ON stores;
CREATE TRIGGER stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_memberships_updated_at ON store_memberships;
CREATE TRIGGER store_memberships_updated_at
  BEFORE UPDATE ON store_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_customers_updated_at ON store_customers;
CREATE TRIGGER store_customers_updated_at
  BEFORE UPDATE ON store_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_customer_consents_updated_at ON store_customer_consents;
CREATE TRIGGER store_customer_consents_updated_at
  BEFORE UPDATE ON store_customer_consents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_customer_bikes_updated_at ON store_customer_bikes;
CREATE TRIGGER store_customer_bikes_updated_at
  BEFORE UPDATE ON store_customer_bikes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_customer_workorders_updated_at ON store_customer_workorders;
CREATE TRIGGER store_customer_workorders_updated_at
  BEFORE UPDATE ON store_customer_workorders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_customer_tasks_updated_at ON store_customer_tasks;
CREATE TRIGGER store_customer_tasks_updated_at
  BEFORE UPDATE ON store_customer_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_agent_actions_updated_at ON store_agent_actions;
CREATE TRIGGER store_agent_actions_updated_at
  BEFORE UPDATE ON store_agent_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_customer_programme_enrolments_updated_at ON store_customer_programme_enrolments;
CREATE TRIGGER store_customer_programme_enrolments_updated_at
  BEFORE UPDATE ON store_customer_programme_enrolments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_community_events_updated_at ON store_community_events;
CREATE TRIGGER store_community_events_updated_at
  BEFORE UPDATE ON store_community_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS store_loyalty_programmes_updated_at ON store_loyalty_programmes;
CREATE TRIGGER store_loyalty_programmes_updated_at
  BEFORE UPDATE ON store_loyalty_programmes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Only the two
-- membership predicates are intended to be callable from authenticated SQL;
-- projection/bootstrap functions run exclusively as triggers.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM authenticated;
GRANT EXECUTE ON FUNCTION private.is_store_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_store(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_store_member_for_owner(UUID) TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
