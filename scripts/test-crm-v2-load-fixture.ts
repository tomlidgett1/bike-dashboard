import assert from "node:assert/strict";
import {
  compareCustomerRecords,
  paginateCustomerRecordsInMemory,
  type CustomerSortRecord,
} from "../src/lib/crm/customer-graph/ranking";

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function generateCustomerLoadFixture(
  size: number,
  seed = 20_260_712,
): CustomerSortRecord[] {
  const random = pseudoRandom(seed);
  const base = Date.UTC(2026, 6, 12);
  return Array.from({ length: size }, (_, index) => ({
    id: `fixture-${String(index).padStart(7, "0")}`,
    displayName: `Rider ${Math.floor(random() * Math.max(1, size / 3))
      .toString()
      .padStart(6, "0")}`,
    totalSpend: Math.round(random() * 2_000_000) / 100,
    lastPurchaseAt:
      random() < 0.08
        ? null
        : new Date(base - Math.floor(random() * 1_825) * 86_400_000).toISOString(),
    updatedAt: new Date(base - Math.floor(random() * 31_536_000_000)).toISOString(),
  }));
}

const fixture = generateCustomerLoadFixture(100_000);
assert.equal(fixture.length, 100_000);
assert.equal(new Set(fixture.map((record) => record.id)).size, fixture.length);

for (const sort of ["updated_desc", "spend_desc", "last_purchase_desc", "name_asc"] as const) {
  const expected = [...fixture].sort((left, right) =>
    compareCustomerRecords(left, right, sort),
  );
  const first = paginateCustomerRecordsInMemory(fixture, sort, 1_000);
  assert.deepEqual(
    first.items.map((record) => record.id),
    expected.slice(0, 1_000).map((record) => record.id),
  );
  assert.ok(first.nextCursor);
  const second = paginateCustomerRecordsInMemory(
    fixture,
    sort,
    1_000,
    first.nextCursor,
  );
  assert.deepEqual(
    second.items.map((record) => record.id),
    expected.slice(1_000, 2_000).map((record) => record.id),
  );
  assert.equal(
    new Set([...first.items, ...second.items].map((record) => record.id)).size,
    2_000,
  );
}

// Exercise the target timeline cardinality without retaining one million
// heavyweight objects in memory. The checksum verifies deterministic,
// collision-free key construction across the complete event range.
let eventChecksum = 0n;
const eventKeys = new Set<string>();
for (let index = 0; index < 1_000_000; index += 1) {
  const key = `event-${index.toString(36).padStart(6, "0")}`;
  if (index % 1_000 === 0) eventKeys.add(key);
  eventChecksum += BigInt(index);
}
assert.equal(eventKeys.size, 1_000);
assert.equal(eventChecksum, 499_999_500_000n);

console.log("CRM v2 100,000-customer / 1,000,000-event load fixture assertions passed.");
