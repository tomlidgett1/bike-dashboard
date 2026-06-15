// Run: npx tsx scripts/test-variant-apply.ts
import {
  buildRpcOptions,
  buildRpcItems,
  pickMasterIndex,
  validateCandidateForApply,
} from "../src/lib/variants/apply-group";
import type { VariantCandidateItem } from "../src/lib/variants/types";

let failures = 0;
function checkTrue(name: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function item(id: string, values: Record<string, string>, qoh: number): VariantCandidateItem {
  return { product_id: id, lightspeed_item_id: "ls-" + id, title: id, variant_values: values, price: 100, qoh, image_url: null };
}

const items: VariantCandidateItem[] = [
  item("a", { Size: "Small", Colour: "Black" }, 0),
  item("b", { Size: "Medium", Colour: "Black" }, 5),
  item("c", { Size: "Large", Colour: "Black" }, 2),
];

console.log("buildRpcOptions:");
const options = buildRpcOptions([{ name: "Size" }, { name: "Colour" }], items);
checkTrue("Size values S,M,L ordered", JSON.stringify(options[0].values.map((v) => v.value)) === JSON.stringify(["Small", "Medium", "Large"]));
checkTrue("Colour collapses to single Black", options[1].values.length === 1 && options[1].values[0].value === "Black");
checkTrue("option positions 1,2", options[0].position === 1 && options[1].position === 2);

console.log("master selection (highest stock):");
checkTrue("pickMasterIndex picks b (qoh 5)", pickMasterIndex(items) === 1);
const rpcItems = buildRpcItems(items);
checkTrue("only one master", rpcItems.filter((i) => i.is_master).length === 1);
checkTrue("master is b", rpcItems.find((i) => i.is_master)?.product_id === "b");
checkTrue("value_assignments preserved", JSON.stringify(rpcItems[0].value_assignments) === JSON.stringify({ Size: "Small", Colour: "Black" }));

// ---- validateCandidateForApply with a mock supabase ----
type ProductRow = { id: string; user_id: string; is_active: boolean; variant_group_id: string | null };
function mockSupabase(rows: ProductRow[]) {
  return {
    from() {
      return {
        select() {
          return { in: () => Promise.resolve({ data: rows, error: null }) };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const twoItems = [item("a", {}, 1), item("b", {}, 1)];

console.log("validateCandidateForApply:");
(async () => {
  const ok = await validateCandidateForApply(
    mockSupabase([
      { id: "a", user_id: "u1", is_active: true, variant_group_id: null },
      { id: "b", user_id: "u1", is_active: true, variant_group_id: null },
    ]),
    "u1",
    twoItems,
  );
  checkTrue("all groupable -> ok", ok.ok === true);

  const missing = await validateCandidateForApply(
    mockSupabase([{ id: "a", user_id: "u1", is_active: true, variant_group_id: null }]),
    "u1",
    twoItems,
  );
  checkTrue("missing product -> conflict b", missing.ok === false && (missing as { conflictProductIds: string[] }).conflictProductIds.includes("b"));

  const crossStore = await validateCandidateForApply(
    mockSupabase([
      { id: "a", user_id: "u1", is_active: true, variant_group_id: null },
      { id: "b", user_id: "OTHER", is_active: true, variant_group_id: null },
    ]),
    "u1",
    twoItems,
  );
  checkTrue("cross-store product -> conflict", crossStore.ok === false && (crossStore as { conflictProductIds: string[] }).conflictProductIds.includes("b"));

  const alreadyGrouped = await validateCandidateForApply(
    mockSupabase([
      { id: "a", user_id: "u1", is_active: true, variant_group_id: null },
      { id: "b", user_id: "u1", is_active: true, variant_group_id: "existing-group" },
    ]),
    "u1",
    twoItems,
  );
  checkTrue("already-grouped product -> conflict", alreadyGrouped.ok === false && (alreadyGrouped as { conflictProductIds: string[] }).conflictProductIds.includes("b"));

  const tooFew = await validateCandidateForApply(mockSupabase([]), "u1", [item("a", {}, 1)]);
  checkTrue("fewer than two -> not ok", tooFew.ok === false);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll apply tests passed.");
})();
