// Attribution — the "prove" step that justifies the subscription.
//
// Identity-based: the agent knows exactly which Lightspeed customers it
// touched, and the POS mirror records every sale line. Any purchase by a
// touched customer inside the attribution window counts (in store or online,
// code or no code). Holdout touches accrue revenue the same way; the weekly
// receipt subtracts the holdout baseline so reported lift is incremental,
// not wishful post-hoc counting.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DomestiqueConfig } from "@/lib/types/domestique";

const DAY_MS = 24 * 60 * 60 * 1000;

type TouchRow = {
  id: string;
  playbook_key: string;
  lightspeed_customer_id: string | null;
  is_holdout: boolean;
  touched_at: string;
};

function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

/**
 * Refresh attributed revenue for every touch still inside the attribution
 * window: sum the customer's POS sale lines completed after the touch.
 */
export async function refreshAttributionForStore(
  supabase: SupabaseClient,
  userId: string,
  config: Pick<DomestiqueConfig, "attribution_window_days">,
): Promise<{ touchesRefreshed: number }> {
  const windowStart = new Date(Date.now() - config.attribution_window_days * DAY_MS).toISOString();

  const { data: touchRows, error: touchError } = await supabase
    .from("domestique_touches")
    .select("id, playbook_key, lightspeed_customer_id, is_holdout, touched_at")
    .eq("user_id", userId)
    .gte("touched_at", windowStart)
    .not("lightspeed_customer_id", "is", null)
    .limit(10_000);
  if (touchError) {
    console.error("[domestique/attribution] touch fetch failed:", touchError.message);
    return { touchesRefreshed: 0 };
  }

  const touches = (touchRows ?? []) as TouchRow[];
  if (touches.length === 0) return { touchesRefreshed: 0 };

  const earliestTouch = touches.reduce(
    (min, t) => (t.touched_at < min ? t.touched_at : min),
    touches[0].touched_at,
  );

  // One bounded query for all relevant sale lines, aggregated in JS.
  const { data: lineRows, error: lineError } = await supabase
    .from("lightspeed_sales_report_lines")
    .select("customer_id, complete_time, total, sale_id")
    .eq("user_id", userId)
    .gte("complete_time", earliestTouch)
    .not("customer_id", "is", null)
    .limit(50_000);
  if (lineError) {
    console.error("[domestique/attribution] sales fetch failed:", lineError.message);
    return { touchesRefreshed: 0 };
  }

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

  let refreshed = 0;
  for (const touch of touches) {
    const lines = linesByCustomer.get(touch.lightspeed_customer_id!) ?? [];
    const after = lines.filter((l) => l.complete_time > touch.touched_at);
    const revenue = Math.round(after.reduce((sum, l) => sum + l.total, 0) * 100) / 100;
    const saleCount = new Set(after.map((l) => l.sale_id).filter(Boolean)).size;

    const { error } = await supabase
      .from("domestique_touches")
      .update({
        attributed_revenue: revenue,
        attributed_sale_count: saleCount,
        last_attributed_at: new Date().toISOString(),
      })
      .eq("id", touch.id)
      .eq("user_id", userId);
    if (!error) refreshed += 1;
  }

  return { touchesRefreshed: refreshed };
}

/** Monday of the week containing `date` (UTC). */
function weekStartOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Build the receipt for the most recent COMPLETED week if it doesn't exist.
 * Incremental revenue = attributed (live touches) − holdout baseline scaled
 * to the live-touch count.
 */
export async function ensureWeeklyReceipt(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ created: boolean }> {
  const thisWeekStart = weekStartOf(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY_MS);
  const lastWeekEnd = new Date(thisWeekStart.getTime() - DAY_MS);

  const weekStartStr = isoDate(lastWeekStart);
  const weekEndStr = isoDate(lastWeekEnd);

  const { data: existing } = await supabase
    .from("domestique_receipts")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStartStr)
    .maybeSingle();
  if (existing) return { created: false };

  const rangeStart = lastWeekStart.toISOString();
  const rangeEnd = new Date(thisWeekStart.getTime()).toISOString();

  const [{ data: touchRows }, { count: playsExecuted }] = await Promise.all([
    supabase
      .from("domestique_touches")
      .select("playbook_key, is_holdout, attributed_revenue")
      .eq("user_id", userId)
      .gte("touched_at", rangeStart)
      .lt("touched_at", rangeEnd)
      .limit(10_000),
    supabase
      .from("domestique_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "executed")
      .gte("executed_at", rangeStart)
      .lt("executed_at", rangeEnd),
  ]);

  const touches = (touchRows ?? []) as Array<{
    playbook_key: string;
    is_holdout: boolean;
    attributed_revenue: number | string | null;
  }>;
  if (touches.length === 0 && (playsExecuted ?? 0) === 0) return { created: false };

  let liveCount = 0;
  let holdoutCount = 0;
  let liveRevenue = 0;
  let holdoutRevenue = 0;
  const breakdown: Record<string, { touches: number; revenue: number }> = {};

  for (const touch of touches) {
    const revenue = num(touch.attributed_revenue);
    if (touch.is_holdout) {
      holdoutCount += 1;
      holdoutRevenue += revenue;
    } else {
      liveCount += 1;
      liveRevenue += revenue;
      const entry = breakdown[touch.playbook_key] ?? { touches: 0, revenue: 0 };
      entry.touches += 1;
      entry.revenue = Math.round((entry.revenue + revenue) * 100) / 100;
      breakdown[touch.playbook_key] = entry;
    }
  }

  // Baseline: what the touched customers would likely have spent anyway,
  // estimated from the holdout group's per-customer revenue.
  const holdoutPerCustomer = holdoutCount > 0 ? holdoutRevenue / holdoutCount : 0;
  const holdoutBaseline = Math.round(holdoutPerCustomer * liveCount * 100) / 100;
  const incremental = Math.max(0, Math.round((liveRevenue - holdoutBaseline) * 100) / 100);

  const { error } = await supabase.from("domestique_receipts").insert({
    user_id: userId,
    week_start: weekStartStr,
    week_end: weekEndStr,
    touches_count: liveCount,
    holdout_count: holdoutCount,
    plays_executed: playsExecuted ?? 0,
    attributed_revenue: Math.round(liveRevenue * 100) / 100,
    holdout_baseline: holdoutBaseline,
    incremental_revenue: incremental,
    breakdown,
  });
  if (error) {
    console.error("[domestique/attribution] receipt insert failed:", error.message);
    return { created: false };
  }
  return { created: true };
}
