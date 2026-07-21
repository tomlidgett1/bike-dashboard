/**
 * Seed demo supplier catalogue products for Supplier Lookup UI / ranking evals.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-supplier-catalogue.ts
 */
import { createClient } from "@supabase/supabase-js";
import { toDbRow } from "../src/lib/supplier-catalogue/normalise";
import type { CanonicalSupplierProductInput } from "../src/lib/supplier-catalogue/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SEED_PRODUCTS: Omit<CanonicalSupplierProductInput, "catalogueId">[] = [
  {
    supplierName: "Demo Distributors",
    supplierProductId: "demo-kids-winter-gloves-01",
    supplierSku: "KWG-100",
    upc: "9312345678901",
    sourceUrl: "https://example.com/b2b/products/kids-winter-gloves",
    name: "Kids Winter Cycling Gloves",
    brand: "DemoWear",
    description: "Insulated winter gloves for children, touchscreen compatible.",
    categoryPath: ["Apparel", "Gloves", "Kids"],
    productType: "winter gloves",
    audience: "kids",
    audienceRaw: "kids",
    costPrice: 12.5,
    retailPrice: 29.95,
    priceConfidence: "known",
    stockStatus: "in_stock",
    stockQuantity: 48,
    sizes: ["XS", "S", "M"],
    colours: ["Black", "Navy", "Red"],
    heroImageUrl: null,
    imageUrls: [],
  },
  {
    supplierName: "Demo Distributors",
    supplierProductId: "demo-adult-summer-gloves-01",
    supplierSku: "ASG-200",
    sourceUrl: "https://example.com/b2b/products/adult-summer-gloves",
    name: "Adult Summer Gel Gloves",
    brand: "DemoWear",
    description: "Lightweight summer gloves for adults.",
    categoryPath: ["Apparel", "Gloves"],
    productType: "gloves",
    audience: "unisex",
    costPrice: 9.8,
    retailPrice: 24.95,
    priceConfidence: "known",
    stockStatus: "in_stock",
    stockQuantity: 120,
    sizes: ["S", "M", "L", "XL"],
    colours: ["Black", "White"],
  },
  {
    supplierName: "Parts Hub AU",
    supplierProductId: "demo-bb-orbea-compatible",
    supplierSku: "BB-PF86-OR",
    sourceUrl: "https://example.com/b2b/products/bottom-bracket-pf86",
    name: "PF86 Bottom Bracket — Orbea Compatible",
    brand: "Token",
    description: "Bottom bracket suitable for Orbea road frames using PF86.",
    categoryPath: ["Components", "Bottom Brackets"],
    productType: "bottom bracket",
    audience: "unknown",
    costPrice: 28,
    retailPrice: 69.95,
    priceConfidence: "known",
    stockStatus: "in_stock",
    stockQuantity: 15,
    sizes: [],
    colours: ["Black"],
  },
  {
    supplierName: "Parts Hub AU",
    supplierProductId: "demo-bb-generic",
    supplierSku: "BB-BSA-68",
    sourceUrl: "https://example.com/b2b/products/bottom-bracket-bsa",
    name: "BSA 68mm Bottom Bracket",
    brand: "Shimano",
    description: "Standard threaded bottom bracket.",
    categoryPath: ["Components", "Bottom Brackets"],
    productType: "bottom bracket",
    audience: "unknown",
    costPrice: 18,
    retailPrice: 49.95,
    priceConfidence: "known",
    stockStatus: "out_of_stock",
    stockQuantity: 0,
    sizes: [],
    colours: [],
  },
  {
    supplierName: "Kids Ride Co",
    supplierProductId: "demo-blue-kids-bike-16",
    supplierSku: "KB-16-BLU",
    sourceUrl: "https://example.com/b2b/products/blue-kids-bike-16",
    name: "16\" Kids Balance-to-Pedal Bike Blue",
    brand: "Woom",
    description: "Blue kids bike with 16 inch wheels.",
    categoryPath: ["Bikes", "Kids"],
    productType: "kids bike",
    audience: "kids",
    audienceRaw: "kids",
    costPrice: 220,
    retailPrice: 449,
    priceConfidence: "known",
    stockStatus: "in_stock",
    stockQuantity: 6,
    sizes: ["16\""],
    colours: ["Blue"],
  },
  {
    supplierName: "Kids Ride Co",
    supplierProductId: "demo-red-kids-bike-16",
    supplierSku: "KB-16-RED",
    sourceUrl: "https://example.com/b2b/products/red-kids-bike-16",
    name: "16\" Kids Pedal Bike Red",
    brand: "Woom",
    description: "Red kids bike with 16 inch wheels.",
    categoryPath: ["Bikes", "Kids"],
    productType: "kids bike",
    audience: "kids",
    costPrice: 220,
    retailPrice: 449,
    priceConfidence: "known",
    stockStatus: "in_stock",
    stockQuantity: 3,
    sizes: ["16\""],
    colours: ["Red"],
  },
  {
    supplierName: "Parts Hub AU",
    supplierProductId: "demo-shimano-cassette-11-28",
    supplierSku: "CS-R7000",
    sourceUrl: "https://example.com/b2b/products/shimano-cassette",
    name: "Shimano 105 11-28 Cassette",
    brand: "Shimano",
    description: "11-speed road cassette in stock.",
    categoryPath: ["Components", "Cassettes"],
    productType: "cassette",
    audience: "unknown",
    costPrice: 42,
    retailPrice: 99,
    priceConfidence: "known",
    stockStatus: "in_stock",
    stockQuantity: 22,
    sizes: ["11-28"],
    colours: ["Silver"],
  },
];

async function main() {
  const { data: catalogue, error: catalogueError } = await admin
    .from("supplier_catalogues")
    .upsert(
      {
        name: "Demo Distributors",
        base_url: "https://example.com/b2b",
        login_url: "https://example.com/b2b/login",
        credential_ciphertext: "seed.not-used",
        status: "ready",
        product_count: SEED_PRODUCTS.length,
        last_run_status: "succeeded",
        last_run_at: new Date().toISOString(),
      },
      { onConflict: "base_url" },
    )
    .select("id")
    .single();

  // unique index is on lower(base_url) — upsert onConflict may need manual find
  let catalogueId = catalogue?.id as string | undefined;
  if (catalogueError || !catalogueId) {
    const { data: existing } = await admin
      .from("supplier_catalogues")
      .select("id")
      .ilike("base_url", "https://example.com/b2b")
      .maybeSingle();
    if (existing?.id) {
      catalogueId = existing.id;
      await admin
        .from("supplier_catalogues")
        .update({
          name: "Demo Distributors",
          status: "ready",
          product_count: SEED_PRODUCTS.length,
        })
        .eq("id", catalogueId);
    } else {
      const { data: created, error } = await admin
        .from("supplier_catalogues")
        .insert({
          name: "Demo Distributors",
          base_url: "https://example.com/b2b",
          login_url: "https://example.com/b2b/login",
          credential_ciphertext: "seed.not-used",
          status: "ready",
          product_count: SEED_PRODUCTS.length,
        })
        .select("id")
        .single();
      if (error || !created) {
        throw new Error(error?.message || catalogueError?.message || "create failed");
      }
      catalogueId = created.id;
    }
  }

  const rows = SEED_PRODUCTS.map((product) =>
    toDbRow({ ...product, catalogueId: catalogueId! }),
  );

  const { error } = await admin
    .from("supplier_catalogue_products")
    .upsert(rows, { onConflict: "catalogue_id,supplier_product_id" });

  if (error) throw new Error(error.message);

  console.log(
    `Seeded ${rows.length} products into catalogue ${catalogueId}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
