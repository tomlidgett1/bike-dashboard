/**
 * Shared copy-need checks for optimise flows (client + server).
 * Mirrors logic in optimizer-shared hasTitle / hasDesc.
 */

export type CopyNeedProduct = {
  description: string;
  display_name: string | null;
  product_description: string | null;
  listing_source: string | null;
};

function isManualCatalogListing(listingSource: string | null) {
  return listingSource === "manual" || listingSource === "online_catalog";
}

export function hasTitle(product: CopyNeedProduct) {
  const display = product.display_name?.trim();
  if (!display) return false;
  if (isManualCatalogListing(product.listing_source)) return true;
  return display.toLowerCase() !== (product.description ?? "").trim().toLowerCase();
}

export function hasDesc(product: CopyNeedProduct) {
  const marketing = product.product_description?.trim();
  if (marketing) return true;
  if (isManualCatalogListing(product.listing_source)) {
    const fallback = product.description?.trim();
    const title = (product.display_name ?? "").trim().toLowerCase();
    if (fallback && fallback.toLowerCase() !== title && fallback.length >= 24) {
      return true;
    }
  }
  return false;
}

export function needsCopy(product: CopyNeedProduct) {
  return !hasTitle(product) || !hasDesc(product);
}
