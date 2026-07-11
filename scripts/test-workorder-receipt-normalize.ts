/**
 * Unit tests for Lightspeed ID normalisation and receipt sale resolution helpers.
 * Usage: npx tsx scripts/test-workorder-receipt-normalize.ts
 */
import { normalizeLightspeedId, hasLightspeedId } from "../src/lib/services/lightspeed/normalize-lightspeed-id";
import { workorderCanSendReceipt } from "../src/lib/services/lightspeed/resolve-workorder-receipt-sale";

let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

assert(normalizeLightspeedId("0") === null, 'treats "0" as null');
assert(normalizeLightspeedId(0) === null, "treats 0 as null");
assert(normalizeLightspeedId("12558") === "12558", "keeps valid sale id");
assert(hasLightspeedId("0") === false, "hasLightspeedId rejects zero");
assert(
  workorderCanSendReceipt({
    sale_id: "0",
    sale_line_id: null,
    is_finished: false,
    items: [],
  }) === false,
  "cannot send when only zero sale id and no detail",
);
assert(
  workorderCanSendReceipt({
    sale_id: "0",
    sale_line_id: "131916",
    is_finished: false,
    items: [],
  }) === true,
  "can send when sale line id present",
);
assert(
  workorderCanSendReceipt({
    sale_id: null,
    sale_line_id: null,
    is_finished: true,
    items: [],
  }) === true,
  "can send finished workorder via summary fallback",
);

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll normalisation tests passed.");
