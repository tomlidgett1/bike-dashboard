import type {
  AlternatePhotoMatch,
  SupplierImageSourcePreference,
  SupplierScrapedProduct,
} from "@/lib/scrapers/supplier-types";

export interface ResolvedProductImages {
  imageUrls: string[];
  heroImageUrl: string | null;
  sources: Array<"supplier_scrape" | "alternate_photo_scrape">;
}

export function alternatePhotoHasImages(match: AlternatePhotoMatch | null | undefined): boolean {
  return Boolean(match?.imageUrls?.length);
}

export function defaultImagePreference(
  product: SupplierScrapedProduct,
): SupplierImageSourcePreference {
  if (alternatePhotoHasImages(product.alternatePhoto)) return "alternate";
  return "supplier";
}

export function resolveProductImages(
  product: SupplierScrapedProduct,
  preference: SupplierImageSourcePreference,
  excludedUrls: string[] = [],
): ResolvedProductImages {
  const excluded = new Set(excludedUrls);
  const supplierImages = [...new Set(product.imageUrls.filter(Boolean))].filter(
    (url) => !excluded.has(url),
  );
  const supplierHero =
    product.heroImageUrl && !excluded.has(product.heroImageUrl)
      ? product.heroImageUrl
      : supplierImages[0] ?? null;
  const alternate = product.alternatePhoto;
  const alternateImages = [...new Set((alternate?.imageUrls ?? []).filter(Boolean))].filter(
    (url) => !excluded.has(url),
  );
  const alternateHero =
    alternate?.heroImageUrl && !excluded.has(alternate.heroImageUrl)
      ? alternate.heroImageUrl
      : alternateImages[0] ?? null;

  if (preference === "alternate") {
    if (alternateImages.length > 0) {
      return {
        imageUrls: alternateImages,
        heroImageUrl: alternateHero,
        sources: ["alternate_photo_scrape"],
      };
    }
    return {
      imageUrls: supplierImages,
      heroImageUrl: supplierHero,
      sources: ["supplier_scrape"],
    };
  }

  if (preference === "both") {
    const merged = [...new Set([...supplierImages, ...alternateImages])];
    const hero = alternateHero ?? supplierHero ?? merged[0] ?? null;
    const sources: ResolvedProductImages["sources"] = [];
    if (supplierImages.length > 0) sources.push("supplier_scrape");
    if (alternateImages.length > 0) sources.push("alternate_photo_scrape");
    return {
      imageUrls: merged,
      heroImageUrl: hero,
      sources,
    };
  }

  return {
    imageUrls: supplierImages,
    heroImageUrl: supplierHero,
    sources: ["supplier_scrape"],
  };
}
