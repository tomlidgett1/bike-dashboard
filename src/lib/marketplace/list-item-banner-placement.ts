import { MARKETPLACE_PROMO_BANNERS_ENABLED } from "@/lib/marketplace-feature-flags";

/** Insert the list CTA after this many full rows on mobile (2-column grid). */
export const LIST_ITEM_BANNER_ROW = 6;

/** Mobile marketplace grids use 2 columns below the `sm` breakpoint. */
export const LIST_ITEM_BANNER_MOBILE_COLUMNS = 2;

/** 0-based product index after which the banner is rendered (end of row 6). */
export const LIST_ITEM_BANNER_INSERT_INDEX =
  LIST_ITEM_BANNER_ROW * LIST_ITEM_BANNER_MOBILE_COLUMNS - 1;

/** Minimum products before the CTA can appear (user threshold: 6+). */
export const LIST_ITEM_BANNER_MIN_PRODUCTS = LIST_ITEM_BANNER_ROW;

export function shouldRenderListItemBanner(
  productIndex: number,
  productCount: number
): boolean {
  if (!MARKETPLACE_PROMO_BANNERS_ENABLED) return false;
  if (productCount < LIST_ITEM_BANNER_MIN_PRODUCTS) return false;
  return productIndex === LIST_ITEM_BANNER_INSERT_INDEX;
}
