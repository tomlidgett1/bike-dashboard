/**
 * Find a Lightspeed customer by scanning Customer.json with Contact loaded.
 * Run: npx tsx --env-file=.env.local scripts/find-julie-by-phone.ts '+61428808811'
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createLightspeedClient } from "../src/lib/services/lightspeed/lightspeed-client";
import {
  phoneLookupKeys,
  searchLightspeedCustomersForNest,
} from "../src/lib/services/lightspeed/customer-search";
import type { LightspeedContactPhone, LightspeedCustomer } from "../src/lib/services/lightspeed/types";
import { getValidAccessToken, getConnection } from "../src/lib/services/lightspeed/token-manager";

const USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";
const PHONE = process.argv[2] ?? "+61428808811";

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function customerPhones(customer: LightspeedCustomer): string[] {
  const contact = customer.Contact;
  const nested = ensureArray(contact?.Phones?.ContactPhone)
    .map((entry: LightspeedContactPhone) => String(entry.number ?? "").trim())
    .filter(Boolean);
  const flat = [contact?.mobile, contact?.phoneHome, contact?.phoneWork, contact?.pager, contact?.fax]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set([...nested, ...flat]));
}

function customerName(customer: LightspeedCustomer): string {
  return [customer.firstName, customer.lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function phonesMatch(left: string, right: string): boolean {
  const leftKeys = new Set(phoneLookupKeys(left));
  for (const key of phoneLookupKeys(right)) {
    if (leftKeys.has(key)) return true;
  }
  return false;
}

async function scanCustomerJsonWithContact(
  userId: string,
  phone: string,
  maxPages = 150,
): Promise<LightspeedCustomer | null> {
  const client = createLightspeedClient(userId);

  for (const archived of ["false", "true"] as const) {
    const batch = await client.getAllCustomersCursor(
      { load_relations: '["Contact"]', archived },
      { maxPages, limit: 100 },
    );

    for (const customer of batch.customers) {
      if (customerPhones(customer).some((entry) => phonesMatch(phone, entry))) {
        return customer;
      }
    }
  }

  return null;
}

async function main() {
  console.log("Phone:", PHONE);
  console.log("Lookup keys:", phoneLookupKeys(PHONE));

  const connection = await getConnection(USER_ID);
  console.log("Lightspeed status:", connection?.status, connection?.last_error ?? "");

  const token = await getValidAccessToken(USER_ID);
  if (!token) {
    console.error("\nNo valid Lightspeed token — reconnect Lightspeed in Settings first.");
    process.exit(1);
  }

  console.log("\nScanning GET Customer.json?load_relations=[\"Contact\"] ...");
  const scanned = await scanCustomerJsonWithContact(USER_ID, PHONE, 150);
  if (scanned) {
    console.log("\n*** CUSTOMER FOUND ***");
    console.log({
      customerID: scanned.customerID,
      name: customerName(scanned),
      phones: customerPhones(scanned),
      mobile: scanned.Contact?.mobile,
      phoneHome: scanned.Contact?.phoneHome,
      archived: scanned.archived,
    });
    return;
  }

  console.log("\nTrying searchLightspeedCustomersForNest...");
  const results = await searchLightspeedCustomersForNest(USER_ID, PHONE, 5);
  if (results.length > 0) {
    console.log("\n*** CUSTOMER FOUND (search) ***");
    console.log(results);
    return;
  }

  console.log("\nNo customer found for this phone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
