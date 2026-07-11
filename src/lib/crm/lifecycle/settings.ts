// Load/save per-store lifecycle engine settings.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleSettings, LifecycleThresholds } from "./types";

export const DEFAULT_LIFECYCLE_SETTINGS: Omit<LifecycleSettings, "user_id"> = {
  is_enabled: false,
  timezone: "Australia/Melbourne",
  frequency_cap_days: 7,
  holdout_percent: 10,
  attribution_window_days: 21,
  thresholds: {},
  learned: {},
  last_classified_at: null,
  last_planned_at: null,
  last_attributed_at: null,
};

export function normaliseLifecycleSettings(
  userId: string,
  row: Partial<LifecycleSettings> | null,
): LifecycleSettings {
  const base = { ...DEFAULT_LIFECYCLE_SETTINGS, user_id: userId };
  if (!row) return base;
  return {
    ...base,
    ...row,
    user_id: userId,
    thresholds: (row.thresholds ?? {}) as Partial<LifecycleThresholds>,
    learned: (row.learned ?? {}) as LifecycleSettings["learned"],
  };
}

export async function loadLifecycleSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<LifecycleSettings> {
  const { data } = await supabase
    .from("crm_lifecycle_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return normaliseLifecycleSettings(userId, (data as Partial<LifecycleSettings> | null) ?? null);
}

export type LifecycleSettingsUpdate = Partial<
  Pick<
    LifecycleSettings,
    | "is_enabled"
    | "timezone"
    | "frequency_cap_days"
    | "holdout_percent"
    | "attribution_window_days"
    | "thresholds"
  >
>;

export async function upsertLifecycleSettings(
  supabase: SupabaseClient,
  userId: string,
  update: LifecycleSettingsUpdate,
): Promise<LifecycleSettings> {
  const patch: Record<string, unknown> = { user_id: userId };
  for (const key of [
    "is_enabled",
    "timezone",
    "frequency_cap_days",
    "holdout_percent",
    "attribution_window_days",
    "thresholds",
  ] as const) {
    if (update[key] !== undefined) patch[key] = update[key];
  }

  const { data, error } = await supabase
    .from("crm_lifecycle_settings")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return normaliseLifecycleSettings(userId, data as Partial<LifecycleSettings>);
}

/** Internal timestamps / learned payload written by the engine itself. */
export async function markLifecycleEngineState(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<
    Pick<
      LifecycleSettings,
      "last_classified_at" | "last_planned_at" | "last_attributed_at" | "learned"
    >
  >,
): Promise<void> {
  await supabase
    .from("crm_lifecycle_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
}
