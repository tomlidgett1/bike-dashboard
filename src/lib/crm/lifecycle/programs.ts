// Lifecycle program catalogue — one automated play per stage.
//
// Programs are seeded per store on first use and stay editable
// (enable/pause, review vs auto, cadence, offer policy). The planner
// only ever acts through these rows, so the UI is always the truth.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LifecycleOfferPolicy,
  LifecycleProgram,
  LifecycleProgramMode,
  LifecycleStage,
} from "./types";

export type ProgramDefinition = {
  key: string;
  stage: LifecycleStage;
  name: string;
  description: string;
  /** One-line commercial objective, shop-facing. */
  objective: string;
  /** Why this play works in bike retail — the evidence-flavoured pitch. */
  why: string;
  entry_delay_days: number;
  cooldown_days: number;
  offer_policy: LifecycleOfferPolicy;
  default_enabled: boolean;
  /** Step-by-step mechanics shown in the UI so nothing feels like magic. */
  mechanics: string[];
};

export const PROGRAM_DEFINITIONS: ProgramDefinition[] = [
  {
    key: "welcome_new",
    stage: "new",
    name: "Welcome series",
    description:
      "A warm welcome about a week after the first purchase — sets up the service relationship early.",
    objective:
      "Turn a first purchase into a second visit and a service relationship.",
    why:
      "The first 90 days decide whether someone becomes a regular. A warm, no-pitch welcome roughly doubles the odds of a second purchase versus silence — and it books first services, the stickiest revenue in the shop.",
    entry_delay_days: 7,
    cooldown_days: 90,
    offer_policy: "none",
    default_enabled: true,
    mechanics: [
      "Waits 7 days after a customer's first purchase, then sends one welcome email.",
      "Introduces the workshop, free advice and what to expect from the store.",
      "No discount — the goal is the relationship, not a coupon.",
    ],
  },
  {
    key: "nurture_active",
    stage: "active",
    name: "Active rider check-in",
    description:
      "A light, useful touch for customers inside their normal buying rhythm. Keeps the store front of mind without selling hard.",
    objective:
      "Stay front of mind with regulars without burning goodwill.",
    why:
      "Regulars who hear from you occasionally spend more per year and defect to chain stores less. The trick is restraint: useful, seasonal, never salesy.",
    entry_delay_days: 30,
    cooldown_days: 75,
    offer_policy: "none",
    default_enabled: false,
    mechanics: [
      "Touches active customers at most every ~10 weeks.",
      "Seasonal riding tips and a soft pointer to what's new in store.",
      "Off by default — turn it on if you want more regular presence.",
    ],
  },
  {
    key: "vip_thanks",
    stage: "vip",
    name: "High-value recognition",
    description:
      "Your top spenders get a personal thank-you and first look at new arrivals. Recognition, never a coupon.",
    objective:
      "Protect your highest-value relationships and grow referrals.",
    why:
      "The top 20% of customers typically drive well over half of revenue. Recognition — not discounts — is what keeps them loyal; a discount actually cheapens the relationship.",
    entry_delay_days: 14,
    cooldown_days: 90,
    offer_policy: "none",
    default_enabled: true,
    mechanics: [
      "Targets customers in your top spend tier who are still actively buying.",
      "A personal note in your voice — thanks, priority service, early access framing.",
      "Deliberately no discount; VIPs respond to recognition.",
    ],
  },
  {
    key: "save_at_risk",
    stage: "at_risk",
    name: "At-risk save",
    description:
      "Customers overdue for their next visit get a genuine check-in with a service angle before they drift further.",
    objective:
      "Catch drifting customers before they're gone — the cheapest save there is.",
    why:
      "Winning back a customer who is merely overdue costs a fraction of acquiring a new one. A service-angle check-in converts far better here than a sale pitch, because it reads as care, not desperation.",
    entry_delay_days: 7,
    cooldown_days: 45,
    offer_policy: "soft",
    default_enabled: true,
    mechanics: [
      "Fires about a week after a customer crosses your store's 'overdue' boundary.",
      "Leads with usefulness (bike due a once-over?) rather than a sale.",
      "May include a modest sweetener when offer policy allows it.",
    ],
  },
  {
    key: "winback_dormant",
    stage: "dormant",
    name: "Dormant win-back",
    description:
      "A proper win-back for customers long past their usual gap — the highest-leverage email in retail.",
    objective:
      "Recover revenue from customers everyone else has written off.",
    why:
      "Win-back emails are consistently retail's highest-ROI campaign: the list costs nothing and even single-digit response rates are pure recovered revenue. Honesty about the absence outperforms pretending nothing happened.",
    entry_delay_days: 14,
    cooldown_days: 60,
    offer_policy: "winback",
    default_enabled: true,
    mechanics: [
      "Targets customers well beyond the at-risk window.",
      "Acknowledges the absence honestly and gives a concrete reason to return.",
      "Win-back offer framing allowed; every send is holdout-tested for real lift.",
    ],
  },
  {
    key: "lastcall_churned",
    stage: "churned",
    name: "Churned last call",
    description:
      "One respectful reconnect for long-lost customers, at most every four months. Low volume, occasionally golden.",
    objective:
      "One respectful shot at the archive before letting go.",
    why:
      "A tiny percentage of long-lost customers still ride and still live nearby. At one email per four months the downside is nil and the occasional win is a whole customer back.",
    entry_delay_days: 30,
    cooldown_days: 120,
    offer_policy: "winback",
    default_enabled: false,
    mechanics: [
      "No purchase in 2+ years — expectations are low and the tone stays humble.",
      "Maximum one email per customer per 120 days.",
      "Off by default; enable when you want to squeeze the archive.",
    ],
  },
  {
    key: "thank_reactivated",
    stage: "reactivated",
    name: "Reactivation thank-you",
    description:
      "Customers who came back after drifting get a genuine thank-you a few days later — cements the comeback.",
    objective:
      "Cement the comeback so it becomes a habit, not a one-off.",
    why:
      "A returning lapsed customer is at their highest risk of lapsing again. A genuine thank-you within days of the comeback measurably lifts the odds of a third purchase.",
    entry_delay_days: 5,
    cooldown_days: 90,
    offer_policy: "none",
    default_enabled: true,
    mechanics: [
      "Fires a few days after a lapsed customer purchases again.",
      "Pure gratitude plus a pointer to the workshop for their next service.",
      "One of the highest open-rate emails a store can send.",
    ],
  },
  {
    key: "first_purchase_prospect",
    stage: "prospect",
    name: "First-purchase nudge",
    description:
      "Contacts on the list who've never bought get one gentle reason to make their first purchase.",
    objective:
      "Convert subscribers who have never bought into first-time customers.",
    why:
      "People on your list already know you. A single low-pressure invitation converts better than any cold advertising dollar you could spend.",
    entry_delay_days: 21,
    cooldown_days: 120,
    offer_policy: "soft",
    default_enabled: false,
    mechanics: [
      "Targets subscribed contacts with no recorded purchase.",
      "One email per 120 days at most — nudge, not nagging.",
      "Off by default; useful after list imports or event signups.",
    ],
  },
];

