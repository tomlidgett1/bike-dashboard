import {
  imageRunFromSerperCache,
  parseSerperCacheRow,
  type SerperImageCacheEntry,
} from "@/lib/optimize/serper-image-cache";

export type ImageApprovalProductImage = {
  source?: string | null;
  approval_status?: string | null;
  cloudinary_public_id?: string | null;
  cloudinary_url?: string | null;
  external_url?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
};

export type ImageApprovalCanonical = {
  id: string;
  upc?: string | null;
  normalized_name?: string | null;
  serper_candidates?: unknown;
  serper_candidates_search_query?: string | null;
  serper_candidates_fetched_at?: string | null;
  serper_ai_selection?: unknown;
  product_images?: ImageApprovalProductImage[] | null;
};

export type ImageApprovalProduct = {
  id: string;
  canonical_product_id: string | null;
  description: string;
  display_name: string | null;
  product_description: string | null;
  product_specs: string | null;
  brand: string | null;
  category_name: string | null;
  listing_source: string | null;
  custom_sku: string | null;
  system_sku: string | null;
  price: number;
  qoh: number;
  is_bicycle?: boolean | null;
  resolved_image_url?: string | null;
  primary_image_url?: string | null;
  canonical_products?: ImageApprovalCanonical | null;
  product_images?: ImageApprovalProductImage[];
};

function isManualCatalogListing(p: ImageApprovalProduct) {
  return p.listing_source === "manual" || p.listing_source === "online_catalog";
}

function isLightspeedListing(p: ImageApprovalProduct) {
  const source = p.listing_source;
  if (source === "manual" || source === "online_catalog") return false;
  return true;
}

export function hasTitle(p: ImageApprovalProduct) {
  const display = p.display_name?.trim();
  if (!display) return false;
  if (isManualCatalogListing(p)) return true;
  return display.toLowerCase() !== (p.description ?? "").trim().toLowerCase();
}

export function hasDesc(p: ImageApprovalProduct) {
  const marketing = p.product_description?.trim();
  if (marketing) return true;
  if (isManualCatalogListing(p)) {
    const fallback = p.description?.trim();
    const title = (p.display_name ?? "").trim().toLowerCase();
    if (fallback && fallback.toLowerCase() !== title && fallback.length >= 24) {
      return true;
    }
  }
  return false;
}

export function hasSpecs(p: ImageApprovalProduct) {
  return !!p.product_specs?.trim();
}

export function hasSerperImage(p: ImageApprovalProduct) {
  const canonicalImages = p.canonical_products?.product_images ?? [];
  const productImages = p.product_images ?? [];
  const allImages = [...canonicalImages, ...productImages];
  const hasApprovedImage = allImages.some(
    (img) =>
      (img.approval_status === "approved" || img.approval_status === null) &&
      (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
  );

  if (!isLightspeedListing(p)) {
    return hasApprovedImage;
  }

  return allImages.some(
    (img) =>
      img.source === "serper_workbench" &&
      (img.approval_status === "approved" || img.approval_status === null) &&
      (img.cloudinary_public_id || img.cloudinary_url || img.external_url),
  );
}

export function serperCacheEntryForProduct(
  product: ImageApprovalProduct,
): SerperImageCacheEntry | null {
  const canonical = product.canonical_products;
  if (!canonical?.id) return null;
  return parseSerperCacheRow({
    id: canonical.id,
    serper_candidates: canonical.serper_candidates,
    serper_candidates_search_query: canonical.serper_candidates_search_query,
    serper_candidates_fetched_at: canonical.serper_candidates_fetched_at,
    serper_ai_selection: canonical.serper_ai_selection,
  });
}

export function hasCachedSerperSelection(product: ImageApprovalProduct) {
  const entry = serperCacheEntryForProduct(product);
  const run = imageRunFromSerperCache(entry);
  return run?.phase === "ready" && !!run.primaryUrl;
}

export function isReadyForImageApproval(product: ImageApprovalProduct) {
  if (!product.canonical_product_id) return false;
  if (!hasTitle(product) || !hasDesc(product) || !hasSpecs(product)) return false;
  if (hasSerperImage(product)) return false;
  return hasCachedSerperSelection(product);
}

export function productLabel(p: ImageApprovalProduct) {
  return p.display_name?.trim() || p.description;
}

export function lightspeedSku(p: ImageApprovalProduct) {
  return p.custom_sku?.trim() || p.system_sku?.trim() || null;
}

export function lightspeedProductName(p: ImageApprovalProduct) {
  return p.description?.trim() || null;
}

const SERPER_CACHE_CHUNK = 50;

export async function fetchSerperCaches(
  canonicalIds: string[],
): Promise<Record<string, SerperImageCacheEntry>> {
  const unique = [...new Set(canonicalIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const caches: Record<string, SerperImageCacheEntry> = {};
  for (let index = 0; index < unique.length; index += SERPER_CACHE_CHUNK) {
    const chunk = unique.slice(index, index + SERPER_CACHE_CHUNK);
    const response = await fetch(
      `/api/optimize/serper-cache?canonicalIds=${encodeURIComponent(chunk.join(","))}`,
    );
    if (!response.ok) continue;
    const data = await response.json();
    Object.assign(caches, data.caches ?? {});
  }

  return caches;
}

export function saveSerperCache(
  canonicalProductId: string,
  payload: {
    searchQuery: string;
    candidates: SerperImageCacheEntry["candidates"];
    aiSelection: SerperImageCacheEntry["aiSelection"];
  },
) {
  void fetch("/api/optimize/serper-cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      canonicalProductId,
      searchQuery: payload.searchQuery,
      candidates: payload.candidates,
      aiSelection: payload.aiSelection,
    }),
  });
}
