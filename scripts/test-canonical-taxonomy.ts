/**
 * Verifies the Yellow Jersey canonical taxonomy helpers and category search.
 * Run: npx tsx scripts/test-canonical-taxonomy.ts
 */

import assert from "node:assert/strict";
import {
  buildStaticCategoryHierarchy,
  isValidCanonicalPath,
  listCanonicalLevel1,
  listCanonicalLevel2,
  resolveBikeTypeToCanonicalPath,
  resolveCanonicalPath,
  searchCanonicalCategories,
} from "../src/lib/marketplace/canonical-taxonomy";

function main() {
  const level1 = listCanonicalLevel1();
  assert.ok(level1.length >= 15, `Expected full L1 taxonomy, got ${level1.length}`);
  assert.ok(level1.includes("Bicycles"));
  assert.ok(level1.includes("Drivetrain"));
  assert.ok(level1.includes("Apparel"));
  assert.ok(level1.includes("Accessories"));

  const bikeL2 = listCanonicalLevel2("Bicycles");
  assert.ok(bikeL2.includes("Road"));
  assert.ok(bikeL2.includes("Gravel"));
  assert.ok(bikeL2.includes("Mountain"));

  assert.equal(isValidCanonicalPath("Bicycles", "Road"), true);
  assert.equal(isValidCanonicalPath("Parts", "Frames"), false);
  assert.equal(isValidCanonicalPath("Frames & Framesets", "Road Frameset"), true);

  const legacy = resolveCanonicalPath("Parts", "Wheels");
  assert.ok(legacy);
  assert.equal(legacy?.level1, "Wheels & Tyres");

  const bikeType = resolveBikeTypeToCanonicalPath("gravel");
  assert.deepEqual(bikeType, {
    level1: "Bicycles",
    level2: "Gravel",
    level3: null,
  });

  const hierarchy = buildStaticCategoryHierarchy();
  assert.equal(hierarchy.length, level1.length);
  for (const category of hierarchy) {
    assert.ok(
      category.level2Categories.length > 0,
      `${category.level1} should expose L2 categories for product-page slide-downs`,
    );
  }

  const searchHits = searchCanonicalCategories("helmet", 5);
  assert.ok(searchHits.length > 0);
  assert.ok(searchHits.some((hit) => hit.level1 === "Accessories" && hit.level2 === "Helmets"));

  console.log("✅ Canonical taxonomy checks passed");
  console.log(`   L1 count: ${level1.length}`);
  console.log(`   Search sample: ${searchHits.map((hit) => hit.label).join(", ")}`);
}

main();
