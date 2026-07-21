/**
 * Live Focus / Pon Dealer B2B smoke test.
 *
 * Credentials via env only (never commit):
 *   PON_B2B_USERNAME=...
 *   PON_B2B_PASSWORD=...
 *
 * Usage:
 *   PON_B2B_USERNAME='...' PON_B2B_PASSWORD='...' \
 *     npx tsx --env-file=.env.local scripts/test-pon-dealer-catalogue.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  createSupplierCatalogue,
  enqueueCatalogueCrawl,
  runCatalogueCrawl,
} from "../src/lib/supplier-catalogue/ingest";
import { isSupplierCatalogueManagerEmail } from "../src/lib/supplier-catalogue/auth";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const username = process.env.PON_B2B_USERNAME?.trim();
const password = process.env.PON_B2B_PASSWORD;

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}
if (!username || !password) {
  console.error("Set PON_B2B_USERNAME and PON_B2B_PASSWORD");
  process.exit(1);
}

assert.equal(
  isSupplierCatalogueManagerEmail("shop@ashburtoncycles.com.au"),
  true,
  "Ashburton Cycles must be allowlisted for catalogue management",
);

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASE_URL = "https://pondealer.bike";
const MAX_PRODUCTS_PER_TARGET = 3;

async function main() {
  console.log("Creating / updating Pon Dealer catalogue…");
  const { catalogueId } = await createSupplierCatalogue({
    admin,
    name: "Pon Dealer (Focus)",
    baseUrl: BASE_URL,
    loginUrl: BASE_URL,
    username,
    password,
    startCrawl: false,
  });
  assert.ok(catalogueId);

  const runId = await enqueueCatalogueCrawl(admin, catalogueId, {
    maxProductsPerTarget: MAX_PRODUCTS_PER_TARGET,
  });
  console.log(`Starting limited crawl (max ${MAX_PRODUCTS_PER_TARGET}/target)…`);
  console.log(`catalogueId=${catalogueId} runId=${runId}`);

  await runCatalogueCrawl({
    admin,
    runId,
    accessToken: null,
  });

  const { data: catalogue } = await admin
    .from("supplier_catalogues")
    .select("status, product_count, last_run_status, last_error, last_run_summary")
    .eq("id", catalogueId)
    .single();

  const { data: products, error } = await admin
    .from("supplier_catalogue_products")
    .select(
      "name, brand, supplier_sku, cost_price, retail_price, stock_status, source_url, audience, sizes, colours, hero_image_url",
    )
    .eq("catalogue_id", catalogueId)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);

  console.log("\nCatalogue status:", catalogue);
  console.log(`Products stored: ${products?.length ?? 0} (showing up to 10)`);
  for (const product of products ?? []) {
    console.log(
      `- ${product.name} | brand=${product.brand ?? "—"} | cost=${product.cost_price ?? "—"} | stock=${product.stock_status} | url=${product.source_url}`,
    );
  }

  assert.equal(catalogue?.last_run_status, "succeeded", catalogue?.last_error ?? "crawl failed");
  assert.ok(
    (catalogue?.product_count ?? 0) > 0 || (products?.length ?? 0) > 0,
    "Expected at least one product from Pon Dealer",
  );
  assert.ok(
    (products ?? []).every((p) => typeof p.source_url === "string" && p.source_url.startsWith("http")),
    "Every product needs a B2B source_url",
  );

  console.log("\nPon Dealer live smoke test passed.");
}

main().catch((error) => {
  console.error("\nPon Dealer live smoke test FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
