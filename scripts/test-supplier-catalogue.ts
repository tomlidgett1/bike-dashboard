/**
 * Unit tests + ranking heuristics for supplier catalogue normaliser / query parse.
 *
 * Usage:
 *   npx tsx scripts/test-supplier-catalogue.ts
 */
import assert from "node:assert/strict";
import {
  inferAudience,
  inferProductType,
  normaliseScrapedProduct,
} from "../src/lib/supplier-catalogue/normalise";
import { parseSupplierLookupQuery } from "../src/lib/supplier-catalogue/parse-query";
import {
  decideCatalogueCoverage,
  mergeDiscoveryEvidence,
} from "../src/lib/supplier-catalogue/reconciliation";
import {
  looksLikeBrowseUrl,
  looksLikeProductUrl,
} from "../src/lib/scrapers/supplier-universal-discovery";
import type { SupplierScrapedProduct } from "../src/lib/scrapers/supplier-types";

function fixtureProduct(
  overrides: Partial<SupplierScrapedProduct> = {},
): SupplierScrapedProduct {
  return {
    productId: "p-1",
    name: "Kids Winter Gloves Black",
    url: "https://supplier.example/products/kids-winter-gloves",
    categoryUrl: "https://supplier.example/shop/apparel/gloves",
    brand: "DemoWear",
    price: 12.5,
    sku: "KWG-100",
    soh: 12,
    sohRaw: "SOH: 12",
    description: "Warm gloves for children in winter.",
    imageUrls: ["https://cdn.example/glove.jpg"],
    heroImageUrl: "https://cdn.example/glove.jpg",
    fields: {
      RRP: "29.95",
      Cost: "12.50",
      UPC: "9312345678901",
      Colour: "Black, Navy",
      Sizes: "XS, S, M",
    },
    variants: [
      {
        optionName: "Size",
        optionValue: "XS",
        sku: "KWG-100-XS",
        soh: 4,
        sohRaw: "4",
        price: "12.50",
      },
      {
        optionName: "Size",
        optionValue: "S",
        sku: "KWG-100-S",
        soh: 5,
        sohRaw: "5",
        price: "12.50",
      },
      {
        optionName: "Size",
        optionValue: "M",
        sku: "KWG-100-M",
        soh: 3,
        sohRaw: "3",
        price: "12.50",
      },
      {
        optionName: "Colour",
        optionValue: "Black",
        sku: null,
        soh: null,
        sohRaw: null,
        price: null,
      },
    ],
    ...overrides,
  };
}

