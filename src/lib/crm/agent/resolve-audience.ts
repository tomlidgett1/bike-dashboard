// Step 2: Resolve audience from deterministic rules against CRM + Lightspeed sales data.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudienceRule, AudienceResolution, AudiencePreviewContact } from "./types";
import { contactToPreview } from "./types";
import type { CrmContact } from "../types";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "../postgrest-page";

const SAMPLE_SIZE = 8;
/** PostgREST max_rows is 1000 (supabase/config.toml) — never request more or
 *  pagination silently stops after the first capped page. */
const CONTACT_PAGE_SIZE = POSTGREST_PAGE_SIZE;
const ID_PAGE_SIZE = POSTGREST_PAGE_SIZE;

type ContactRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  opted_out: boolean;
  lightspeed_customer_id: string | null;
  lightspeed_joined_at: string | null;
  last_purchase_at: string | null;
  total_spend: number;
  sale_count: number;
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function ruleNumber(rule: AudienceRule, fallback: number): number {
  const n = Number(rule.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function purchaseSearchTerms(value: string | undefined): string[] {
  return String(value ?? "")
    .split(/\s+(?:or|and)\s+|[,|/;]/i)
    .map((term) => term.replace(/[%_(),]/g, "").trim())
    .filter(Boolean);
}

function isPurchaseIncludeRule(rule: AudienceRule): boolean {
  return (
    rule.type === "purchased_category" ||
    rule.type === "purchased_brand" ||
    rule.type === "purchased_keyword"
  );
}

function isPurchaseExcludeRule(rule: AudienceRule): boolean {
  return (
    rule.type === "not_purchased_category" ||
    rule.type === "not_purchased_brand" ||
    rule.type === "not_purchased_keyword"
  );
}

function isPurchaseHistoryRule(rule: AudienceRule): boolean {
  return isPurchaseIncludeRule(rule) || isPurchaseExcludeRule(rule);
}

async function fetchAllCrmContacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<ContactRow[]> {
  return fetchAllPostgrestPages({
    fetchPage: (from, to) =>
      supabase
        .from("crm_contacts")
        .select(
          "id, email, first_name, last_name, opted_out, lightspeed_customer_id, lightspeed_joined_at, last_purchase_at, total_spend, sale_count",
        )
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, to),
    pageSize: CONTACT_PAGE_SIZE,
  }) as Promise<ContactRow[]>;
}

async function customerIdsFromSalesFilter(
  supabase: SupabaseClient,
  userId: string,
  filter: { category?: string; brand?: string; keyword?: string; withinDays?: number },
): Promise<Set<string>> {
  const orClauses: string[] = [];
  for (const term of purchaseSearchTerms(filter.category)) {
    orClauses.push(`category.ilike.%${term}%`);
  }
  for (const term of purchaseSearchTerms(filter.brand)) {
    orClauses.push(`description.ilike.%${term}%`);
  }
  for (const term of purchaseSearchTerms(filter.keyword)) {
    orClauses.push(
      `description.ilike.%${term}%`,
      `sku.ilike.%${term}%`,
      `category.ilike.%${term}%`,
    );
  }

  const rows = await fetchAllPostgrestPages({
    fetchPage: (from, to) => {
      let query = supabase
        .from("lightspeed_sales_report_lines")
        .select("customer_id")
        .eq("user_id", userId)
        .not("complete_time", "is", null)
        .not("customer_id", "is", null)
        .neq("customer_id", "0")
        .order("id", { ascending: true })
        .range(from, to);

      if (filter.withinDays) {
        query = query.gte("complete_time", daysAgo(filter.withinDays).toISOString());
      }
      if (orClauses.length > 0) {
        query = query.or(orClauses.join(","));
      }
      return query;
    },
    pageSize: ID_PAGE_SIZE,
  });

  const ids = new Set<string>();
  for (const row of rows) {
    if (row.customer_id) ids.add(String(row.customer_id));
  }
  return ids;
}

async function contactIdsFromOpenedEmails(
  supabase: SupabaseClient,
  userId: string,
  withinDays?: number,
): Promise<Set<string>> {
  const rows = await fetchAllPostgrestPages({
    fetchPage: (from, to) => {
      let query = supabase
        .from("crm_campaign_recipients")
        .select("contact_id")
        .eq("user_id", userId)
        .not("opened_at", "is", null)
        // Order by primary key — contact_id alone is not unique across campaigns.
        .order("id", { ascending: true })
        .range(from, to);

      if (withinDays && withinDays > 0) {
        query = query.gte("opened_at", daysAgo(withinDays).toISOString());
      }
      return query;
    },
    pageSize: ID_PAGE_SIZE,
  });

  const ids = new Set<string>();
  for (const row of rows) {
    if (row.contact_id) ids.add(String(row.contact_id));
  }
  return ids;
}

function applyRules(
  contacts: ContactRow[],
  rules: AudienceRule[],
  onStep?: (rule: AudienceRule, remaining: number) => void,
): ContactRow[] {
  let result = [...contacts];

  for (const rule of rules) {
    switch (rule.type) {
      case "min_spend":
        result = result.filter((c) => Number(c.total_spend ?? 0) >= ruleNumber(rule, 100));
        break;
      case "max_spend":
        result = result.filter((c) => Number(c.total_spend ?? 0) <= ruleNumber(rule, 10000));
        break;
      case "min_visits":
        result = result.filter((c) => Number(c.sale_count ?? 0) >= ruleNumber(rule, 2));
        break;
      case "max_visits":
        result = result.filter((c) => Number(c.sale_count ?? 0) <= ruleNumber(rule, 100));
        break;
      case "joined_within_days": {
        const cutoff = daysAgo(ruleNumber(rule, 90));
        result = result.filter(
          (c) => c.lightspeed_joined_at && new Date(c.lightspeed_joined_at) >= cutoff,
        );
        break;
      }
      case "joined_before_days": {
        const cutoff = daysAgo(ruleNumber(rule, 365));
        result = result.filter(
          (c) => c.lightspeed_joined_at && new Date(c.lightspeed_joined_at) < cutoff,
        );
        break;
      }
      case "last_purchase_within_days": {
        const cutoff = daysAgo(ruleNumber(rule, 365));
        result = result.filter(
          (c) => c.last_purchase_at && new Date(c.last_purchase_at) >= cutoff,
        );
        break;
      }
      case "no_purchase_within_days": {
        const cutoff = daysAgo(ruleNumber(rule, 180));
        result = result.filter(
          (c) => !c.last_purchase_at || new Date(c.last_purchase_at) < cutoff,
        );
        break;
      }
      case "inactive_days":
      case "lapsed": {
        const days = rule.type === "lapsed" ? 180 : ruleNumber(rule, 180);
        const cutoff = daysAgo(days);
        result = result.filter(
          (c) => !c.last_purchase_at || new Date(c.last_purchase_at) < cutoff,
        );
        break;
      }
      case "new_members": {
        const cutoff = daysAgo(ruleNumber(rule, 90));
        result = result.filter(
          (c) => c.lightspeed_joined_at && new Date(c.lightspeed_joined_at) >= cutoff,
        );
        break;
      }
      case "high_value": {
        const spends = result.map((c) => Number(c.total_spend ?? 0)).sort((a, b) => b - a);
        const threshold = spends[Math.floor(spends.length * 0.2)] ?? ruleNumber(rule, 500);
        result = result.filter((c) => Number(c.total_spend ?? 0) >= threshold);
        break;
      }
      default:
        break;
    }
    onStep?.(rule, result.length);
  }

  return result;
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function resolveAudienceSort(rules: AudienceRule[]): AudienceResolution["sort"] {
  if (rules.some((rule) => rule.type === "new_members" || rule.type === "joined_within_days")) {
    return {
      label: "Newest matching customers first",
      fields: ["crm_contacts.lightspeed_joined_at DESC", "crm_contacts.total_spend DESC"],
    };
  }

  if (
    rules.some(
      (rule) =>
        rule.type === "lapsed" ||
        rule.type === "inactive_days" ||
        rule.type === "no_purchase_within_days",
    )
  ) {
    return {
      label: "Longest-lapsed matching customers first",
      fields: ["crm_contacts.last_purchase_at ASC NULLS FIRST", "crm_contacts.total_spend DESC"],
    };
  }

  if (
    rules.some(
      (rule) =>
        rule.type === "high_value" ||
        rule.type === "min_spend" ||
        rule.type === "purchased_category" ||
        rule.type === "purchased_brand" ||
        rule.type === "purchased_keyword",
    )
  ) {
    return {
      label: "Highest-value matching customers first",
      fields: ["crm_contacts.total_spend DESC", "crm_contacts.sale_count DESC"],
    };
  }

  if (rules.some((rule) => rule.type === "opened_email")) {
    return {
      label: "Most engaged matching customers first",
      fields: ["crm_contacts.sale_count DESC", "crm_contacts.total_spend DESC"],
    };
  }

  return {
    label: "Most engaged matching customers first",
    fields: ["crm_contacts.sale_count DESC", "crm_contacts.total_spend DESC"],
  };
}

function sortAudience(contacts: ContactRow[], sort: AudienceResolution["sort"]): ContactRow[] {
  const sorted = [...contacts];
  switch (sort?.label) {
    case "Newest matching customers first":
      return sorted.sort(
        (a, b) =>
          timeValue(b.lightspeed_joined_at) - timeValue(a.lightspeed_joined_at) ||
          Number(b.total_spend ?? 0) - Number(a.total_spend ?? 0),
      );
    case "Longest-lapsed matching customers first":
      return sorted.sort((a, b) => {
        const aTime = timeValue(a.last_purchase_at);
        const bTime = timeValue(b.last_purchase_at);
        if (aTime === 0 && bTime !== 0) return -1;
        if (bTime === 0 && aTime !== 0) return 1;
        return aTime - bTime || Number(b.total_spend ?? 0) - Number(a.total_spend ?? 0);
      });
    case "Highest-value matching customers first":
      return sorted.sort(
        (a, b) =>
          Number(b.total_spend ?? 0) - Number(a.total_spend ?? 0) ||
          Number(b.sale_count ?? 0) - Number(a.sale_count ?? 0),
      );
    default:
      return sorted.sort(
        (a, b) =>
          Number(b.sale_count ?? 0) - Number(a.sale_count ?? 0) ||
          Number(b.total_spend ?? 0) - Number(a.total_spend ?? 0),
      );
  }
}

export async function resolveAudience(
  supabase: SupabaseClient,
  userId: string,
  rules: AudienceRule[],
  maxRecipients?: number | null,
): Promise<AudienceResolution> {
  const built = await buildEligibleAudience(supabase, userId, rules, maxRecipients);

  const sample: AudiencePreviewContact[] = built.selected
    .slice(0, SAMPLE_SIZE)
    .map((c) => contactRowToPreview(c));

  return {
    contactIds: built.selected.map((c) => c.id),
    count: built.selected.length,
    sample,
    rules: built.rules,
    excludedOptedOut: built.excludedOptedOut,
    sort: built.sort,
    funnel: built.funnel,
  };
}

export type EligibleAudienceBuild = {
  selected: ContactRow[];
  rules: AudienceRule[];
  purchaseRules: AudienceRule[];
  excludedOptedOut: number;
  sort: AudienceResolution["sort"];
  funnel: NonNullable<AudienceResolution["funnel"]>;
};

export async function buildEligibleAudience(
  supabase: SupabaseClient,
  userId: string,
  rules: AudienceRule[],
  maxRecipients?: number | null,
): Promise<EligibleAudienceBuild> {
  const funnel: NonNullable<AudienceResolution["funnel"]> = [];
  const purchaseRules = rules.filter(isPurchaseIncludeRule);
  const excludedPurchaseRules = rules.filter(isPurchaseExcludeRule);
  const hasPurchaseHistoryRules = rules.some(isPurchaseHistoryRule);
  const withinRule = rules.find((r) => r.type === "last_purchase_within_days");
  const withinDays = withinRule ? ruleNumber(withinRule, 1825) : undefined;

  let purchaseCustomerIds: Set<string> | null = null;
  for (const rule of purchaseRules) {
    const ids = await customerIdsFromSalesFilter(supabase, userId, {
      category: rule.type === "purchased_category" ? String(rule.value ?? "") : undefined,
      brand: rule.type === "purchased_brand" ? String(rule.value ?? "") : undefined,
      keyword: rule.type === "purchased_keyword" ? String(rule.value ?? "") : undefined,
      withinDays,
    });

    purchaseCustomerIds = purchaseCustomerIds
      ? new Set([...purchaseCustomerIds].filter((id: string) => ids.has(id)))
      : ids;
  }

  let excludedPurchaseCustomerIds: Set<string> | null = null;
  for (const rule of excludedPurchaseRules) {
    const ids = await customerIdsFromSalesFilter(supabase, userId, {
      category: rule.type === "not_purchased_category" ? String(rule.value ?? "") : undefined,
      brand: rule.type === "not_purchased_brand" ? String(rule.value ?? "") : undefined,
      keyword: rule.type === "not_purchased_keyword" ? String(rule.value ?? "") : undefined,
      withinDays,
    });

    excludedPurchaseCustomerIds = excludedPurchaseCustomerIds
      ? new Set([...excludedPurchaseCustomerIds, ...ids])
      : ids;
  }

  const rows = await fetchAllCrmContacts(supabase, userId);
  funnel.push({ label: "All contacts", count: rows.length });
  let excludedOptedOut = 0;
  let eligible = rows.filter((c) => {
    if (c.opted_out) {
      excludedOptedOut++;
      return false;
    }
    return true;
  });
  funnel.push({
    label: "Subscribed (not opted out)",
    detail: excludedOptedOut > 0 ? `${excludedOptedOut.toLocaleString()} opted out excluded` : undefined,
    count: eligible.length,
  });

  const openedRules = rules.filter((r) => r.type === "opened_email");
  if (openedRules.length > 0) {
    // Tightest window wins when multiple opened_email rules are combined.
    const windows = openedRules
      .map((rule) => {
        const n = Number(rule.value);
        return Number.isFinite(n) && n > 0 ? n : null;
      })
      .filter((n): n is number => n != null);
    const withinDays = windows.length > 0 ? Math.min(...windows) : undefined;
    const openedContactIds = await contactIdsFromOpenedEmails(supabase, userId, withinDays);
    eligible = eligible.filter((c) => openedContactIds.has(c.id));
    funnel.push({
      label:
        openedRules.map((r) => r.label || "Opened a campaign email").join(" + ") ||
        "Opened a campaign email",
      detail: withinDays
        ? `${openedContactIds.size.toLocaleString()} contacts opened email in the last ${withinDays} days`
        : `${openedContactIds.size.toLocaleString()} contacts have opened at least one campaign email`,
      count: eligible.length,
    });
  }

  if (purchaseCustomerIds) {
    eligible = eligible.filter(
      (c) => c.lightspeed_customer_id && purchaseCustomerIds!.has(String(c.lightspeed_customer_id)),
    );
    funnel.push({
      label: purchaseRules.map((r) => r.label || `${r.type}: ${r.value ?? ""}`).join(" + ") || "Purchase history match",
      detail: `${purchaseCustomerIds.size.toLocaleString()} matching Lightspeed customer IDs in sales history`,
      count: eligible.length,
    });
  }

  if (excludedPurchaseCustomerIds) {
    eligible = eligible.filter(
      (c) =>
        !c.lightspeed_customer_id ||
        !excludedPurchaseCustomerIds!.has(String(c.lightspeed_customer_id)),
    );
    funnel.push({
      label:
        excludedPurchaseRules
          .map((r) => r.label || `${r.type}: ${r.value ?? ""}`)
          .join(" + ") || "Excluded purchase history",
      detail: `${excludedPurchaseCustomerIds.size.toLocaleString()} matching Lightspeed customer IDs excluded`,
      count: eligible.length,
    });
  }

  const nonPurchaseRules = rules.filter(
    (r) =>
      r.type !== "opened_email" &&
      !isPurchaseHistoryRule(r) &&
      !(hasPurchaseHistoryRules && r.type === "last_purchase_within_days"),
  );
  eligible = applyRules(eligible, nonPurchaseRules, (rule, remaining) => {
    funnel.push({
      label: rule.label || rule.type.replaceAll("_", " "),
      detail: rule.value != null && rule.value !== "" ? `value: ${String(rule.value)}` : undefined,
      count: remaining,
    });
  });

  const sort = resolveAudienceSort(rules);
  eligible = sortAudience(eligible, sort);

  const selected =
    maxRecipients && maxRecipients > 0 ? eligible.slice(0, maxRecipients) : eligible;
  if (maxRecipients && maxRecipients > 0 && selected.length < eligible.length) {
    funnel.push({
      label: `Capped at ${maxRecipients.toLocaleString()} recipients`,
      detail: sort?.label,
      count: selected.length,
    });
  }

  // Sample MUST come from the capped selection — sampling the uncapped pool
  // makes the specs sheet show contacts who won't actually receive the email.
  return {
    selected,
    rules,
    purchaseRules,
    excludedOptedOut,
    sort,
    funnel,
  };
}

function contactRowToPreview(c: ContactRow): AudiencePreviewContact {
  return contactToPreview({
    ...c,
    phone: null,
    lightspeed_customer_id: c.lightspeed_customer_id,
    source: "lightspeed",
    opted_out: false,
    opted_out_at: null,
    opt_out_reason: null,
    enriched_at: null,
    created_at: "",
    updated_at: "",
  } as CrmContact);
}
