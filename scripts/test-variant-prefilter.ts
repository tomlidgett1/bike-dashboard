// Run: npx tsx scripts/test-variant-prefilter.ts
import { buildVariantBuckets, countBucketedProducts } from "../src/lib/variants/prefilter";
import type { VariantCandidateProduct } from "../src/lib/variants/types";

let failures = 0;
function checkTrue(name: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function product(p: Partial<VariantCandidateProduct> & { product_id: string; title: string }): VariantCandidateProduct {
  return {
    lightspeed_item_id: null,
    lightspeed_description: null,
    brand: null,
    category_name: null,
    marketplace_category: null,
    system_sku: "SKU-" + p.product_id,
    custom_sku: null,
    manufacturer_sku: null,
    upc: null,
    price: 100,
    qoh: 1,
    model_year: null,
    size: null,
    frame_size: null,
    wheel_size: null,
    color_primary: null,
    color_secondary: null,
    image_url: null,
    ...p,
  };
}

const products: VariantCandidateProduct[] = [
  // Giro helmet — 3 sizes, same brand & base -> one bucket
  product({ product_id: "g1", title: "Giro Fixture Helmet Small Black", brand: "Giro", category_name: "Helmets", price: 90 }),
  product({ product_id: "g2", title: "Giro Fixture Helmet Medium Black", brand: "Giro", category_name: "Helmets", price: 90 }),
  product({ product_id: "g3", title: "Giro Fixture Helmet Large Black", brand: "Giro", category_name: "Helmets", price: 90 }),
  // A genuine singleton -> dropped
  product({ product_id: "s1", title: "Brooks B17 Saddle", brand: "Brooks", category_name: "Saddles" }),
  // Same title, two different brands -> must NOT merge across brands
  product({ product_id: "a1", title: "Pro Bar Tape Red", brand: "BrandA", category_name: "Bars" }),
  product({ product_id: "a2", title: "Pro Bar Tape Blue", brand: "BrandA", category_name: "Bars" }),
  product({ product_id: "b1", title: "Pro Bar Tape Red", brand: "BrandB", category_name: "Bars" }),
  product({ product_id: "b2", title: "Pro Bar Tape Blue", brand: "BrandB", category_name: "Bars" }),
];

const buckets = buildVariantBuckets(products);
const byBaseBrand = (brand: string) =>
  buckets.find((b) => b.brand === brand && b.base_title.toLowerCase().includes("bar tape"));

console.log("bucketing:");
checkTrue("singleton dropped (no Brooks bucket)", !buckets.some((b) => b.brand === "Brooks"));
const giro = buckets.find((b) => b.brand === "Giro");
checkTrue("Giro 3 sizes form one bucket of 3", !!giro && giro.products.length === 3);
checkTrue("Giro base title is 'Giro Fixture Helmet'", giro?.base_title === "Giro Fixture Helmet");

console.log("brand isolation:");
checkTrue("BrandA bar tape bucket exists with 2", (byBaseBrand("BrandA")?.products.length ?? 0) === 2);
checkTrue("BrandB bar tape bucket exists with 2", (byBaseBrand("BrandB")?.products.length ?? 0) === 2);
checkTrue("BrandA and BrandB are separate buckets", byBaseBrand("BrandA") !== byBaseBrand("BrandB"));

console.log("counts:");
checkTrue("bucketed product count = 7 (3 + 2 + 2)", countBucketedProducts(buckets) === 7);

console.log("warnings:");
const priceProducts = [
  product({ product_id: "p1", title: "Specialized Tarmac 52cm", brand: "Specialized", category_name: "Bikes", price: 2000 }),
  product({ product_id: "p2", title: "Specialized Tarmac 54cm", brand: "Specialized", category_name: "Bikes", price: 4200 }),
];
const priceBucket = buildVariantBuckets(priceProducts)[0];
checkTrue("price spread triggers price_mismatch", priceBucket.warnings.includes("price_mismatch"));

const catProducts = [
  product({ product_id: "c1", title: "Castelli Gabba Jersey Small", brand: "Castelli", category_name: "Jerseys", price: 150 }),
  product({ product_id: "c2", title: "Castelli Gabba Jersey Medium", brand: "Castelli", category_name: "Jackets", price: 150 }),
];
const catBucket = buildVariantBuckets(catProducts)[0];
checkTrue("category mismatch triggers category_mismatch", catBucket.warnings.includes("category_mismatch"));

console.log("exclude already-grouped products:");
const excluded = buildVariantBuckets(products, { excludeProductIds: new Set(["g1", "g2"]) });
checkTrue("Giro bucket dropped once only 1 product remains", !excluded.some((b) => b.brand === "Giro"));

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll prefilter tests passed.");
