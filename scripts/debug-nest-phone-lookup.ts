import { config } from "dotenv";
config({ path: ".env.local" });

import { createLightspeedClient } from "../src/lib/services/lightspeed/lightspeed-client";
import {
  getLightspeedPhoneNameIndex,
  lookupLightspeedNameInIndex,
  searchLightspeedCustomersForNest,
} from "../src/lib/services/lightspeed/customer-search";
import type { LightspeedContactPhone, LightspeedCustomer } from "../src/lib/services/lightspeed/types";

const userId = "3acef09d-8b28-46e8-a0c3-45ce59c61972";
const phone = "+61403188006";

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function customerPhones(customer: LightspeedCustomer): string[] {
  return ensureArray(customer.Contact?.Phones?.ContactPhone)
    .map((entry: LightspeedContactPhone) => String(entry.number ?? "").trim())
    .filter(Boolean);
}

async function main() {
  const client = createLightspeedClient(userId);
  const batch = await client.getAllCustomersCursor(
    { load_relations: '["Contact"]', archived: "false" },
    { maxPages: 50, limit: 100 },
  );

  console.log("Fetched customers:", batch.customers.length, "hitPageLimit:", batch.hitPageLimit);

  let withPhones = 0;
  let withoutPhones = 0;
  let found: Record<string, unknown> | null = null;
  const target = phoneDigits(phone);
  const tail = target.slice(-9);

  for (const customer of batch.customers) {
    const phones = customerPhones(customer);
    if (phones.length) withPhones += 1;
    else withoutPhones += 1;

    for (const entry of phones) {
      const digits = phoneDigits(entry);
      if (digits === target || digits === tail || digits.endsWith(tail)) {
        found = {
          id: customer.customerID,
          name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
          phone: entry,
          contactID: customer.contactID,
        };
        break;
      }
    }
    if (found) break;
  }

  console.log("With phones:", withPhones, "without:", withoutPhones);
  console.log("List scan found:", found);

  if (!found) {
    const missingContact = batch.customers.find(
      (customer) => customerPhones(customer).length === 0 && customer.contactID,
    );
    if (missingContact) {
      const full = await client.getCustomer(missingContact.customerID, {
        load_relations: '["Contact"]',
      });
      console.log(
        "Sample getCustomer phones for",
        missingContact.customerID,
        ":",
        customerPhones(full),
      );
    }
  }

  for (const query of [phone, phoneDigits(phone), tail, "0403188006"]) {
    const results = await searchLightspeedCustomersForNest(userId, query, 5);
    console.log("Search", query, "=>", results);
  }

  const index = await getLightspeedPhoneNameIndex(userId);
  console.log("Index size:", index.size);
  console.log("Index lookup:", lookupLightspeedNameInIndex(index, phone));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
