// Domestique guardrails: one contact budget across channels + deterministic
// holdout assignment for honest attribution.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DomestiqueConfig, DomestiqueTargetContact } from "@/lib/types/domestique";

/**
 * Deterministic 0–99 bucket from a contact id. Stable across runs so the same
 * customer is always (or never) in the holdout for a given store — a genuine
 * control group, not a per-send coin flip.
 */
export function contactHoldoutBucket(contactId: string): number {
  let hash = 0;
  for (let i = 0; i < contactId.length; i++) {
    hash = (hash * 31 + contactId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

export function isHoldoutContact(contactId: string, holdoutPercent: number): boolean {
  if (holdoutPercent <= 0) return false;
  return contactHoldoutBucket(contactId) < Math.min(holdoutPercent, 50);
}

/**
 * Contacts touched by the agent (any channel, non-holdout) inside the cooldown
 * window. Marketing plays must skip these — one contact budget across email
 * and SMS combined.
 */
export async function fetchRecentlyTouchedContactIds(
  supabase: SupabaseClient,
  userId: string,
  cooldownDays: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("domestique_touches")
    .select("contact_id")
    .eq("user_id", userId)
    .eq("is_holdout", false)
    .gte("touched_at", since)
    .not("contact_id", "is", null)
    .limit(10_000);
  if (error) {
    console.error("[domestique/guardrails] touch fetch failed:", error.message);
    return new Set();
  }
  const set = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as { contact_id: string | null }).contact_id;
    if (id) set.add(id);
  }
  return set;
}

/**
 * Apply the contact budget and holdout split to a detector's target list.
 * Returns contacts with `is_holdout` set, recently-touched contacts removed.
 */
export function applyContactGuardrails(
  contacts: DomestiqueTargetContact[],
  recentlyTouched: Set<string>,
  config: Pick<DomestiqueConfig, "holdout_percent">,
): DomestiqueTargetContact[] {
  const out: DomestiqueTargetContact[] = [];
  const seen = new Set<string>();
  for (const contact of contacts) {
    if (!contact.contact_id || seen.has(contact.contact_id)) continue;
    seen.add(contact.contact_id);
    if (recentlyTouched.has(contact.contact_id)) continue;
    out.push({
      ...contact,
      is_holdout: isHoldoutContact(contact.contact_id, config.holdout_percent),
    });
  }
  return out;
}
