import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normaliseScrapedProduct,
  toDbRow,
} from "@/lib/supplier-catalogue/normalise";
import type { CanonicalSupplierProductInput } from "@/lib/supplier-catalogue/types";
import type { SupplierScrapedProduct } from "@/lib/scrapers/supplier-types";

const CLOUDINARY_RE = /res\.cloudinary\.com\//i;

function isHosted(url: string | null | undefined): boolean {
  return Boolean(url && CLOUDINARY_RE.test(url));
}

function enrichmentFields(heroImageUrl: string | null | undefined) {
  if (!heroImageUrl) {
    return {
      hero_image_source_url: null as string | null,
      image_enrichment_status: "skipped" as const,
    };
  }
  if (isHosted(heroImageUrl)) {
    return {
      hero_image_source_url: heroImageUrl,
      image_enrichment_status: "hosted" as const,
    };
  }
  return {
    hero_image_source_url: heroImageUrl,
    image_enrichment_status: "pending" as const,
  };
}

export async function upsertCanonicalProducts(
  admin: SupabaseClient,
  products: CanonicalSupplierProductInput[],
): Promise<number> {
  if (products.length === 0) return 0;

  const catalogueId = products[0]?.catalogueId;
  const productIds = products.map((product) => product.supplierProductId);

  const existingByKey = new Map<
    string,
    {
      hero_image_url: string | null;
      hero_image_source_url: string | null;
      image_enrichment_status: string | null;
      image_urls: string[] | null;
    }
  >();

  if (catalogueId) {
    const { data: existing } = await admin
      .from("supplier_catalogue_products")
      .select(
        "supplier_product_id, hero_image_url, hero_image_source_url, image_enrichment_status, image_urls",
      )
      .eq("catalogue_id", catalogueId)
      .in("supplier_product_id", productIds);

    for (const row of existing ?? []) {
      existingByKey.set(row.supplier_product_id as string, {
        hero_image_url: (row.hero_image_url as string | null) ?? null,
        hero_image_source_url:
          (row.hero_image_source_url as string | null) ?? null,
        image_enrichment_status:
          (row.image_enrichment_status as string | null) ?? null,
        image_urls: Array.isArray(row.image_urls)
          ? (row.image_urls as string[])
          : null,
      });
    }
  }

  const rows = products.map((product) => {
    const base = toDbRow(product);
    const scrapedHero = product.heroImageUrl ?? null;
    const existing = existingByKey.get(product.supplierProductId);
    const enrich = enrichmentFields(scrapedHero);

    // Preserve CDN hero if we already hosted it and the source URL is unchanged.
    if (
      existing?.image_enrichment_status === "hosted" &&
      existing.hero_image_url &&
      isHosted(existing.hero_image_url) &&
      (!scrapedHero ||
        scrapedHero === existing.hero_image_source_url ||
        scrapedHero === existing.hero_image_url)
    ) {
      return {
        ...base,
        hero_image_url: existing.hero_image_url,
        hero_image_source_url:
          existing.hero_image_source_url || scrapedHero || existing.hero_image_url,
        image_urls:
          existing.image_urls && existing.image_urls.length > 0
            ? existing.image_urls
            : base.image_urls,
        image_enrichment_status: "hosted",
      };
    }

    return {
      ...base,
      ...enrich,
    };
  });

  const { error, count } = await admin
    .from("supplier_catalogue_products")
    .upsert(rows, {
      onConflict: "catalogue_id,supplier_product_id",
      count: "exact",
    });

  if (error) {
    throw new Error(error.message || "Failed to upsert supplier catalogue products");
  }

  return count ?? rows.length;
}

export async function upsertFromScrapedProducts(input: {
  admin: SupabaseClient;
  catalogueId: string;
  supplierName: string;
  products: SupplierScrapedProduct[];
}): Promise<number> {
  const normalised = input.products.map((product) =>
    normaliseScrapedProduct({
      catalogueId: input.catalogueId,
      supplierName: input.supplierName,
      product,
    }),
  );
  return upsertCanonicalProducts(input.admin, normalised);
}

export async function getProductIdsBySourceUrl(input: {
  admin: SupabaseClient;
  catalogueId: string;
  sourceUrls: string[];
}): Promise<Map<string, string>> {
  if (input.sourceUrls.length === 0) return new Map();
  const { data, error } = await input.admin
    .from("supplier_catalogue_products")
    .select("id, source_url")
    .eq("catalogue_id", input.catalogueId)
    .in("source_url", [...new Set(input.sourceUrls)]);

  if (error) {
    throw new Error(error.message || "Failed to resolve ingested products");
  }
  return new Map(
    (data ?? []).map((row) => [row.source_url as string, row.id as string]),
  );
}

export async function refreshCatalogueProductCount(
  admin: SupabaseClient,
  catalogueId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("supplier_catalogue_products")
    .select("id", { count: "exact", head: true })
    .eq("catalogue_id", catalogueId);

  if (error) {
    throw new Error(error.message || "Failed to count catalogue products");
  }

  const productCount = count ?? 0;
  await admin
    .from("supplier_catalogues")
    .update({ product_count: productCount })
    .eq("id", catalogueId);

  return productCount;
}
