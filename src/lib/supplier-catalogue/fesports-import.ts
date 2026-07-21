import type { SupabaseClient } from "@supabase/supabase-js";
import type { FEsportsScrapedProduct } from "@/lib/scrapers/fesports-scraper";
import type { SupplierScrapedProduct } from "@/lib/scrapers/supplier-types";
import {
  refreshCatalogueProductCount,
  upsertFromScrapedProducts,
} from "@/lib/supplier-catalogue/upsert";
import { enrichSparseProductFields } from "@/lib/supplier-catalogue/images";

/**
 * Map FE Sports scraped products into the global shared catalogue.
 * Useful as the first fixture supplier dry-run before generic B2B sites.
 */
export async function importFesportsIntoSharedCatalogue(input: {
  admin: SupabaseClient;
  products: FEsportsScrapedProduct[];
  catalogueName?: string;
  baseUrl?: string;
}): Promise<{ catalogueId: string; upserted: number }> {
  const baseUrl = input.baseUrl ?? "https://www.fesports.com.au";
  const name = input.catalogueName ?? "FE Sports";

  let catalogueId: string | null = null;
  const { data: existing } = await input.admin
    .from("supplier_catalogues")
    .select("id")
    .ilike("base_url", baseUrl)
    .maybeSingle();

  if (existing?.id) {
    catalogueId = existing.id;
    await input.admin
      .from("supplier_catalogues")
      .update({ name, status: "crawling", last_run_status: "running" })
      .eq("id", catalogueId);
  } else {
    const { data, error } = await input.admin
      .from("supplier_catalogues")
      .insert({
        name,
        base_url: baseUrl,
        login_url: `${baseUrl.replace(/\/$/, "")}/Account/Login`,
        credential_ciphertext: "fesports.managed-elsewhere",
        status: "crawling",
        last_run_status: "running",
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(error?.message || "Failed to create FE Sports catalogue");
    }
    catalogueId = data.id;
  }

  if (!catalogueId) {
    throw new Error("Failed to resolve FE Sports catalogue id");
  }

  const products = input.products as SupplierScrapedProduct[];
  const upserted = await upsertFromScrapedProducts({
    admin: input.admin,
    catalogueId,
    supplierName: name,
    products,
  });

  await enrichSparseProductFields({
    admin: input.admin,
    catalogueId,
    limit: 2000,
  });
  const productCount = await refreshCatalogueProductCount(
    input.admin,
    catalogueId,
  );

  await input.admin
    .from("supplier_catalogues")
    .update({
      status: "ready",
      last_run_status: "succeeded",
      last_run_at: new Date().toISOString(),
      product_count: productCount,
      last_run_summary: { upserted, source: "fesports" },
      last_error: null,
    })
    .eq("id", catalogueId);

  return { catalogueId, upserted };
}
