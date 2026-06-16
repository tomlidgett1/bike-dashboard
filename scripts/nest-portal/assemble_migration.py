#!/usr/bin/env python3
"""Assemble the final YJ migration from the filtered Nest business schema.

- Strips session SETs, schema-level statements, and OWNER TO statements
  (objects will be owned by the migration runner on the YJ project).
- Prepends required extensions + the pgmq queue the inbound pipeline uses.
"""
import re
import sys
sys.path.insert(0, '/tmp')
from filter_schema import split_statements

# Strip session SETs and ONLY the public-schema scaffolding (keep full_review/private schemas).
SKIP = re.compile(
    r'^\s*(SET\b|SELECT\s+pg_catalog\.set_config|'
    r'(CREATE|ALTER)\s+SCHEMA\s+(IF NOT EXISTS\s+)?"public"|'
    r'COMMENT\s+ON\s+SCHEMA\s+"public")',
    re.IGNORECASE)
OWNER = re.compile(r'\bOWNER\s+TO\b', re.IGNORECASE)

PRELUDE = """-- ============================================================================
-- Nest BUSINESS portal -> Yellow Jersey (single Supabase project)
-- (function-body validation off: some retained helper functions reference
--  intentionally-excluded individual tables; bodies are valid in production.)
-- ============================================================================
SET check_function_bodies = false;
-- ============================================================================
-- Schema lifted from the live Nest "Nest Chat" project (oypzijwqmkxktvgtsqkp),
-- filtered to the business/brand-portal subset (65 tables). Individual/personal
-- assistant tables (moments, quid, hey_comp, bank, entities, memory, etc.) are
-- intentionally excluded. `conversations` is excluded to avoid colliding with
-- YJ's existing marketplace-messaging table (the portal uses conversation_messages).
-- Additive only: no existing YJ object is modified or dropped.
-- ============================================================================

-- Required extensions (no-op if already enabled on this project)
create extension if not exists "vector" with schema "extensions";
create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pgmq";

-- pg_cron powers the brand reporting/automation schedules (functions call cron.schedule).
-- On Supabase this is normally enabled via the dashboard; create resiliently so the
-- migration still applies where pg_cron is not preloaded (functions create either way).
do $$
begin
  create extension if not exists "pg_cron";
exception when others then
  raise notice 'pg_cron not enabled in this environment; enable via Supabase dashboard before relying on scheduled automations';
end $$;

-- Business helper schemas (full_review jobs, private analytics views) are created by the
-- body below; ensure they exist defensively.
create schema if not exists "full_review";
create schema if not exists "private";

-- pgmq queue used by the inbound message pipeline (process-inbound-queue)
do $$
begin
  perform pgmq.create('inbound_events');
exception when others then null;  -- already exists / version differences
end $$;

"""


def main():
    body = open('/tmp/nest_business_schema.sql').read()
    out = [PRELUDE]
    skipped_owner = skipped_prelude = kept = 0
    for st in split_statements(body):
        s = st.strip()
        if not s:
            continue
        if SKIP.match(s):
            skipped_prelude += 1
            continue
        if OWNER.search(s) and re.match(r'^\s*ALTER\b', s, re.IGNORECASE):
            skipped_owner += 1
            continue
        out.append(s if s.endswith(';') else s + ';')
        kept += 1
    text = '\n'.join(out) + '\n'
    dest = '/Users/user/Bike/bike-dashboard/supabase/migrations/20260616090000_nest_business_portal_schema.sql'
    open(dest, 'w').write(text)
    sys.stderr.write(f"kept statements: {kept}  | stripped OWNER TO: {skipped_owner}  | stripped prelude: {skipped_prelude}\n")
    sys.stderr.write(f"wrote {dest} ({text.count(chr(10))} lines)\n")


if __name__ == '__main__':
    main()
