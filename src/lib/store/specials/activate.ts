import type { SupabaseClient } from '@supabase/supabase-js';
import type { SpecialsConfig } from '@/lib/types/specials';
import { loadSpecialsConfig, ensureSpecialsCarousel } from '@/lib/store/specials/config';
import { ensureUpcomingCycles } from '@/lib/store/specials/generate-cycle';

interface CycleItemRow {
  product_id: string;
  position: number;
  proposed_discount_percent: number;
  final_discount_percent: number | null;
  is_removed: boolean;
}

/** Effective discount for a cycle item — a manual override wins over the proposal. */
function effectiveDiscount(item: CycleItemRow): number {
  return item.final_discount_percent != null
    ? item.final_discount_percent
    : item.proposed_discount_percent;
}

/** Ordered, live (non-removed) items of a cycle. */
async function fetchLiveItems(
  supabase: SupabaseClient,
  cycleId: string,
): Promise<CycleItemRow[]> {
  const { data } = await supabase
    .from('store_specials_cycle_items')
    .select('product_id, position, proposed_discount_percent, final_discount_percent, is_removed')
    .eq('cycle_id', cycleId)
    .eq('is_removed', false)
    .order('position', { ascending: true });
  return (data ?? []) as CycleItemRow[];
}

/**
 * Point the storefront carousel anchor at a cycle's products (in order). When
 * cycleId is null the carousel is emptied (it then simply stops rendering).
 */
export async function syncSpecialsCarousel(
  supabase: SupabaseClient,
  userId: string,
  config: SpecialsConfig,
  cycleId: string | null,
): Promise<void> {
  const carouselId = await ensureSpecialsCarousel(supabase, userId, config);
  if (!carouselId) return;

  const productIds = cycleId ? (await fetchLiveItems(supabase, cycleId)).map((i) => i.product_id) : [];

  await supabase
    .from('store_categories')
    .update({
      product_ids: productIds,
      name: config.carousel_title,
      subtitle: config.carousel_subtitle,
      is_active: productIds.length > 0,
    })
    .eq('id', carouselId)
    .eq('user_id', userId);
}

/**
 * Apply the cycle's discounts to the underlying products so the storefront shows
 * sale pricing. Discounts auto-expire at the cycle end (defensive: the sale
 * lapses even if the next rotation cron runs late). Marks them specials-owned.
 */
async function applyCycleDiscounts(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  endsAt: string,
): Promise<string[]> {
  const items = await fetchLiveItems(supabase, cycleId);
  const appliedIds: string[] = [];

  for (const item of items) {
    const pct = Math.round(effectiveDiscount(item) * 100) / 100;
    if (pct <= 0) continue;
    const { error } = await supabase
      .from('products')
      .update({
        discount_percent: pct,
        discount_active: true,
        discount_ends_at: endsAt,
        is_specials_discount: true,
      })
      .eq('id', item.product_id)
      .eq('user_id', userId);
    if (error) {
      console.error('[specials/activate] apply discount failed:', error.message);
    } else {
      appliedIds.push(item.product_id);
    }
  }
  return appliedIds;
}

/** Clear specials-owned discounts except for the given product ids. Never touches hand-set discounts. */
export async function clearSpecialsDiscounts(
  supabase: SupabaseClient,
  userId: string,
  exceptProductIds: string[] = [],
): Promise<void> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('user_id', userId)
    .eq('is_specials_discount', true);

  const except = new Set(exceptProductIds);
  const toClear = (data ?? [])
    .map((r) => (r as { id: string }).id)
    .filter((id) => !except.has(id));

  if (toClear.length === 0) return;

  const { error } = await supabase
    .from('products')
    .update({
      discount_active: false,
      discount_percent: null,
      discount_ends_at: null,
      is_specials_discount: false,
    })
    .eq('user_id', userId)
    .in('id', toClear);

  if (error) console.error('[specials/activate] clear discounts failed:', error.message);
}

/**
 * Re-apply discounts + carousel for the currently active cycle after a live edit
 * (manual add/remove/reorder/discount change). No generation — fast and safe to
 * call from interactive item endpoints. No-op when the given cycle isn't active.
 */
export async function resyncActiveCycle(
  supabase: SupabaseClient,
  userId: string,
  config: SpecialsConfig,
  cycleId: string,
): Promise<void> {
  const { data } = await supabase
    .from('store_specials_cycles')
    .select('id, status, ends_at')
    .eq('id', cycleId)
    .eq('user_id', userId)
    .maybeSingle();

  const cycle = data as { id: string; status: string; ends_at: string } | null;
  if (!cycle || cycle.status !== 'active') return;

  const appliedIds = await applyCycleDiscounts(supabase, userId, cycle.id, cycle.ends_at);
  await clearSpecialsDiscounts(supabase, userId, appliedIds);
  await syncSpecialsCarousel(supabase, userId, config, cycle.id);
}

export interface RotateResult {
  changed: boolean;
  activeCycleId: string | null;
  message: string;
}

/**
 * Rotation entry point (cron + on-demand). Idempotent:
 *  - disabled store → clear specials discounts + empty carousel.
 *  - else ensure the pipeline, expire past cycles, then activate the cycle whose
 *    window contains `now` (applying its discounts + syncing the carousel) and
 *    retire the previous one.
 */
export async function rotateSpecials(
  supabase: SupabaseClient,
  userId: string,
  options: { now?: Date; config?: SpecialsConfig } = {},
): Promise<RotateResult> {
  const now = options.now ?? new Date();
  const config = options.config ?? (await loadSpecialsConfig(supabase, userId));

  if (!config.is_enabled) {
    await clearSpecialsDiscounts(supabase, userId, []);
    await syncSpecialsCarousel(supabase, userId, config, null);
    return { changed: false, activeCycleId: null, message: 'Specials disabled.' };
  }

  await ensureUpcomingCycles(supabase, userId, config, { now });

  const nowIso = now.toISOString();

  // Expire any active cycle whose window has already ended.
  await supabase
    .from('store_specials_cycles')
    .update({ status: 'expired', expired_at: nowIso })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('ends_at', nowIso);

  // The cycle whose window contains now.
  const { data: currentRow } = await supabase
    .from('store_specials_cycles')
    .select('id, status, ends_at')
    .eq('user_id', userId)
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!currentRow) {
    await clearSpecialsDiscounts(supabase, userId, []);
    await syncSpecialsCarousel(supabase, userId, config, null);
    return { changed: false, activeCycleId: null, message: 'No current cycle.' };
  }

  const current = currentRow as { id: string; status: string; ends_at: string };
  const wasActive = current.status === 'active';

  // Retire any other active cycle.
  await supabase
    .from('store_specials_cycles')
    .update({ status: 'expired', expired_at: nowIso })
    .eq('user_id', userId)
    .eq('status', 'active')
    .neq('id', current.id);

  if (!wasActive) {
    await supabase
      .from('store_specials_cycles')
      .update({ status: 'active', activated_at: nowIso })
      .eq('id', current.id)
      .eq('user_id', userId);
  }

  // Apply discounts for the active cycle and clear everything else (idempotent).
  const appliedIds = await applyCycleDiscounts(supabase, userId, current.id, current.ends_at);
  await clearSpecialsDiscounts(supabase, userId, appliedIds);
  await syncSpecialsCarousel(supabase, userId, config, current.id);

  await supabase
    .from('store_specials_config')
    .update({ last_rotated_at: nowIso })
    .eq('user_id', userId);

  return {
    changed: !wasActive,
    activeCycleId: current.id,
    message: wasActive ? 'Active cycle refreshed.' : 'Rotated to new cycle.',
  };
}
