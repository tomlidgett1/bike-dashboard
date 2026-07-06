// Load/save the per-store Domestique configuration.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DomestiqueConfig, DomestiqueConfigUpdate, DomestiquePlaybookKey } from "@/lib/types/domestique";
import { ALL_PLAYBOOK_KEYS, isPlaybookKey } from "./playbooks";

export const DEFAULT_DOMESTIQUE_CONFIG: Omit<DomestiqueConfig, "user_id"> = {
  is_enabled: false,
  mode: "copilot",
  timezone: "Australia/Melbourne",
  run_hour: 3,
  enabled_playbooks: [...ALL_PLAYBOOK_KEYS],
  autopilot_playbooks: [],
  max_plays_per_day: 3,
  contact_cooldown_days: 14,
  holdout_percent: 10,
  attribution_window_days: 14,
  max_sms_per_play: 25,
  max_discount_percent: 30,
  min_margin_floor_percent: 15,
  send_brief_via_nest: false,
  brief_phone: null,
  last_run_at: null,
  last_brief_sent_at: null,
};

function sanitisePlaybooks(value: unknown): DomestiquePlaybookKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((key): key is DomestiquePlaybookKey => typeof key === "string" && isPlaybookKey(key));
}

export function normaliseConfig(userId: string, row: Partial<DomestiqueConfig> | null): DomestiqueConfig {
  const base = { ...DEFAULT_DOMESTIQUE_CONFIG, user_id: userId };
  if (!row) return base;
  return {
    ...base,
    ...row,
    user_id: userId,
    enabled_playbooks: sanitisePlaybooks(row.enabled_playbooks ?? base.enabled_playbooks),
    autopilot_playbooks: sanitisePlaybooks(row.autopilot_playbooks ?? base.autopilot_playbooks),
  };
}

export async function loadDomestiqueConfig(
  supabase: SupabaseClient,
  userId: string,
): Promise<DomestiqueConfig> {
  const { data } = await supabase
    .from("domestique_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return normaliseConfig(userId, (data as Partial<DomestiqueConfig> | null) ?? null);
}

const UPDATABLE_KEYS: Array<keyof DomestiqueConfigUpdate> = [
  "is_enabled",
  "mode",
  "timezone",
  "run_hour",
  "enabled_playbooks",
  "autopilot_playbooks",
  "max_plays_per_day",
  "contact_cooldown_days",
  "holdout_percent",
  "attribution_window_days",
  "max_sms_per_play",
  "max_discount_percent",
  "min_margin_floor_percent",
  "send_brief_via_nest",
  "brief_phone",
];

export async function upsertDomestiqueConfig(
  supabase: SupabaseClient,
  userId: string,
  update: DomestiqueConfigUpdate,
): Promise<DomestiqueConfig> {
  const patch: Record<string, unknown> = { user_id: userId };
  for (const key of UPDATABLE_KEYS) {
    if (update[key] !== undefined) patch[key] = update[key];
  }
  if (patch.enabled_playbooks) patch.enabled_playbooks = sanitisePlaybooks(patch.enabled_playbooks);
  if (patch.autopilot_playbooks) patch.autopilot_playbooks = sanitisePlaybooks(patch.autopilot_playbooks);

  const { data, error } = await supabase
    .from("domestique_config")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return normaliseConfig(userId, data as Partial<DomestiqueConfig>);
}
