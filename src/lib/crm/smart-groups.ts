// Smart customer groups — recommended from real Lightspeed data, verified
// deterministically, refreshable on demand.
//
// Pipeline: aggregate scan (top brands/categories by distinct buyers via the
// validated SQL RPC + RFM cuts over crm_contacts) → candidate rules → exact
// verification through resolveAudience (same engine campaigns use, so a
// group's displayed count always equals its materialised membership) → LLM
// curation for naming/descriptions (deterministic fallback if the model is
// unavailable). Accepting a proposal stores the rules so the group can be
// re-materialised any time with refreshSmartGroup.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_AGENT_MODEL,
  extractOutputText,
  getCrmOpenAI,
  parseJsonFromModel,
} from "./agent/openai";
import { runCrmLightspeedSql } from "./agent/lightspeed-sql";
import { resolveAudience } from "./agent/resolve-audience";
import type {
  AudiencePreviewContact,
  AudienceRule,
} from "./agent/types";

export type SmartGroupProposal = {
  key: string;
  name: string;
  description: string;
  reason: string;
  rules: AudienceRule[];
  count: number;
  sample: AudiencePreviewContact[];
};

export type SmartGroupRefreshResult = {
  groupId: string;
  name: string;
  count: number;
  added: number;
  removed: number;
};

type Candidate = {
  key: string;
  defaultName: string;
  defaultDescription: string;
  dataHint: string;
  rules: AudienceRule[];
};

const MIN_GROUP_SIZE = 5;
const MAX_PROPOSALS = 8;
const PURCHASE_WINDOW_DAYS = 730;

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

type BuyerAggregate = { name: string; buyers: number };

function cleanAggregateRows(rows: Array<Record<string, unknown>> | undefined): BuyerAggregate[] {
  return (rows ?? [])
    .map((row) => ({
      name: String(row.name ?? "").trim(),
      buyers: Number(row.buyers ?? 0),
    }))
    .filter((row) => row.name && row.name.toLowerCase() !== "unknown" && row.buyers >= 10);
}

async function topBrandBuyers(userId: string): Promise<BuyerAggregate[]> {
  const result = await runCrmLightspeedSql(userId, {
    purpose: "Top brands by distinct buyers (last 2 years) for group recommendations",
    sql: `select i.brand_name as name, count(distinct s.customer_id) as buyers
from genie_lightspeed_sales_report_lines s
join genie_lightspeed_inventory i on i.item_id = s.item_id
where s.customer_id is not null and s.customer_id <> '0'
  and s.complete_time >= now() - interval '2 years'
  and i.brand_name is not null and i.brand_name <> ''
group by i.brand_name
order by buyers desc
limit 8`,
    limit: 8,
  });
  return result.status === "ok" ? cleanAggregateRows(result.rows) : [];
}

async function topCategoryBuyers(userId: string): Promise<BuyerAggregate[]> {
  const result = await runCrmLightspeedSql(userId, {
    purpose: "Top categories by distinct buyers (last 2 years) for group recommendations",
    sql: `select category as name, count(distinct customer_id) as buyers
from genie_lightspeed_sales_report_lines
where customer_id is not null and customer_id <> '0'
  and complete_time >= now() - interval '2 years'
  and category is not null and category <> ''
group by category
order by buyers desc
limit 10`,
    limit: 10,
  });
  return result.status === "ok" ? cleanAggregateRows(result.rows) : [];
}

