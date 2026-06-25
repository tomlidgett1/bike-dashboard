import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SpecialsCandidate,
  SpecialsConfig,
  SpecialsSource,
} from '@/lib/types/specials';
import {
  fetchRecentlyUsedProductIds,
  fetchSpecialsCandidates,
} from '@/lib/store/specials/candidate-pool';
import { curateCycleWithAI } from '@/lib/store/specials/ai-curate';
import { selectCandidates } from '@/lib/store/specials/selection';
import { computeCycleWindows } from '@/lib/store/specials/cycle-window';
import { gatherMetricsForProductIds } from '@/lib/store/specials/metrics';
import { proposeDiscount } from '@/lib/store/specials/discount-engine';

/** Active cycle + this many upcoming = the pipeline depth we maintain. */
export const DESIRED_TOTAL_WINDOWS = 4;

interface CycleSelection {
  selected: SpecialsCandidate[];
  themeLabel: string | null;
  rationale: string | null;
  generatedBy: SpecialsSource;
}

/** Pick a cycle's products: AI when enabled, else the deterministic engine. */
async function buildCycleSelection(
  supabase: SupabaseClient,
  userId: string,
  config: SpecialsConfig,
  options: { excludeCycleId?: string; limit?: number; now?: Date } = {},
): Promise<CycleSelection> {
  // Manual stores hand-pick everything — start the cycle empty.
  if (config.selection_mode === 'manual') {
    return { selected: [], themeLabel: null, rationale: null, generatedBy: 'manual' };
  }

  const exclude = await fetchRecentlyUsedProductIds(
    supabase,
    userId,
    config.min_cooldown_cycles,
    { excludeCycleId: options.excludeCycleId },
  );
  const candidates = await fetchSpecialsCandidates(supabase, userId, config, {
    excludeProductIds: exclude,
    now: options.now,
  });

  const limit = options.limit ?? config.products_per_cycle;
  const cappedConfig = { ...config, products_per_cycle: Math.max(0, limit) };
  if (limit <= 0) {
    return { selected: [], themeLabel: null, rationale: null, generatedBy: 'manual' };
  }

  const ai = await curateCycleWithAI(candidates, cappedConfig);
  if (ai && ai.selected.length > 0) {
    return {
      selected: ai.selected.slice(0, limit),
      themeLabel: ai.themeLabel,
      rationale: ai.rationale,
      generatedBy: 'ai',
    };
  }

  const deterministic = selectCandidates(candidates, cappedConfig);
  return {
    selected: deterministic.selected.slice(0, limit),
    themeLabel: deterministic.themeLabel,
    rationale: null,
    generatedBy: 'heuristic',
  };
}

/** Map a selected candidate to a cycle item row, at the given position. */
function candidateToItemRow(
  cycleId: string,
  userId: string,
  candidate: SpecialsCandidate,
  position: number,
  source: SpecialsSource,
  isPinned = false,
) {
  return {
    cycle_id: cycleId,
    user_id: userId,
    product_id: candidate.product_id,
    lightspeed_item_id: candidate.lightspeed_item_id,
    position,
    retail: candidate.retail,
    cost: candidate.cost,
    soh: candidate.soh,
    last_sold_at: candidate.last_sold_at,
    days_since_sold: candidate.days_since_sold,
    units_sold_90d: candidate.units_sold_90d,
    units_sold_300d: candidate.units_sold_300d,
    margin_percent: candidate.margin_percent,
    proposed_discount_percent: candidate.proposal.discount_percent,
    proposed_sale_price: candidate.proposal.sale_price,
    ai_reason: candidate.proposal.reason,
    source,
    is_pinned: isPinned,
    is_removed: false,
  };
}

/** Insert selection items for a cycle and update its metadata row. */
async function persistCycleSelection(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  selection: CycleSelection,
): Promise<void> {
  if (selection.selected.length > 0) {
    const rows = selection.selected.map((c, i) =>
      candidateToItemRow(cycleId, userId, c, i, selection.generatedBy),
    );
    const { error: itemsError } = await supabase.from('store_specials_cycle_items').insert(rows);
    if (itemsError) {
      console.error('[specials/generate] failed to insert items:', itemsError.message);
    }
  }

  await supabase
    .from('store_specials_cycles')
    .update({
      generated_by: selection.generatedBy,
      theme_label: selection.themeLabel,
      ai_rationale: selection.rationale,
      item_count: selection.selected.length,
    })
    .eq('id', cycleId)
    .eq('user_id', userId);
}

/**
 * Fill cycles that exist but have no live items — e.g. when candidate fetch failed
 * after the cycle row was created (stale view columns, transient API error).
 */
async function backfillEmptyCycles(
  supabase: SupabaseClient,
  userId: string,
  config: SpecialsConfig,
  options: { now?: Date } = {},
): Promise<void> {
  if (config.selection_mode === 'manual') return;

  const { data: cycles } = await supabase
    .from('store_specials_cycles')
    .select('id, status, item_count')
    .eq('user_id', userId)
    .in('status', ['upcoming', 'active'])
    .lte('item_count', 0);

  for (const row of cycles ?? []) {
    const cycle = row as { id: string; status: string; item_count: number };
    if (cycle.status === 'upcoming') {
      await regenerateCycleItems(supabase, userId, cycle.id, config);
      continue;
    }

    const selection = await buildCycleSelection(supabase, userId, config, {
      excludeCycleId: cycle.id,
      now: options.now,
    });
    await persistCycleSelection(supabase, userId, cycle.id, selection);
  }
}

