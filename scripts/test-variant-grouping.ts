// Run: npx tsx scripts/test-variant-grouping.ts
import { mapRawGroupsToCandidates, collectOptionValues } from "../src/lib/variants/grouping";
import type { VariantBucket, VariantCandidateProduct } from "../src/lib/variants/types";
import type { RawVariantGroup } from "../src/lib/ai/detect-product-variants";

let failures = 0;
function checkTrue(name: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function product(
  id: string,
  title: string,
  lightspeedDescription: string | null = null,
  colorPrimary: string | null = null,
): VariantCandidateProduct {
  return {
    product_id: id,
    lightspeed_item_id: "ls-" + id,
    title,
    lightspeed_description: lightspeedDescription,
    brand: "Giro",
    category_name: "Helmets",
    marketplace_category: null,
    system_sku: "SKU-" + id,
    custom_sku: null,
    manufacturer_sku: null,
    upc: null,
    price: 90,
    qoh: 2,
    model_year: null,
    size: null,
    frame_size: null,
    wheel_size: null,
    color_primary: colorPrimary,
    color_secondary: null,
    image_url: "https://img/" + id,
  };
}

function bucket(products: VariantCandidateProduct[]): VariantBucket {
  return {
    key: "giro::giro fixture helmet",
    brand: "Giro",
    base_title: "Giro Fixture Helmet",
    category_name: "Helmets",
    products,
    warnings: ["missing_sku"],
  };
}

const refs = (m: Record<string, string>) => new Map(Object.entries(m));

// --- multi-dimension: Colour + Size ---
console.log("multi-dimension colour + size:");
{
  const products = [
    product("a", "Giro Fixture Helmet Small Black"),
    product("b", "Giro Fixture Helmet Medium Black"),
    product("c", "Giro Fixture Helmet Small Red"),
  ];
  const raw: RawVariantGroup[] = [
    {
      is_variant_group: true,
      master_title: "Giro Fixture Helmet",
      option_types: [{ name: "Size" }, { name: "Colour" }],
      items: [
        { ref: "p0", values: [{ option: "Size", value: "Small" }, { option: "Colour", value: "Black" }] },
        { ref: "p1", values: [{ option: "Size", value: "Medium" }, { option: "Colour", value: "Black" }] },
        { ref: "p2", values: [{ option: "Size", value: "Small" }, { option: "Colour", value: "Red" }] },
      ],
      confidence: "high",
      explanation: "Same helmet in size/colour variants.",
      warnings: [],
    },
  ];
  const out = mapRawGroupsToCandidates(bucket(products), raw, refs({ p0: "a", p1: "b", p2: "c" }));
  checkTrue("one candidate produced", out.length === 1);
  checkTrue("3 items", out[0].items.length === 3);
  checkTrue("two option types", out[0].option_types.length === 2);
  const values = collectOptionValues(out[0]);
  checkTrue("Size values Small+Medium", JSON.stringify(values["Size"]) === JSON.stringify(["Small", "Medium"]));
  checkTrue("Colour values Black+Red", JSON.stringify(values["Colour"]) === JSON.stringify(["Black", "Red"]));
  checkTrue("bucket warning merged in", out[0].warnings.includes("missing_sku"));
  checkTrue("image/price taken from product not AI", out[0].items[0].image_url === "https://img/a" && out[0].items[0].price === 90);
}

// --- model-year split: one bucket -> two groups ---
console.log("model-year split into two groups:");
{
  const products = [
    product("y1", "Giro Fixture Helmet Small 2024"),
    product("y2", "Giro Fixture Helmet Medium 2024"),
    product("z1", "Giro Fixture Helmet Small 2025"),
    product("z2", "Giro Fixture Helmet Medium 2025"),
  ];
  const raw: RawVariantGroup[] = [
    {
      is_variant_group: true, master_title: "Giro Fixture Helmet (2024)",
      option_types: [{ name: "Size" }],
      items: [
        { ref: "p0", values: [{ option: "Size", value: "Small" }] },
        { ref: "p1", values: [{ option: "Size", value: "Medium" }] },
      ],
      confidence: "high", explanation: "2024", warnings: [],
    },
    {
      is_variant_group: true, master_title: "Giro Fixture Helmet (2025)",
      option_types: [{ name: "Size" }],
      items: [
        { ref: "p2", values: [{ option: "Size", value: "Small" }] },
        { ref: "p3", values: [{ option: "Size", value: "Medium" }] },
      ],
      confidence: "high", explanation: "2025", warnings: [],
    },
  ];
  const out = mapRawGroupsToCandidates(bucket(products), raw, refs({ p0: "y1", p1: "y2", p2: "z1", p3: "z2" }));
  checkTrue("two candidates", out.length === 2);
  checkTrue("no product shared across groups", out[0].items.every((i) => !out[1].items.some((j) => j.product_id === i.product_id)));
}

// --- drop <2-item groups and non-variant groups ---
console.log("drops tiny and non-variant groups:");
{
  const products = [product("a", "Giro Fixture Helmet Small"), product("b", "Giro Fixture Helmet Medium")];
  const raw: RawVariantGroup[] = [
    { is_variant_group: true, master_title: "X", option_types: [{ name: "Size" }], items: [{ ref: "p0", values: [{ option: "Size", value: "Small" }] }], confidence: "low", explanation: "", warnings: [] },
    { is_variant_group: false, master_title: "Y", option_types: [], items: [{ ref: "p0", values: [] }, { ref: "p1", values: [] }], confidence: "low", explanation: "", warnings: [] },
  ];
  const out = mapRawGroupsToCandidates(bucket(products), raw, refs({ p0: "a", p1: "b" }));
  checkTrue("single-item group dropped, non-variant dropped -> 0 candidates", out.length === 0);
}

// --- duplicate group prevention + product used once ---
console.log("duplicate group + single membership:");
{
  const products = [product("a", "Giro Fixture Helmet Small"), product("b", "Giro Fixture Helmet Medium")];
  const g: RawVariantGroup = {
    is_variant_group: true, master_title: "Giro Fixture Helmet", option_types: [{ name: "Size" }],
    items: [
      { ref: "p0", values: [{ option: "Size", value: "Small" }] },
      { ref: "p1", values: [{ option: "Size", value: "Medium" }] },
    ],
    confidence: "high", explanation: "", warnings: [],
  };
  const out = mapRawGroupsToCandidates(bucket(products), [g, { ...g }], refs({ p0: "a", p1: "b" }));
  checkTrue("identical duplicate group de-duped -> 1 candidate", out.length === 1);
}

// --- Yellow Jersey name lost the size, but the Lightspeed listing has it ---
console.log("cross-check Lightspeed listing recovers confidence:");
{
  // Both Yellow Jersey titles are identical (size stripped); the Lightspeed
  // listing still carries the distinct size.
  const products = [
    product("a", "Giro Fixture Helmet", "Giro Fixture Helmet Small Black"),
    product("b", "Giro Fixture Helmet", "Giro Fixture Helmet Medium Black"),
  ];
  const raw: RawVariantGroup[] = [
    {
      is_variant_group: true,
      master_title: "Giro Fixture Helmet",
      option_types: [{ name: "Size" }],
      items: [
        { ref: "p0", values: [{ option: "Size", value: "Small" }] },
        { ref: "p1", values: [{ option: "Size", value: "Medium" }] },
      ],
      confidence: "medium", // model unsure from the cleaned names alone
      explanation: "",
      warnings: [],
    },
  ];
  const out = mapRawGroupsToCandidates(bucket(products), raw, refs({ p0: "a", p1: "b" }));
  checkTrue("Lightspeed listing distinguishes -> confidence high", out[0]?.confidence === "high");
}

console.log("cross-check uses the structured colour field when the listing lacks it:");
{
  // Identical titles, no Lightspeed text — but the structured colour field differs.
  const products = [
    product("a", "Giro Fixture Helmet", null, "Black"),
    product("b", "Giro Fixture Helmet", null, "Red"),
  ];
  const raw: RawVariantGroup[] = [
    {
      is_variant_group: true,
      master_title: "Giro Fixture Helmet",
      option_types: [{ name: "Colour" }],
      items: [
        { ref: "p0", values: [{ option: "Colour", value: "Black" }] },
        { ref: "p1", values: [{ option: "Colour", value: "Red" }] },
      ],
      confidence: "medium",
      explanation: "",
      warnings: [],
    },
  ];
  const out = mapRawGroupsToCandidates(bucket(products), raw, refs({ p0: "a", p1: "b" }));
  checkTrue("structured colour distinguishes -> confidence high", out[0]?.confidence === "high");
  checkTrue("item carries colour detail for display", out[0]?.items[0].color === "Black");
}

console.log("cross-check flags when neither source distinguishes:");
{
  // Identical Yellow Jersey names AND no Lightspeed detail to tell them apart.
  const products = [product("a", "Giro Fixture Helmet"), product("b", "Giro Fixture Helmet")];
  const raw: RawVariantGroup[] = [
    {
      is_variant_group: true,
      master_title: "Giro Fixture Helmet",
      option_types: [{ name: "Size" }],
      items: [
        { ref: "p0", values: [] },
        { ref: "p1", values: [] },
      ],
      confidence: "high", // model over-confident
      explanation: "",
      warnings: [],
    },
  ];
  const out = mapRawGroupsToCandidates(bucket(products), raw, refs({ p0: "a", p1: "b" }));
  checkTrue("no distinguisher -> possible_false_positive warning", out[0]?.warnings.includes("possible_false_positive"));
  checkTrue("no distinguisher -> confidence downgraded from high", out[0]?.confidence !== "high");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll grouping tests passed.");
