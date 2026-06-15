// ============================================================
// Apply a reviewed candidate into a local variant group
// ============================================================
// Pure payload builders (unit tested) + an orchestrator that re-validates
// the products are still groupable (stale handling) and calls the atomic
// apply_variant_group() RPC.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VariantCandidateItem, VariantOptionType } from "./types";

export type VisibilityMode = "master_only" | "individual_and_master";
export type SyncTarget = "local" | "lightspeed";

export type CandidateForApply = {
  id: string;
  user_id: string;
  status: string;
  proposed_master_title: string;
  brand: string | null;
  category_name: string | null;
  option_types: VariantOptionType[];
  items: VariantCandidateItem[];
};

type RpcOption = { name: string; position: number; values: { value: string; position: number }[] };
type RpcItem = { product_id: string; is_master: boolean; value_assignments: Record<string, string>; position: number };

/** Distinct values for each option, in first-seen order, as RPC payload. */
export function buildRpcOptions(optionTypes: VariantOptionType[], items: VariantCandidateItem[]): RpcOption[] {
  return optionTypes.map((option, optionIndex) => {
    const seen: string[] = [];
    for (const item of items) {
      const value = item.variant_values[option.name];
      if (value && !seen.includes(value)) seen.push(value);
    }
    return {
      name: option.name,
      position: optionIndex + 1,
      values: seen.map((value, i) => ({ value, position: i + 1 })),
    };
  });
}

/** Choose the master child: most stock first, then first listed. */
export function pickMasterIndex(items: VariantCandidateItem[]): number {
  let best = 0;
  let bestQoh = -Infinity;
  items.forEach((item, i) => {
    const qoh = typeof item.qoh === "number" ? item.qoh : -1;
    if (qoh > bestQoh) {
      bestQoh = qoh;
      best = i;
    }
  });
  return best;
}

export function buildRpcItems(items: VariantCandidateItem[]): RpcItem[] {
  const masterIndex = pickMasterIndex(items);
  return items.map((item, i) => ({
    product_id: item.product_id,
    is_master: i === masterIndex,
    value_assignments: item.variant_values,
    position: i,
  }));
}

export type StaleCheck = { ok: true } | { ok: false; reason: string; conflictProductIds: string[] };

/**
 * Re-read the candidate's products and confirm they can still be grouped:
 * present, owned by this store, active, and not already in another group.
 */
export async function validateCandidateForApply(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  items: VariantCandidateItem[],
): Promise<StaleCheck> {
  const ids = items.map((i) => i.product_id);
  if (ids.length < 2) {
    return { ok: false, reason: "A variant group needs at least two products.", conflictProductIds: [] };
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, user_id, is_active, variant_group_id")
    .in("id", ids);

  if (error) return { ok: false, reason: `Could not re-check products: ${error.message}`, conflictProductIds: [] };

  const byId = new Map((data ?? []).map((p) => [p.id as string, p]));
  const conflicts: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.user_id !== userId || row.is_active === false || row.variant_group_id) {
      conflicts.push(id);
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      reason:
        "Some products have changed since this group was suggested (deleted, hidden, or already in another variant group). Re-run the scan to refresh.",
      conflictProductIds: conflicts,
    };
  }
  return { ok: true };
}

export type ApplyResult =
  | { ok: true; groupId: string }
  | { ok: false; reason: string; conflictProductIds?: string[] };

/**
 * Validate + atomically create the local variant group from a candidate.
 * Lightspeed write-back (if requested) is handled by the caller afterwards.
 */
export async function applyCandidateLocally(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  candidate: CandidateForApply,
  opts: { visibilityMode: VisibilityMode; syncTarget: SyncTarget; lightspeedCategoryId?: string | null },
): Promise<ApplyResult> {
  if (candidate.status === "applied_local" || candidate.status === "applied_lightspeed") {
    return { ok: false, reason: "This group has already been applied." };
  }

  const stale = await validateCandidateForApply(supabase, userId, candidate.items);
  if (!stale.ok) return { ok: false, reason: stale.reason, conflictProductIds: stale.conflictProductIds };

  const { data: groupId, error } = await supabase.rpc("apply_variant_group", {
    p_user_id: userId,
    p_candidate_id: candidate.id,
    p_master_title: candidate.proposed_master_title,
    p_brand: candidate.brand,
    p_category_name: candidate.category_name,
    p_lightspeed_category_id: opts.lightspeedCategoryId ?? null,
    p_visibility_mode: opts.visibilityMode,
    p_sync_target: opts.syncTarget,
    p_options: buildRpcOptions(candidate.option_types, candidate.items),
    p_items: buildRpcItems(candidate.items),
  });

  if (error) {
    // The RPC raises VARIANT_APPLY_CONFLICT if products changed between our
    // check and the write (defence in depth).
    const reason = /VARIANT_APPLY_CONFLICT/.test(error.message)
      ? "Some products are no longer groupable (already in a group or removed). Re-run the scan."
      : error.message;
    return { ok: false, reason };
  }

  return { ok: true, groupId: groupId as string };
}
