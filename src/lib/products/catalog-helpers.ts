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
