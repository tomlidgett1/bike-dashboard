import assert from "node:assert/strict";
import {
  actionIdempotencyKey,
  decodeKeysetCursor,
  encodeKeysetCursor,
  paginateCustomerRecordsInMemory,
  rankTodayItems,
  type CustomerSortRecord,
} from "../src/lib/crm/customer-graph/ranking";
import type {
  CustomerSearchSort,
  KeysetCursor,
  TodayItem,
} from "../src/lib/crm/customer-graph/types";

const now = new Date("2026-07-12T10:00:00.000Z");
const items: TodayItem[] = [
  {
    id: "task:low",
    source: "task",
    sourceId: "low",
    customerId: null,
    customerName: null,
    title: "Later",
    summary: null,
    priority: "low",
    status: "open",
    riskTier: "low",
    dueAt: "2026-07-15T10:00:00.000Z",
    createdAt: "2026-07-10T00:00:00.000Z",
    availableDecisions: ["approve"],
  },
  {
    id: "enquiry:urgent",
    source: "enquiry",
    sourceId: "urgent",
    customerId: null,
    customerName: null,
    title: "Urgent enquiry",
    summary: null,
    priority: "urgent",
    status: "open",
    riskTier: "approval",
    dueAt: "2026-07-12T09:00:00.000Z",
    createdAt: "2026-07-12T09:00:00.000Z",
    availableDecisions: [],
  },
];
assert.equal(rankTodayItems(items, now)[0]?.id, "enquiry:urgent");

const keyA = actionIdempotencyKey({
  storeId: "store-1",
  source: "lifecycle",
  sourceId: "action-1",
  actionType: "send_email",
  customerId: "customer-1",
});
const keyB = actionIdempotencyKey({
  storeId: "store-1",
  source: "LIFECYCLE",
  sourceId: "action-1",
  actionType: "SEND_EMAIL",
  customerId: "customer-1",
});
assert.equal(keyA, keyB);
assert.notEqual(
  keyA,
  actionIdempotencyKey({
    storeId: "store-1",
    source: "lifecycle",
    sourceId: "action-2",
    actionType: "send_email",
    customerId: "customer-1",
  }),
);

const cursor: KeysetCursor = {
  sort: "updated_desc",
  id: "customer-1",
  value: "2026-07-12T00:00:00.000Z",
};
assert.deepEqual(decodeKeysetCursor(encodeKeysetCursor(cursor)), cursor);
assert.equal(decodeKeysetCursor("not-json"), null);

const records: CustomerSortRecord[] = Array.from({ length: 127 }, (_, index) => ({
  id: `customer-${String(index).padStart(4, "0")}`,
  displayName: `Rider ${String((index * 17) % 127).padStart(3, "0")}`,
  totalSpend: (index * 113) % 10_000,
  lastPurchaseAt:
    index % 11 === 0
      ? null
      : new Date(Date.UTC(2026, 6, 12) - ((index * 19) % 600) * 86_400_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 6, 12) - index * 60_000).toISOString(),
}));

const sorts: CustomerSearchSort[] = [
  "name_asc",
  "updated_desc",
  "last_purchase_desc",
  "spend_desc",
];
for (const sort of sorts) {
  const seen: string[] = [];
  let next: KeysetCursor | null = null;
  let pages = 0;
  do {
    const page = paginateCustomerRecordsInMemory(records, sort, 13, next);
    seen.push(...page.items.map((record) => record.id));
    next = page.nextCursor;
    pages += 1;
    assert.ok(pages < 20);
  } while (next);
  assert.equal(seen.length, records.length);
  assert.equal(new Set(seen).size, records.length);
}

const firstPage = paginateCustomerRecordsInMemory(records, "updated_desc", 10);
assert.ok(firstPage.nextCursor);
const withoutCursorRow = records.filter(
  (record) => record.id !== firstPage.nextCursor?.id,
);
const secondPage = paginateCustomerRecordsInMemory(
  withoutCursorRow,
  "updated_desc",
  10,
  firstPage.nextCursor,
);
assert.equal(secondPage.items[0]?.id, "customer-0010");

console.log("CRM v2 ranking and cursor assertions passed.");
