// Step 4: Compose campaign as direct HTML via GPT-5.5.

import type { AgentComposeResult, AgentProductPick, CrmAgentBrief } from "./types";
import type { StoreAgentContext } from "./types";
import { COMPOSE_INSTRUCTIONS } from "./prompts";
import { COMPOSE_JSON_SCHEMA } from "./schemas";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI, parseJsonFromModel } from "./openai";
import { buildHtmlCampaignContent } from "../campaign-html";
import { SITE_URL } from "@/lib/seo/site";

type HtmlCampaignModelOutput = {
  subject: string;
  subject_variants: string[];
  title: string;
  body: string;
  cta_text: string;
  cta_url: string;
  footer_text: string;
  reasoning: string;
  html: string;
};

export function applyHtmlCampaignOutput(
  parsed: HtmlCampaignModelOutput,
  brief: CrmAgentBrief,
  products: AgentProductPick[],
  context: StoreAgentContext,
  userId: string,
): AgentComposeResult {
  const marketplaceUrl = `${SITE_URL}/marketplace?store=${userId}`;
  const ctaUrl = String(parsed.cta_url ?? "").trim() || marketplaceUrl;
  const layout = brief.layout_preference;

  const content = buildHtmlCampaignContent({
    title: String(parsed.title ?? brief.campaign_goal).trim(),
    body: String(parsed.body ?? "").trim(),
    html: parsed.html,
    ctaText: String(parsed.cta_text ?? "Shop now").trim(),
    ctaUrl,
    footerText: String(parsed.footer_text ?? `— ${context.storeName}`).trim(),
    layout,
    items: products.length > 0 ? products : undefined,
  });

  const subjectVariants = [
    String(parsed.subject ?? "").trim(),
    ...(parsed.subject_variants ?? []).map((s) => String(s).trim()),
  ].filter(Boolean);

  const uniqueSubjects = [...new Set(subjectVariants)].slice(0, 3);
  const subject = uniqueSubjects[0] ?? brief.campaign_goal.slice(0, 60);
  const templateKey = products.length > 0 ? "featured_bikes" : "store_announcement";

  return {
    subject,
    subjectVariants: uniqueSubjects.length > 1 ? uniqueSubjects : [subject, `${subject} — don't miss out`],
    templateKey,
    content,
    reasoning: String(parsed.reasoning ?? "Campaign composed as HTML email."),
  };
}

function performanceHints(context: StoreAgentContext): string {
  if (context.pastCampaigns.length === 0) return "No past campaign data yet.";
  const top = [...context.pastCampaigns].sort((a, b) => b.openRate - a.openRate)[0];
  const weak = [...context.pastCampaigns].sort((a, b) => a.openRate - b.openRate)[0];
  return `Best open rate: "${top.subject}" (${top.openRate}%). Weakest: "${weak.subject}" (${weak.openRate}%). Lean toward subjects similar to what performed well.`;
}

export async function composeCampaign(
  brief: CrmAgentBrief,
  products: AgentProductPick[],
  audienceCount: number,
  context: StoreAgentContext,
  userId: string,
): Promise<AgentComposeResult> {
  const openai = getCrmOpenAI();
  const marketplaceUrl = `${SITE_URL}/marketplace?store=${userId}`;

  const response = await openai.responses.create({
    model: CRM_AGENT_MODEL,
    instructions: COMPOSE_INSTRUCTIONS,
    text: {
      format: {
        type: "json_schema",
        name: "crm_campaign_html",
        strict: true,
        schema: COMPOSE_JSON_SCHEMA,
      },
    },
    input: JSON.stringify({
      store_name: context.storeName,
      store_logo_url: context.logoUrl,
      brief,
      audience_count: audienceCount,
      products: products.map((p) => ({
        title: p.title,
        subtitle: p.subtitle,
        price: p.price,
        original_price: p.originalPrice,
        badge: p.badge,
        on_sale: p.onSale,
        image_url: p.imageUrl,
        url: p.url,
      })),
      promotion: brief.promo,
      style_profile: context.styleProfile,
      performance_hints: performanceHints(context),
      default_cta_url: marketplaceUrl,
      unsubscribe_placeholder: "{{UNSUBSCRIBE_URL}}",
    }),
  });

  const parsed = parseJsonFromModel<HtmlCampaignModelOutput>(extractOutputText(response));
  if (!parsed?.html?.trim()) {
    throw new Error("Failed to compose campaign HTML from model");
  }

  return applyHtmlCampaignOutput(parsed, brief, products, context, userId);
}

// Legacy export kept for refine imports that may reference the name
export { applyHtmlCampaignOutput as applyComposeModelOutput };
