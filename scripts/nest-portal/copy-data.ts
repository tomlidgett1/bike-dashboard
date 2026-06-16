/**
 * Copy Nest BUSINESS-portal data -> Yellow Jersey Supabase.
 *
 * Reads from the Nest project (service-role) and upserts into YJ (service-role), table by
 * table, in FK-dependency order. Shared tables are filtered to the business slice (e.g.
 * conversation_messages where engagement_scope='brand') so no individual data comes over.
 *
 * Run AFTER the schema migration (20260616090000_nest_business_portal_schema.sql) is applied
 * to YJ. Idempotent: re-running upserts on the primary key.
 *
 *   NEST_SUPABASE_URL=... NEST_SUPABASE_SECRET_KEY=... \
 *   YJ_SUPABASE_URL=... YJ_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/nest-portal/copy-data.ts [--dry-run] [--only=table1,table2]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type TableSpec = {
  table: string;
  /** PostgREST filter applied to the source read, e.g. ["engagement_scope", "eq", "brand"]. */
  filter?: [column: string, op: "eq" | "neq" | "is", value: string | boolean];
  /** Conflict target for upsert (defaults to the primary key). */
  onConflict?: string;
};

// FK-dependency order: independent / parent tables first, children after.
const TABLES: TableSpec[] = [
  // brand identity + integration state (independent, keyed by brand_key)
  { table: "user_profiles" },
  { table: "nest_brand_chat_config" },
  { table: "nest_brand_portal_connections" },
  { table: "nest_brand_portal_secrets" },
  { table: "nest_brand_oauth_states" },
  { table: "nest_brand_onboard_jobs" },
  { table: "brand_sessions" },
  { table: "onboarding_events" },
  { table: "admin_onboarding_prompts" },
  // messaging core (conversation_messages is shared -> business slice only)
  { table: "conversation_messages", filter: ["engagement_scope", "eq", "brand"] },
  { table: "conversation_summaries" },
  { table: "outbound_messages" },
  { table: "message_buffer" },
  { table: "linq_human_mode_threads" },
  { table: "linq_send_failures" },
  { table: "analytics_message_facts" },
  // automations
  { table: "automation_preferences" },
  { table: "automation_runs" },
  { table: "customer_automation_rule_state" },
  { table: "nest_brand_reporting_automation_runs" },
  // voice / outbound calling
  { table: "buzz_sessions" },
  { table: "buzz_call_jobs" },
  { table: "buzz_events" },
  { table: "nest_outbound_call_jobs" },
  { table: "twilio_voice_welcome_rate" },
  // lightspeed cache (sale before sale_line FK)
  { table: "nest_brand_lightspeed_sync_state" },
  { table: "nest_brand_lightspeed_backfill_state" },
  { table: "nest_brand_lightspeed_transaction_export_state" },
  { table: "nest_brand_lightspeed_item" },
  { table: "nest_brand_lightspeed_sale" },
  { table: "nest_brand_lightspeed_sale_line" },
  { table: "nest_brand_lightspeed_workorder" },
  { table: "nest_brand_lightspeed_booking_state" },
  { table: "nest_brand_lightspeed_transaction_line" },
  { table: "nest_brand_lightspeed_report_sale_line" },
  { table: "nest_brand_lightspeed_lookup_cache" },
  { table: "nest_brand_lightspeed_sql_query_log" },
  // knowledge base
  { table: "nest_brand_knowledge_items" },
  { table: "nest_brand_knowledge_chunks" },
  { table: "nest_brand_images" },
  { table: "nest_brand_deputy_pending_actions" },
  // iMessage text-upload (Yellow Jersey specific)
  { table: "yellow_jersey_ash_phone_routes" },
  { table: "yellow_jersey_upload_phone_routes" },
  { table: "yellow_jersey_upload_sessions" },
  // shared infra (operational — copy for continuity)
  { table: "notification_webhook_subscriptions" },
  { table: "notification_webhook_events" },
  { table: "webhook_events" },
  { table: "pending_inbound_images" },
  { table: "polling_cursors" },
  { table: "oauth_link_states" },
];

const PAGE = 1000;

function env(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  throw new Error(`Missing env: one of ${names.join(", ")}`);
}

async function copyTable(src: SupabaseClient, dst: SupabaseClient, spec: TableSpec, dryRun: boolean) {
  let from = 0;
  let total = 0;
  for (;;) {
    let q = src.from(spec.table).select("*").range(from, from + PAGE - 1);
    if (spec.filter) {
      const [col, op, val] = spec.filter;
      q = op === "is" ? q.is(col, val as boolean) : op === "neq" ? q.neq(col, val) : q.eq(col, val);
    }
    const { data, error } = await q;
    if (error) {
      console.error(`  ✗ ${spec.table}: read failed: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) break;
    if (!dryRun) {
      const { error: upErr } = await dst
        .from(spec.table)
        .upsert(data, spec.onConflict ? { onConflict: spec.onConflict } : undefined);
      if (upErr) {
        console.error(`  ✗ ${spec.table}: upsert failed @${from}: ${upErr.message}`);
        return;
      }
    }
    total += data.length;
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  ✓ ${spec.table}: ${dryRun ? "would copy" : "copied"} ${total} rows`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;

  const src = createClient(
    env("NEST_SUPABASE_URL"),
    env("NEST_SUPABASE_SECRET_KEY", "NEST_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const dst = createClient(
    env("YJ_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    env("YJ_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  console.log(`Nest -> YJ data copy${dryRun ? " (DRY RUN)" : ""}`);
  for (const spec of TABLES) {
    if (only && !only.has(spec.table)) continue;
    await copyTable(src, dst, spec, dryRun);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
