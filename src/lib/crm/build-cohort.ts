// Natural-language cohort builder for CRM smart groups.
//
// Pipeline: prompt → deterministic shortcuts OR LLM parse → validate rules →
// resolveAudience (exact subscribed count) → preview. Creation is a separate
// confirm step so the owner always sees the real member count first.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_AGENT_MODEL,
  extractOutputText,
  getCrmOpenAI,
  parseJsonFromModel,
} from "./agent/openai";
import { resolveAudience } from "./agent/resolve-audience";
import type { AudiencePreviewContact, AudienceRule, AudienceRuleType } from "./agent/types";
import { createSmartGroup } from "./smart-groups";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "./postgrest-page";

const VALID_RULE_TYPES = new Set<AudienceRuleType>([
  "min_spend",
  "max_spend",
  "min_visits",
  "max_visits",
  "joined_within_days",
  "joined_before_days",
  "last_purchase_within_days",
  "no_purchase_within_days",
  "inactive_days",
  "purchased_category",
  "purchased_brand",
  "purchased_keyword",
  "not_purchased_category",
  "not_purchased_brand",
  "not_purchased_keyword",
  "lapsed",
  "new_members",
  "high_value",
  "opened_email",
]);

const MAX_PROMPT_LENGTH = 280;
const MIN_PROMPT_LENGTH = 2;

export type CohortBuildPreview = {
  name: string;
  description: string;
  reason: string;
  rules: AudienceRule[];
  count: number;
  sample: AudiencePreviewContact[];
  source: "shortcut" | "ai";
  clarification?: string | null;
};

export type CohortBuildResult =
  | { status: "preview"; preview: CohortBuildPreview }
  | { status: "created"; groupId: string; name: string; count: number }
  | { status: "error"; error: string; code?: "empty" | "ambiguous" | "zero" | "duplicate" | "invalid" };

const RULE_TYPE_ENUM = [
  "min_spend",
  "max_spend",
  "min_visits",
  "max_visits",
  "joined_within_days",
  "joined_before_days",
  "last_purchase_within_days",
  "no_purchase_within_days",
  "inactive_days",
  "purchased_category",
  "purchased_brand",
  "purchased_keyword",
  "not_purchased_category",
  "not_purchased_brand",
  "not_purchased_keyword",
  "lapsed",
  "new_members",
  "high_value",
  "opened_email",
] as const;

const COHORT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "reason", "audience_rules", "clarification"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    reason: { type: "string" },
    clarification: { type: ["string", "null"] },
    audience_rules: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "value", "label"],
        properties: {
          type: {
            type: "string",
            enum: RULE_TYPE_ENUM,
          },
          value: { type: ["string", "number", "null"] },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

const COHORT_PARSER_INSTRUCTIONS = `You turn a bike shop owner's natural-language cohort request into a smart CRM group definition.

The shop is Australian. Write in Australian English. No emoji.

Output:
- name: short punchy group name (≤32 chars), title case where natural (e.g. "Engaged openers", "Shimano riders", "Lapsed 6+ months").
- description: one plain line describing exactly who is in the group.
- reason: one line on why this cohort is useful to email.
- audience_rules: 1–6 deterministic filters the database can apply. Rules AND together. Never invent contact IDs or emails.
- clarification: null when the request is clear enough; otherwise a short question the owner should answer (still also return your best-guess rules).

Rule types (use only these):
- min_spend / max_spend (AUD lifetime)
- min_visits / max_visits (sale_count)
- joined_within_days / joined_before_days / new_members (new_members default 90)
- last_purchase_within_days / no_purchase_within_days / inactive_days / lapsed (lapsed = 180 days)
- purchased_category / purchased_brand / purchased_keyword
- not_purchased_category / not_purchased_brand / not_purchased_keyword
- high_value (top 20% spend of matched set; value null)
- opened_email (opened a campaign email; value null = ever, or N days)

Guidance:
- "engaged", "open my emails", "people who open" → opened_email (value null).
- "VIP", "best customers", "top spenders" → high_value.
- "lapsed", "haven't been in", "haven't bought in ages" → no_purchase_within_days 180 or lapsed.
- "new customers" / "just joined" → new_members 90.
- "bought Muc-Off" → purchased_brand + last_purchase_within_days 730 unless they specify another window.
- "haven't bought a service recently" → not_purchased_keyword for the service name(s) + last_purchase_within_days for the window.
- Opted-out contacts are ALWAYS excluded automatically — do not add a rule for that.
- Prefer the fewest rules that faithfully match the request.
- For rules without a numeric value (lapsed, high_value, opened_email ever), set value to null.`;

type ModelCohortOutput = {
  name: string;
  description: string;
  reason: string;
  clarification: string | null;
  audience_rules: AudienceRule[];
};

function normalisePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_LENGTH);
}

