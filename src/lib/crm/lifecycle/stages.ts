// Stage registry + store-relative threshold computation.
//
// Classification is deterministic maths over the enriched CRM contact
// stats (recency / frequency / monetary). Boundaries adapt to each
// store's own repurchase rhythm and spend distribution, with sensible
// bike-retail fallbacks, and every boundary can be overridden in
// crm_lifecycle_settings.thresholds.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleStage, LifecycleThresholds } from "./types";

export type StageDefinition = {
  stage: LifecycleStage;
  label: string;
  /** Shop-facing one-liner of who is in the stage. */
  description: string;
  /** Order used everywhere the funnel is displayed. */
  order: number;
};

export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    stage: "new",
    label: "New",
    description: "Made their first purchase recently — the welcome window.",
    order: 0,
  },
  {
    stage: "active",
    label: "Active",
    description: "Purchased within the store's normal repurchase rhythm.",
    order: 1,
  },
  {
    stage: "vip",
    label: "High value",
    description: "Active and in the top tier of lifetime spend.",
    order: 2,
  },
  {
    stage: "reactivated",
    label: "Reactivated",
    description: "Were slipping away, then came back and purchased again.",
    order: 3,
  },
  {
    stage: "at_risk",
    label: "At risk",
    description: "Overdue for their next purchase — starting to drift.",
    order: 4,
  },
  {
    stage: "dormant",
    label: "Dormant",
    description: "Long past their usual gap — prime win-back targets.",
    order: 5,
  },
  {
    stage: "churned",
    label: "Churned",
    description: "No purchase in a very long time; likely lost without action.",
    order: 6,
  },
  {
    stage: "prospect",
    label: "Prospects",
    description: "On the list but haven't purchased yet.",
    order: 7,
  },
];

const BY_STAGE = new Map(STAGE_DEFINITIONS.map((d) => [d.stage, d]));

export function stageDefinition(stage: LifecycleStage): StageDefinition {
  return BY_STAGE.get(stage) ?? STAGE_DEFINITIONS[STAGE_DEFINITIONS.length - 1];
}

export const DEFAULT_THRESHOLDS: LifecycleThresholds = {
  new_days: 60,
  active_days: 180,
  at_risk_days: 365,
  dormant_days: 730,
  vip_min_spend: 1500,
  reactivated_hold_days: 45,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute store-relative thresholds:
 * - active_days from the store's median gap between repeat purchases
 *   (bikes ≠ groceries: clamped to a 90–270 day window),
 * - vip_min_spend from the 80th percentile of lifetime spend.
 * Explicit overrides in settings.thresholds always win.
 */
export async function computeThresholds(
  supabase: SupabaseClient,
  userId: string,
  overrides: Partial<LifecycleThresholds>,
): Promise<LifecycleThresholds> {
  const [activeDays, vipMinSpend] = await Promise.all([
    overrides.active_days ? Promise.resolve(overrides.active_days) : medianRepurchaseGapDays(supabase, userId),
    overrides.vip_min_spend ? Promise.resolve(overrides.vip_min_spend) : vipSpendThreshold(supabase, userId),
  ]);

  const active = clamp(
    activeDays ?? DEFAULT_THRESHOLDS.active_days,
    90,
    270,
  );

  const computed: LifecycleThresholds = {
    new_days: DEFAULT_THRESHOLDS.new_days,
    active_days: active,
    at_risk_days: clamp(Math.round(active * 2), active + 60, 540),
    dormant_days: DEFAULT_THRESHOLDS.dormant_days,
    vip_min_spend: vipMinSpend ?? DEFAULT_THRESHOLDS.vip_min_spend,
    reactivated_hold_days: DEFAULT_THRESHOLDS.reactivated_hold_days,
  };

  return { ...computed, ...overrides };
}

/**
 * Median days between purchases for repeat customers, approximated from
 * enriched contact stats (lifetime span ÷ purchase gaps). Cheap, no mirror
 * scan, and robust enough for a stage boundary.
 */
async function medianRepurchaseGapDays(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("crm_contacts")
    .select("lightspeed_joined_at, last_purchase_at, sale_count")
    .eq("user_id", userId)
    .gte("sale_count", 2)
    .not("last_purchase_at", "is", null)
    .not("lightspeed_joined_at", "is", null)
    .limit(5000);

  const gaps: number[] = [];
  for (const row of data ?? []) {
    const joined = new Date(String(row.lightspeed_joined_at)).getTime();
    const last = new Date(String(row.last_purchase_at)).getTime();
    const count = Number(row.sale_count ?? 0);
    if (!Number.isFinite(joined) || !Number.isFinite(last) || count < 2) continue;
    const spanDays = (last - joined) / (24 * 60 * 60 * 1000);
    if (spanDays <= 0) continue;
    gaps.push(spanDays / (count - 1));
  }
  if (gaps.length < 20) return null;
  gaps.sort((a, b) => a - b);
  return Math.round(gaps[Math.floor(gaps.length / 2)]);
}

/** 80th percentile of lifetime spend among spenders (min $500 floor). */
async function vipSpendThreshold(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { count } = await supabase
    .from("crm_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("total_spend", 0);
  if (!count || count < 25) return null;

  const offset = Math.floor(count * 0.2);
  const { data } = await supabase
    .from("crm_contacts")
    .select("total_spend")
    .eq("user_id", userId)
    .gt("total_spend", 0)
    .order("total_spend", { ascending: false })
    .range(offset, offset);
  const value = Number(data?.[0]?.total_spend ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(500, Math.floor(value / 50) * 50);
}

/**
 * Pure stage assignment for one contact. `previousStage`/`enteredAt` feed the
 * reactivation rule: a lapsed customer who purchases again is "reactivated"
 * for a hold window before normal recency rules resume.
 */
export function classifyContact(input: {
  saleCount: number;
  totalSpend: number;
  lastPurchaseAt: string | null;
  joinedAt: string | null;
  previousStage: LifecycleStage | null;
  previousEnteredAt: string | null;
  thresholds: LifecycleThresholds;
  now: Date;
}): LifecycleStage {
  const { thresholds, now } = input;

  if (input.saleCount <= 0 || !input.lastPurchaseAt) return "prospect";

  const recencyDays =
    (now.getTime() - new Date(input.lastPurchaseAt).getTime()) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(recencyDays) || recencyDays < 0) return "active";

  const joinedDays = input.joinedAt
    ? (now.getTime() - new Date(input.joinedAt).getTime()) / (24 * 60 * 60 * 1000)
    : null;

  const wasLapsed =
    input.previousStage === "at_risk" ||
    input.previousStage === "dormant" ||
    input.previousStage === "churned";
  const stillReactivated =
    input.previousStage === "reactivated" &&
    input.previousEnteredAt != null &&
    now.getTime() - new Date(input.previousEnteredAt).getTime() <
      thresholds.reactivated_hold_days * 24 * 60 * 60 * 1000;

  if (recencyDays <= thresholds.active_days) {
    // Purchased recently. Lapsed → reactivated takes precedence so the
    // comeback is visible (and celebrated) before normal rules resume.
    if (wasLapsed && recencyDays <= thresholds.reactivated_hold_days) return "reactivated";
    if (stillReactivated) return "reactivated";
    if (joinedDays != null && joinedDays <= thresholds.new_days) return "new";
    if (input.totalSpend >= thresholds.vip_min_spend) return "vip";
    return "active";
  }
  if (recencyDays <= thresholds.at_risk_days) return "at_risk";
  if (recencyDays <= thresholds.dormant_days) return "dormant";
  return "churned";
}
