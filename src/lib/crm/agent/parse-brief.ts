// Step 1: Parse natural-language brief into structured rules via GPT-5.5.

import type { AudienceRule, CrmAgentBrief, CrmPromoBrief } from "./types";
import type { StoreAgentContext } from "./types";
import { BRIEF_PARSER_INSTRUCTIONS } from "./prompts";
import { BRIEF_JSON_SCHEMA } from "./schemas";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI, parseJsonFromModel } from "./openai";
import { detectPromoFromPrompt, mergePromoBrief } from "../promo-detect";

type BriefParseOutput = {
  campaign_goal: string;
  tone: string;
  audience_description: string;
  product_focus: string;
  layout_preference: string;
  include_products: boolean;
  max_recipients: number | null;
  promo_kind: CrmPromoBrief["kind"];
  promo_discount_percent: number | null;
  promo_brand: string | null;
  promo_keyword: string | null;
  promo_label: string | null;
  promo_only_on_sale: boolean;
  audience_rules: AudienceRule[];
};

export type ParseBriefResult = {
  brief: CrmAgentBrief;
  rules: AudienceRule[];
};

function promoFromModel(parsed: BriefParseOutput): CrmPromoBrief {
  return {
    kind:
      parsed.promo_kind === "percent_off" || parsed.promo_kind === "on_sale_only"
        ? parsed.promo_kind
        : "none",
    discount_percent:
      typeof parsed.promo_discount_percent === "number" && parsed.promo_discount_percent > 0
        ? parsed.promo_discount_percent
        : null,
    brand: parsed.promo_brand ? String(parsed.promo_brand).trim() : null,
    keyword: parsed.promo_keyword ? String(parsed.promo_keyword).trim() : null,
    label: parsed.promo_label ? String(parsed.promo_label).trim() : null,
    only_on_sale: Boolean(parsed.promo_only_on_sale),
  };
}

export async function parseBrief(
  prompt: string,
  context: StoreAgentContext,
  presetRules?: AudienceRule[],
): Promise<ParseBriefResult> {
  const detectedPromo = detectPromoFromPrompt(prompt);

  if (presetRules?.length) {
    return {
      brief: {
        campaign_goal: prompt.slice(0, 200),
        tone: context.styleProfile?.tone ?? "Warm and professional",
        audience_description: "Saved audience preset",
        product_focus: detectedPromo.brand ?? detectedPromo.keyword ?? "",
        layout_preference: "classic",
        include_products: true,
        promo: detectedPromo,
      },
      rules: presetRules,
    };
  }

  const openai = getCrmOpenAI();
  const response = await openai.responses.create({
    model: CRM_AGENT_MODEL,
    instructions: BRIEF_PARSER_INSTRUCTIONS,
    text: {
      format: {
        type: "json_schema",
        name: "crm_brief",
        strict: true,
        schema: BRIEF_JSON_SCHEMA,
      },
    },
    input: JSON.stringify({
      prompt: prompt.trim(),
      store_name: context.storeName,
      contact_stats: context.contactStats,
      past_campaign_subjects: context.pastCampaigns.map((c) => c.subject).slice(0, 5),
      detected_promo_hint: detectedPromo,
    }),
  });

  const parsed = parseJsonFromModel<BriefParseOutput>(extractOutputText(response));
  if (!parsed) {
    throw new Error("Failed to parse campaign brief from model");
  }

  const rules = (parsed.audience_rules ?? []).map((rule) => ({
    type: rule.type,
    value: rule.value,
    label: rule.label ?? String(rule.type),
  }));

  const promo = mergePromoBrief(promoFromModel(parsed), detectedPromo);
  const productFocus =
    String(parsed.product_focus ?? "").trim() ||
    promo.brand ||
    promo.keyword ||
    detectedPromo.brand ||
    "";

  const brief: CrmAgentBrief = {
    campaign_goal: String(parsed.campaign_goal ?? "").trim() || prompt.slice(0, 200),
    tone: String(parsed.tone ?? context.styleProfile?.tone ?? "Warm and professional"),
    audience_description: String(parsed.audience_description ?? ""),
    product_focus: productFocus,
    layout_preference:
      parsed.layout_preference === "minimal" || parsed.layout_preference === "editorial"
        ? parsed.layout_preference
        : "classic",
    include_products: Boolean(parsed.include_products) || Boolean(promo.brand || promo.discount_percent),
    max_recipients:
      typeof parsed.max_recipients === "number" && parsed.max_recipients > 0
        ? parsed.max_recipients
        : null,
    promo,
  };

  return { brief, rules };
}
