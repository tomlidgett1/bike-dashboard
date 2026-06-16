#!/usr/bin/env python3
"""Filter the full Nest public-schema dump down to the BUSINESS portal subset.

Strategy: keep everything that is NOT attached to a clearly-individual table.
- Types, functions, extensions, schema-level statements -> always kept (harmless
  if an individual feature's function is unused; bodies aren't validated).
- Table-attached statements (CREATE TABLE / ALTER TABLE / INDEX / SEQUENCE /
  TRIGGER / POLICY / COMMENT / GRANT) -> dropped iff their owning table (the first
  "public"."<name>" reference) is in EXCLUDE.
"""
import re
import sys

EXCLUDE = set("""
NESTV3_agent_artifacts NESTV3_agent_pending_intents NESTV3_agent_run_steps
NESTV3_agent_runs NESTV3_agent_specs NESTV3_automation_runs NESTV3_automations
NESTV3_runtime_debug_events NESTV3_tool_profiles NESTV3_user_connected_accounts
bank_conversations bank_messages fiskil_accounts fiskil_connections live_fiskil
composio_mode_sessions composio_trigger_registrations
contact_delegation_messages contact_delegation_opt_outs contact_delegation_tasks
entities entity_timeline
hey_comp_acks hey_comp_agent_runs hey_comp_agent_tool_calls hey_comp_agent_triggers
hey_comp_agents hey_comp_pending_confirmations hey_comp_pending_resume_tasks
hey_comp_router_decisions hey_comp_scheduled_jobs hey_comp_scheduled_runs
hey_comp_smart_runs
memory_items moments moment_admin_audit_log moment_executions moment_global_config
moment_user_suppressions moment_versions
quid_backfill_jobs quid_dashboard_tokens quid_inbound_events quid_opportunity_runs
quid_profile_runs quid_scan_findings quid_scan_runs quid_users
reminders proactive_messages calendar_event_notification_snapshots
email_watch_trigger_deliveries search_documents search_embeddings
tool_traces turn_traces ingestion_jobs ingestion_tasks
group_chats group_chat_members notification_watch_triggers
user_document_chunks granola_oauth_state _debug_log deleted_accounts pending_actions
conversations
""".split())

# Statement leads that are NEVER table-attached -> always keep.
KEEP_PREFIX = re.compile(
    r'^\s*(SET\b|SELECT\s+pg_catalog\.set_config|CREATE\s+SCHEMA|ALTER\s+SCHEMA|COMMENT\s+ON\s+SCHEMA|'
    r'CREATE\s+EXTENSION|CREATE\s+TYPE|ALTER\s+TYPE|CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|'
    r'CREATE\s+(OR\s+REPLACE\s+)?PROCEDURE|CREATE\s+(OR\s+REPLACE\s+)?AGGREGATE|'
    r'CREATE\s+DOMAIN|CREATE\s+CAST)',
    re.IGNORECASE)

REF = re.compile(r'"public"\."([A-Za-z0-9_]+)"')


def split_statements(sql):
    """Split SQL on top-level semicolons, respecting $tag$...$tag$ dollar quotes
    and '...' single-quoted strings."""
    stmts, buf = [], []
    i, n = 0, len(sql)
    dollar = None
    in_squote = False
    while i < n:
        if dollar:
            if sql.startswith(dollar, i):
                buf.append(dollar); i += len(dollar); dollar = None
            else:
                buf.append(sql[i]); i += 1
            continue
        if in_squote:
            buf.append(sql[i])
            if sql[i] == "'":
                in_squote = False
            i += 1
            continue
        m = re.match(r'\$[A-Za-z_0-9]*\$', sql[i:])
        if m:
            dollar = m.group(0); buf.append(dollar); i += len(dollar); continue
        if sql[i] == "'":
            in_squote = True; buf.append(sql[i]); i += 1; continue
        if sql[i] == ';':
            buf.append(';'); stmts.append(''.join(buf)); buf = []; i += 1; continue
        buf.append(sql[i]); i += 1
    if ''.join(buf).strip():
        stmts.append(''.join(buf))
    return stmts


def owning_table(stmt):
    m = REF.search(stmt)
    return m.group(1) if m else None


