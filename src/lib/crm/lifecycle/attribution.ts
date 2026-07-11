// Attribution + measurement for lifecycle touches.
//
// Identity-based, same discipline as the Domestique: every touched (or
// withheld) customer's POS sale lines after the touch count toward the
// program; holdout touches accrue identically so incremental lift is
// live-vs-control, never wishful post-hoc counting. Also tracks the
// outcomes campaigns can't see on their own: unsubscribes after a touch
// and reactivations of lapsed customers.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "../postgrest-page";
import type { LifecycleImpact, LifecycleProgramStats, LifecycleSettings } from "./types";
import { markLifecycleEngineState } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;
const LAPSED_STAGES = new Set(["at_risk", "dormant", "churned"]);

type TouchRow = {
  id: string;
  program_key: string;
  stage_at_touch: string;
  contact_id: string | null;
  lightspeed_customer_id: string | null;
  is_holdout: boolean;
  touched_at: string;
  attributed_revenue: number | string | null;
  attributed_sale_count: number | null;
  unsubscribed: boolean;
  reactivated: boolean;
};

function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

/** Refresh revenue/unsub/reactivation for touches inside the window. */
export async function refreshLifecycleAttribution(
  supabase: SupabaseClient,
  userId: string,
  settings: Pick<LifecycleSettings, "attribution_window_days">,
): Promise<{ touchesRefreshed: number }> {
  const windowStart = new Date(
    Date.now() - settings.attribution_window_days * DAY_MS,
  ).toISOString();

  const touches = (await fetchAllPostgrestPages({
    fetchPage: (from, to) =>
      supabase
        .from("crm_lifecycle_touches")
        .select(
          "id, program_key, stage_at_touch, contact_id, lightspeed_customer_id, is_holdout, touched_at, attributed_revenue, attributed_sale_count, unsubscribed, reactivated",
        )
        .eq("user_id", userId)
        .gte("touched_at", windowStart)
        .order("id", { ascending: true })
        .range(from, to),
    pageSize: POSTGREST_PAGE_SIZE,
  })) as TouchRow[];
  if (touches.length === 0) {
    await markLifecycleEngineState(supabase, userId, {
      last_attributed_at: new Date().toISOString(),
    });
    return { touchesRefreshed: 0 };
  }

  const earliestTouch = touches.reduce(
    (min, t) => (t.touched_at < min ? t.touched_at : min),
    touches[0].touched_at,
  );

  // Sale lines since the earliest touch, paged past the PostgREST row cap.
  const lineRows = await fetchAllPostgrestPages({
    fetchPage: (from, to) =>
      supabase
        .from("lightspeed_sales_report_lines")
        .select("customer_id, complete_time, total, sale_id")
        .eq("user_id", userId)
        .gte("complete_time", earliestTouch)
        .not("customer_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    pageSize: POSTGREST_PAGE_SIZE,
  });

  type Line = { complete_time: string; total: number; sale_id: string | null };
  const linesByCustomer = new Map<string, Line[]>();
  for (const row of (lineRows ?? []) as Array<Record<string, unknown>>) {
    const customerId = row.customer_id as string | null;
    const completeTime = row.complete_time as string | null;
    if (!customerId || !completeTime) continue;
    const list = linesByCustomer.get(customerId) ?? [];
    list.push({
      complete_time: completeTime,
      total: num(row.total as number | string | null),
      sale_id: (row.sale_id as string | null) ?? null,
    });
    linesByCustomer.set(customerId, list);
  }

  // Unsubscribes after the earliest touch (cheap single query).
  const { data: optOutRows } = await supabase
    .from("crm_contacts")
    .select("id, opted_out_at")
    .eq("user_id", userId)
    .eq("opted_out", true)
    .gte("opted_out_at", earliestTouch)
    .limit(5_000);
  const optOutAtByContact = new Map<string, string>();
  for (const row of optOutRows ?? []) {
    if (row.id && row.opted_out_at) optOutAtByContact.set(String(row.id), String(row.opted_out_at));
  }

  let refreshed = 0;
  for (const touch of touches) {
    const lines = touch.lightspeed_customer_id
      ? (linesByCustomer.get(touch.lightspeed_customer_id) ?? [])
      : [];
    const after = lines.filter((l) => l.complete_time > touch.touched_at);
    const revenue = Math.round(after.reduce((sum, l) => sum + l.total, 0) * 100) / 100;
    const saleCount = new Set(after.map((l) => l.sale_id).filter(Boolean)).size;
    const optedOutAt = touch.contact_id ? optOutAtByContact.get(touch.contact_id) : undefined;
    const unsubscribed =
      touch.unsubscribed || Boolean(optedOutAt && optedOutAt > touch.touched_at && !touch.is_holdout);
    const reactivated = LAPSED_STAGES.has(touch.stage_at_touch) && saleCount > 0;

    const unchanged =
      revenue === num(touch.attributed_revenue) &&
      saleCount === Number(touch.attributed_sale_count ?? 0) &&
      unsubscribed === touch.unsubscribed &&
      reactivated === touch.reactivated;
    if (unchanged && touch.attributed_revenue !== null) continue;

    const { error: updateError } = await supabase
      .from("crm_lifecycle_touches")
      .update({
        attributed_revenue: revenue,
        attributed_sale_count: saleCount,
        unsubscribed,
        reactivated,
        last_attributed_at: new Date().toISOString(),
      })
      .eq("id", touch.id)
      .eq("user_id", userId);
    if (!updateError) refreshed += 1;
  }

  await markLifecycleEngineState(supabase, userId, {
    last_attributed_at: new Date().toISOString(),
  });
  return { touchesRefreshed: refreshed };
}

function emptyStats(programKey: string): LifecycleProgramStats {
  return {
    program_key: programKey,
    actions_sent: 0,
    emails_sent: 0,
    open_rate: null,
    click_rate: null,
    conversions: 0,
    attributed_revenue: 0,
    holdout_baseline: 0,
    incremental_revenue: 0,
    unsubscribes: 0,
    reactivations: 0,
  };
}

/**
 * Aggregate program performance + overall impact over a trailing window.
 * Incremental revenue = live attributed − holdout per-customer baseline
 * scaled to live volume (per program, then summed).
 */
export async function computeLifecycleStats(
  supabase: SupabaseClient,
  userId: string,
  windowDays = 90,
): Promise<{ byProgram: Map<string, LifecycleProgramStats>; impact: LifecycleImpact }> {
  const since = new Date(Date.now() - windowDays * DAY_MS).toISOString();

  const [touchRows, actionsResult] = await Promise.all([
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_lifecycle_touches")
          .select(
            "program_key, stage_at_touch, is_holdout, attributed_revenue, attributed_sale_count, unsubscribed, reactivated",
          )
          .eq("user_id", userId)
          .gte("touched_at", since)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }),
    supabase
      .from("crm_lifecycle_actions")
      .select("program_key, status, campaign:crm_campaigns(sent_count, delivered_count, opened_count, clicked_count)")
      .eq("user_id", userId)
      .eq("status", "sent")
      .gte("created_at", since)
      .limit(1_000),
  ]);
  const actionRows = actionsResult.data;

  const byProgram = new Map<string, LifecycleProgramStats>();
  const liveByProgram = new Map<string, { count: number; revenue: number }>();
  const holdoutByProgram = new Map<string, { count: number; revenue: number }>();

  for (const row of (touchRows ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.program_key);
    const stats = byProgram.get(key) ?? emptyStats(key);
    const revenue = num(row.attributed_revenue as number | string | null);
    const sales = Number(row.attributed_sale_count ?? 0);
    if (row.is_holdout) {
      const h = holdoutByProgram.get(key) ?? { count: 0, revenue: 0 };
      h.count += 1;
      h.revenue += revenue;
      holdoutByProgram.set(key, h);
    } else {
      const l = liveByProgram.get(key) ?? { count: 0, revenue: 0 };
      l.count += 1;
      l.revenue += revenue;
      liveByProgram.set(key, l);
      stats.emails_sent += 1;
      stats.attributed_revenue += revenue;
      if (sales > 0) stats.conversions += 1;
      if (row.unsubscribed) stats.unsubscribes += 1;
      if (row.reactivated) stats.reactivations += 1;
    }
    byProgram.set(key, stats);
  }

  // Open/click rates from the linked campaigns.
  const engagement = new Map<string, { delivered: number; opened: number; clicked: number; actions: number }>();
  for (const row of (actionRows ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.program_key);
    const campaign = row.campaign as
      | { sent_count?: number; delivered_count?: number; opened_count?: number; clicked_count?: number }
      | null;
    const entry = engagement.get(key) ?? { delivered: 0, opened: 0, clicked: 0, actions: 0 };
    entry.actions += 1;
    const delivered = Number(campaign?.delivered_count ?? 0) || Number(campaign?.sent_count ?? 0);
    entry.delivered += delivered;
    entry.opened += Number(campaign?.opened_count ?? 0);
    entry.clicked += Number(campaign?.clicked_count ?? 0);
    engagement.set(key, entry);
  }

  const impact: LifecycleImpact = {
    window_days: windowDays,
    emails_sent: 0,
    contacts_touched: 0,
    attributed_revenue: 0,
    holdout_baseline: 0,
    incremental_revenue: 0,
    conversions: 0,
    reactivations: 0,
    unsubscribes: 0,
  };

  for (const [key, stats] of byProgram) {
    const live = liveByProgram.get(key) ?? { count: 0, revenue: 0 };
    const holdout = holdoutByProgram.get(key) ?? { count: 0, revenue: 0 };
    const baselinePerCustomer = holdout.count > 0 ? holdout.revenue / holdout.count : 0;
    stats.holdout_baseline = Math.round(baselinePerCustomer * live.count * 100) / 100;
    stats.incremental_revenue = Math.max(
      0,
      Math.round((live.revenue - stats.holdout_baseline) * 100) / 100,
    );
    stats.attributed_revenue = Math.round(stats.attributed_revenue * 100) / 100;

    const eng = engagement.get(key);
    if (eng) {
      stats.actions_sent = eng.actions;
      stats.open_rate = eng.delivered > 0 ? eng.opened / eng.delivered : null;
      stats.click_rate = eng.delivered > 0 ? eng.clicked / eng.delivered : null;
    }

    impact.emails_sent += stats.emails_sent;
    impact.contacts_touched += stats.emails_sent;
    impact.attributed_revenue += stats.attributed_revenue;
    impact.holdout_baseline += stats.holdout_baseline;
    impact.incremental_revenue += stats.incremental_revenue;
    impact.conversions += stats.conversions;
    impact.reactivations += stats.reactivations;
    impact.unsubscribes += stats.unsubscribes;
  }

  impact.attributed_revenue = Math.round(impact.attributed_revenue * 100) / 100;
  impact.holdout_baseline = Math.round(impact.holdout_baseline * 100) / 100;
  impact.incremental_revenue = Math.round(impact.incremental_revenue * 100) / 100;

  return { byProgram, impact };
}
