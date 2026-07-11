// The planner: decide who each program should touch today.
//
// Deterministic eligibility → guardrails (one global frequency cap across
// lifecycle sends, manual campaigns AND Domestique plays; per-program
// cooldowns; opt-outs; deterministic holdout split) → composed action.
// Review-mode programs park the action for approval; auto-mode programs
// are executed by the engine immediately after planning.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isHoldoutContact } from "@/lib/domestique/guardrails";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "../postgrest-page";
import { normalizeEmail } from "../types";
import { composeProgramEmail, loadLifecycleComposeContext } from "./compose";
import { readProgramAbConfig } from "./template-config";
import { stageDefinition } from "./stages";
import type {
  LifecycleActionTarget,
  LifecycleProgram,
  LifecycleSettings,
  LifecycleStage,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cap live recipients per program run — a safety valve, not a target. */
const MAX_LIVE_PER_RUN = 250;
/** Don't bother running a program for fewer than this many live contacts. */
const MIN_LIVE_PER_RUN = 3;
/** Unapproved actions expire after a week so the queue never rots. */
const ACTION_TTL_DAYS = 7;

export type PlannedAction = {
  actionId: string;
  program: LifecycleProgram;
  liveCount: number;
  holdoutCount: number;
};

type EligibleContact = {
  contact_id: string;
  email: string;
  first_name: string | null;
  lightspeed_customer_id: string | null;
  last_purchase_at: string | null;
  total_spend: number;
  entered_at: string;
};

/** Contacts sent ANY marketing email recently, across all three systems. */
async function fetchRecentlyEmailedContactIds(
  supabase: SupabaseClient,
  userId: string,
  capDays: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - capDays * DAY_MS).toISOString();

  // Paged — a single big campaign can exceed PostgREST's 1000-row cap, and a
  // truncated read here would silently break the frequency cap.
  const [campaignRows, domestiqueRows, lifecycleRows] = await Promise.all([
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_campaign_recipients")
          .select("contact_id")
          .eq("user_id", userId)
          .gte("sent_at", since)
          .not("contact_id", "is", null)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }),
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("domestique_touches")
          .select("contact_id")
          .eq("user_id", userId)
          .eq("is_holdout", false)
          .gte("touched_at", since)
          .not("contact_id", "is", null)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }),
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_lifecycle_touches")
          .select("contact_id")
          .eq("user_id", userId)
          .eq("is_holdout", false)
          .gte("touched_at", since)
          .not("contact_id", "is", null)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }),
  ]);

  const ids = new Set<string>();
  for (const rows of [campaignRows, domestiqueRows, lifecycleRows]) {
    for (const row of rows as Array<{ contact_id: string | null }>) {
      if (row.contact_id) ids.add(row.contact_id);
    }
  }
  return ids;
}

/** Contacts this specific program touched (or held out) inside its cooldown. */
async function fetchProgramTouchedContactIds(
  supabase: SupabaseClient,
  userId: string,
  programKey: string,
  cooldownDays: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - cooldownDays * DAY_MS).toISOString();
  const rows = await fetchAllPostgrestPages({
    fetchPage: (from, to) =>
      supabase
        .from("crm_lifecycle_touches")
        .select("contact_id")
        .eq("user_id", userId)
        .eq("program_key", programKey)
        .gte("touched_at", since)
        .not("contact_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    pageSize: POSTGREST_PAGE_SIZE,
  });
  const ids = new Set<string>();
  for (const row of rows as Array<{ contact_id: string | null }>) {
    if (row.contact_id) ids.add(row.contact_id);
  }
  return ids;
}

async function fetchEligibleContacts(
  supabase: SupabaseClient,
  userId: string,
  stage: LifecycleStage,
  entryDelayDays: number,
): Promise<EligibleContact[]> {
  const enteredBefore = new Date(Date.now() - entryDelayDays * DAY_MS).toISOString();

  const stateRows = (await fetchAllPostgrestPages({
    fetchPage: (from, to) =>
      supabase
        .from("crm_lifecycle_states")
        .select("contact_id, entered_at")
        .eq("user_id", userId)
        .eq("stage", stage)
        .lte("entered_at", enteredBefore)
        .order("contact_id", { ascending: true })
        .range(from, to),
    pageSize: POSTGREST_PAGE_SIZE,
  })) as Array<{ contact_id: string; entered_at: string }>;
  if (stateRows.length === 0) return [];

  const enteredByContact = new Map(stateRows.map((row) => [row.contact_id, row.entered_at]));
  const eligible: EligibleContact[] = [];
  const contactIds = stateRows.map((row) => row.contact_id);

  for (let i = 0; i < contactIds.length; i += 500) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, email, first_name, lightspeed_customer_id, last_purchase_at, total_spend, opted_out")
      .eq("user_id", userId)
      .eq("opted_out", false)
      .in("id", contactIds.slice(i, i + 500));
    for (const row of data ?? []) {
      const email = normalizeEmail(String(row.email ?? ""));
      if (!email) continue;
      eligible.push({
        contact_id: String(row.id),
        email,
        first_name: (row.first_name as string | null) ?? null,
        lightspeed_customer_id: (row.lightspeed_customer_id as string | null) ?? null,
        last_purchase_at: (row.last_purchase_at as string | null) ?? null,
        total_spend: Number(row.total_spend ?? 0),
        entered_at: enteredByContact.get(String(row.id)) ?? new Date().toISOString(),
      });
    }
  }
  return eligible;
}

