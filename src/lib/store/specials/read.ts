import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCloudinaryImageUrl,
  extractCloudinaryPublicId,
} from '@/lib/utils/cloudinary-transforms';
import { salePriceForDiscount } from '@/lib/store/specials/discount-engine';
import type {
  SpecialsAnalyticsSummary,
  SpecialsCycle,
  SpecialsCycleItem,
  SpecialsCycleItemView,
  SpecialsCycleStatus,
  SpecialsCycleWithItems,
  SpecialsProductPerformance,
} from '@/lib/types/specials';

interface ProductDisplay {
  display_name: string;
  category_name: string | null;
  brand: string | null;
  image_url: string | null;
}

/** Fetch lightweight display fields (name, brand, image) for a set of products. */
async function fetchProductDisplays(
  supabase: SupabaseClient,
  userId: string,
  productIds: string[],
): Promise<Map<string, ProductDisplay>> {
  const map = new Map<string, ProductDisplay>();
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from('marketplace_ready_products')
    .select(
      'id, display_name, description, category_name, manufacturer_name, resolved_cloudinary_public_id, resolved_cloudinary_url, resolved_external_url',
    )
    .eq('user_id', userId)
    .in('id', ids);

  for (const row of data ?? []) {
    const r = row as Record<string, string | null>;
    const publicId =
      r.resolved_cloudinary_public_id || extractCloudinaryPublicId(r.resolved_cloudinary_url);
    map.set(r.id as string, {
      display_name: r.display_name?.trim() || r.description?.trim() || 'Product',
      category_name: r.category_name ?? null,
      brand: r.manufacturer_name ?? null,
      image_url:
        buildCloudinaryImageUrl(publicId, 'mobile_card') ||
        r.resolved_cloudinary_url ||
        r.resolved_external_url ||
        null,
    });
  }
  return map;
}

function toItemView(item: SpecialsCycleItem, display?: ProductDisplay): SpecialsCycleItemView {
  const effectiveDiscount =
    item.final_discount_percent != null ? item.final_discount_percent : item.proposed_discount_percent;
  const effectiveSale =
    item.final_discount_percent != null
      ? salePriceForDiscount(item.retail, item.final_discount_percent)
      : item.proposed_sale_price;

  return {
    ...item,
    display_name: display?.display_name ?? 'Product',
    category_name: display?.category_name ?? null,
    brand: display?.brand ?? null,
    image_url: display?.image_url ?? null,
    effective_discount_percent: effectiveDiscount,
    effective_sale_price: effectiveSale,
  };
}

/** Load cycles (optionally by status) with their items joined to display fields. */
export async function loadCyclesWithItems(
  supabase: SupabaseClient,
  userId: string,
  options: { statuses?: SpecialsCycleStatus[]; limit?: number; includeRemoved?: boolean } = {},
): Promise<SpecialsCycleWithItems[]> {
  let cyclesQuery = supabase
    .from('store_specials_cycles')
    .select('*')
    .eq('user_id', userId)
    .order('starts_at', { ascending: true });

  if (options.statuses && options.statuses.length > 0) {
    cyclesQuery = cyclesQuery.in('status', options.statuses);
  }
  if (options.limit) cyclesQuery = cyclesQuery.limit(options.limit);

  const { data: cycles, error } = await cyclesQuery;
  if (error) {
    if (error.code === '42P01') return []; // table not migrated yet → graceful empty
    console.error('[specials/read] load cycles failed:', error.message);
    return [];
  }
  if (!cycles || cycles.length === 0) return [];

  const cycleIds = cycles.map((c) => (c as SpecialsCycle).id);
  let itemsQuery = supabase
    .from('store_specials_cycle_items')
    .select('*')
    .in('cycle_id', cycleIds)
    .order('position', { ascending: true });
  if (!options.includeRemoved) itemsQuery = itemsQuery.eq('is_removed', false);

  const { data: items } = await itemsQuery;
  const allItems = (items ?? []) as SpecialsCycleItem[];

  const displays = await fetchProductDisplays(
    supabase,
    userId,
    allItems.map((i) => i.product_id),
  );

  const itemsByCycle = new Map<string, SpecialsCycleItemView[]>();
  for (const item of allItems) {
    const view = toItemView(item, displays.get(item.product_id));
    const list = itemsByCycle.get(item.cycle_id);
    if (list) list.push(view);
    else itemsByCycle.set(item.cycle_id, [view]);
  }

  return cycles.map((c) => ({
    ...(c as SpecialsCycle),
    items: itemsByCycle.get((c as SpecialsCycle).id) ?? [],
  }));
}

const PERF_EVENT_TYPES = ['product_impression', 'product_click', 'add_to_cart_click'] as const;

/**
 * Per-product views/clicks attributed to each cycle's live window (requirement:
 * track views, clicks etc per product). Counts storefront analytics events for a
 * cycle's products that occurred while that cycle was live — robust without
 * needing bespoke event tagging.
 */