/** 80th-percentile lifetime spend among subscribed spenders, rounded down to $50. */
async function bigSpenderThreshold(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { count } = await supabase
    .from("crm_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("opted_out", false)
    .gt("total_spend", 0);
  if (!count || count < 25) return null;

  const offset = Math.floor(count * 0.2);
  const { data } = await supabase
    .from("crm_contacts")
    .select("total_spend")
    .eq("user_id", userId)
    .eq("opted_out", false)
    .gt("total_spend", 0)
    .order("total_spend", { ascending: false })
    .range(offset, offset);
  const value = Number(data?.[0]?.total_spend ?? 0);
  if (!Number.isFinite(value) || value < 100) return null;
  return Math.max(100, Math.floor(value / 50) * 50);
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

function isServiceLike(name: string): boolean {
  return /service|workshop|labour|labor|repair/i.test(name);
}

async function buildCandidates(supabase: SupabaseClient, userId: string): Promise<Candidate[]> {
  const [brands, categories, spendThreshold] = await Promise.all([
    topBrandBuyers(userId),
    topCategoryBuyers(userId),
    bigSpenderThreshold(supabase, userId),
  ]);

  const candidates: Candidate[] = [
    {
      key: "vip",
      defaultName: "VIP customers",
      defaultDescription: "Your top 20% of customers by lifetime spend.",
      dataHint: "top 20% by lifetime spend",
      rules: [{ type: "high_value", value: null as unknown as undefined, label: "Top 20% by lifetime spend" }],
    },
    {
      key: "lapsed",
      defaultName: "Lapsed customers",
      defaultDescription: "Haven't purchased in over 6 months — prime win-back targets.",
      dataHint: "no purchase in 180+ days",
      rules: [{ type: "no_purchase_within_days", value: 180, label: "No purchase in 6+ months" }],
    },
    {
      key: "recent",
      defaultName: "Recently active",
      defaultDescription: "Purchased in the last 90 days — warmest audience for follow-ups.",
      dataHint: "purchased within 90 days",
      rules: [{ type: "last_purchase_within_days", value: 90, label: "Purchased in the last 90 days" }],
    },
    {
      key: "new",
      defaultName: "New customers",
      defaultDescription: "Joined in the last 90 days — welcome them properly.",
      dataHint: "joined within 90 days",
      rules: [{ type: "new_members", value: 90, label: "Joined in the last 90 days" }],
    },
    {
      key: "frequent",
      defaultName: "Frequent visitors",
      defaultDescription: "Five or more visits — your store regulars.",
      dataHint: "5+ visits",
      rules: [{ type: "min_visits", value: 5, label: "5+ store visits" }],
    },
    {
      key: "one_timers",
      defaultName: "One-time buyers",
      defaultDescription: "Bought exactly once — a nudge could earn a second visit.",
      dataHint: "exactly 1 visit",
      rules: [
        { type: "min_visits", value: 1, label: "At least 1 visit" },
        { type: "max_visits", value: 1, label: "No more than 1 visit" },
      ],
    },
  ];

  if (spendThreshold) {
    candidates.push({
      key: "big_spenders",
      defaultName: `$${spendThreshold.toLocaleString()}+ club`,
      defaultDescription: `Customers who've spent $${spendThreshold.toLocaleString()} or more with you.`,
      dataHint: `lifetime spend ≥ $${spendThreshold.toLocaleString()} (80th percentile)`,
      rules: [{ type: "min_spend", value: spendThreshold, label: `Spent $${spendThreshold.toLocaleString()}+ lifetime` }],
    });
  }

  for (const brand of brands.slice(0, 5)) {
    candidates.push({
      key: `brand:${brand.name.toLowerCase()}`,
      defaultName: `${brand.name} riders`,
      defaultDescription: `Bought ${brand.name} in the last 2 years.`,
      dataHint: `${brand.buyers.toLocaleString()} distinct ${brand.name} buyers in Lightspeed (2y)`,
      rules: [
        { type: "purchased_brand", value: brand.name, label: `Bought ${brand.name}` },
        { type: "last_purchase_within_days", value: PURCHASE_WINDOW_DAYS, label: "In the last 2 years" },
      ],
    });
  }

  for (const category of categories.slice(0, 5)) {
    const service = isServiceLike(category.name);
    candidates.push({
      key: `category:${category.name.toLowerCase()}`,
      defaultName: service ? "Workshop customers" : `${category.name} buyers`,
      defaultDescription: service
        ? "Had a service or repair with you in the last 2 years."
        : `Bought from ${category.name} in the last 2 years.`,
      dataHint: `${category.buyers.toLocaleString()} distinct buyers in "${category.name}" (2y)`,
      rules: [
        { type: "purchased_category", value: category.name, label: service ? "Had a service/repair" : `Bought ${category.name}` },
        { type: "last_purchase_within_days", value: PURCHASE_WINDOW_DAYS, label: "In the last 2 years" },
      ],
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// LLM curation
// ---------------------------------------------------------------------------

const CURATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selections"],
  properties: {
    selections: {
      type: "array",
      maxItems: MAX_PROPOSALS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "name", "description", "reason"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const CURATION_INSTRUCTIONS = `You curate customer groups for an Australian bike shop's email CRM.
You receive verified candidate groups (each with its EXACT current member count from the store's real data).
Select the most useful, diverse set (max ${MAX_PROPOSALS}) and write the shop-facing copy.

RULES:
- Australian English. No emoji.
- Only return keys from the candidates list. Never invent keys.
- Prefer a diverse mix: value tiers, lifecycle (new/lapsed/recent), and the strongest brand/category affinities.
- Skip near-duplicates (e.g. two overlapping categories) and tiny groups unless strategically valuable.
- name: short and punchy (≤30 chars), e.g. "Shimano riders", "VIP customers", "Workshop regulars".
- description: one plain line describing exactly who is in the group.
- reason: one line on why this group is worth emailing, grounded in the member count or data hint provided.`;

type CurationSelection = { key: string; name: string; description: string; reason: string };

async function curateWithLlm(
  storeName: string,
  verified: Array<Candidate & { count: number }>,
): Promise<CurationSelection[] | null> {
  try {
    const openai = getCrmOpenAI();
    const response = await openai.responses.create({
      model: CRM_AGENT_MODEL,
      instructions: CURATION_INSTRUCTIONS,
      text: {
        format: {
          type: "json_schema",
          name: "smart_group_curation",
          strict: true,
          schema: CURATION_SCHEMA,
        },
      },
      input: JSON.stringify({
        store_name: storeName,
        candidates: verified.map((candidate) => ({
          key: candidate.key,
          default_name: candidate.defaultName,
          member_count: candidate.count,
          data_hint: candidate.dataHint,
          rules: candidate.rules.map((rule) => rule.label ?? rule.type),
        })),
      }),
    });
    const parsed = parseJsonFromModel<{ selections: CurationSelection[] }>(extractOutputText(response));
    if (!parsed?.selections?.length) return null;
    const validKeys = new Set(verified.map((candidate) => candidate.key));
    const selections = parsed.selections.filter((selection) => validKeys.has(selection.key));
    return selections.length > 0 ? selections : null;
  } catch (error) {
    console.error("[crm] smart group curation failed, using defaults:", error);
    return null;
  }
}

function fallbackSelections(verified: Array<Candidate & { count: number }>): CurationSelection[] {
  // RFM staples first, then the biggest brand/category affinities.
  const staples = verified.filter((candidate) => !candidate.key.includes(":"));
  const affinities = verified
    .filter((candidate) => candidate.key.includes(":"))
    .sort((a, b) => b.count - a.count);
  return [...staples, ...affinities].slice(0, MAX_PROPOSALS).map((candidate) => ({
    key: candidate.key,
    name: candidate.defaultName,
    description: candidate.defaultDescription,
    reason: `${candidate.count.toLocaleString()} subscribed customers match right now (${candidate.dataHint}).`,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function recommendSmartGroups(
  supabase: SupabaseClient,
  userId: string,
  storeName: string,
): Promise<SmartGroupProposal[]> {
  const [candidates, existing] = await Promise.all([
    buildCandidates(supabase, userId),
    supabase
      .from("crm_contact_groups")
      .select("name")
      .eq("user_id", userId)
      .then(({ data }) => new Set((data ?? []).map((row) => String(row.name).toLowerCase()))),
  ]);

  // Verify every candidate with the same deterministic engine campaigns use —
  // the count shown IS the membership that materialises on accept.
  const verified: Array<Candidate & { count: number; sample: AudiencePreviewContact[] }> = [];
  for (const candidate of candidates) {
    if (existing.has(candidate.defaultName.toLowerCase())) continue;
    try {
      const resolution = await resolveAudience(supabase, userId, candidate.rules);
      if (resolution.count >= MIN_GROUP_SIZE) {
        verified.push({ ...candidate, count: resolution.count, sample: resolution.sample });
      }
    } catch (error) {
      console.error(`[crm] smart group candidate ${candidate.key} failed verification:`, error);
    }
  }
  if (verified.length === 0) return [];

  const selections =
    (await curateWithLlm(storeName, verified)) ?? fallbackSelections(verified);

  const byKey = new Map(verified.map((candidate) => [candidate.key, candidate]));
  const proposals: SmartGroupProposal[] = [];
  const usedNames = new Set<string>();
  for (const selection of selections) {
    const candidate = byKey.get(selection.key);
    if (!candidate) continue;
    const name = selection.name.trim().slice(0, 60) || candidate.defaultName;
    if (existing.has(name.toLowerCase()) || usedNames.has(name.toLowerCase())) continue;
    usedNames.add(name.toLowerCase());
    proposals.push({
      key: candidate.key,
      name,
      description: selection.description.trim() || candidate.defaultDescription,
      reason: selection.reason.trim(),
      rules: candidate.rules,
      count: candidate.count,
      sample: candidate.sample,
    });
    if (proposals.length >= MAX_PROPOSALS) break;
  }
  return proposals;
}

async function syncGroupMembers(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
  contactIds: string[],
): Promise<{ added: number; removed: number }> {
  const desired = new Set(contactIds);

  const current = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("crm_contact_group_members")
      .select("contact_id")
      .eq("user_id", userId)
      .eq("group_id", groupId)
      .range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) current.add(String(row.contact_id));
    if (!data || data.length < 1000) break;
  }

  const toAdd = contactIds.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  for (let i = 0; i < toRemove.length; i += 200) {
    const { error } = await supabase
      .from("crm_contact_group_members")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", groupId)
      .in("contact_id", toRemove.slice(i, i + 200));
    if (error) throw error;
  }

  for (let i = 0; i < toAdd.length; i += 500) {
    const rows = toAdd.slice(i, i + 500).map((contactId) => ({
      group_id: groupId,
      contact_id: contactId,
      user_id: userId,
    }));
    const { error } = await supabase
      .from("crm_contact_group_members")
      .upsert(rows, { onConflict: "group_id,contact_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  return { added: toAdd.length, removed: toRemove.length };
}

export async function createSmartGroup(
  supabase: SupabaseClient,
  userId: string,
  proposal: Pick<SmartGroupProposal, "name" | "description" | "reason" | "rules">,
): Promise<{ groupId: string; count: number }> {
  const resolution = await resolveAudience(supabase, userId, proposal.rules);

  const { data: group, error } = await supabase
    .from("crm_contact_groups")
    .upsert(
      {
        user_id: userId,
        name: proposal.name.trim(),
        description: proposal.description.trim() || null,
        reason: proposal.reason.trim() || null,
        rules: proposal.rules,
        is_smart: true,
        source: "ai",
        last_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name" },
    )
    .select("id")
    .single();
  if (error || !group) throw error ?? new Error("Failed to create group");

  await syncGroupMembers(supabase, userId, String(group.id), resolution.contactIds);
  return { groupId: String(group.id), count: resolution.count };
}

export async function refreshSmartGroup(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
): Promise<SmartGroupRefreshResult> {
  const { data: group, error } = await supabase
    .from("crm_contact_groups")
    .select("id, name, is_smart, rules")
    .eq("user_id", userId)
    .eq("id", groupId)
    .single();
  if (error || !group) throw new Error("Group not found");
  if (!group.is_smart || !Array.isArray(group.rules)) {
    throw new Error("Only smart groups can be refreshed — this group has no rules.");
  }

  const resolution = await resolveAudience(supabase, userId, group.rules as AudienceRule[]);
  const { added, removed } = await syncGroupMembers(supabase, userId, groupId, resolution.contactIds);

  await supabase
    .from("crm_contact_groups")
    .update({ last_refreshed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("user_id", userId);

  return {
    groupId,
    name: String(group.name),
    count: resolution.count,
    added,
    removed,
  };
}

export async function refreshAllSmartGroups(
  supabase: SupabaseClient,
  userId: string,
): Promise<SmartGroupRefreshResult[]> {
  const { data: groups, error } = await supabase
    .from("crm_contact_groups")
    .select("id")
    .eq("user_id", userId)
    .eq("is_smart", true)
    .order("name");
  if (error) throw error;

  const results: SmartGroupRefreshResult[] = [];
  for (const group of groups ?? []) {
    results.push(await refreshSmartGroup(supabase, userId, String(group.id)));
  }
  return results;
}
