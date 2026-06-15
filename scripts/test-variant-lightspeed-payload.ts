// Run: npx tsx scripts/test-variant-lightspeed-payload.ts
import {
  resolveAttributeSetPlan,
  computeSlotByOption,
  buildReparentAttributes,
  selectRemainingItemIds,
} from "../src/lib/services/lightspeed/variant-matrix";
import type { LightspeedItemAttributeSet } from "../src/lib/services/lightspeed/types";

let failures = 0;
function checkTrue(name: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function set(id: string, name: string, a1: string, a2 = "", a3 = ""): LightspeedItemAttributeSet {
  return { itemAttributeSetID: id, name, attributeName1: a1, attributeName2: a2, attributeName3: a3, system: "true", archived: "false" };
}

const SYSTEM_SETS: LightspeedItemAttributeSet[] = [
  set("1", "Color/Size", "Color", "Size"),
  set("2", "Size", "Size"),
  set("3", "Color", "Color"),
];

console.log("reuse system Color/Size set for Colour + Size (any order):");
{
  const plan = resolveAttributeSetPlan([{ name: "Size" }, { name: "Colour" }], SYSTEM_SETS);
  checkTrue("reuses existing set", plan.mode === "reuse" && plan.setId === "1");
  checkTrue("attribute order Color, Size", JSON.stringify(plan.attributeNames) === JSON.stringify(["Color", "Size"]));

  const slots = computeSlotByOption([{ name: "Colour" }, { name: "Size" }], plan.attributeNames);
  checkTrue("Colour -> slot 1", slots["Colour"] === 1);
  checkTrue("Size -> slot 2", slots["Size"] === 2);

  const attrs = buildReparentAttributes("1", slots, { Colour: "Black", Size: "Medium" });
  checkTrue("attribute1 = Black (colour)", attrs.attribute1 === "Black");
  checkTrue("attribute2 = Medium (size)", attrs.attribute2 === "Medium");
  checkTrue("itemAttributeSetID carried", attrs.itemAttributeSetID === "1");
}

console.log("reuse single Size set:");
{
  const plan = resolveAttributeSetPlan([{ name: "Size" }], SYSTEM_SETS);
  checkTrue("reuses Size set id 2", plan.mode === "reuse" && plan.setId === "2");
  const slots = computeSlotByOption([{ name: "Size" }], plan.attributeNames);
  const attrs = buildReparentAttributes("2", slots, { Size: "Large" });
  checkTrue("attribute1 = Large", attrs.attribute1 === "Large" && attrs.attribute2 === undefined);
}

console.log("create a custom set for Frame Size (no system match):");
{
  const plan = resolveAttributeSetPlan([{ name: "Frame Size" }], SYSTEM_SETS);
  checkTrue("mode create", plan.mode === "create");
  checkTrue("createSpec name + attr1", plan.createSpec?.name === "Frame Size" && plan.createSpec?.attributeName1 === "Frame Size");
  const slots = computeSlotByOption([{ name: "Frame Size" }], plan.attributeNames);
  const attrs = buildReparentAttributes("9", slots, { "Frame Size": "54cm" });
  checkTrue("attribute1 = 54cm", attrs.attribute1 === "54cm");
}

console.log("retry selects only remaining item ids:");
{
  const remaining = selectRemainingItemIds(["100", "101", "102"], ["100"]);
  checkTrue("skips already-synced 100", JSON.stringify(remaining) === JSON.stringify(["101", "102"]));
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll lightspeed-payload tests passed.");