function sanitiseRules(rules: AudienceRule[]): AudienceRule[] {
  const cleaned: AudienceRule[] = [];
  for (const rule of rules ?? []) {
    const type = String(rule?.type ?? "").trim() as AudienceRuleType;
    if (!VALID_RULE_TYPES.has(type)) continue;
    const label = String(rule.label ?? type.replaceAll("_", " ")).trim().slice(0, 120);
    let value: string | number | undefined = undefined;
    if (rule.value === null || rule.value === undefined || rule.value === "") {
      value = undefined;
    } else if (typeof rule.value === "number" && Number.isFinite(rule.value)) {
      value = rule.value;
    } else {
      const asNumber = Number(rule.value);
      if (typeof rule.value === "string" && rule.value.trim() !== "" && Number.isFinite(asNumber) && !/[a-z]/i.test(rule.value)) {
        value = asNumber;
      } else {
        value = String(rule.value).trim().slice(0, 80);
      }
    }
    cleaned.push({ type, value, label: label || type });
  }
  return cleaned.slice(0, 6);
}

function uniqueName(base: string, existingNames: Set<string>): string {
  const trimmed = base.trim().slice(0, 48) || "Custom group";
  if (!existingNames.has(trimmed.toLowerCase())) return trimmed;
  for (let i = 2; i <= 20; i++) {
    const candidate = `${trimmed} (${i})`;
    if (!existingNames.has(candidate.toLowerCase())) return candidate;
  }
  return `${trimmed} ${Date.now().toString(36).slice(-4)}`;
}

type Shortcut = {
  test: (prompt: string) => boolean;
  build: () => Omit<CohortBuildPreview, "count" | "sample" | "source">;
};