export async function loadSpecialsAnalytics(
  supabase: SupabaseClient,
  userId: string,
  options: { cycleLimit?: number; now?: Date } = {},
): Promise<SpecialsAnalyticsSummary> {
  const now = options.now ?? new Date();
  const empty: SpecialsAnalyticsSummary = {
    total_impressions: 0,
    total_clicks: 0,
    total_add_to_cart: 0,
    ctr: 0,
    products: [],
  };

  // Cycles that have been (or are) live: active + expired, most recent first.
  const { data: cycles, error } = await supabase
    .from('store_specials_cycles')
    .select('id, cycle_index, starts_at, ends_at, status')
    .eq('user_id', userId)
    .in('status', ['active', 'expired'])
    .order('starts_at', { ascending: false })
    .limit(options.cycleLimit ?? 8);

  if (error) {
    if (error.code !== '42P01') console.error('[specials/read] analytics cycles failed:', error.message);
    return empty;
  }
  if (!cycles || cycles.length === 0) return empty;

  const cycleRows = cycles as Array<{
    id: string;
    cycle_index: number;
    starts_at: string;
    ends_at: string;
    status: string;
  }>;

  // Cycle items (id snapshots: discount + product).
  const { data: items } = await supabase
    .from('store_specials_cycle_items')
    .select('cycle_id, product_id, proposed_discount_percent, final_discount_percent, proposed_sale_price, retail')
    .in('cycle_id', cycleRows.map((c) => c.id))
    .eq('is_removed', false);

  const itemRows = (items ?? []) as Array<{
    cycle_id: string;
    product_id: string;
    proposed_discount_percent: number;
    final_discount_percent: number | null;
    proposed_sale_price: number;
    retail: number;
  }>;
  if (itemRows.length === 0) return empty;

  const productIds = Array.from(new Set(itemRows.map((i) => i.product_id)));
  const earliestStart = cycleRows.reduce(
    (min, c) => (c.starts_at < min ? c.starts_at : min),
    cycleRows[0].starts_at,
  );

  const { data: events } = await supabase
    .from('store_analytics_events')
    .select('product_id, event_type, occurred_at')
    .eq('store_owner_id', userId)
    .in('product_id', productIds)
    .in('event_type', PERF_EVENT_TYPES as unknown as string[])
    .gte('occurred_at', earliestStart)
    .limit(100_000);

  const eventRows = (events ?? []) as Array<{
    product_id: string;
    event_type: string;
    occurred_at: string;
  }>;

  const displays = await fetchProductDisplays(supabase, userId, productIds);

  // Bucket each event into the cycle window it falls inside (per product).
  const perf = new Map<string, SpecialsProductPerformance>();
  const keyOf = (cycleId: string, productId: string) => `${cycleId}:${productId}`;

  const itemByKey = new Map(itemRows.map((i) => [keyOf(i.cycle_id, i.product_id), i]));
  const productCycles = new Map<string, typeof cycleRows>();
  for (const item of itemRows) {
    const cycle = cycleRows.find((c) => c.id === item.cycle_id);
    if (!cycle) continue;
    const list = productCycles.get(item.product_id) ?? [];
    list.push(cycle);
    productCycles.set(item.product_id, list);
  }

  for (const event of eventRows) {
    const cyclesForProduct = productCycles.get(event.product_id);
    if (!cyclesForProduct) continue;
    const ts = event.occurred_at;
    const cycle = cyclesForProduct.find(
      (c) => ts >= c.starts_at && ts <= (c.ends_at < now.toISOString() ? c.ends_at : now.toISOString()),
    );
    if (!cycle) continue;

    const key = keyOf(cycle.id, event.product_id);
    let row = perf.get(key);
    if (!row) {
      const item = itemByKey.get(key);
      const discount =
        item?.final_discount_percent != null
          ? item.final_discount_percent
          : item?.proposed_discount_percent ?? 0;
      row = {
        product_id: event.product_id,
        display_name: displays.get(event.product_id)?.display_name ?? 'Product',
        image_url: displays.get(event.product_id)?.image_url ?? null,
        cycle_id: cycle.id,
        cycle_index: cycle.cycle_index,
        impressions: 0,
        clicks: 0,
        add_to_cart: 0,
        ctr: 0,
        discount_percent: discount,
        sale_price: item?.proposed_sale_price ?? 0,
      };
      perf.set(key, row);
    }
    if (event.event_type === 'product_impression') row.impressions += 1;
    else if (event.event_type === 'product_click') row.clicks += 1;
    else if (event.event_type === 'add_to_cart_click') row.add_to_cart += 1;
  }

  const products = Array.from(perf.values()).map((p) => ({
    ...p,
    ctr: p.impressions > 0 ? Math.round((p.clicks / p.impressions) * 1000) / 10 : 0,
  }));
  products.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);

  const totalImpressions = products.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = products.reduce((s, p) => s + p.clicks, 0);
  const totalAddToCart = products.reduce((s, p) => s + p.add_to_cart, 0);

  return {
    total_impressions: totalImpressions,
    total_clicks: totalClicks,
    total_add_to_cart: totalAddToCart,
    ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0,
    products,
  };
}
