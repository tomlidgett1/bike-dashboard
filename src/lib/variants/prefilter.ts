// ============================================================
// Deterministic variant pre-filter (no AI cost)
// ============================================================
// Groups scope products into candidate "buckets" by brand + normalized
// base title BEFORE any model call. Only buckets of 2+ products are kept,
// which removes the overwhelming majority of products from AI analysis.
// Deterministic warnings (price spread, category mismatch) are attached
// here so the reviewer sees them even for high-confidence groups.

import type { VariantBucket, VariantCandidateProduct, VariantWarning } from "./types";
import { coreModelKey, normalizeBrandKey, suggestBaseTitle, variantComparisonKey } from "./normalize";

// Complete bikes name colours with open-ended marketing words ("Espace", "Halo"),
// so we group them by model identifier only. Parts keep precise full-title keys.
function looksLikeCompleteBike(product: VariantCandidateProduct): boolean {
  const cat = `${product.marketplace_category ?? ""} ${product.category_name ?? ""}`.toLowerCase();
  const bikeish = /\b(bike|bikes|bicycle|bicycles|mtb|e-?bike)\b/.test(cat);
  const partish = /(part|component|accessor|spare|wheel|tyre|tire|tube|chain|cassette|saddle|pedal|helmet|apparel|clothing|glove|shoe)/.test(cat);
  return bikeish && !partish;
}

function bucketKeyFor(product: VariantCandidateProduct): string {
  return looksLikeCompleteBike(product)
    ? coreModelKey(product.title, product.brand)
    : variantComparisonKey(product.title);
}

/** Prices this many times apart within a bucket trigger a price warning. */
export const PRICE_SPREAD_RATIO = 1.6;

function detectBucketWarnings(products: VariantCandidateProduct[]): VariantWarning[] {
  const warnings: VariantWarning[] = [];

  const categories = new Set(
    products.map((p) => (p.category_name ?? "").trim().toLowerCase()).filter(Boolean),
  );
  if (categories.size > 1) warnings.push("category_mismatch");

  const prices = products
    .map((p) => (typeof p.price === "number" ? p.price : Number(p.price)))
    .filter((n): n is number => Number.isFinite(n) && n > 0);
  if (prices.length >= 2) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min > 0 && max / min >= PRICE_SPREAD_RATIO) warnings.push("price_mismatch");
  }

  const years = new Set(products.map((p) => (p.model_year ?? "").trim()).filter(Boolean));
  if (years.size > 1) warnings.push("model_year_conflict");

  if (products.some((p) => !p.system_sku && !p.custom_sku && !p.upc)) {
    warnings.push("missing_sku");
  }

  return warnings;
}

/**
 * Bucket products by brand + normalized base title. Products already in a
 * variant group must be filtered out by the caller (they are excluded here
 * defensively too via `excludeProductIds`).
 */
export function buildVariantBuckets(
  products: VariantCandidateProduct[],
  options?: { excludeProductIds?: Set<string> },
): VariantBucket[] {
  const exclude = options?.excludeProductIds ?? new Set<string>();
  const byKey = new Map<string, VariantBucket>();

  for (const product of products) {
    if (exclude.has(product.product_id)) continue;

    const baseKey = bucketKeyFor(product);
    if (!baseKey) continue; // nothing left after stripping — too generic to group

    const brandKey = normalizeBrandKey(product.brand);
    const key = `${brandKey}::${baseKey}`;

    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        brand: product.brand,
        base_title: suggestBaseTitle(product.title) || product.title,
        category_name: product.category_name,
        products: [],
        warnings: [],
      };
      byKey.set(key, bucket);
    }
    bucket.products.push(product);
  }

  const buckets: VariantBucket[] = [];
  for (const bucket of byKey.values()) {
    // A variant group needs at least two distinct products.
    if (bucket.products.length < 2) continue;
    bucket.warnings = detectBucketWarnings(bucket.products);
    buckets.push(bucket);
  }

  // Largest, most-confident buckets first.
  buckets.sort((a, b) => b.products.length - a.products.length);
  return buckets;
}

/** Total products that survived the pre-filter into 2+ buckets. */
export function countBucketedProducts(buckets: VariantBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.products.length, 0);
}
