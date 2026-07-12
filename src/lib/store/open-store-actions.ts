import type { MissingBrandProduct } from "@/lib/missing-brands/types";
import type { MissingCategoryProduct } from "@/lib/missing-categories/types";

/** Matches the simple Actions table catalog fetch limit. */
export const OPEN_ACTIONS_CATALOG_LIMIT = 30;

export function countOpenStoreActions({
  brandProducts,
  categoryProducts,
}: {
  brandProducts: MissingBrandProduct[];
  categoryProducts: MissingCategoryProduct[];
}): number {
  return brandProducts.length + categoryProducts.length;
}

export function formatOpenActionsBadgeCount(count: number): string | undefined {
  if (count <= 0) return undefined;
  return String(count);
}
