import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAud } from "../types";
import { buildEligibleAudience } from "./resolve-audience";
import type { AudienceMemberWithReason, AudienceRule } from "./types";

type MatchingPurchase = {
  description: string;
  complete_time: string;
  category: string | null;
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

function isPurchaseHistoryRule(rule: AudienceRule): boolean {
  return (
    rule.type === "purchased_category" ||
    rule.type === "purchased_brand" ||
    rule.type === "purchased_keyword" ||
    rule.type === "not_purchased_category" ||
    rule.type === "not_purchased_brand" ||
    rule.type === "not_purchased_keyword"
  );
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function sanitiseTerm(value: string): string {
  return value.replace(/[%_]/g, "").trim();
}

function lineMatchesPurchaseRules(
  line: { description: string | null; category: string | null; sku: string | null },
  rules: AudienceRule[],
): boolean {
  const description = String(line.description ?? "").toLowerCase();
  const category = String(line.category ?? "").toLowerCase();
  const sku = String(line.sku ?? "").toLowerCase();

  return rules.some((rule) => {
    const raw = String(rule.value ?? "").trim();
    if (!raw) return false;
    const term = sanitiseTerm(raw).toLowerCase();
    if (!term) return false;

    switch (rule.type) {
      case "purchased_category":
        return category.includes(term);
      case "purchased_brand":
        return description.includes(term);
      case "purchased_keyword":
        return description.includes(term) || sku.includes(term) || category.includes(term);
      case "not_purchased_category":
      case "not_purchased_brand":
      case "not_purchased_keyword":
        return false;
      default:
        return false;
    }
  });
}

async function fetchLatestMatchingPurchases(
  supabase: SupabaseClient,
  userId: string,
  customerIds: string[],
  purchaseRules: AudienceRule[],
  allRules: AudienceRule[],
): Promise<Map<string, MatchingPurchase>> {
  const matches = new Map<string, MatchingPurchase>();
  if (customerIds.length === 0 || purchaseRules.length === 0) return matches;

  const withinRule = allRules.find((rule) => rule.type === "last_purchase_within_days");
  const withinDays = withinRule ? ruleNumber(withinRule, 1825) : undefined;
  const cutoff = withinDays ? daysAgo(withinDays).toISOString() : null;

  for (let offset = 0; offset < customerIds.length; offset += 100) {
    const batch = customerIds.slice(offset, offset + 100);
    let query = supabase
      .from("lightspeed_sales_report_lines")
      .select("customer_id, description, category, sku, complete_time")
      .eq("user_id", userId)
      .in("customer_id", batch)
      .not("complete_time", "is", null)
      .order("complete_time", { ascending: false })
      .limit(400);

    if (cutoff) {
      query = query.gte("complete_time", cutoff);
    }

    const { data, error } = await query;
    if (error) throw error;

    for (const row of data ?? []) {
      const customerId = String(row.customer_id ?? "");
      if (!customerId || matches.has(customerId)) continue;
      if (
        !lineMatchesPurchaseRules(
          {
            description: row.description ? String(row.description) : null,
            category: row.category ? String(row.category) : null,
            sku: row.sku ? String(row.sku) : null,
          },
          purchaseRules,
        )
      ) {
        continue;
      }

      matches.set(customerId, {
        description: String(row.description ?? "purchase").trim() || "purchase",
        complete_time: String(row.complete_time),
        category: row.category ? String(row.category) : null,
      });
    }
  }

  return matches;
}

function buildInclusionReason(
  contact: {
    total_spend: number;
    sale_count: number;
    last_purchase_at: string | null;
    lightspeed_joined_at: string | null;
  },
  rules: AudienceRule[],
  purchaseRules: AudienceRule[],
  matchingPurchase: MatchingPurchase | null,
): string {
  const reasons: string[] = [];
  const hasPurchaseHistoryRules = rules.some(isPurchaseHistoryRule);
  const purchaseWindowRule = rules.find((rule) => rule.type === "last_purchase_within_days");
  const purchaseWindowDays = purchaseWindowRule ? ruleNumber(purchaseWindowRule, 1825) : null;

  if (purchaseRules.length > 0) {
    const purchaseLabel =
      purchaseRules
        .map((rule) => rule.label?.trim() || String(rule.value ?? "").trim())
        .filter(Boolean)
        .join(", ") || "Matching purchase history";

    if (matchingPurchase) {
      const when = formatShortDate(matchingPurchase.complete_time);
      reasons.push(
        when
          ? `Purchased ${matchingPurchase.description} on ${when}`
          : `Purchased ${matchingPurchase.description}`,
      );
    } else {
      reasons.push(purchaseLabel);
    }
  }

  for (const rule of rules) {
    switch (rule.type) {
      case "last_purchase_within_days": {
        if (hasPurchaseHistoryRules) break;
        const when = formatShortDate(contact.last_purchase_at);
        if (when) {
          reasons.push(`Last purchase on ${when}`);
        }
        break;
      }
      case "not_purchased_category":
      case "not_purchased_brand":
      case "not_purchased_keyword": {
        const label =
          rule.label?.trim() ||
          `No ${String(rule.value ?? "matching").trim()} purchase${
            purchaseWindowDays ? ` in the last ${purchaseWindowDays} days` : ""
          }`;
        reasons.push(label);
        break;
      }
      case "no_purchase_within_days":
      case "inactive_days":
      case "lapsed": {
        const when = formatShortDate(contact.last_purchase_at);
        if (when) {
          reasons.push(`No purchase since ${when}`);
        } else {
          reasons.push("No recent purchase on record");
        }
        break;
      }
      case "min_spend":
        reasons.push(`Lifetime spend ${formatAud(contact.total_spend)}`);
        break;
      case "min_visits":
        reasons.push(`${contact.sale_count} store visit${contact.sale_count === 1 ? "" : "s"}`);
        break;
      case "new_members":
      case "joined_within_days": {
        const when = formatShortDate(contact.lightspeed_joined_at);
        if (when) reasons.push(`Joined on ${when}`);
        break;
      }
      case "high_value":
        reasons.push(`High-value customer (${formatAud(contact.total_spend)} lifetime)`);
        break;
      default:
        break;
    }
  }

  const unique = [...new Set(reasons.filter(Boolean))];
  if (unique.length === 0) {
    return rules.length === 0 ? "Subscribed contact" : "Matches all audience rules";
  }

  return unique.slice(0, 3).join(" · ");
}

function contactRowToMember(
  contact: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    total_spend: number;
    sale_count: number;
    last_purchase_at: string | null;
    lightspeed_joined_at: string | null;
    lightspeed_customer_id: string | null;
  },
  rules: AudienceRule[],
  purchaseRules: AudienceRule[],
  purchaseByCustomerId: Map<string, MatchingPurchase>,
): AudienceMemberWithReason {
  const matchingPurchase = contact.lightspeed_customer_id
    ? (purchaseByCustomerId.get(String(contact.lightspeed_customer_id)) ?? null)
    : null;

  return {
    id: contact.id,
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    total_spend: contact.total_spend,
    sale_count: contact.sale_count,
    last_purchase_at: contact.last_purchase_at,
    lightspeed_joined_at: contact.lightspeed_joined_at,
    reason: buildInclusionReason(contact, rules, purchaseRules, matchingPurchase),
  };
}

export async function fetchAudienceMembersPage(
  supabase: SupabaseClient,
  userId: string,
  rules: AudienceRule[],
  options: {
    maxRecipients?: number | null;
    offset?: number;
    limit?: number;
  } = {},
): Promise<{ total: number; members: AudienceMemberWithReason[] }> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  const built = await buildEligibleAudience(supabase, userId, rules, options.maxRecipients ?? null);
  const total = built.selected.length;
  const page = built.selected.slice(offset, offset + limit);

  const customerIds = page
    .map((contact) => contact.lightspeed_customer_id)
    .filter((value): value is string => Boolean(value));

  const purchaseByCustomerId = await fetchLatestMatchingPurchases(
    supabase,
    userId,
    customerIds,
    built.purchaseRules,
    built.rules,
  );

  return {
    total,
    members: page.map((contact) =>
      contactRowToMember(contact, built.rules, built.purchaseRules, purchaseByCustomerId),
    ),
  };
}
