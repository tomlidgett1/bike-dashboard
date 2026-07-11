// Assemble everything the Lifecycle UI needs in one call.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "../postgrest-page";
import { computeLifecycleStats } from "./attribution";
import { loadLifecyclePrograms } from "./programs";
import { loadLifecycleSettings } from "./settings";
import { computeThresholds, STAGE_DEFINITIONS } from "./stages";
import type {
  LifecycleAction,
  LifecycleImpact,
  LifecycleInsight,
  LifecycleProgram,
  LifecycleProgramStats,
  LifecycleSettings,
  LifecycleStage,
  LifecycleStageDistribution,
  LifecycleThresholds,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;


export type LifecycleAbResult = {
  subject_a: string;
  subject_b: string;
  a_count: number;
  b_count: number;
  a_open_rate: number | null;
  b_open_rate: number | null;
  executed_at: string | null;
};

export type LifecycleOverview = {
  settings: LifecycleSettings;
  thresholds: LifecycleThresholds;
  contactsTracked: number;
  distribution: LifecycleStageDistribution[];
  movements: Array<{ from: LifecycleStage | null; to: LifecycleStage; count: number }>;
  programs: Array<
    LifecycleProgram & { stats: LifecycleProgramStats | null; abLast: LifecycleAbResult | null }
  >;
  pendingActions: LifecycleAction[];
  recentActions: LifecycleAction[];
  impact: LifecycleImpact;
  insights: LifecycleInsight[];
};

function actionFromRow(row: Record<string, unknown>): LifecycleAction {
  return {
    id: String(row.id),
    program_id: (row.program_id as string | null) ?? null,
    program_key: String(row.program_key),
    stage: row.stage as LifecycleStage,
    status: row.status as LifecycleAction["status"],
    status_detail: (row.status_detail as string | null) ?? null,
    subject: String(row.subject ?? ""),
    reasoning: String(row.reasoning ?? ""),
    payload: (row.payload ?? { email: null, targets: [] }) as LifecycleAction["payload"],
    contact_count: Number(row.contact_count ?? 0),
    holdout_count: Number(row.holdout_count ?? 0),
    campaign_id: (row.campaign_id as string | null) ?? null,
    expires_at: (row.expires_at as string | null) ?? null,
    executed_at: (row.executed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

export async function loadLifecycleOverview(
  supabase: SupabaseClient,
  userId: string,
): Promise<LifecycleOverview> {
  const settings = await loadLifecycleSettings(supabase, userId);

  const [thresholds, programs, statsResult, stateRows, transitionRows, pendingRows, recentRows, insightRows] =
    await Promise.all([
      computeThresholds(supabase, userId, settings.thresholds),
      loadLifecyclePrograms(supabase, userId),
      computeLifecycleStats(supabase, userId, 90),
      fetchAllPostgrestPages({
        fetchPage: (from, to) =>
          supabase
            .from("crm_lifecycle_states")
            .select("stage, metrics")
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        pageSize: POSTGREST_PAGE_SIZE,
      }),
      fetchAllPostgrestPages({
        fetchPage: (from, to) =>
          supabase
            .from("crm_lifecycle_transitions")
            .select("from_stage, to_stage")
            .eq("user_id", userId)
            .gte("occurred_at", new Date(Date.now() - 7 * DAY_MS).toISOString())
            .order("id", { ascending: true })
            .range(from, to),
        pageSize: POSTGREST_PAGE_SIZE,
      }),
      supabase
        .from("crm_lifecycle_actions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "awaiting_approval")
        .order("created_at", { ascending: false })
        .limit(20)
        .then((res) => res.data ?? []),
      supabase
        .from("crm_lifecycle_actions")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["sent", "skipped", "expired", "failed"])
        .order("created_at", { ascending: false })
        .limit(15)
        .then((res) => res.data ?? []),
      supabase
        .from("crm_lifecycle_insights")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10)
        .then((res) => res.data ?? []),
    ]);

  // Distribution + spend per stage from the state snapshot.
  const counts = new Map<string, { count: number; spend: number }>();
  for (const row of stateRows as Array<Record<string, unknown>>) {
    const stage = String(row.stage);
    const metrics = (row.metrics ?? {}) as { monetary?: number };
    const entry = counts.get(stage) ?? { count: 0, spend: 0 };
    entry.count += 1;
    entry.spend += Number(metrics.monetary ?? 0);
    counts.set(stage, entry);
  }

  // Net 7-day movement per stage from the transition log.
  const netDelta = new Map<string, number>();
  const movementTally = new Map<string, number>();
  for (const row of transitionRows as Array<Record<string, unknown>>) {
    const from = (row.from_stage as string | null) ?? null;
    const to = String(row.to_stage);
    netDelta.set(to, (netDelta.get(to) ?? 0) + 1);
    if (from) netDelta.set(from, (netDelta.get(from) ?? 0) - 1);
    if (from && from !== to) {
      const key = `${from}→${to}`;
      movementTally.set(key, (movementTally.get(key) ?? 0) + 1);
    }
  }

  const distribution: LifecycleStageDistribution[] = STAGE_DEFINITIONS.map((def) => ({
    stage: def.stage,
    count: counts.get(def.stage)?.count ?? 0,
    delta7d: netDelta.get(def.stage) ?? 0,
    totalSpend: Math.round(counts.get(def.stage)?.spend ?? 0),
  }));

  const movements = [...movementTally.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from: from as LifecycleStage, to: to as LifecycleStage, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Latest completed A/B test per program (subject split → open rates).
  const abByProgram = new Map<string, LifecycleAbResult>();
  const { data: abRows } = await supabase
    .from("crm_lifecycle_actions")
    .select("program_key, subject, payload, executed_at, campaign_id")
    .eq("user_id", userId)
    .eq("status", "sent")
    .not("payload->ab->>campaign_b_id", "is", null)
    .order("executed_at", { ascending: false })
    .limit(30);
  const campaignIds = new Set<string>();
  const abCandidates: Array<{
    program_key: string;
    subject: string;
    ab: { subject_b?: string; campaign_b_id?: string; a_count?: number; b_count?: number };
    campaign_id: string | null;
    executed_at: string | null;
  }> = [];
  for (const row of (abRows ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.program_key);
    if (abByProgram.has(key) || abCandidates.some((c) => c.program_key === key)) continue;
    const ab = ((row.payload as Record<string, unknown> | null)?.ab ?? {}) as {
      subject_b?: string;
      campaign_b_id?: string;
      a_count?: number;
      b_count?: number;
    };
    if (!ab.campaign_b_id || !row.campaign_id) continue;
    abCandidates.push({
      program_key: key,
      subject: String(row.subject ?? ""),
      ab,
      campaign_id: String(row.campaign_id),
      executed_at: (row.executed_at as string | null) ?? null,
    });
    campaignIds.add(String(row.campaign_id));
    campaignIds.add(String(ab.campaign_b_id));
  }
  if (campaignIds.size > 0) {
    const { data: campaignRows } = await supabase
      .from("crm_campaigns")
      .select("id, sent_count, delivered_count, opened_count")
      .eq("user_id", userId)
      .in("id", [...campaignIds]);
    const openRateById = new Map<string, number | null>();
    for (const row of campaignRows ?? []) {
      const delivered = Number(row.delivered_count ?? 0) || Number(row.sent_count ?? 0);
      openRateById.set(
        String(row.id),
        delivered > 0 ? Number(row.opened_count ?? 0) / delivered : null,
      );
    }
    for (const candidate of abCandidates) {
      abByProgram.set(candidate.program_key, {
        subject_a: candidate.subject,
        subject_b: String(candidate.ab.subject_b ?? ""),
        a_count: Number(candidate.ab.a_count ?? 0),
        b_count: Number(candidate.ab.b_count ?? 0),
        a_open_rate: openRateById.get(String(candidate.campaign_id)) ?? null,
        b_open_rate: openRateById.get(String(candidate.ab.campaign_b_id)) ?? null,
        executed_at: candidate.executed_at,
      });
    }
  }

  return {
    settings,
    thresholds,
    contactsTracked: (stateRows as unknown[]).length,
    distribution,
    movements,
    programs: programs.map((program) => ({
      ...program,
      stats: statsResult.byProgram.get(program.key) ?? null,
      abLast: abByProgram.get(program.key) ?? null,
    })),
    pendingActions: (pendingRows as Array<Record<string, unknown>>).map(actionFromRow),
    recentActions: (recentRows as Array<Record<string, unknown>>).map(actionFromRow),
    impact: statsResult.impact,
    insights: (insightRows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      program_key: (row.program_key as string | null) ?? null,
      kind: row.kind as LifecycleInsight["kind"],
      title: String(row.title ?? ""),
      detail: String(row.detail ?? ""),
      evidence: (row.evidence ?? {}) as Record<string, unknown>,
      status: row.status as LifecycleInsight["status"],
      created_at: String(row.created_at ?? ""),
    })),
  };
}

export type LifecycleStageMember = {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  total_spend: number;
  sale_count: number;
  last_purchase_at: string | null;
  entered_at: string;
  opted_out: boolean;
};

export async function loadStageMembers(
  supabase: SupabaseClient,
  userId: string,
  stage: LifecycleStage,
  limit = 100,
): Promise<{ members: LifecycleStageMember[]; total: number }> {
  const { data: stateRows, count } = await supabase
    .from("crm_lifecycle_states")
    .select("contact_id, entered_at", { count: "exact" })
    .eq("user_id", userId)
    .eq("stage", stage)
    .order("entered_at", { ascending: false })
    .limit(limit);

  const rows = stateRows ?? [];
  if (rows.length === 0) return { members: [], total: count ?? 0 };

  const enteredByContact = new Map(rows.map((row) => [String(row.contact_id), String(row.entered_at)]));
  const { data: contactRows } = await supabase
    .from("crm_contacts")
    .select("id, email, first_name, last_name, total_spend, sale_count, last_purchase_at, opted_out")
    .eq("user_id", userId)
    .in("id", rows.map((row) => String(row.contact_id)));

  const members = (contactRows ?? [])
    .map((row) => ({
      contact_id: String(row.id),
      email: String(row.email ?? ""),
      first_name: (row.first_name as string | null) ?? null,
      last_name: (row.last_name as string | null) ?? null,
      total_spend: Number(row.total_spend ?? 0),
      sale_count: Number(row.sale_count ?? 0),
      last_purchase_at: (row.last_purchase_at as string | null) ?? null,
      entered_at: enteredByContact.get(String(row.id)) ?? "",
      opted_out: Boolean(row.opted_out),
    }))
    .sort((a, b) => b.total_spend - a.total_spend);

  return { members, total: count ?? members.length };
}
