/**
 * Live discount pricing resolution.
 *
 * The DB stores a percentage discount (`discount_percent`), an on/off flag
 * (`discount_active`), an optional expiry (`discount_ends_at`) and a computed
 * `sale_price` column. Whether a discount is *currently live* cannot be a DB
 * generated column because it depends on now() — so it is decided here, at
 * render time, and used uniformly across cards, carousels and the detail page.
 */

import type { MarketplaceProduct } from '@/lib/types/marketplace';

export interface LivePrice {
  /** What the customer pays right now (sale price if on sale, else list price). */
  price: number;
  /** The pre-discount list price — only set when a discount is live. */
  originalPrice: number | null;
  /** Whole-number percent off — only set when a discount is live. */
  percentOff: number | null;
  /** True when a discount is currently applied (active, not expired, real saving). */
  onSale: boolean;
}

type DiscountInput = Pick<
  MarketplaceProduct,
  'price' | 'sale_price' | 'discount_percent' | 'discount_active' | 'discount_ends_at'
>;

/**
 * Resolve the price a customer should see right now for a product.
 * `now` is injectable for testing; defaults to the current time.
 */
export function resolveLivePrice(product: DiscountInput, now: Date = new Date()): LivePrice {
  const base = Number(product.price) || 0;
  const active = product.discount_active === true;
  const sale = product.sale_price != null ? Number(product.sale_price) : null;
  const pct = product.discount_percent != null ? Number(product.discount_percent) : null;
  const notExpired =
    !product.discount_ends_at || new Date(product.discount_ends_at).getTime() > now.getTime();

  const onSale =
    active && notExpired && sale != null && sale < base && pct != null && pct > 0;

  if (!onSale) {
    return { price: base, originalPrice: null, percentOff: null, onSale: false };
  }

  return {
    price: sale as number,
    originalPrice: base,
    percentOff: Math.round(pct as number),
    onSale: true,
  };
}

/** Keep relative order within each group; sale items always lead carousels. */
export function sortProductsSaleFirst<T extends DiscountInput>(products: T[]): T[] {
  const onSale: T[] = [];
  const regular: T[] = [];
  for (const product of products) {
    if (resolveLivePrice(product).onSale) {
      onSale.push(product);
    } else {
      regular.push(product);
    }
  }
  return [...onSale, ...regular];
}

/** Format a number as a whole-dollar AUD price string, e.g. 1235 -> "$1,235". */
export function formatPriceAUD(value: number): string {
  return `$${value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format a number as an AUD price string always showing exactly two decimal
 * places, e.g. 1235 -> "$1,235.00", 617.5 -> "$617.50".
 * Use this for sale and strikethrough prices so both values align.
 */
export function formatPriceAUDFull(value: number): string {
  return `$${value.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
