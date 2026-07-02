// Campaign product pricing — live DB discounts + brief-stated promotions.

import { formatPriceAUDFull } from "@/lib/marketplace/pricing";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import type { CampaignItem } from "./types";
import type { CrmPromoBrief } from "./agent/types";

export type PricedCatalogRow = {
  price: number | null;
  sale_price?: number | null;
  discount_percent?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
  display_name?: string | null;
  description?: string | null;
  manufacturer_name?: string | null;
  brand?: string | null;
};

function roundAud(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAud(value: number, decimals = 2): string {
  return formatPriceAUDFull(value);
}

export function productMatchesBrand(row: PricedCatalogRow, brand: string): boolean {
  const needle = brand.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!needle) return true;

  const haystacks = [
    row.manufacturer_name,
    row.brand,
    row.display_name,
    row.description,
  ]
    .map((v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);

  return haystacks.some((hay) => hay.includes(needle) || needle.includes(hay));
}

/**
 * Resolve display pricing for a CRM campaign product.
 * Prefers live store discounts; falls back to brief-stated % off for matching brand.
 */
export function resolveCampaignItemPricing(
  row: PricedCatalogRow,
  promo: CrmPromoBrief,
): Pick<CampaignItem, "price" | "originalPrice" | "badge" | "discountPercent" | "onSale"> | null {
  const retail = Number(row.price) || 0;
  const live = resolveLivePrice({
    price: row.price ?? 0,
    sale_price: row.sale_price ?? null,
    discount_percent: row.discount_percent ?? null,
    discount_active: row.discount_active ?? false,
    discount_ends_at: row.discount_ends_at ?? null,
  });

  if (promo.only_on_sale || promo.kind === "on_sale_only") {
    if (!live.onSale) return null;
    return {
      price: formatAud(live.price),
      originalPrice: live.originalPrice != null ? formatAud(live.originalPrice) : undefined,
      badge: live.percentOff != null ? `${live.percentOff}% OFF` : "SALE",
      discountPercent: live.percentOff ?? undefined,
      onSale: true,
    };
  }

  if (live.onSale) {
    return {
      price: formatAud(live.price),
      originalPrice: live.originalPrice != null ? formatAud(live.originalPrice) : undefined,
      badge: live.percentOff != null ? `${live.percentOff}% OFF` : "SALE",
      discountPercent: live.percentOff ?? undefined,
      onSale: true,
    };
  }

  const brandMatch = promo.brand ? productMatchesBrand(row, promo.brand) : true;
  const pct = promo.discount_percent;

  if (
    promo.kind === "percent_off" &&
    pct != null &&
    pct > 0 &&
    retail > 0 &&
    brandMatch
  ) {
    const sale = roundAud(retail * (1 - pct / 100));
    if (sale < retail) {
      return {
        price: formatAud(sale),
        originalPrice: formatAud(retail),
        badge: promo.label ?? `${pct}% OFF`,
        discountPercent: pct,
        onSale: true,
      };
    }
  }

  if (retail <= 0) return { onSale: false };

  return {
    price: formatAud(retail),
    onSale: false,
  };
}
