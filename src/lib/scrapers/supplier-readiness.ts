import {
  applyFieldMapping,
  type FieldMapping,
} from "@/lib/scrapers/fesports-field-mapping";
import {
  defaultImagePreference,
  resolveProductImages,
} from "@/lib/scrapers/supplier-image-preferences";
import type {
  SupplierImageSourcePreferences,
  SupplierScrapedProduct,
} from "@/lib/scrapers/supplier-types";

/**
 * How complete a product page will be after import. The marketplace product
 * page renders a hero image plus two feature-panel images (3+ photos ideal),
 * a long description, a spec sheet, and a brand eyebrow — so those are what
 * we check before letting a scrape through quietly.
 */
export interface ProductPageReadiness {
  /** Missing essentials that make a product page look broken. */
  gaps: string[];
  /** Softer suggestions — the page works but looks thin. */
  notes: string[];
  imageCount: number;
  ready: boolean;
}

export function assessProductPageReadiness(
  product: SupplierScrapedProduct,
  fieldMapping: FieldMapping,
  imagePreferences?: SupplierImageSourcePreferences,
  excludedImages?: Record<string, string[]>,
): ProductPageReadiness {
  const mapped = applyFieldMapping(product, fieldMapping);
  const preference =
    imagePreferences?.[product.productId] ?? defaultImagePreference(product);
  const resolved = resolveProductImages(
    product,
    preference,
    excludedImages?.[product.productId] ?? [],
  );

  const gaps: string[] = [];
  const notes: string[] = [];

  if (!(mapped.price > 0)) gaps.push("No price");
  if (resolved.imageUrls.length === 0) gaps.push("No photos");
  else if (resolved.imageUrls.length < 3) {
    notes.push(
      `Only ${resolved.imageUrls.length} photo${resolved.imageUrls.length === 1 ? "" : "s"} (pages look best with 3+)`,
    );
  }
  if (!mapped.product_description?.trim()) gaps.push("No description");
  if (!mapped.brand?.trim()) gaps.push("No brand");
  if (!mapped.product_specs?.trim()) notes.push("No specs");

  return {
    gaps,
    notes,
    imageCount: resolved.imageUrls.length,
    ready: gaps.length === 0,
  };
}

export interface ReadinessSummary {
  ready: number;
  missingPhotos: number;
  missingDescriptions: number;
  missingBrand: number;
  missingPrice: number;
}

export function summariseReadiness(
  products: SupplierScrapedProduct[],
  fieldMapping: FieldMapping,
  imagePreferences?: SupplierImageSourcePreferences,
  excludedImages?: Record<string, string[]>,
): ReadinessSummary {
  const summary: ReadinessSummary = {
    ready: 0,
    missingPhotos: 0,
    missingDescriptions: 0,
    missingBrand: 0,
    missingPrice: 0,
  };
  for (const product of products) {
    const readiness = assessProductPageReadiness(
      product,
      fieldMapping,
      imagePreferences,
      excludedImages,
    );
    if (readiness.ready) summary.ready += 1;
    if (readiness.gaps.includes("No photos")) summary.missingPhotos += 1;
    if (readiness.gaps.includes("No description")) summary.missingDescriptions += 1;
    if (readiness.gaps.includes("No brand")) summary.missingBrand += 1;
    if (readiness.gaps.includes("No price")) summary.missingPrice += 1;
  }
  return summary;
}
