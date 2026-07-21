/**
 * FE Sports → shared catalogue dry-run using fixture scraped products
 * (no live B2B login required).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/dry-run-fesports-catalogue-import.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { FEsportsScrapedProduct } from "../src/lib/scrapers/fesports-scraper";
import { importFesportsIntoSharedCatalogue } from "../src/lib/supplier-catalogue/fesports-import";
import { normaliseScrapedProduct } from "../src/lib/supplier-catalogue/normalise";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FIXTURES: FEsportsScrapedProduct[] = [
  {
    productId: "fesports-fixture-gloves",
    name: "Kids Winter Softshell Gloves",
    url: "https://www.fesports.com.au/Shop/p_fixture/Kids_Winter_Gloves",
    categoryUrl: "https://www.fesports.com.au/Shop/c_1/Apparel",
    brand: "Pearl Izumi",
    price: 14.95,
    sku: "PI-KWG-01",
    soh: 20,
    sohRaw: "SOH 20",
    description: "Kids winter gloves for cold rides.",
    imageUrls: ["https://www.fesports.com.au/stock/fixture_glove.jpg"],
    heroImageUrl: "https://www.fesports.com.au/stock/fixture_glove.jpg",
    fields: { RRP: "39.95", Category: "Gloves" },
    variants: [
      {
        optionName: "Size",
        optionValue: "S",
        sku: "PI-KWG-01-S",
        soh: 8,
        sohRaw: "8",
        price: "14.95",
      },
      {
        optionName: "Size",
        optionValue: "M",
        sku: "PI-KWG-01-M",
        soh: 12,
        sohRaw: "12",
        price: "14.95",
      },
    ],
  },
  {
    productId: "fesports-fixture-bb",
    name: "Praxis PF86 Bottom Bracket",
    url: "https://www.fesports.com.au/Shop/p_fixture/Praxis_PF86",
    categoryUrl: "https://www.fesports.com.au/Shop/c_2/Components",
    brand: "Praxis",
    price: 32,
    sku: "PRX-PF86",
    soh: 5,
    sohRaw: "5",
    description: "PF86 bottom bracket compatible with many road frames including Orbea.",
    imageUrls: [],
    heroImageUrl: null,
    fields: { RRP: "79.95" },
    variants: [],
  },
];

async function main() {
  for (const product of FIXTURES) {
    const normalised = normaliseScrapedProduct({
      catalogueId: "00000000-0000-0000-0000-000000000099",
      supplierName: "FE Sports",
      product,
    });
    assert.ok(normalised.name);
    assert.ok(normalised.sourceUrl.includes("fesports.com.au"));
  }

  const result = await importFesportsIntoSharedCatalogue({
    admin,
    products: FIXTURES,
    baseUrl: "https://www.fesports.com.au/fixture-dry-run",
    catalogueName: "FE Sports (fixture dry-run)",
  });

  assert.ok(result.upserted >= 2, "expected at least 2 upserted products");

  const { count } = await admin
    .from("supplier_catalogue_products")
    .select("id", { count: "exact", head: true })
    .eq("catalogue_id", result.catalogueId);

  assert.ok((count ?? 0) >= 2);

  // Perf check: sequential ILIKE search against seeded rows
  const perfStart = performance.now();
  const { data, error } = await admin
    .from("supplier_catalogue_products")
    .select("id, name, audience, colours")
    .ilike("search_text", "%kids%glove%")
    .limit(50);
  if (error) throw new Error(error.message);
  const perfMs = performance.now() - perfStart;
  assert.ok(perfMs < 500, `search should be fast, took ${perfMs.toFixed(1)}ms`);
  assert.ok((data?.length ?? 0) >= 1);

  console.log(
    `FE Sports fixture dry-run ok: catalogue=${result.catalogueId} upserted=${result.upserted} search=${perfMs.toFixed(1)}ms`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
