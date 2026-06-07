import { createLightspeedClient } from "./lightspeed-client";
import type { LightspeedCustomer } from "./types";

export type NestCustomerSearchResult = {
  customerId: string;
  name: string;
  phone: string;
};

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter((token) => token.length > 1);
}

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function lightspeedContainsFilter(term: string): string {
  const normalized = normalizeText(term).replace(/%/g, "").trim();
  return `~,%${normalized}%`;
}

function customerName(customer: LightspeedCustomer): string {
  const name = [customer.firstName, customer.lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || String(customer.company ?? "").trim() || `Customer ${customer.customerID}`;
}

function customerPhones(customer: LightspeedCustomer): string[] {
  const phones = ensureArray(customer.Contact?.Phones?.ContactPhone);
  return phones
    .map((phone) => String(phone.number ?? "").trim())
    .filter(Boolean);
}

function pickCustomerMobile(customer: LightspeedCustomer): string | null {
  const phones = ensureArray(customer.Contact?.Phones?.ContactPhone);
  const mobile = phones.find((phone) =>
    String(phone.useType ?? "")
      .toLowerCase()
      .includes("mobile"),
  );
  if (mobile?.number?.trim()) return mobile.number.trim();
  const first = phones.find((phone) => phone.number?.trim());
  return first?.number?.trim() ?? null;
}

function customerMatchScore(query: string, customer: LightspeedCustomer): number {
  const q = normalizeText(query);
  if (!q) return 0;

  let score = 0;

  if (String(customer.customerID) === query.trim()) {
    score += 180;
  }

  const fullName = normalizeText(customerName(customer));
  if (fullName === q) score += 80;
  else if (fullName.includes(q)) score += 40;

  for (const token of queryTokens(query)) {
    if (fullName.includes(token)) score += 8;
  }

  const company = normalizeText(customer.company);
  if (company.includes(q)) score += 30;

  const qDigits = phoneDigits(query);
  if (qDigits.length >= 3) {
    for (const phone of customerPhones(customer)) {
      const digits = phoneDigits(phone);
      if (!digits) continue;
      if (digits === qDigits) score += 170;
      else if (digits.endsWith(qDigits) || qDigits.endsWith(digits)) score += qDigits.length >= 7 ? 140 : 90;
      else if (digits.includes(qDigits)) score += 80;
    }
  }

  const emails = ensureArray(customer.Contact?.Emails?.ContactEmail);
  for (const email of emails) {
    const address = String(email.address ?? "").toLowerCase();
    if (address && address.includes(query.trim().toLowerCase())) score += 100;
  }

  return score;
}

export async function searchLightspeedCustomersForNest(
  userId: string,
  query: string,
  limit = 8,
): Promise<NestCustomerSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const client = createLightspeedClient(userId);
  const customerById = new Map<string, LightspeedCustomer>();
  const baseParams = {
    load_relations: '["Contact"]',
    archived: "false" as const,
  };

  const fetchCustomers = async (
    params: Record<string, string | number | undefined>,
    maxPages = 2,
  ) => {
    const result = await client.getAllCustomersCursor({ ...baseParams, ...params }, {
      maxPages,
      limit: 100,
    });
    return result.customers;
  };

  if (/^\d+$/.test(trimmed)) {
    try {
      const profile = await client.getCustomer(trimmed, { load_relations: '["Contact"]' });
      customerById.set(String(profile.customerID), profile);
    } catch {
      // Fall through to broader search.
    }
  }

  const terms = Array.from(
    new Set([normalizeText(trimmed), ...queryTokens(trimmed)].filter((term) => term.length >= 2)),
  ).slice(0, 4);

  const focusedResults = await Promise.all(
    terms.flatMap((term) => [
      fetchCustomers({ firstName: lightspeedContainsFilter(term) }),
      fetchCustomers({ lastName: lightspeedContainsFilter(term) }),
      fetchCustomers({ company: lightspeedContainsFilter(term) }),
    ]),
  );

  for (const customers of focusedResults) {
    for (const customer of customers) {
      customerById.set(String(customer.customerID), customer);
    }
  }

  const needsContactFallback =
    customerById.size === 0 ||
    trimmed.includes("@") ||
    phoneDigits(trimmed).length >= 3;

  if (needsContactFallback) {
    const fallbackCustomers = await fetchCustomers({}, 8);
    for (const customer of fallbackCustomers) {
      customerById.set(String(customer.customerID), customer);
    }
  }

  const ranked = Array.from(customerById.values())
    .map((customer) => ({
      customer,
      score: customerMatchScore(trimmed, customer),
    }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || customerName(a.customer).localeCompare(customerName(b.customer)),
    );

  const seenPhones = new Set<string>();
  const results: NestCustomerSearchResult[] = [];

  for (const { customer } of ranked) {
    if (results.length >= limit) break;
    const phone = pickCustomerMobile(customer);
    if (!phone) continue;
    const phoneKey = phoneDigits(phone);
    if (phoneKey && seenPhones.has(phoneKey)) continue;
    if (phoneKey) seenPhones.add(phoneKey);
    results.push({
      customerId: String(customer.customerID),
      name: customerName(customer),
      phone,
    });
  }

  return results;
}
