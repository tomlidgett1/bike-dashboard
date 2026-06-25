import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCloudinaryImageUrl,
  extractCloudinaryPublicId,
} from '@/lib/utils/cloudinary-transforms';
import type { SpecialsProductMetrics } from '@/lib/types/specials';

/**
 * Per-product economics + sell-through used by the specials discount engine.
 *
 * Data sources (all keyed off Lightspeed item id):
 *  - marketplace_ready_products → live retail, cost, SOH, category, brand, image
 *    (this view only surfaces products that actually render on the storefront).
 *  - lightspeed_sales_report_lines → last-sold date + units sold per window.
 */

const SALES_WINDOW_DAYS = 300;
const SALES_LINE_FETCH_LIMIT = 50_000;

/** Columns selected from marketplace_ready_products for candidate metrics. */
export const SPECIALS_PRODUCT_COLUMNS = `
  id,
  lightspeed_item_id,
  lightspeed_category_id,
  display_name,
  description,
  category_name,
  manufacturer_name,
  price,
  avg_cost,
  default_cost,
  qoh,
  discount_active,
  is_specials_discount,
  resolved_cloudinary_public_id,
  resolved_cloudinary_url,
  resolved_external_url
` as const;

export interface RawSpecialsProductRow {
  id: string;
  lightspeed_item_id: string | null;
  lightspeed_category_id: string | null;
  display_name: string | null;
  description: string | null;
  category_name: string | null;
  manufacturer_name: string | null;
  price: number | string | null;
  avg_cost: number | string | null;
  default_cost: number | string | null;
  qoh: number | string | null;
  discount_active: boolean | null;
  is_specials_discount: boolean | null;
  resolved_cloudinary_public_id: string | null;
  resolved_cloudinary_url: string | null;
  resolved_external_url: string | null;
}

interface SalesAggregate {
  lastSoldAt: string | null;
  units90: number;
  units300: number;
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

function resolveImageUrl(row: RawSpecialsProductRow): string | null {
  const publicId =
    row.resolved_cloudinary_public_id ||
    extractCloudinaryPublicId(row.resolved_cloudinary_url);
  return (
    buildCloudinaryImageUrl(publicId, 'mobile_card') ||
    row.resolved_cloudinary_url ||
    row.resolved_external_url ||
    null
  );
}

/**
 * Aggregate every sale line in the last 300 days into a per-item summary:
 * latest sale time + units sold in the trailing 90 / 300 day windows.
 *
 * Aggregation happens in JS (Supabase JS has no GROUP BY) but is bounded to a
 * sane row cap and selects only three small columns, so it stays cheap even for
 * busy stores. Returns a Map keyed by Lightspeed item id.
 */
export async function fetchSalesAggregates(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<Map<string, SalesAggregate>> {
  const since = new Date(now.getTime() - SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const ninetyAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).getTime();

  const { data, error } = await supabase
    .from('lightspeed_sales_report_lines')
    .select('item_id, complete_time, quantity')
    .eq('user_id', userId)
    .not('item_id', 'is', null)
    .gte('complete_time', since.toISOString())
    .order('complete_time', { ascending: false })
    .limit(SALES_LINE_FETCH_LIMIT);

  const map = new Map<string, SalesAggregate>();
  if (error) {
    console.error('[specials/metrics] sales aggregate fetch failed:', error.message);
    return map;
  }

  for (const row of data ?? []) {
    const itemId = (row as { item_id: string | null }).item_id;
    if (!itemId) continue;
    const completeTime = (row as { complete_time: string | null }).complete_time;
    const qty = num((row as { quantity: number | string | null }).quantity);

    const existing = map.get(itemId) ?? { lastSoldAt: null, units90: 0, units300: 0 };
    if (completeTime) {
      if (!existing.lastSoldAt || completeTime > existing.lastSoldAt) {
        existing.lastSoldAt = completeTime;
      }
      existing.units300 += qty;
      if (new Date(completeTime).getTime() >= ninetyAgo) existing.units90 += qty;
    }
    map.set(itemId, existing);
  }

  return map;
}

/** Combine a product row + its sales aggregate into a metrics record. */
export function buildProductMetrics(
  row: RawSpecialsProductRow,
  salesByItemId: Map<string, SalesAggregate>,
  now: Date = new Date(),
): SpecialsProductMetrics {
  const retail = num(row.price);
  const cost = num(row.avg_cost) || num(row.default_cost);
  const soh = num(row.qoh);
  const marginPercent =
    retail > 0 ? Math.round(((retail - cost) / retail) * 1000) / 10 : null;

  const sales = (row.lightspeed_item_id && salesByItemId.get(row.lightspeed_item_id)) || null;
  const lastSoldAt = sales?.lastSoldAt ?? null;
  const daysSinceSold = lastSoldAt
    ? Math.max(
        0,
        Math.floor((now.getTime() - new Date(lastSoldAt).getTime()) / (24 * 60 * 60 * 1000)),
      )
    : null;

  return {
    product_id: row.id,
    lightspeed_item_id: row.lightspeed_item_id,
    display_name: row.display_name?.trim() || row.description?.trim() || 'Product',
    category_name: row.category_name,
    lightspeed_category_id: row.lightspeed_category_id,
    brand: row.manufacturer_name,
    image_url: resolveImageUrl(row),
    retail,
    cost,
    soh,
    margin_percent: marginPercent,
    last_sold_at: lastSoldAt,
    days_since_sold: daysSinceSold,
    units_sold_90d: sales?.units90 ?? 0,
    units_sold_300d: sales?.units300 ?? 0,
  };
}

/**
 * Build metrics for an explicit list of product ids (used when a store owner
 * manually adds a product to a cycle, or to refresh a cycle's snapshot).
 */
export async function gatherMetricsForProductIds(
  supabase: SupabaseClient,
  userId: string,
  productIds: string[],
  now: Date = new Date(),
): Promise<SpecialsProductMetrics[]> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const [{ data, error }, salesByItemId] = await Promise.all([
    supabase
      .from('marketplace_ready_products')
      .select(SPECIALS_PRODUCT_COLUMNS)
      .eq('user_id', userId)
      .in('id', ids),
    fetchSalesAggregates(supabase, userId, now),
  ]);

  if (error) {
    console.error('[specials/metrics] product fetch failed:', error.message);
    return [];
  }

  const byId = new Map<string, SpecialsProductMetrics>();
  for (const row of (data ?? []) as RawSpecialsProductRow[]) {
    byId.set(row.id, buildProductMetrics(row, salesByItemId, now));
  }
  // Preserve the requested order.
  return ids.map((id) => byId.get(id)).filter((m): m is SpecialsProductMetrics => !!m);
}