async function nextCycleIndex(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('store_specials_cycles')
    .select('cycle_index')
    .eq('user_id', userId)
    .order('cycle_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { cycle_index: number } | null)?.cycle_index ?? -1) + 1;
}

/**
 * Keep the cycle pipeline full. For each rotation window from "now" forward that
 * has no cycle yet, generate one (status 'upcoming') and persist its items.
 * Existing cycles are never touched, so manual edits and AI picks are preserved.
 * Items are inserted before the next window is generated, so the no-recycle
 * cooldown naturally prevents back-to-back upcoming cycles from overlapping.
 */
export async function ensureUpcomingCycles(
  supabase: SupabaseClient,
  userId: string,
  config: SpecialsConfig,
  options: { now?: Date; totalWindows?: number } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const totalWindows = options.totalWindows ?? DESIRED_TOTAL_WINDOWS;
  const windows = computeCycleWindows(config, totalWindows, now);

  // Which windows already have a cycle (matched by start time)?
  const earliestStart = windows[0]?.starts_at;
  const { data: existing } = await supabase
    .from('store_specials_cycles')
    .select('starts_at')
    .eq('user_id', userId)
    .gte('starts_at', earliestStart ?? now.toISOString());
  const existingStarts = new Set(
    (existing ?? []).map((c) => new Date((c as { starts_at: string }).starts_at).getTime()),
  );

  let index = await nextCycleIndex(supabase, userId);

  for (const window of windows) {
    if (existingStarts.has(new Date(window.starts_at).getTime())) continue;

    const selection = await buildCycleSelection(supabase, userId, config, { now });

    const { data: cycle, error: cycleError } = await supabase
      .from('store_specials_cycles')
      .insert({
        user_id: userId,
        cycle_index: index,
        status: 'upcoming',
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        cadence: config.cadence,
        strategy: config.strategy,
        generated_by: selection.generatedBy,
        theme_label: selection.themeLabel,
        ai_rationale: selection.rationale,
        item_count: selection.selected.length,
      })
      .select('id')
      .single();

    if (cycleError || !cycle) {
      console.error('[specials/generate] failed to create cycle:', cycleError?.message);
      break;
    }
    index += 1;

    const cycleId = (cycle as { id: string }).id;
    await persistCycleSelection(supabase, userId, cycleId, selection);
  }

  await backfillEmptyCycles(supabase, userId, config, { now });
}

/**
 * Regenerate an upcoming cycle's auto-picked items, preserving pinned items and
 * never re-adding manually-removed products (tombstones). Recomputes positions:
 * pinned items first, then the fresh picks.
 */
export async function regenerateCycleItems(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  config: SpecialsConfig,
): Promise<{ ok: boolean; error?: string }> {
  const { data: cycle } = await supabase
    .from('store_specials_cycles')
    .select('id, status')
    .eq('id', cycleId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!cycle) return { ok: false, error: 'Cycle not found' };
  if ((cycle as { status: string }).status !== 'upcoming') {
    return { ok: false, error: 'Only upcoming cycles can be regenerated' };
  }

  const { data: items } = await supabase
    .from('store_specials_cycle_items')
    .select('product_id, is_pinned, is_removed, position')
    .eq('cycle_id', cycleId);

  const pinnedIds = (items ?? [])
    .filter((i) => (i as { is_pinned: boolean; is_removed: boolean }).is_pinned && !(i as { is_removed: boolean }).is_removed)
    .map((i) => (i as { product_id: string }).product_id);
  const removedIds = (items ?? [])
    .filter((i) => (i as { is_removed: boolean }).is_removed)
    .map((i) => (i as { product_id: string }).product_id);

  // Remove all current non-pinned, non-removed items; keep pinned + tombstones.
  await supabase
    .from('store_specials_cycle_items')
    .delete()
    .eq('cycle_id', cycleId)
    .eq('is_pinned', false)
    .eq('is_removed', false);

  const slotsLeft = Math.max(0, config.products_per_cycle - pinnedIds.length);

  let selection: CycleSelection = {
    selected: [],
    themeLabel: null,
    rationale: null,
    generatedBy: 'manual',
  };
  if (slotsLeft > 0 && config.selection_mode === 'auto') {
    selection = await buildCycleSelection(supabase, userId, config, {
      excludeCycleId: cycleId,
      limit: slotsLeft,
    });
  }

  // Exclude pinned + removed so we never duplicate or resurrect them.
  const blocked = new Set([...pinnedIds, ...removedIds]);
  const fresh = selection.selected.filter((c) => !blocked.has(c.product_id));

  if (fresh.length > 0) {
    const rows = fresh.map((c, i) =>
      candidateToItemRow(cycleId, userId, c, pinnedIds.length + i, selection.generatedBy),
    );
    const { error } = await supabase.from('store_specials_cycle_items').insert(rows);
    if (error) {
      console.error('[specials/generate] regenerate insert failed:', error.message);
      return { ok: false, error: error.message };
    }
  }

  await supabase
    .from('store_specials_cycles')
    .update({
      generated_by: pinnedIds.length > 0 ? 'manual' : selection.generatedBy,
      theme_label: selection.themeLabel,
      ai_rationale: selection.rationale,
      item_count: pinnedIds.length + fresh.length,
    })
    .eq('id', cycleId)
    .eq('user_id', userId);

  return { ok: true };
}

/**
 * Build a single cycle-item row for a product the owner manually adds. The
 * discount is engine-proposed from the live metrics (margin-safe) and the item
 * is pinned so regeneration won't drop it.
 */
export async function buildManualItemRow(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  productId: string,
  config: SpecialsConfig,
  position: number,
) {
  const metrics = await gatherMetricsForProductIds(supabase, userId, [productId]);
  if (metrics.length === 0) return null;
  const m = metrics[0];
  const proposal = proposeDiscount(m, config);
  return candidateToItemRow(cycleId, userId, { ...m, proposal }, position, 'manual', true);
}
