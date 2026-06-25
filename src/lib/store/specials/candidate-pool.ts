import type { SupabaseClient } from '@supabase/supabase-js';
import type { SpecialsCandidate, SpecialsConfig } from '@/lib/types/specials';
import { proposeDiscount } from '@/lib/store/specials/discount-engine';
import {
  SPECIALS_PRODUCT_COLUMNS,
  buildProductMetrics,
  fetchSalesAggregates,
  type RawSpecialsProductRow,
} from '@/lib/store/specials/metrics';

const CANDIDATE_FETCH_LIMIT = 3000;

/**
 * Product ids used by the most recent `cooldownCycles` cycles (any status).
 * Drives the no-recycle rule: a product can't reappear until at least this many
 * cycles have passed. Includes already-scheduled upcoming cycles so back-to-back
 * upcoming cycles never repeat each other.
 */
export async function fetchRecentlyUsedProductIds(
  supabase: SupabaseClient,
  userId: string,
  cooldownCycles: number,
  options: { excludeCycleId?: string } = {},
): Promise<Set<string>> {
  const used = new Set<string>();
  if (cooldownCycles <= 0) return used;

  // Pull one extra so excluding the in-flight cycle still honours the full window.
  const { data: cycles, error: cyclesError } = await supabase
    .from('store_specials_cycles')
    .select('id')
    .eq('user_id', userId)
    .order('cycle_index', { ascending: false })
    .limit(cooldownCycles + (options.excludeCycleId ? 1 : 0));

  if (cyclesError || !cycles || cycles.length === 0) {
    if (cyclesError) console.error('[specials/candidates] recent cycles failed:', cyclesError.message);
    return used;
  }

  const cycleIds = cycles
    .map((c) => (c as { id: string }).id)
    .filter((id) => id !== options.excludeCycleId)
    .slice(0, cooldownCycles);
  if (cycleIds.length === 0) return used;
  const { data: items, error: itemsError } = await supabase
    .from('store_specials_cycle_items')
    .select('product_id')
    .in('cycle_id', cycleIds);

  if (itemsError) {
    console.error('[specials/candidates] recent items failed:', itemsError.message);
    return used;
  }

  for (const item of items ?? []) used.add((item as { product_id: string }).product_id);
  return used;
}

/**
 * Build the ranked candidate pool for a cycle: every in-stock, storefront-ready
 * product that is eligible (not on cooldown, not hand-discounted), scored and
 * paired with a proposed discount, sorted strongest-clearance first.
 */
export async function fetchSpecialsCandidates(
  supabase: SupabaseClient,
  userId: string,
  config: SpecialsConfig,
  options: { excludeProductIds?: Set<string>; now?: Date } = {},
): Promise<SpecialsCandidate[]> {
  const now = options.now ?? new Date();
  const exclude = options.excludeProductIds ?? new Set<string>();

  const [{ data, error }, salesByItemId] = await Promise.all([
    supabase
      .from('marketplace_ready_products')
      .select(SPECIALS_PRODUCT_COLUMNS)
      .eq('user_id', userId)
      .gt('qoh', 0)
      .limit(CANDIDATE_FETCH_LIMIT),
    fetchSalesAggregates(supabase, userId, now),
  ]);

  if (error) {
    console.error('[specials/candidates] product fetch failed:', error.message);
    return [];
  }

  const candidates: SpecialsCandidate[] = [];
  for (const row of (data ?? []) as RawSpecialsProductRow[]) {
    if (exclude.has(row.id)) continue;

    // Protect hand-set discounts — never let specials touch them.
    if (row.discount_active === true && row.is_specials_discount !== true) continue;

    const metrics = buildProductMetrics(row, salesByItemId, now);
    if (metrics.retail <= 0) continue;

    const proposal = proposeDiscount(metrics, config);
    if (proposal.discount_percent <= 0) continue; // no room to discount

    candidates.push({ ...metrics, proposal });
  }

  candidates.sort((a, b) => {
    if (b.proposal.clearance_score !== a.proposal.clearance_score) {
      return b.proposal.clearance_score - a.proposal.clearance_score;
    }
    return (b.margin_percent ?? 0) - (a.margin_percent ?? 0);
  });

  return candidates;
}
