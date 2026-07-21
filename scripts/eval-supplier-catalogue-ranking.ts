/**
 * Offline ranking eval: ensures parsed filters + normaliser traits would
 * surface the expected seed products first when scored like the SQL RPC.
 *
 * Usage:
 *   npx tsx scripts/eval-supplier-catalogue-ranking.ts
 */
import assert from "node:assert/strict";
import { parseSupplierLookupQuery } from "../src/lib/supplier-catalogue/parse-query";
import type { SupplierCatalogueSearchHit } from "../src/lib/supplier-catalogue/types";

const CORPUS: SupplierCatalogueSearchHit[] = [
  {
    productId: "1",
    relevanceScore: 0,
    name: "Kids Winter Cycling Gloves",
    brand: "DemoWear",
    supplierName: "Demo Distributors",
    audience: "kids",
    productType: "winter gloves",
    sizes: ["XS", "S", "M"],
    colours: ["Black", "Navy"],
    costPrice: 12.5,
    retailPrice: 29.95,
    currency: "AUD",
    stockStatus: "in_stock",
    stockQuantity: 48,
    heroImageUrl: null,
    sourceUrl: "https://example.com/1",
    categoryPath: ["Apparel", "Gloves", "Kids"],
    supplierSku: "KWG-100",
    upc: null,
  },
  {
    productId: "2",
    relevanceScore: 0,
    name: "Adult Summer Gel Gloves",
    brand: "DemoWear",
    supplierName: "Demo Distributors",
    audience: "unisex",
    productType: "gloves",
    sizes: ["S", "M", "L"],
    colours: ["Black"],
    costPrice: 9.8,
    retailPrice: 24.95,
    currency: "AUD",
    stockStatus: "in_stock",
    stockQuantity: 10,
    heroImageUrl: null,
    sourceUrl: "https://example.com/2",
    categoryPath: ["Apparel", "Gloves"],
    supplierSku: "ASG-200",
    upc: null,
  },
  {
    productId: "3",
    relevanceScore: 0,
    name: "PF86 Bottom Bracket — Orbea Compatible",
    brand: "Token",
    supplierName: "Parts Hub AU",
    audience: "unknown",
    productType: "bottom bracket",
    sizes: [],
    colours: ["Black"],
    costPrice: 28,
    retailPrice: 69.95,
    currency: "AUD",
    stockStatus: "in_stock",
    stockQuantity: 15,
    heroImageUrl: null,
    sourceUrl: "https://example.com/3",
    categoryPath: ["Components", "Bottom Brackets"],
    supplierSku: "BB-PF86-OR",
    upc: null,
  },
  {
    productId: "4",
    relevanceScore: 0,
    name: "16\" Kids Balance-to-Pedal Bike Blue",
    brand: "Woom",
    supplierName: "Kids Ride Co",
    audience: "kids",
    productType: "kids bike",
    sizes: ["16\""],
    colours: ["Blue"],
    costPrice: 220,
    retailPrice: 449,
    currency: "AUD",
    stockStatus: "in_stock",
    stockQuantity: 6,
    heroImageUrl: null,
    sourceUrl: "https://example.com/4",
    categoryPath: ["Bikes", "Kids"],
    supplierSku: "KB-16-BLU",
    upc: null,
  },
  {
    productId: "5",
    relevanceScore: 0,
    name: "16\" Kids Pedal Bike Red",
    brand: "Woom",
    supplierName: "Kids Ride Co",
    audience: "kids",
    productType: "kids bike",
    sizes: ["16\""],
    colours: ["Red"],
    costPrice: 220,
    retailPrice: 449,
    currency: "AUD",
    stockStatus: "in_stock",
    stockQuantity: 3,
    heroImageUrl: null,
    sourceUrl: "https://example.com/5",
    categoryPath: ["Bikes", "Kids"],
    supplierSku: "KB-16-RED",
    upc: null,
  },
];

function scoreHit(
  hit: SupplierCatalogueSearchHit,
  query: string,
  filters: {
    audience?: string | null;
    brand?: string | null;
    productType?: string | null;
    colour?: string | null;
  },
): number {
  const q = query.toLowerCase();
  const haystack = [
    hit.name,
    hit.brand,
    hit.productType,
    hit.supplierName,
    ...hit.categoryPath,
    ...hit.colours,
    ...hit.sizes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const token of q.split(/\s+/).filter(Boolean)) {
    if (haystack.includes(token)) score += 2;
    if (hit.name.toLowerCase().includes(token)) score += 3;
  }
  if (filters.audience && hit.audience === filters.audience) score += 4;
  if (
    filters.brand &&
    (hit.brand?.toLowerCase().includes(filters.brand.toLowerCase()) ||
      hit.name.toLowerCase().includes(filters.brand.toLowerCase()))
  ) {
    score += 5;
  }
  if (
    filters.productType &&
    (hit.productType?.toLowerCase().includes(filters.productType.toLowerCase()) ||
      hit.name.toLowerCase().includes(filters.productType.toLowerCase()))
  ) {
    score += 3.5;
  }
  if (
    filters.colour &&
    hit.colours.some((c) =>
      c.toLowerCase().includes(filters.colour!.toLowerCase()),
    )
  ) {
    score += 2.5;
  }
  if (hit.stockStatus === "in_stock") score += 0.75;
  return score;
}

async function main() {
  const started = performance.now();

  const cases: Array<{
    query: string;
    expectTopId: string;
    expectTopNameIncludes: string;
  }> = [
    {
      query: "kids winter gloves",
      expectTopId: "1",
      expectTopNameIncludes: "Winter",
    },
    {
      query: "bottom bracket for Orbea",
      expectTopId: "3",
      expectTopNameIncludes: "Bottom Bracket",
    },
    {
      query: "blue kids bike",
      expectTopId: "4",
      expectTopNameIncludes: "Blue",
    },
  ];

  for (const testCase of cases) {
    const parsed = await parseSupplierLookupQuery(testCase.query);
    const ranked = CORPUS.map((hit) => ({
      hit,
      score: scoreHit(hit, parsed.searchText || testCase.query, parsed.filters),
    })).sort((a, b) => b.score - a.score);

    const top = ranked[0];
    assert.ok(top, `expected ranking for ${testCase.query}`);
    assert.equal(
      top.hit.productId,
      testCase.expectTopId,
      `top product for "${testCase.query}" should be ${testCase.expectTopId}, got ${top.hit.productId} (${top.hit.name}) score=${top.score}`,
    );
    assert.ok(
      top.hit.name.includes(testCase.expectTopNameIncludes),
      `top name should include ${testCase.expectTopNameIncludes}`,
    );
  }

  // Perf sanity for offline scorer on a larger synthetic set
  const big = Array.from({ length: 8000 }, (_, index) => ({
    ...CORPUS[index % CORPUS.length],
    productId: `bulk-${index}`,
    name: `${CORPUS[index % CORPUS.length].name} ${index}`,
  }));
  const perfStart = performance.now();
  const parsed = await parseSupplierLookupQuery("kids winter gloves");
  big
    .map((hit) => ({
      hit,
      score: scoreHit(hit, parsed.searchText, parsed.filters),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
  const perfMs = performance.now() - perfStart;
  assert.ok(
    perfMs < 200,
    `offline rank of 8k rows should be under 200ms, took ${perfMs.toFixed(1)}ms`,
  );

  console.log(
    `supplier-catalogue ranking evals passed in ${(performance.now() - started).toFixed(1)}ms (8k rank ${perfMs.toFixed(1)}ms)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
