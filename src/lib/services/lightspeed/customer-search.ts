import { buildContactSearchOrFilter } from "@/lib/crm/contact-search";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createLightspeedClient } from "./lightspeed-client";
import type { LightspeedCustomer } from "./types";

export type NestCustomerSearchResult = {
  customerId: string;
  name: string;
  /** Empty when Lightspeed has no mobile on file. */
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

export function customerRecordMatchesPhone(
  customer: LightspeedCustomer,
  queryPhone: string,
): boolean {
  return customerPhones(customer).some((entry) => phonesMatch(queryPhone, entry));
}

function customerName(customer: LightspeedCustomer): string {
  const name = [customer.firstName, customer.lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || String(customer.company ?? "").trim() || `Customer ${customer.customerID}`;
}

function customerPhones(customer: LightspeedCustomer): string[] {
  const contact = customer.Contact;
  const fromNested = ensureArray(contact?.Phones?.ContactPhone)
    .map((phone) => String(phone.number ?? "").trim())
    .filter(Boolean);
  const fromFlat = [
    contact?.mobile,
    contact?.phoneHome,
    contact?.phoneWork,
    contact?.pager,
    contact?.fax,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set([...fromNested, ...fromFlat]));
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

export function formatAustralianSpacedMobile(digits: string): string | null {
  const local =
    digits.startsWith("61") && digits.length >= 11
      ? `0${digits.slice(2)}`
      : digits.startsWith("0")
        ? digits
        : null;
  if (!local || local.length !== 10) return null;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Canonical 10-digit AU local mobile (e.g. 0428808811) for Lightspeed exact filters. */
export function normalizeAustralianMobileLocal(phone: string): string | null {
  const digits = phoneDigits(phone);
  if (!digits) return null;

  if (digits.startsWith("61") && digits.length >= 11) {
    const local = `0${digits.slice(2)}`;
    if (local.length === 10) return local;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }

  if (digits.length === 9 && digits.startsWith("4")) {
    return `0${digits}`;
  }

  return null;
}

function pickResultPhone(customer: LightspeedCustomer, query: string): string | null {
  const phones = customerPhones(customer);
  const matched = phones.find((entry) => phonesMatch(query, entry));
  if (matched) return matched;
  return pickCustomerMobile(customer) ?? phones[0] ?? null;
}

const RECENT_CUSTOMERS_DAYS_BACK = 180;

function createTimeRangeFilter(daysBack: number): string {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  const fmt = (date: Date) => date.toISOString().split("T")[0];
  return `><,${fmt(start)},${fmt(end)}`;
}

async function fetchRecentCustomers(
  userId: string,
  daysBack = RECENT_CUSTOMERS_DAYS_BACK,
): Promise<LightspeedCustomer[]> {
  const client = createLightspeedClient(userId);
  const customerById = new Map<string, LightspeedCustomer>();

  for (const archived of ["false", "true"] as const) {
    try {
      const { customers } = await client.getAllCustomersCursor(
        {
          load_relations: '["Contact"]',
          archived,
          createTime: createTimeRangeFilter(daysBack),
        },
        { maxPages: 10, limit: 100 },
      );
      for (const customer of customers) {
        customerById.set(String(customer.customerID), customer);
      }
    } catch {
      // createTime filter may not be supported on all accounts.
    }
  }

  return Array.from(customerById.values());
}

function findCustomerInListByPhone(
  customers: LightspeedCustomer[],
  phone: string,
): LightspeedCustomer | null {
  for (const customer of customers) {
    if (customerPhones(customer).some((entry) => phonesMatch(phone, entry))) {
      return customer;
    }
  }
  return null;
}

async function findCustomersInListByPhones(
  userId: string,
  customers: LightspeedCustomer[],
  phones: string[],
): Promise<Map<string, LightspeedCustomer>> {
  const results = new Map<string, LightspeedCustomer>();
  const unmatched = new Set(phones.map((phone) => phone.trim()).filter(isLikelyPhone));
  if (unmatched.size === 0) return results;

  for (const customer of customers) {
    for (const entry of customerPhones(customer)) {
      for (const phone of unmatched) {
        if (phonesMatch(phone, entry)) {
          results.set(phone, customer);
          unmatched.delete(phone);
        }
      }
    }
    if (unmatched.size === 0) break;
  }

  if (unmatched.size > 0) {
    await hydrateCustomersMissingPhones(
      userId,
      customers,
      (customer) => {
        for (const phone of unmatched) {
          if (customerPhones(customer).some((entry) => phonesMatch(phone, entry))) {
            results.set(phone, customer);
            unmatched.delete(phone);
          }
        }
        return unmatched.size === 0;
      },
      40,
    );
  }

  return results;
}

function rememberCustomerInPhoneIndex(
  userId: string,
  phone: string,
  customer: LightspeedCustomer,
  index: Map<string, string>,
): string {
  const name = customerName(customer);
  rememberPhoneName(userId, phone, name, index);
  for (const entry of customerPhones(customer)) {
    for (const key of phoneLookupKeys(entry)) {
      if (!index.has(key)) index.set(key, name);
    }
  }
  return name;
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

const nestCustomerSearchCache = new Map<
  string,
  { expiresAt: number; results: NestCustomerSearchResult[] }
>();
const NEST_CUSTOMER_SEARCH_TTL_MS = 60_000;

function nestCustomerSearchCacheKey(userId: string, query: string): string {
  return `${userId}:${normalizeText(query)}`;
}

async function searchCrmContactsForNest(
  userId: string,
  query: string,
  limit: number,
): Promise<NestCustomerSearchResult[]> {
  const searchFilter = buildContactSearchOrFilter(query);
  if (!searchFilter) return [];

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("crm_contacts")
      .select("id, lightspeed_customer_id, first_name, last_name, phone")
      .eq("user_id", userId)
      .or(searchFilter)
      .limit(Math.max(limit * 3, 24));
    if (error || !data?.length) return [];

    const q = normalizeText(query);
    const tokens = queryTokens(query);
    const ranked = data
      .map((row) => {
        const name = [row.first_name, row.last_name]
          .map((part) => String(part ?? "").trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!name) return null;
        const normalisedName = normalizeText(name);
        let score = 0;
        if (normalisedName === q) score += 80;
        else if (normalisedName.includes(q)) score += 40;
        for (const token of tokens) {
          if (normalisedName.includes(token)) score += 8;
        }
        const phone = String(row.phone ?? "").trim();
        if (phone) score += 4;
        return {
          score,
          result: {
            customerId:
              String(row.lightspeed_customer_id ?? "").trim() ||
              `crm:${row.id}`,
            name,
            phone,
          } satisfies NestCustomerSearchResult,
        };
      })
      .filter((row): row is { score: number; result: NestCustomerSearchResult } =>
        Boolean(row && row.score > 0),
      )
      .sort(
        (a, b) =>
          b.score - a.score || a.result.name.localeCompare(b.result.name),
      );

    const seen = new Set<string>();
    const out: NestCustomerSearchResult[] = [];
    for (const row of ranked) {
      const key =
        row.result.customerId ||
        `${normalizeText(row.result.name)}:${phoneDigits(row.result.phone)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row.result);
      if (out.length >= limit) break;
    }
    return out;
  } catch (error) {
    console.warn(
      "[nest-customer-search] CRM fast path failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

function mergeNestCustomerResults(
  batches: NestCustomerSearchResult[][],
  limit: number,
): NestCustomerSearchResult[] {
  const byKey = new Map<string, NestCustomerSearchResult>();

  for (const batch of batches) {
    for (const customer of batch) {
      const phoneKey = phoneDigits(customer.phone);
      const key =
        customer.customerId ||
        (phoneKey ? `phone:${phoneKey}` : `name:${normalizeText(customer.name)}`);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, customer);
        continue;
      }
      // Prefer a row that has a mobile number.
      if (!existing.phone && customer.phone) {
        byKey.set(key, customer);
      }
    }
  }

  const merged = Array.from(byKey.values());
  merged.sort((a, b) => {
    const phoneDelta = Number(Boolean(b.phone)) - Number(Boolean(a.phone));
    if (phoneDelta !== 0) return phoneDelta;
    return a.name.localeCompare(b.name);
  });
  return merged.slice(0, limit);
}

export async function searchLightspeedCustomersForNest(
  userId: string,
  query: string,
  limit = 8,
): Promise<NestCustomerSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = nestCustomerSearchCacheKey(userId, trimmed);
  const cached = nestCustomerSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results.slice(0, limit);
  }

  const client = createLightspeedClient(userId);
  const customerById = new Map<string, LightspeedCustomer>();

  const finish = (results: NestCustomerSearchResult[]) => {
    nestCustomerSearchCache.set(cacheKey, {
      expiresAt: Date.now() + NEST_CUSTOMER_SEARCH_TTL_MS,
      results,
    });
    return results.slice(0, limit);
  };

  // Phone: Contact.mobile filter only (1–2 requests). Compose search must stay snappy.
  if (isPhoneQuery(trimmed)) {
    const [crmMatches, matched] = await Promise.all([
      searchCrmContactsForNest(userId, trimmed, limit),
      findCustomerByPhone(userId, trimmed, {
        allowScan: false,
        maxScanPages: 0,
      }),
    ]);
    const lightspeedMatches: NestCustomerSearchResult[] = [];
    if (matched) {
      const phone = pickResultPhone(matched, trimmed);
      lightspeedMatches.push({
        customerId: String(matched.customerID),
        name: customerName(matched),
        phone: phone ?? "",
      });
    }
    return finish(mergeNestCustomerResults([crmMatches, lightspeedMatches], limit));
  }

  // Exact customer ID lookup — one request.
  if (/^\d+$/.test(trimmed)) {
    const crmMatches = await searchCrmContactsForNest(userId, trimmed, limit);
    try {
      const profile = await client.getCustomer(trimmed, { load_relations: '["Contact"]' });
      const phone = pickResultPhone(profile, trimmed);
      return finish(
        mergeNestCustomerResults(
          [
            crmMatches,
            [
              {
                customerId: String(profile.customerID),
                name: customerName(profile),
                phone: phone ?? "",
              },
            ],
          ],
          limit,
        ),
      );
    } catch {
      if (crmMatches.length > 0) return finish(crmMatches);
      // Fall through to name search.
    }
  }

  // Local CRM first (usually <50ms), Lightspeed filters in parallel for coverage.
  const tokens = queryTokens(trimmed);
  const first = tokens[0] ?? normalizeText(trimmed);
  const last = tokens.length >= 2 ? tokens[tokens.length - 1]! : first;
  if (first.length < 2) return finish([]);

  const lightspeedRequests: Array<Promise<LightspeedCustomer[]>> = [
    client.getCustomers({
      load_relations: '["Contact"]',
      archived: "false",
      limit: 20,
      firstName: lightspeedContainsFilter(first),
    }),
    client.getCustomers({
      load_relations: '["Contact"]',
      archived: "false",
      limit: 20,
      lastName: lightspeedContainsFilter(last),
    }),
  ];
  // Multi-token: also ask Lightspeed for first+last together so exact people
  // like "Sam Danks" are not crowded out of the single-field pages.
  if (tokens.length >= 2 && first !== last) {
    lightspeedRequests.push(
      client.getCustomers({
        load_relations: '["Contact"]',
        archived: "false",
        limit: 20,
        firstName: lightspeedContainsFilter(first),
        lastName: lightspeedContainsFilter(last),
      }),
    );
  }

  const [crmMatches, settled] = await Promise.all([
    searchCrmContactsForNest(userId, trimmed, limit),
    Promise.allSettled(lightspeedRequests),
  ]);

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const customer of result.value) {
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
  const seenIds = new Set<string>();
  const withPhone: NestCustomerSearchResult[] = [];
  const withoutPhone: NestCustomerSearchResult[] = [];

  for (const { customer, score } of ranked) {
    const id = String(customer.customerID);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const phone = pickResultPhone(customer, trimmed) ?? "";
    const phoneKey = phoneDigits(phone);
    if (phoneKey) {
      if (seenPhones.has(phoneKey)) continue;
      seenPhones.add(phoneKey);
      withPhone.push({
        customerId: id,
        name: customerName(customer),
        phone,
      });
      continue;
    }
    // Keep strong name matches even when Nest cannot text them yet.
    if (score >= 40) {
      withoutPhone.push({
        customerId: id,
        name: customerName(customer),
        phone: "",
      });
    }
  }

  return finish(
    mergeNestCustomerResults([crmMatches, withPhone, withoutPhone], limit),
  );
}

const phoneIndexCache = new Map<string, { expiresAt: number; index: Map<string, string> }>();
const phoneIndexInflight = new Map<string, Promise<Map<string, string>>>();
const phoneNameCache = new Map<string, { expiresAt: number; name: string | null }>();
const phoneCustomerCache = new Map<string, { expiresAt: number; customer: LightspeedCustomer }>();
const PHONE_INDEX_TTL_MS = 5 * 60 * 1000;
const PHONE_NAME_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PHONE_INDEX_MAX_PAGES =
  process.env.NODE_ENV === "development" ? 4 : 12;

function phoneNameCacheKey(userId: string, phone: string): string {
  const keys = phoneLookupKeys(phone);
  return `${userId}:${keys[0] ?? phoneDigits(phone)}`;
}

function getCachedPhoneCustomer(userId: string, phone: string): LightspeedCustomer | null {
  const cached = phoneCustomerCache.get(phoneNameCacheKey(userId, phone));
  if (cached && cached.expiresAt > Date.now()) return cached.customer;
  return null;
}

function rememberPhoneCustomer(userId: string, phone: string, customer: LightspeedCustomer): void {
  phoneCustomerCache.set(phoneNameCacheKey(userId, phone), {
    expiresAt: Date.now() + PHONE_NAME_TTL_MS,
    customer,
  });
}

/** One or two Lightspeed calls: Contact.mobile with local then spaced AU format. */
async function fetchCustomerByPhoneFilterFast(
  userId: string,
  phone: string,
): Promise<LightspeedCustomer | null> {
  const local = normalizeAustralianMobileLocal(phone);
  if (!local) return null;

  const client = createLightspeedClient(userId);
  const baseParams = {
    load_relations: '["Contact"]',
    archived: "false" as const,
    limit: 5,
  };
  const trustedFilters = new Set(
    [local, formatAustralianSpacedMobile(local) ?? ""].filter(Boolean),
  );

  const queryMobile = async (mobileFilter: string): Promise<LightspeedCustomer | null> => {
    try {
      const customers = await client.getCustomers({
        ...baseParams,
        "Contact.mobile": mobileFilter,
      });
      if (customers.length === 0) return null;

      for (const customer of customers) {
        if (customerPhones(customer).some((entry) => phonesMatch(phone, entry))) {
          return customer;
        }
      }

      if (trustedFilters.has(mobileFilter) && customers.length === 1) {
        const only = customers[0];
        if (only && customerRecordMatchesPhone(only, phone)) {
          return only;
        }
      }
    } catch {
      // Unsupported on this account — fall through to scan.
    }
    return null;
  };

  const fromLocal = await queryMobile(local);
  if (fromLocal) return fromLocal;

  const spaced = formatAustralianSpacedMobile(local);
  if (spaced && spaced !== local) {
    return queryMobile(spaced);
  }

  return null;
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

export async function findCustomerByPhone(
  userId: string,
  phone: string,
  options: PhoneLookupOptions = {},
): Promise<LightspeedCustomer | null> {
  const allowScan = options.allowScan ?? true;
  const maxScanPages = options.maxScanPages ?? 5;
  const queryPhone = phone.trim();
  if (!queryPhone) return null;

  const cached = getCachedPhoneCustomer(userId, queryPhone);
  if (cached) return cached;

  const fromFilter = await fetchCustomerByPhoneFilterFast(userId, queryPhone);
  if (fromFilter) {
    rememberPhoneCustomer(userId, queryPhone, fromFilter);
    return fromFilter;
  }

  if (allowScan) {
    const fromScan = await scanCustomersForPhone(userId, queryPhone, maxScanPages);
    if (fromScan) {
      rememberPhoneCustomer(userId, queryPhone, fromScan);
      return fromScan;
    }

    const recentCustomers = await fetchRecentCustomers(userId);
    const fromRecent = findCustomerInListByPhone(recentCustomers, queryPhone);
    if (fromRecent) {
      rememberPhoneCustomer(userId, queryPhone, fromRecent);
      return fromRecent;
    }

    const hydratedRecent = await hydrateCustomersMissingPhones(
      userId,
      recentCustomers,
      (customer) => customerPhones(customer).some((entry) => phonesMatch(queryPhone, entry)),
      40,
    );
    if (hydratedRecent) {
      rememberPhoneCustomer(userId, queryPhone, hydratedRecent);
      return hydratedRecent;
    }
  }

  return null;
}

function customerEmails(customer: LightspeedCustomer): string[] {
  return ensureArray(customer.Contact?.Emails?.ContactEmail)
    .map((email) => String(email.address ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/** Match a Gmail/Nest sender to a Lightspeed customer via paginated Customer.json + Contact. */
export async function findLightspeedCustomerForInquiry(
  userId: string,
  args: { senderEmail: string; senderName: string },
  options?: { maxScanPages?: number },
): Promise<LightspeedCustomer | null> {
  const maxScanPages = options?.maxScanPages ?? 100;
  const email = args.senderEmail.trim().toLowerCase();
  const name = args.senderName.trim();

  const phoneCandidates = Array.from(
    new Set(
      [args.senderEmail, args.senderName]
        .map((value) => value.trim())
        .filter((value) => isLikelyPhone(value)),
    ),
  );

  for (const candidate of phoneCandidates) {
    const byPhone = await findCustomerByPhone(userId, candidate, {
      allowScan: true,
      maxScanPages,
    });
    if (byPhone) return byPhone;
  }

  const phoneOnlyQuery =
    phoneCandidates.length > 0 &&
    (!email || phoneCandidates.some((candidate) => phonesMatch(candidate, email))) &&
    (!name || phoneCandidates.some((candidate) => phonesMatch(candidate, name)));

  if (phoneOnlyQuery) {
    return null;
  }

  const client = createLightspeedClient(userId);
  let best: { customer: LightspeedCustomer; score: number } | null = null;

  for (const archived of ["false", "true"] as const) {
    const batch = await client.getAllCustomersCursor(
      { load_relations: '["Contact"]', archived },
      { maxPages: maxScanPages, limit: 100 },
    );

    for (const customer of batch.customers) {
      let score = 0;

      if (email && customerEmails(customer).includes(email)) {
        score += 200;
      }

      if (name.length >= 2) {
        const fullName = customerName(customer).toLowerCase();
        const needle = name.toLowerCase();
        if (fullName === needle) score += 80;
        else if (fullName.includes(needle)) score += 40;
      }

      if (score <= 0) continue;
      if (score >= 200) return customer;
      if (!best || score > best.score) best = { customer, score };
    }

    if (best && best.score >= 200) break;
  }

  return best?.customer ?? null;
}

export type LightspeedLabLookupStep = {
  phase: string;
  matched: boolean;
  durationMs: number;
  pagesFetched?: number;
  hitPageLimit?: boolean;
  candidates?: number;
  note?: string;
  error?: string;
};

export async function lookupLightspeedCustomerForLab(
  userId: string,
  args: { phone?: string; email?: string; name?: string; maxScanPages?: number },
): Promise<{
  matched: boolean;
  customer: LightspeedCustomer | null;
  steps: LightspeedLabLookupStep[];
  lookupKeys: string[];
  normalizedPhone: string | null;
}> {
  const steps: LightspeedLabLookupStep[] = [];
  const maxScanPages = Math.min(Math.max(args.maxScanPages ?? 5, 1), 20);
  const phone = args.phone?.trim() ?? "";
  const email = args.email?.trim().toLowerCase() ?? "";
  const name = args.name?.trim() ?? "";
  const normalizedPhone = phone ? normalizeAustralianMobileLocal(phone) : null;
  let customer: LightspeedCustomer | null = null;

  if (phone && isLikelyPhone(phone)) {
    const cached = getCachedPhoneCustomer(userId, phone);
    if (cached) {
      customer = cached;
      steps.push({
        phase: "phone_cache",
        matched: true,
        durationMs: 0,
        note: "Returned from in-memory phone cache",
      });
    } else {
      const filterStarted = Date.now();
      try {
        customer = await fetchCustomerByPhoneFilterFast(userId, phone);
        steps.push({
          phase: "phone_filter",
          matched: Boolean(customer),
          durationMs: Date.now() - filterStarted,
          note: 'GET Customer.json?Contact.mobile=<local AU mobile> (1–2 requests max)',
        });
        if (customer) rememberPhoneCustomer(userId, phone, customer);
      } catch (error) {
        steps.push({
          phase: "phone_filter",
          matched: false,
          durationMs: Date.now() - filterStarted,
          error: error instanceof Error ? error.message : "Phone filter lookup failed.",
        });
      }

      if (!customer) {
        const scanStarted = Date.now();
        try {
          customer = await scanCustomersForPhone(userId, phone, maxScanPages);
          steps.push({
            phase: "phone_scan",
            matched: Boolean(customer),
            durationMs: Date.now() - scanStarted,
            note: "Paginated scan fallback only when Contact.mobile filter misses",
          });
          if (customer) rememberPhoneCustomer(userId, phone, customer);
        } catch (error) {
          steps.push({
            phase: "phone_scan",
            matched: false,
            durationMs: Date.now() - scanStarted,
            error: error instanceof Error ? error.message : "Phone scan failed.",
          });
        }
      }
    }
  }

  if (!customer && (email || name)) {
    const inquiryStarted = Date.now();
    try {
      customer = await findLightspeedCustomerForInquiry(
        userId,
        {
          senderEmail: email || phone || name,
          senderName: name || phone || email,
        },
        { maxScanPages },
      );
      steps.push({
        phase: "email_name_match",
        matched: Boolean(customer),
        durationMs: Date.now() - inquiryStarted,
        note: "Email/name scoring on paginated Customer.json scan",
      });
    } catch (error) {
      steps.push({
        phase: "email_name_match",
        matched: false,
        durationMs: Date.now() - inquiryStarted,
        error: error instanceof Error ? error.message : "Email/name lookup failed.",
      });
    }
  }

  return {
    matched: Boolean(customer),
    customer,
    steps,
    lookupKeys: phone ? phoneLookupKeys(phone) : [],
    normalizedPhone,
  };
}

export async function lookupCustomerFirstLastNameByPhone(
  userId: string,
  phone: string,
): Promise<{
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  customerId: string | null;
} | null> {
  const customer = await findCustomerByPhone(userId, phone, {
    allowScan: true,
    maxScanPages: 5,
  });
  if (!customer) return null;
  const firstName = customer.firstName ?? null;
  const lastName = customer.lastName ?? null;
  const displayName = customerName(customer);
  return {
    firstName,
    lastName,
    displayName,
    customerId: customer.customerID != null ? String(customer.customerID) : null,
  };
}

export function isLightspeedPhoneNameIndexWarm(userId: string): boolean {
  const cached = phoneIndexCache.get(userId);
  return Boolean(cached && cached.expiresAt > Date.now());
}

export function warmLightspeedPhoneNameIndex(
  userId: string,
  maxPages = DEFAULT_PHONE_INDEX_MAX_PAGES,
): void {
  if (isLightspeedPhoneNameIndexWarm(userId) || phoneIndexInflight.has(userId)) return;
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
  if (!customer) {
    rememberPhoneName(userId, trimmed, null, index);
    return null;
  }
  return rememberCustomerInPhoneIndex(userId, trimmed, customer, index);
}

export function isLikelyPhone(value: string): boolean {
  return phoneDigits(value).length >= 8;
}

export async function resolveRecentCustomerPhoneNames(
  userId: string,
  phones: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(phones.map((phone) => phone.trim()).filter(isLikelyPhone)));
  if (unique.length === 0) return new Map();

  const recentCustomers = await fetchRecentCustomers(userId);
  const matches = await findCustomersInListByPhones(userId, recentCustomers, unique);
  const resolved = new Map<string, string>();
  for (const [phone, customer] of matches) {
    resolved.set(phone, customerName(customer));
  }
  return resolved;
}

export async function resolveLightspeedNamesFromIndex(
  userId: string,
  phones: string[],
  index?: Map<string, string>,
  options?: { allowScan?: boolean; directLookupLimit?: number },
): Promise<Map<string, string>> {
  const allowScan = options?.allowScan ?? true;
  const directLookupLimit = options?.directLookupLimit ?? 12;
  const unique = Array.from(new Set(phones.map((phone) => phone.trim()).filter(isLikelyPhone)));
  const resolved = new Map<string, string>();
  if (unique.length === 0) return resolved;

  const phoneIndex = index ?? (await getLightspeedPhoneNameIndex(userId, { maxPages: DEFAULT_PHONE_INDEX_MAX_PAGES }));
  const misses: string[] = [];
  for (const phone of unique) {
    const name = lookupLightspeedNameInIndex(phoneIndex, phone);
    if (name) resolved.set(phone, name);
    else misses.push(phone);
  }

  if (misses.length === 0 || !allowScan) return resolved;

  const missesToLookup = misses.slice(0, directLookupLimit);

  try {
    const recentCustomers = await fetchRecentCustomers(userId);
    const fromRecent = await findCustomersInListByPhones(userId, recentCustomers, missesToLookup);
    for (const [phone, customer] of fromRecent) {
      const name = rememberCustomerInPhoneIndex(userId, phone, customer, phoneIndex);
      resolved.set(phone, name);
    }
  } catch (error) {
    console.error("[lightspeed] Recent customer phone batch lookup failed:", error);
  }

  for (const phone of missesToLookup) {
    if (resolved.has(phone)) continue;
    try {
      const name = await lookupLightspeedCustomerNameByPhone(userId, phone, {
        allowScan: true,
        maxScanPages: 40,
      });
      if (name) resolved.set(phone, name);
    } catch (error) {
      console.error("[lightspeed] Nest phone name lookup failed:", phone, error);
    }
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
  const maxPages = options.maxPages ?? DEFAULT_PHONE_INDEX_MAX_PAGES;
  const cached = phoneIndexCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.index;

  let inflight = phoneIndexInflight.get(userId);
  if (!inflight) {
    inflight = (async () => {
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

      try {
        const recentCustomers = await fetchRecentCustomers(userId);
        for (const customer of recentCustomers) {
          const name = customerName(customer);
          for (const phone of customerPhones(customer)) {
            for (const key of phoneLookupKeys(phone)) {
              if (!index.has(key)) index.set(key, name);
            }
          }
        }
      } catch {
        // Index is still usable without the recent-customer pass.
      }

      phoneIndexCache.set(userId, { expiresAt: Date.now() + PHONE_INDEX_TTL_MS, index });
      return index;
    })().finally(() => {
      phoneIndexInflight.delete(userId);
    });
    phoneIndexInflight.set(userId, inflight);
  }

  if (!options.timeoutMs || options.timeoutMs <= 0) {
    return inflight;
  }

  const timedOut = new Promise<Map<string, string>>((resolve) => {
    setTimeout(() => resolve(cached?.index ?? new Map()), options.timeoutMs);
  });

  return Promise.race([inflight, timedOut]);
}