async function main() {
  const audienceKids = inferAudience("Kids Winter Gloves for children");
  assert.equal(audienceKids.audience, "kids");

  const audienceWomens = inferAudience("Women's Road Jersey");
  assert.equal(audienceWomens.audience, "womens");

  assert.equal(
    inferProductType("PF86 Bottom Bracket", ["Components", "Bottom Brackets"]),
    "Bottom Brackets",
  );
  assert.equal(
    inferProductType("Shimano winter gloves", []),
    "winter glove",
  );

  const normalised = normaliseScrapedProduct({
    catalogueId: "00000000-0000-0000-0000-000000000001",
    supplierName: "Demo Distributors",
    product: fixtureProduct(),
  });

  assert.equal(normalised.audience, "kids");
  assert.equal(normalised.stockStatus, "in_stock");
  assert.equal(normalised.costPrice, 12.5);
  assert.equal(normalised.retailPrice, 29.95);
  assert.equal(normalised.priceConfidence, "known");
  assert.ok(normalised.sizes.includes("XS"));
  assert.ok(normalised.sizes.includes("S"));
  assert.ok(normalised.colours.includes("Black"));
  assert.equal(normalised.upc, "9312345678901");
  assert.equal(normalised.sourceUrl.includes("kids-winter-gloves"), true);

  const outOfStock = normaliseScrapedProduct({
    catalogueId: "00000000-0000-0000-0000-000000000001",
    supplierName: "Demo",
    product: fixtureProduct({
      name: "Adult Helmet",
      soh: 0,
      sohRaw: "0",
      variants: [],
      fields: {},
      description: "Adult helmet",
    }),
  });
  assert.equal(outOfStock.stockStatus, "out_of_stock");
  assert.equal(outOfStock.audience, "unknown");

  const parsedKids = await parseSupplierLookupQuery("kids winter gloves");
  assert.equal(parsedKids.filters.audience, "kids");
  assert.ok(
    parsedKids.filters.productType?.includes("glove") ||
      parsedKids.searchText.toLowerCase().includes("glove"),
  );

  const parsedBb = await parseSupplierLookupQuery("bottom bracket for Orbea");
  assert.ok(
    parsedBb.filters.productType?.includes("bottom bracket") ||
      parsedBb.searchText.toLowerCase().includes("bottom bracket"),
  );
  assert.ok(
    parsedBb.filters.brand?.toLowerCase().includes("orbea") ||
      parsedBb.searchText.toLowerCase().includes("orbea"),
  );

  const parsedBlueKids = await parseSupplierLookupQuery("blue kids bikes");
  assert.equal(parsedBlueKids.filters.audience, "kids");
  assert.equal(parsedBlueKids.filters.colour, "blue");

  // Ranking expectation helpers (offline): scored traits for eval fixtures
  const rankingCases = [
    {
      query: "kids winter gloves",
      expectTopTraits: {
        audience: "kids",
        nameIncludes: "winter",
      },
    },
    {
      query: "bottom bracket Orbea",
      expectTopTraits: {
        nameIncludes: "bottom bracket",
        brandOrNameIncludes: "orbea",
      },
    },
    {
      query: "blue kids bike",
      expectTopTraits: {
        audience: "kids",
        colour: "Blue",
      },
    },
  ] as const;

  for (const testCase of rankingCases) {
    const parsed = await parseSupplierLookupQuery(testCase.query);
    if ("audience" in testCase.expectTopTraits) {
      assert.equal(
        parsed.filters.audience,
        testCase.expectTopTraits.audience,
        `audience for ${testCase.query}`,
      );
    }
    if ("colour" in testCase.expectTopTraits) {
      assert.equal(
        parsed.filters.colour?.toLowerCase(),
        testCase.expectTopTraits.colour.toLowerCase(),
        `colour for ${testCase.query}`,
      );
    }
  }

  assert.equal(
    looksLikeProductUrl("https://supplier.example/product/road-bike-123"),
    true,
  );
  assert.equal(
    looksLikeProductUrl("https://supplier.example/Shop/p_123/Road_Bike"),
    true,
  );
  assert.equal(
    looksLikeBrowseUrl("https://supplier.example/brand/road-bikes"),
    true,
  );

  const mergedEvidence = mergeDiscoveryEvidence([], [
    {
      sourceType: "sitemap",
      scope: "catalogue",
      endpointUrl: "https://supplier.example/product-sitemap.xml",
      requestMethod: "GET",
      requestTemplate: {},
      total: 10,
      isAuthoritative: true,
      confidence: 0.98,
      productUrls: ["https://supplier.example/product/one"],
    },
  ]);
  assert.equal(mergedEvidence.length, 1);
  assert.deepEqual(mergedEvidence[0].productUrls, []);

  const baseCounts = {
    discovered: 10,
    pending: 0,
    scraping: 0,
    ingested: 10,
    failed: 0,
    skipped: 0,
    unresolved: 0,
  };
  const verified = decideCatalogueCoverage(baseCounts, [
    {
      source_type: "sitemap",
      endpoint_url: "https://supplier.example/product-sitemap.xml",
      last_total: 10,
      is_authoritative: true,
      confidence: 0.98,
    },
  ]);
  assert.equal(verified.status, "verified");
  assert.equal(
    decideCatalogueCoverage(baseCounts, []).status,
    "unverified",
  );
  assert.equal(
    decideCatalogueCoverage(
      { ...baseCounts, ingested: 9, failed: 1, unresolved: 1 },
      [],
    ).status,
    "incomplete",
  );

  console.log("supplier-catalogue tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
