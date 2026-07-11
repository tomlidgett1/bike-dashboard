// Classification pass: assign every CRM contact a lifecycle stage,
// record transitions, and snapshot the daily distribution.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "../postgrest-page";
import { classifyContact, computeThresholds } from "./stages";
import { markLifecycleEngineState } from "./settings";
import type {
  LifecycleContactMetrics,
  LifecycleSettings,
  LifecycleStage,
  LifecycleThresholds,
} from "./types";

export type ClassifyResult = {
  scanned: number;
  changed: number;
  transitions: Array<{ from: LifecycleStage | null; to: LifecycleStage; count: number }>;
  stageCounts: Record<string, number>;
  thresholds: LifecycleThresholds;
};

type ContactRow = {
  id: string;
  sale_count: number | null;
  total_spend: number | string | null;
  last_purchase_at: string | null;
  lightspeed_joined_at: string | null;
  opted_out: boolean;
};

type StateRow = {
  contact_id: string;
  stage: LifecycleStage;
  entered_at: string;
};

/**
 * When a contact is classified for the FIRST time, estimate when they truly
 * entered the stage from their purchase recency instead of stamping "now".
 * Without this, a store's entire base bootstraps with entered_at = today and
 * every program's entry delay blocks outreach for days-to-weeks; with it, a
 * customer who's been dormant for a year is immediately eligible for the
 * win-back, and "this week" movement stats reflect real behaviour only.
 */
function bootstrapEnteredAt(
  stage: LifecycleStage,
  contact: ContactRow,
  thresholds: LifecycleThresholds,
  now: Date,
): string {
  const lastPurchase = contact.last_purchase_at
    ? new Date(contact.last_purchase_at).getTime()
    : NaN;
  const dayMs = 24 * 60 * 60 * 1000;

  let entered: number;
  if (!Number.isFinite(lastPurchase)) {
    const joined = contact.lightspeed_joined_at
      ? new Date(contact.lightspeed_joined_at).getTime()
      : NaN;
    entered = Number.isFinite(joined) ? joined : now.getTime();
  } else {
    switch (stage) {
      case "at_risk":
        entered = lastPurchase + thresholds.active_days * dayMs;
        break;
      case "dormant":
        entered = lastPurchase + thresholds.at_risk_days * dayMs;
        break;
      case "churned":
        entered = lastPurchase + thresholds.dormant_days * dayMs;
        break;
      default:
        // new / active / vip / reactivated: entered when they purchased.
        entered = lastPurchase;
        break;
    }
  }
  return new Date(Math.min(entered, now.getTime())).toISOString();
}

export async function classifyStore(
  supabase: SupabaseClient,
  userId: string,
  settings: LifecycleSettings,
  now: Date = new Date(),
): Promise<ClassifyResult> {
  const thresholds = await computeThresholds(supabase, userId, settings.thresholds);

  const [contacts, states] = await Promise.all([
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_contacts")
          .select("id, sale_count, total_spend, last_purchase_at, lightspeed_joined_at, opted_out")
          .eq("user_id", userId)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }) as Promise<ContactRow[]>,
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_lifecycle_states")
          .select("contact_id, stage, entered_at")
          .eq("user_id", userId)
          .order("contact_id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }) as Promise<StateRow[]>,
  ]);

  const stateByContact = new Map(states.map((s) => [s.contact_id, s]));
  const nowIso = now.toISOString();

  const upserts: Array<Record<string, unknown>> = [];
  const transitions: Array<Record<string, unknown>> = [];
  const transitionTally = new Map<string, number>();
  const stageCounts: Record<string, number> = {};

  for (const contact of contacts) {
    const existing = stateByContact.get(contact.id) ?? null;
    const stage = classifyContact({
      saleCount: Number(contact.sale_count ?? 0),
      totalSpend: Number(contact.total_spend ?? 0),
      lastPurchaseAt: contact.last_purchase_at,
      joinedAt: contact.lightspeed_joined_at,
      previousStage: existing?.stage ?? null,
      previousEnteredAt: existing?.entered_at ?? null,
      thresholds,
      now,
    });

    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;

    const lastPurchase = contact.last_purchase_at
      ? new Date(contact.last_purchase_at).getTime()
      : NaN;
    const metrics: LifecycleContactMetrics = {
      recency_days: Number.isFinite(lastPurchase)
        ? Math.max(0, Math.round((now.getTime() - lastPurchase) / (24 * 60 * 60 * 1000)))
        : null,
      frequency: Number(contact.sale_count ?? 0),
      monetary: Number(contact.total_spend ?? 0),
      aov:
        Number(contact.sale_count ?? 0) > 0
          ? Math.round((Number(contact.total_spend ?? 0) / Number(contact.sale_count)) * 100) / 100
          : 0,
      opted_out: contact.opted_out,
    };

    if (!existing || existing.stage !== stage) {
      const enteredAt = existing
        ? nowIso
        : bootstrapEnteredAt(stage, contact, thresholds, now);
      upserts.push({
        user_id: userId,
        contact_id: contact.id,
        stage,
        previous_stage: existing?.stage ?? null,
        entered_at: enteredAt,
        metrics,
        updated_at: nowIso,
      });
      transitions.push({
        user_id: userId,
        contact_id: contact.id,
        from_stage: existing?.stage ?? null,
        to_stage: stage,
        occurred_at: enteredAt,
      });
      const key = `${existing?.stage ?? "∅"}→${stage}`;
      transitionTally.set(key, (transitionTally.get(key) ?? 0) + 1);
    } else {
      // Stage unchanged — keep the metrics snapshot fresh without touching
      // entered_at (program entry delays depend on it).
      upserts.push({
        user_id: userId,
        contact_id: contact.id,
        stage,
        previous_stage: existing.stage,
        entered_at: existing.entered_at,
        metrics,
        updated_at: nowIso,
      });
    }
  }

  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await supabase
      .from("crm_lifecycle_states")
      .upsert(upserts.slice(i, i + 500), { onConflict: "user_id,contact_id" });
    if (error) throw error;
  }
  for (let i = 0; i < transitions.length; i += 500) {
    const { error } = await supabase
      .from("crm_lifecycle_transitions")
      .insert(transitions.slice(i, i + 500));
    if (error) console.error("[lifecycle/classify] transition insert failed:", error.message);
  }

  // Daily snapshot for the trend view (idempotent per day).
  await supabase
    .from("crm_lifecycle_daily")
    .upsert(
      { user_id: userId, day: nowIso.slice(0, 10), stage_counts: stageCounts },
      { onConflict: "user_id,day" },
    );

  await markLifecycleEngineState(supabase, userId, { last_classified_at: nowIso });

  return {
    scanned: contacts.length,
    changed: transitions.length,
    transitions: [...transitionTally.entries()].map(([key, count]) => {
      const [from, to] = key.split("→");
      return {
        from: from === "∅" ? null : (from as LifecycleStage),
        to: to as LifecycleStage,
        count,
      };
    }),
    stageCounts,
    thresholds,
  };
}