function contactContext(contact: EligibleContact, stage: LifecycleStage): string {
  const parts: string[] = [];
  if (contact.last_purchase_at) {
    const days = Math.round(
      (Date.now() - new Date(contact.last_purchase_at).getTime()) / DAY_MS,
    );
    parts.push(`last purchase ${days}d ago`);
  } else {
    parts.push("no purchase yet");
  }
  if (contact.total_spend > 0) parts.push(`$${Math.round(contact.total_spend).toLocaleString()} lifetime`);
  parts.push(`entered ${stageDefinition(stage).label.toLowerCase()} ${new Date(contact.entered_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`);
  return parts.join(" · ");
}

/** Expire stale unapproved actions so the queue reflects today, not last month. */
export async function expireStaleActions(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase
    .from("crm_lifecycle_actions")
    .update({ status: "expired", status_detail: "Approval window lapsed" })
    .eq("user_id", userId)
    .eq("status", "awaiting_approval")
    .lt("expires_at", new Date().toISOString());
}

/**
 * Plan one program: find due contacts, apply every guardrail, compose the
 * email, insert the action row. Returns null when there's nothing worth doing.
 */
export async function planProgramAction(
  supabase: SupabaseClient,
  userId: string,
  settings: LifecycleSettings,
  program: LifecycleProgram,
): Promise<PlannedAction | null> {
  if (!program.enabled) return null;

  // One pending action per program at a time — approvals must stay meaningful.
  const { count: pendingCount } = await supabase
    .from("crm_lifecycle_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("program_key", program.key)
    .in("status", ["awaiting_approval", "approved", "executing"]);
  if ((pendingCount ?? 0) > 0) return null;

  const [eligible, recentlyEmailed, programTouched] = await Promise.all([
    fetchEligibleContacts(supabase, userId, program.stage, program.entry_delay_days),
    fetchRecentlyEmailedContactIds(supabase, userId, settings.frequency_cap_days),
    fetchProgramTouchedContactIds(supabase, userId, program.key, program.cooldown_days),
  ]);

  const targets: LifecycleActionTarget[] = [];
  let liveCount = 0;
  for (const contact of eligible) {
    if (recentlyEmailed.has(contact.contact_id)) continue;
    if (programTouched.has(contact.contact_id)) continue;
    const isHoldout = isHoldoutContact(contact.contact_id, settings.holdout_percent);
    if (!isHoldout && liveCount >= MAX_LIVE_PER_RUN) continue;
    if (!isHoldout) liveCount += 1;
    targets.push({
      contact_id: contact.contact_id,
      email: contact.email,
      first_name: contact.first_name,
      lightspeed_customer_id: contact.lightspeed_customer_id,
      context: contactContext(contact, program.stage),
      is_holdout: isHoldout,
    });
  }
  if (liveCount < MIN_LIVE_PER_RUN) return null;

  const holdoutCount = targets.length - liveCount;
  const stageLabel = stageDefinition(program.stage).label;
  const audienceSummary = `${liveCount} customers currently in the "${stageLabel}" stage, past the ${program.entry_delay_days}-day entry delay, none emailed by any campaign in the last ${settings.frequency_cap_days} days.`;

  const composeCtx = await loadLifecycleComposeContext(supabase, userId, program.key);
  const email = await composeProgramEmail(program, composeCtx, audienceSummary, supabase, userId);
  const ab = readProgramAbConfig(program);

  // Shop-facing, plain English — this renders verbatim on the approval card.
  const reasoning = [
    `These ${liveCount.toLocaleString()} customers are due the ${program.name} email: they've been in "${stageLabel}" for a while and none of them have heard from you in at least ${settings.frequency_cap_days} days.`,
    holdoutCount > 0
      ? `${holdoutCount.toLocaleString()} similar customers are deliberately left out, so the extra sales this email creates can be proven, not guessed.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const { data: inserted, error } = await supabase
    .from("crm_lifecycle_actions")
    .insert({
      user_id: userId,
      program_id: program.id,
      program_key: program.key,
      stage: program.stage,
      status: "awaiting_approval",
      subject: email.subject,
      reasoning,
      payload: {
        email,
        targets,
        ...(ab.enabled ? { ab: { subject_b: ab.subject_b } } : {}),
      },
      contact_count: liveCount,
      holdout_count: holdoutCount,
      expires_at: new Date(Date.now() + ACTION_TTL_DAYS * DAY_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[lifecycle/planner] action insert failed:", error?.message);
    return null;
  }

  return { actionId: String(inserted.id), program, liveCount, holdoutCount };
}
