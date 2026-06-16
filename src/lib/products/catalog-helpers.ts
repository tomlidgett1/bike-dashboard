import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductSourceRow = {
  listing_source?: string | null;
  lightspeed_item_id?: string | null;
};

export function isLightspeedProduct(p: ProductSourceRow): boolean {
  if (p.listing_source === "manual" || p.listing_source === "online_catalog") {
    return false;
  }
  if (p.listing_source === "lightspeed") return true;
  return Boolean(p.lightspeed_item_id);
}

export function productSourceLabel(p: ProductSourceRow): "Lightspeed" | "Manual" {
  return isLightspeedProduct(p) ? "Lightspeed" : "Manual";
}

/** PostgREST `.or()` filter — must stay in sync with `isLightspeedProduct`. */
export const LIGHTSPEED_SOURCE_OR_FILTER =
  "listing_source.eq.lightspeed,and(lightspeed_item_id.not.is.null,or(listing_source.is.null,listing_source.not.in.(manual,online_catalog)))";

/** PostgREST `.or()` filter — must stay in sync with `isLightspeedProduct`. */
export const MANUAL_SOURCE_OR_FILTER =
  "listing_source.in.(manual,online_catalog),and(lightspeed_item_id.is.null,or(listing_source.is.null,listing_source.neq.lightspeed))";

export function formatLightspeedCategory(p: {
  full_category_path?: string | null;
  category_name?: string | null;
}): string | null {
  return p.full_category_path?.trim() || p.category_name?.trim() || null;
}

export function formatCanonicalCategory(p: {
  marketplace_category?: string | null;
  marketplace_subcategory?: string | null;
  marketplace_level_3_category?: string | null;
}): string | null {
  const parts = [
    p.marketplace_category,
    p.marketplace_subcategory,
    p.marketplace_level_3_category,
  ]
    .map((s) => s?.trim())
    .filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" › ") : null;
}

const FILTER_OPTIONS_BATCH_SIZE = 1000;

type ProductFilterColumn = "category_name" | "manufacturer_name";
type ProductFilterRow = Record<ProductFilterColumn, string | null>;

/** Batched distinct values for product filter dropdowns (Supabase caps at 1000 rows per request). */
export async function fetchDistinctProductFilterValues(
  supabase: SupabaseClient,
  userId: string,
  column: ProductFilterColumn,
): Promise<string[]> {
  const values = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(column)
      .eq("user_id", userId)
      .not(column, "is", null)
      .order("id")
      .range(from, from + FILTER_OPTIONS_BATCH_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const value = String((row as ProductFilterRow)[column] ?? "").trim();
      if (value) values.add(value);
    }

    if (rows.length < FILTER_OPTIONS_BATCH_SIZE) break;
    from += FILTER_OPTIONS_BATCH_SIZE;
  }

  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** All marketplace-live product ids for a store (batched). */
export async function fetchMarketplaceLiveProductIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_ready_products")
      .select("id")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + FILTER_OPTIONS_BATCH_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    if (rows.length === 0) break;

    ids.push(...rows.map((row) => row.id));

    if (rows.length < FILTER_OPTIONS_BATCH_SIZE) break;
    from += FILTER_OPTIONS_BATCH_SIZE;
  }

  return ids;
}
