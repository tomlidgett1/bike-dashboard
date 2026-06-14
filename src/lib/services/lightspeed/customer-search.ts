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

export function phoneLookupKeys(phone: string): string[] {
  const digits = phoneDigits(phone);
  if (!digits) return [];
  const keys = new Set<string>([digits]);
  if (digits.startsWith("61") && digits.length >= 11) {
    keys.add(digits.slice(2));
    keys.add(`0${digits.slice(2)}`);
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    keys.add(`61${digits.slice(1)}`);
  }
  if (digits.length >= 9) keys.add(digits.slice(-9));
  if (digits.length >= 7) keys.add(digits.slice(-7));
  return Array.from(keys);
}

function phonesMatch(left: string, right: string): boolean {
  const leftKeys = new Set(phoneLookupKeys(left));
  for (const key of phoneLookupKeys(right)) {
    if (leftKeys.has(key)) return true;
  }
  return false;
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
      if (phonesMatch(query, phone)) {
        score += 170;
        continue;
      }
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

function isPhoneQuery(query: string): boolean {
  return phoneDigits(query).length >= 8;
}

function formatAustralianSpacedMobile(digits: string): string | null {
  const local =
    digits.startsWith("61") && digits.length >= 11
      ? `0${digits.slice(2)}`
      : digits.startsWith("0")
        ? digits
        : null;
  if (!local || local.length !== 10) return null;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

function phoneSearchVariants(phone: string): string[] {
  const digits = phoneDigits(phone);
  if (!digits) return [];

  const variants = new Set<string>([phone.trim(), digits]);
  if (digits.startsWith("61") && digits.length >= 11) {
    variants.add(`0${digits.slice(2)}`);
    variants.add(digits.slice(2));
    variants.add(`+${digits}`);
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    variants.add(`61${digits.slice(1)}`);
    variants.add(`+61${digits.slice(1)}`);
  }
  if (digits.length >= 9) {
    variants.add(digits.slice(-9));
    variants.add(digits.slice(-7));
  }

  const spaced = formatAustralianSpacedMobile(digits);
  if (spaced) variants.add(spaced);

  return Array.from(variants).filter(Boolean);
}

function pickResultPhone(customer: LightspeedCustomer, query: string): string | null {
  const phones = customerPhones(customer);
  const matched = phones.find((entry) => phonesMatch(query, entry));
  if (matched) return matched;
  return pickCustomerMobile(customer) ?? phones[0] ?? null;
}

async function fetchCustomersByPhoneFilters(
  userId: string,
  phone: string,
): Promise<LightspeedCustomer[]> {
  const client = createLightspeedClient(userId);
  const customerById = new Map<string, LightspeedCustomer>();
  const baseParams = {
    load_relations: '["Contact"]',
    archived: "false" as const,
    limit: 25,
  };

  for (const variant of phoneSearchVariants(phone)) {
    const digitVariant = phoneDigits(variant);
    const filters = [
      variant,
      digitVariant !== variant ? digitVariant : null,
      digitVariant.length >= 7 ? lightspeedContainsFilter(digitVariant.slice(-7)) : null,
    ].filter(Boolean) as string[];

    for (const filter of filters) {
      try {
        const customers = await client.getCustomers({
          ...baseParams,
          "Contact.Phones.ContactPhone.number": filter,
        });
        for (const customer of customers) {
          customerById.set(String(customer.customerID), customer);
        }
      } catch {
        // Some Lightspeed accounts reject nested phone filters.
      }
    }
  }

  return Array.from(customerById.values());
}

async function hydrateCustomersMissingPhones(
  userId: string,
  customers: LightspeedCustomer[],
  onMatch: (customer: LightspeedCustomer) => boolean,
  maxHydrations = 80,
): Promise<LightspeedCustomer | null> {
  const client = createLightspeedClient(userId);
  const missingPhones = customers.filter((customer) => customerPhones(customer).length === 0);

  for (const customer of missingPhones.slice(0, maxHydrations)) {
    try {
      const full = await client.getCustomer(String(customer.customerID), {
        load_relations: '["Contact"]',
      });
      if (onMatch(full)) return full;
    } catch {
      // Skip customers we cannot load.
    }
  }

  return null;
}

async function scanCustomersForPhones(
  userId: string,
  phones: string[],
  maxPages = 20,
): Promise<Map<string, LightspeedCustomer>> {
  const client = createLightspeedClient(userId);
  const results = new Map<string, LightspeedCustomer>();
  const unmatched = new Set(phones.map((phone) => phone.trim()).filter(isLikelyPhone));
  if (unmatched.size === 0) return results;

  for (const archived of ["false", "true"] as const) {
    if (unmatched.size === 0) break;

    const batch = await client.getAllCustomersCursor(
      { load_relations: '["Contact"]', archived },
      { maxPages, limit: 100 },
    );

    for (const customer of batch.customers) {
      for (const entry of customerPhones(customer)) {
        for (const phone of unmatched) {
          if (phonesMatch(phone, entry)) {
            results.set(phone, customer);
            unmatched.delete(phone);
          }
        }
      }
    }

    const hydrated = await hydrateCustomersMissingPhones(
      userId,
      batch.customers,
      (customer) => {
        for (const phone of unmatched) {
          if (customerPhones(customer).some((entry) => phonesMatch(phone, entry))) {
            results.set(phone, customer);
            unmatched.delete(phone);
          }
        }
        return unmatched.size === 0;
      },
    );
    if (hydrated && unmatched.size === 0) break;
  }

  return results;
}

async function scanCustomersForPhone(
  userId: string,
  phone: string,
  maxPages = 80,
): Promise<LightspeedCustomer | null> {
  const matches = await scanCustomersForPhones(userId, [phone], maxPages);
  return matches.get(phone.trim()) ?? null;
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

  if (isPhoneQuery(trimmed)) {
    const filtered = await fetchCustomersByPhoneFilters(userId, trimmed);
    for (const customer of filtered) {
      customerById.set(String(customer.customerID), customer);
    }
    if (customerById.size === 0) {
      const scanned = await findCustomerByPhone(userId, trimmed, {
        allowScan: true,
        maxScanPages: 30,
      });
      if (scanned) customerById.set(String(scanned.customerID), scanned);
    }
  }

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
    const phone = pickResultPhone(customer, trimmed);
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

const phoneIndexCache = new Map<string, { expiresAt: number; index: Map<string, string> }>();
const phoneNameCache = new Map<string, { expiresAt: number; name: string | null }>();
const PHONE_INDEX_TTL_MS = 5 * 60 * 1000;
const PHONE_NAME_TTL_MS = 15 * 60 * 1000;

function phoneNameCacheKey(userId: string, phone: string): string {
  const keys = phoneLookupKeys(phone);
  return `${userId}:${keys[0] ?? phoneDigits(phone)}`;
}

export function lookupLightspeedNameInIndex(
  index: Map<string, string>,
  phone: string,
): string | null {
  for (const key of phoneLookupKeys(phone)) {
    const name = index.get(key);
    if (name) return name;
  }
  return null;
}

function rememberPhoneName(
  userId: string,
  phone: string,
  name: string | null,
  index?: Map<string, string>,
): void {
  phoneNameCache.set(phoneNameCacheKey(userId, phone), {
    expiresAt: Date.now() + PHONE_NAME_TTL_MS,
    name,
  });
  if (!name || !index) return;
  for (const key of phoneLookupKeys(phone)) {
    if (!index.has(key)) index.set(key, name);
  }
}

type PhoneLookupOptions = {
  allowScan?: boolean;
  maxScanPages?: number;
};

async function findCustomerByPhone(
  userId: string,
  phone: string,
  options: PhoneLookupOptions = {},
): Promise<LightspeedCustomer | null> {
  const allowScan = options.allowScan ?? false;
  const maxScanPages = options.maxScanPages ?? 20;

  const filtered = await fetchCustomersByPhoneFilters(userId, phone);
  for (const customer of filtered) {
    if (customerPhones(customer).some((entry) => phonesMatch(phone, entry))) {
      return customer;
    }
  }

  for (const customer of filtered.slice(0, 3)) {
    try {
      const full = await createLightspeedClient(userId).getCustomer(String(customer.customerID), {
        load_relations: '["Contact"]',
      });
      if (customerPhones(full).some((entry) => phonesMatch(phone, entry))) {
        return full;
      }
    } catch {
      // Try the next filter hit.
    }
  }

  if (!allowScan) return null;
  return scanCustomersForPhone(userId, phone, maxScanPages);
}

export function isLightspeedPhoneNameIndexWarm(userId: string): boolean {
  const cached = phoneIndexCache.get(userId);
  return Boolean(cached && cached.expiresAt > Date.now());
}

export function warmLightspeedPhoneNameIndex(userId: string, maxPages = 12): void {
  void getLightspeedPhoneNameIndex(userId, { maxPages }).catch(() => {});
}

export async function lookupLightspeedCustomerNameByPhone(
  userId: string,
  phone: string,
  options: PhoneLookupOptions = {},
): Promise<string | null> {
  const trimmed = phone.trim();
  if (!isLikelyPhone(trimmed)) return null;

  const cacheKey = phoneNameCacheKey(userId, trimmed);
  const cached = phoneNameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  const index = await getLightspeedPhoneNameIndex(userId);
  const indexed = lookupLightspeedNameInIndex(index, trimmed);
  if (indexed) {
    rememberPhoneName(userId, trimmed, indexed, index);
    return indexed;
  }

  const customer = await findCustomerByPhone(userId, trimmed, options);
  const name = customer ? customerName(customer) : null;
  rememberPhoneName(userId, trimmed, name, index);
  if (customer && name) {
    for (const entry of customerPhones(customer)) {
      for (const key of phoneLookupKeys(entry)) {
        if (!index.has(key)) index.set(key, name);
      }
    }
  }
  return name;
}

function isLikelyPhone(value: string): boolean {
  return phoneDigits(value).length >= 8;
}

export async function resolveLightspeedNamesFromIndex(
  userId: string,
  phones: string[],
  index?: Map<string, string>,
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(phones.map((phone) => phone.trim()).filter(isLikelyPhone)));
  const resolved = new Map<string, string>();
  if (unique.length === 0) return resolved;

  const phoneIndex = index ?? (await getLightspeedPhoneNameIndex(userId, { maxPages: 12 }));
  const misses: string[] = [];
  for (const phone of unique) {
    const name = lookupLightspeedNameInIndex(phoneIndex, phone);
    if (name) resolved.set(phone, name);
    else misses.push(phone);
  }

  if (misses.length === 0) return resolved;

  const missesToLookup = misses.slice(0, 6);
  try {
    const scanned = await scanCustomersForPhones(userId, missesToLookup, 20);
    for (const [phone, customer] of scanned) {
      const name = customerName(customer);
      resolved.set(phone, name);
      rememberPhoneName(userId, phone, name, phoneIndex);
      for (const entry of customerPhones(customer)) {
        for (const key of phoneLookupKeys(entry)) {
          if (!phoneIndex.has(key)) phoneIndex.set(key, name);
        }
      }
    }
  } catch (error) {
    console.error("[lightspeed] Phone scan enrichment failed:", error);
  }

  return resolved;
}

type PhoneIndexOptions = {
  maxPages?: number;
  timeoutMs?: number;
};

export async function getLightspeedPhoneNameIndex(
  userId: string,
  options: PhoneIndexOptions = {},
): Promise<Map<string, string>> {
  const maxPages = options.maxPages ?? 12;
  const cached = phoneIndexCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.index;

  const buildIndex = async (): Promise<Map<string, string>> => {
    const client = createLightspeedClient(userId);
    const index = new Map<string, string>();

    for (const archived of ["false", "true"] as const) {
      const { customers } = await client.getAllCustomersCursor(
        { load_relations: '["Contact"]', archived },
        { maxPages, limit: 100 },
      );

      for (const customer of customers) {
        const name = customerName(customer);
        for (const phone of customerPhones(customer)) {
          for (const key of phoneLookupKeys(phone)) {
            if (!index.has(key)) index.set(key, name);
          }
        }
      }
    }

    phoneIndexCache.set(userId, { expiresAt: Date.now() + PHONE_INDEX_TTL_MS, index });
    return index;
  };

  if (!options.timeoutMs || options.timeoutMs <= 0) {
    return buildIndex();
  }

  const timedOut = new Promise<Map<string, string>>((resolve) => {
    setTimeout(() => resolve(cached?.index ?? new Map()), options.timeoutMs);
  });

  return Promise.race([buildIndex(), timedOut]);
}