const SHORTCUTS: Shortcut[] = [
  {
    test: (p) =>
      /\b(engaged|openers?|open(ed|s)?\s+(my\s+)?(emails?|campaigns?)|email\s+openers?|people\s+who\s+open)\b/i.test(
        p,
      ) && !/\b(haven'?t|never|not)\s+open/i.test(p),
    build: () => ({
      name: "Engaged openers",
      description: "Still subscribed and have opened at least one of your campaign emails.",
      reason: "Your warmest email audience: people who still get mail and actually open it.",
      rules: [{ type: "opened_email", value: undefined, label: "Opened a campaign email" }],
      clarification: null,
    }),
  },
  {
    test: (p) => /\b(vip|high[- ]?value|best customers|top spenders?|whales?)\b/i.test(p),
    build: () => ({
      name: "VIP customers",
      description: "Your top 20% of customers by lifetime spend.",
      reason: "Highest-value customers: protect them with exclusive offers and early access.",
      rules: [{ type: "high_value", value: undefined, label: "Top 20% by lifetime spend" }],
      clarification: null,
    }),
  },
  {
    test: (p) =>
      /\b(lapsed|win[- ]?back|haven'?t\s+(bought|purchased|visited|been)|inactive|dormant)\b/i.test(p) &&
      !/\b(open|email)\b/i.test(p),
    build: () => ({
      name: "Lapsed customers",
      description: "Haven't purchased in over 6 months: prime win-back targets.",
      reason: "A thoughtful nudge can bring quiet customers back through the door.",
      rules: [{ type: "no_purchase_within_days", value: 180, label: "No purchase in 6+ months" }],
      clarification: null,
    }),
  },
  {
    test: (p) => /\b(new customers?|new members?|just joined|recently joined|welcome)\b/i.test(p),
    build: () => ({
      name: "New customers",
      description: "Joined in the last 90 days: welcome them properly.",
      reason: "First impressions matter: onboard them while the relationship is fresh.",
      rules: [{ type: "new_members", value: 90, label: "Joined in the last 90 days" }],
      clarification: null,
    }),
  },
  {
    test: (p) =>
      /\b(recent(ly)?\s+active|bought\s+recently|purchased\s+recently|last\s+90\s+days|warm\s+audience)\b/i.test(
        p,
      ),
    build: () => ({
      name: "Recently active",
      description: "Purchased in the last 90 days: warmest audience for follow-ups.",
      reason: "Still in buying mode: ideal for accessories, services, and next-bike nudges.",
      rules: [{ type: "last_purchase_within_days", value: 90, label: "Purchased in the last 90 days" }],
      clarification: null,
    }),
  },
  {
    test: (p) => /\b(frequent|regulars?|loyal|repeat|5\+?\s+visits?)\b/i.test(p),
    build: () => ({
      name: "Frequent visitors",
      description: "Five or more visits: your store regulars.",
      reason: "Store regulars who already trust you: great for events and loyalty offers.",
      rules: [{ type: "min_visits", value: 5, label: "5+ store visits" }],
      clarification: null,
    }),
  },
  {
    test: (p) => /\b(one[- ]time|single\s+purchase|bought\s+once|first[- ]time\s+only)\b/i.test(p),
    build: () => ({
      name: "One-time buyers",
      description: "Bought exactly once: a nudge could earn a second visit.",
      reason: "Convert one-time buyers into regulars with a timely follow-up.",
      rules: [
        { type: "min_visits", value: 1, label: "At least 1 visit" },
        { type: "max_visits", value: 1, label: "No more than 1 visit" },
      ],
      clarification: null,
    }),
  },
];

function matchShortcut(prompt: string): ReturnType<Shortcut["build"]> | null {
  for (const shortcut of SHORTCUTS) {
    if (shortcut.test(prompt)) return shortcut.build();
  }
  return null;
}

/** Lightweight brand/category purchase pattern: "bought Trek", "Shimano customers", "gravel buyers". */
function matchPurchaseShortcut(prompt: string): ReturnType<Shortcut["build"]> | null {
  const bought =
    prompt.match(/\b(?:bought|purchased|buyers?\s+of|customers?\s+who\s+bought)\s+([A-Za-z0-9][\w &/+-]{1,40})\b/i) ??
    prompt.match(/\b([A-Za-z][\w &/+-]{1,30})\s+(?:riders?|buyers?|customers?|owners?)\b/i);
  if (!bought?.[1]) return null;
  const term = bought[1].replace(/\s+(in|the|last|past|who|that|customers?|buyers?)$/i, "").trim();
  if (!term || term.length < 2) return null;
  if (/^(vip|new|all|my|the|our|email|engaged|lapsed|recent)$/i.test(term)) return null;

  const looksLikeBrand = /^[A-Z0-9]/.test(term) || /^(trek|specialized|cannondale|giant|cervelo|shimano|sram|muc-?off|park\s*tool|wahoo|garmin|rapha|castelli|pearl\s*izumi)$/i.test(term);
  const ruleType: AudienceRuleType = looksLikeBrand ? "purchased_brand" : "purchased_keyword";
  const title = term
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    name: `${title} ${looksLikeBrand ? "riders" : "buyers"}`.slice(0, 32),
    description: `Bought ${title} in the last 2 years.`,
    reason: `Affinity segment for ${title}: strong for related products and service offers.`,
    rules: [
      { type: ruleType, value: term, label: `Bought ${title}` },
      { type: "last_purchase_within_days", value: 730, label: "In the last 2 years" },
    ],
    clarification: null,
  };
}

async function parseWithLlm(prompt: string, storeName: string): Promise<ModelCohortOutput> {
  const openai = getCrmOpenAI();
  const response = await openai.responses.create({
    model: CRM_AGENT_MODEL,
    instructions: COHORT_PARSER_INSTRUCTIONS,
    text: {
      format: {
        type: "json_schema",
        name: "crm_cohort_build",
        strict: true,
        schema: COHORT_JSON_SCHEMA,
      },
    },
    input: JSON.stringify({
      store_name: storeName,
      prompt,
    }),
  });

  const parsed = parseJsonFromModel<ModelCohortOutput>(extractOutputText(response));
  if (!parsed) throw new Error("Could not understand that cohort request");
  return parsed;
}

async function loadExistingGroups(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<{ name: string; rules: AudienceRule[] | null }>> {
  const data = await fetchAllPostgrestPages({
    fetchPage: (from, to) =>
      supabase
        .from("crm_contact_groups")
        .select("name, rules")
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, to),
    pageSize: POSTGREST_PAGE_SIZE,
  });
  return data.map((row) => ({
    name: String(row.name),
    rules: Array.isArray(row.rules) ? (row.rules as AudienceRule[]) : null,
  }));
}

function rulesSignature(rules: AudienceRule[]): string {
  return rules
    .map((rule) => `${rule.type}:${rule.value ?? ""}`)
    .sort()
    .join("|");
}

function findDuplicateGroup(
  existing: Array<{ name: string; rules: AudienceRule[] | null }>,
  rules: AudienceRule[],
): string | null {
  const signature = rulesSignature(rules);
  for (const group of existing) {
    if (!group.rules?.length) continue;
    if (rulesSignature(group.rules) === signature) return group.name;
  }
  return null;
}

export async function previewCohortFromPrompt(
  supabase: SupabaseClient,
  userId: string,
  rawPrompt: string,
  storeName: string,
): Promise<CohortBuildResult> {
  const prompt = normalisePrompt(rawPrompt);
  if (prompt.length < MIN_PROMPT_LENGTH) {
    return { status: "error", error: "Type a cohort to build, e.g. “people who open my emails”.", code: "empty" };
  }

  const shortcut = matchShortcut(prompt) ?? matchPurchaseShortcut(prompt);
  let draft: Omit<CohortBuildPreview, "count" | "sample" | "source"> & { source: "shortcut" | "ai" };

  if (shortcut) {
    draft = { ...shortcut, source: "shortcut" };
  } else {
    try {
      const parsed = await parseWithLlm(prompt, storeName);
      const rules = sanitiseRules(parsed.audience_rules ?? []);
      if (rules.length === 0) {
        return {
          status: "error",
          error: "I couldn't turn that into a filterable group. Try something like “bought Trek” or “lapsed customers”.",
          code: "invalid",
        };
      }
      draft = {
        name: String(parsed.name ?? "").trim() || "Custom group",
        description: String(parsed.description ?? "").trim(),
        reason: String(parsed.reason ?? "").trim(),
        rules,
        clarification: parsed.clarification ? String(parsed.clarification).trim() : null,
        source: "ai",
      };
    } catch (error) {
      console.error("[crm] cohort parse failed:", error);
      return {
        status: "error",
        error: error instanceof Error ? error.message : "Failed to understand that cohort",
        code: "invalid",
      };
    }
  }

  const rules = sanitiseRules(draft.rules);
  if (rules.length === 0) {
    return { status: "error", error: "No valid audience rules for that request.", code: "invalid" };
  }

  const existingGroups = await loadExistingGroups(supabase, userId);
  const duplicateName = findDuplicateGroup(existingGroups, rules);
  if (duplicateName) {
    return {
      status: "error",
      error: `You already have “${duplicateName}” with the same rules. Open it from the list, or refresh that group instead.`,
      code: "duplicate",
    };
  }

  const existingNames = new Set(existingGroups.map((group) => group.name.toLowerCase()));
  const name = uniqueName(draft.name, existingNames);

  let resolution;
  try {
    resolution = await resolveAudience(supabase, userId, rules);
  } catch (error) {
    console.error("[crm] cohort resolve failed:", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Failed to count matching contacts",
      code: "invalid",
    };
  }

  if (resolution.count === 0) {
    return {
      status: "error",
      error:
        "No subscribed contacts match that cohort right now. Try widening the window or a different brand/category.",
      code: "zero",
    };
  }

  return {
    status: "preview",
    preview: {
      name,
      description: draft.description || `Smart group from “${prompt}”.`,
      reason: draft.reason || `Built from your request: “${prompt}”.`,
      rules,
      count: resolution.count,
      sample: resolution.sample,
      source: draft.source,
      clarification: draft.clarification ?? null,
    },
  };
}

export async function createCohortFromPreview(
  supabase: SupabaseClient,
  userId: string,
  preview: Pick<CohortBuildPreview, "name" | "description" | "reason" | "rules">,
): Promise<CohortBuildResult> {
  const rules = sanitiseRules(preview.rules);
  if (rules.length === 0) {
    return { status: "error", error: "Missing audience rules.", code: "invalid" };
  }

  const name = String(preview.name ?? "").trim();
  if (!name) {
    return { status: "error", error: "Group name is required.", code: "invalid" };
  }

  const existingGroups = await loadExistingGroups(supabase, userId);
  const existingNames = new Set(existingGroups.map((group) => group.name.toLowerCase()));
  const finalName = uniqueName(name, existingNames);

  // Re-resolve at create time so membership matches live data.
  const resolution = await resolveAudience(supabase, userId, rules);
  if (resolution.count === 0) {
    return {
      status: "error",
      error: "No subscribed contacts match that cohort anymore. Refresh and try again.",
      code: "zero",
    };
  }

  const created = await createSmartGroup(supabase, userId, {
    name: finalName,
    description: String(preview.description ?? "").trim(),
    reason: String(preview.reason ?? "").trim(),
    rules,
  });

  return {
    status: "created",
    groupId: created.groupId,
    name: finalName,
    count: created.count,
  };
}