const DEFINITION_BY_KEY = new Map(PROGRAM_DEFINITIONS.map((d) => [d.key, d]));

export function programDefinition(key: string): ProgramDefinition | null {
  return DEFINITION_BY_KEY.get(key) ?? null;
}

function rowToProgram(row: Record<string, unknown>): LifecycleProgram {
  return {
    id: String(row.id),
    key: String(row.key),
    stage: row.stage as LifecycleStage,
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    enabled: Boolean(row.enabled),
    mode: (row.mode as LifecycleProgramMode) ?? "review",
    entry_delay_days: Number(row.entry_delay_days ?? 0),
    cooldown_days: Number(row.cooldown_days ?? 60),
    offer_policy: (row.offer_policy as LifecycleOfferPolicy) ?? "none",
    config: (row.config as Record<string, unknown>) ?? {},
    last_run_at: (row.last_run_at as string | null) ?? null,
  };
}

/** Load the store's programs, seeding any missing catalogue entries. */
export async function loadLifecyclePrograms(
  supabase: SupabaseClient,
  userId: string,
): Promise<LifecycleProgram[]> {
  const { data, error } = await supabase
    .from("crm_lifecycle_programs")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;

  const existing = new Set((data ?? []).map((row) => String(row.key)));
  const missing = PROGRAM_DEFINITIONS.filter((def) => !existing.has(def.key));

  if (missing.length > 0) {
    const { error: seedError } = await supabase.from("crm_lifecycle_programs").upsert(
      missing.map((def) => ({
        user_id: userId,
        key: def.key,
        stage: def.stage,
        name: def.name,
        description: def.description,
        enabled: def.default_enabled,
        mode: "review",
        entry_delay_days: def.entry_delay_days,
        cooldown_days: def.cooldown_days,
        offer_policy: def.offer_policy,
      })),
      { onConflict: "user_id,key", ignoreDuplicates: true },
    );
    if (seedError) console.error("[lifecycle/programs] seed failed:", seedError.message);
    const { data: reloaded, error: reloadError } = await supabase
      .from("crm_lifecycle_programs")
      .select("*")
      .eq("user_id", userId);
    if (reloadError) throw reloadError;
    return sortPrograms((reloaded ?? []).map(rowToProgram));
  }

  return sortPrograms((data ?? []).map(rowToProgram));
}

function sortPrograms(programs: LifecycleProgram[]): LifecycleProgram[] {
  const order = new Map(PROGRAM_DEFINITIONS.map((d, i) => [d.key, i]));
  return programs.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
}

export type LifecycleProgramUpdate = Partial<
  Pick<
    LifecycleProgram,
    "enabled" | "mode" | "entry_delay_days" | "cooldown_days" | "offer_policy" | "config"
  >
>;

export async function updateLifecycleProgram(
  supabase: SupabaseClient,
  userId: string,
  programId: string,
  update: LifecycleProgramUpdate,
): Promise<LifecycleProgram> {
  const patch: Record<string, unknown> = {};
  if (update.enabled !== undefined) patch.enabled = update.enabled;
  if (update.mode !== undefined && ["review", "auto"].includes(update.mode)) patch.mode = update.mode;
  if (update.entry_delay_days !== undefined) {
    patch.entry_delay_days = Math.min(90, Math.max(0, Math.round(update.entry_delay_days)));
  }
  if (update.cooldown_days !== undefined) {
    patch.cooldown_days = Math.min(365, Math.max(7, Math.round(update.cooldown_days)));
  }
  if (update.offer_policy !== undefined && ["none", "soft", "winback"].includes(update.offer_policy)) {
    patch.offer_policy = update.offer_policy;
  }
  if (update.config !== undefined && update.config && typeof update.config === "object") {
    // Merge into existing config so unrelated keys aren't wiped.
    const { data: existing } = await supabase
      .from("crm_lifecycle_programs")
      .select("config")
      .eq("id", programId)
      .eq("user_id", userId)
      .maybeSingle();
    const current = (existing?.config as Record<string, unknown> | null) ?? {};
    patch.config = { ...current, ...update.config };
  }

  const { data, error } = await supabase
    .from("crm_lifecycle_programs")
    .update(patch)
    .eq("id", programId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Program not found");
  return rowToProgram(data);
}