SEQNAME = re.compile(r'(?:CREATE|ALTER)\s+SEQUENCE\s+(?:IF NOT EXISTS\s+)?"public"\."([A-Za-z0-9_]+)"', re.IGNORECASE)


def _ref_excluded(name):
    """True if a public identifier is an excluded table or a dependent object named
    after one (e.g. moments_id_seq, NESTV3_..._id_seq, table_pkey)."""
    if name in EXCLUDE:
        return True
    for ex in EXCLUDE:
        if name.startswith(ex + '_'):
            return True
    return False


def stmt_targets_excluded(stmt):
    """True if the statement references any excluded table or a dependent object
    named after one."""
    return any(_ref_excluded(r) for r in REF.findall(stmt))


def is_excluded_nonfunction(stmt):
    return stmt_targets_excluded(stmt)


FUNC_DEF = re.compile(r'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"public"\."([A-Za-z0-9_]+)"', re.IGNORECASE)


def main():
    sql = open('/tmp/nest_schema_multi.sql').read()
    stmts = split_statements(sql)
    kept, dropped = [], []
    dropped_tables = set()
    dropped_names = set()  # every public object name (table/seq/func) whose CREATE we drop

    DEP = re.compile(r'^\s*(GRANT|REVOKE|COMMENT\s+ON|ALTER|SECURITY\s+LABEL|SELECT\s+pg_catalog\.setval)\b', re.IGNORECASE)

    # Pass 1: decide CREATE-object statements; record names of every dropped object.
    decided = []  # (stmt, keep)
    for st in stmts:
        body = st.strip()
        if not body:
            continue
        fm = FUNC_DEF.match(body)
        if fm:
            if set(REF.findall(body)) & EXCLUDE:
                dropped.append(st); dropped_names.add(fm.group(1)); decided.append((st, False)); continue
            decided.append((st, True)); continue
        if KEEP_PREFIX.match(body):
            decided.append((st, True)); continue
        if is_excluded_nonfunction(body):
            t = owning_table(body)
            dropped.append(st)
            if t:
                dropped_tables.add(t)
            # record the created object's own name (CREATE TABLE/SEQUENCE "public"."X")
            cm = re.match(r'^\s*CREATE\s+(?:TABLE|SEQUENCE|VIEW|MATERIALIZED VIEW)\s+(?:IF NOT EXISTS\s+)?"public"\."([A-Za-z0-9_]+)"', body, re.IGNORECASE)
            if cm:
                dropped_names.add(cm.group(1))
            # identity-column sequences can be named unrelated to their table
            # (e.g. notification_watch_triggers -> email_watch_triggers_id_seq); harvest them
            for sm in re.finditer(r'SEQUENCE NAME "public"\."([A-Za-z0-9_]+)"', body, re.IGNORECASE):
                dropped_names.add(sm.group(1))
            decided.append((st, False)); continue
        decided.append((st, True))

    # Pass 2: drop orphaned dependent statements (GRANT/COMMENT/REVOKE/ALTER) that
    # reference any dropped object by name.
    for st, keep in decided:
        if not keep:
            continue
        if DEP.match(st.strip()):
            # orphaned grant/comment/setval on an excluded object (seq/table) or a dropped function
            if stmt_targets_excluded(st) or (dropped_names and (set(REF.findall(st)) & dropped_names)):
                dropped.append(st); continue
        kept.append(st)

    out = '\n'.join(s.strip() for s in kept) + '\n'
    open('/tmp/nest_business_schema.sql', 'w').write(out)

    # report
    created = sorted(set(re.findall(r'CREATE TABLE (?:IF NOT EXISTS )?"public"\."([A-Za-z0-9_]+)"', out)))
    sys.stderr.write(f"kept statements: {len(kept)}  dropped: {len(dropped)}\n")
    sys.stderr.write(f"tables kept ({len(created)}): {' '.join(created)}\n")
    sys.stderr.write(f"excluded tables actually dropped ({len(dropped_tables)}): {' '.join(sorted(dropped_tables))}\n")
    # leakage check: any reference to an excluded table remaining in kept output?
    leaks = sorted({m for m in re.findall(r'"public"\."([A-Za-z0-9_]+)"', out) if m in EXCLUDE})
    sys.stderr.write(f"LEAKED references to excluded tables in kept output: {leaks if leaks else 'NONE'}\n")


if __name__ == '__main__':
    main()
