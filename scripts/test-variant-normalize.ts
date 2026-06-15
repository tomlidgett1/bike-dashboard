// Run: npx tsx scripts/test-variant-normalize.ts
import {
  variantComparisonKey,
  suggestBaseTitle,
  normalizeBrandKey,
  extractVariantTokens,
  variantTokenSignature,
  coreModelKey,
} from "../src/lib/variants/normalize";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}\n      expected: ${e}\n      actual:   ${a}`);
  }
}
function checkTrue(name: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

console.log("variantComparisonKey collapses size/colour variants:");
const giroSmall = variantComparisonKey("Giro Fixture Helmet Small Black");
const giroMedium = variantComparisonKey("Giro Fixture Helmet Medium Black");
const giroLarge = variantComparisonKey("Giro Fixture Helmet Large Black");
check("Small == Medium key", giroSmall, giroMedium);
check("Medium == Large key", giroMedium, giroLarge);
check("base key value", giroSmall, "giro fixture helmet");

console.log("variantComparisonKey strips frame size, wheel size, gender, year:");
check("cm frame size", variantComparisonKey("Trek Domane AL 2 54cm 2024"), "trek domane al 2");
check('wheel size 29"', variantComparisonKey('Giant Talon 29" Large'), "giant talon");
check("700c wheel", variantComparisonKey("Vittoria Corsa 700c Black"), "vittoria corsa");
check("gender word", variantComparisonKey("Rapha Women's Jersey Medium"), "rapha jersey");

console.log("different products keep different keys:");
checkTrue(
  "different model -> different key",
  variantComparisonKey("Giro Fixture Helmet Small") !==
    variantComparisonKey("Giro Syntax Helmet Small"),
);

console.log("suggestBaseTitle preserves original casing, drops variant tokens:");
check("helmet base title", suggestBaseTitle("Giro Fixture Helmet Small Black"), "Giro Fixture Helmet");
check("trailing year/cm tidy", suggestBaseTitle("Trek Domane AL 2 54cm"), "Trek Domane AL 2");
check("hyphen colour tidy", suggestBaseTitle("Bontrager Circuit Jersey - Red - Large"), "Bontrager Circuit Jersey");

console.log("normalizeBrandKey:");
check("trim + lowercase", normalizeBrandKey("  Giro  "), "giro");
check("null brand", normalizeBrandKey(null), "");

console.log("extractVariantTokens recovers size/colour from a listing:");
{
  const tokens = extractVariantTokens("Giro Fixture Helmet Small Black");
  checkTrue("size Small extracted", tokens.sizes.map((s) => s.toLowerCase()).includes("small"));
  checkTrue("colour Black extracted", tokens.colours.map((c) => c.toLowerCase()).includes("black"));
  const cm = extractVariantTokens("Trek Domane 54cm 2024");
  checkTrue("frame size + year captured", cm.others.some((o) => o.includes("54")) && cm.others.includes("2024"));
}

console.log("strips tyre sizes + generic bike words:");
check("tyre size 26×2.20", variantComparisonKey("Orbea Alma H30 26×2.20 Blue"), "orbea alma h30");
check("700x25c tyre", variantComparisonKey("Continental GP5000 700x25c"), "continental gp5000");
check("Mountain Bike generic", variantComparisonKey("Orbea Alma H30 Mountain Bike"), "orbea alma h30");
check("Bicycle generic + finish", variantComparisonKey("Orbea Alma H30 Tanzanite Blue Bicycle Gloss"), "orbea alma h30 tanzanite");

console.log("coreModelKey collapses bike colour/marketing names:");
check("Espace Green Matt", coreModelKey("Orbea Alma H30 Mountain Bike X-Large Espace Green Matt", "Orbea"), "alma h30");
check("Halo Silver Tanzanite", coreModelKey("Orbea Alma H30 Large Halo Silver Tanzanite Blue", "Orbea"), "alma h30");
check("26×2.20 Small", coreModelKey("Orbea Alma H30 26×2.20 Small Silver Blue", "Orbea"), "alma h30");
checkTrue("different model number stays distinct", coreModelKey("Orbea Alma H30", "Orbea") !== coreModelKey("Orbea Alma H50", "Orbea"));
// coreModelKey is intentionally coarse (drops "Cassette") — which is exactly why
// the prefilter only applies it to complete bikes, not parts.
checkTrue("coreModelKey is too coarse for parts → parts use the full key instead", coreModelKey("Shimano 105 R7000 Cassette", "Shimano") === "105");

console.log("variantTokenSignature distinguishes vs collapses:");
checkTrue(
  "different size -> different signature",
  variantTokenSignature("Giro Fixture Helmet Small Black") !== variantTokenSignature("Giro Fixture Helmet Medium Black"),
);
checkTrue(
  "no variant tokens -> empty signature",
  variantTokenSignature("Giro Fixture Helmet") === "",
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll normalize tests passed.");
