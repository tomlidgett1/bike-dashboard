// Step 4: Compose campaign copy + builder blocks via GPT-5.5.

import type { AgentComposeResult, AgentProductPick, CrmAgentBrief } from "./types";
import type { StoreAgentContext } from "./types";
import { COMPOSE_INSTRUCTIONS } from "./prompts";
import { COMPOSE_JSON_SCHEMA } from "./schemas";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI, parseJsonFromModel } from "./openai";
import { buildCampaignContent, modelBlocksToEmailBlocks } from "./build-blocks";
import { SITE_URL } from "@/lib/seo/site";

type ComposeModelOutput = {
  subject: string;
  subject_variants: string[];
  title: string;
  body: string;
  cta_text: string;
  cta_url: string;
  footer_text: string;
  reasoning: string;
  blocks: Array<{
    type: string;
    title?: string;
    text?: string;
    body?: string;
    align?: "left" | "center";
    button_text?: string;
    url?: string;
    image_url?: string;
    alt?: string;
    height?: number;
  }>;
};

export function applyComposeModelOutput(
  parsed: ComposeModelOutput,
  brief: CrmAgentBrief,
  products: AgentProductPick[],
  context: StoreAgentContext,
  userId: string,
  layoutOverride?: CrmAgentBrief["layout_preference"],
): AgentComposeResult {
  const marketplaceUrl = `${SITE_URL}/marketplace?store=${userId}`;
  const heroImage = products.find((p) => p.imageUrl)?.imageUrl;
  const blocks = modelBlocksToEmailBlocks(parsed.blocks ?? [], products, heroImage);

  const hasProductBlock = blocks.some((b) => b.type === "products");
  if (products.length > 0 && !hasProductBlock) {
    blocks.push({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `products-${Date.now()}`,
      type: "products",
      items: products,
      layout: "card",
    });
  }
  const ctaUrl = String(parsed.cta_url ?? "").trim() || marketplaceUrl;
  const layout = layoutOverride ?? brief.layout_preference;

  const content = buildCampaignContent({
    title: String(parsed.title ?? brief.campaign_goal).trim(),
    body: String(parsed.body ?? "").trim(),
    ctaText: String(parsed.cta_text ?? "Shop now").trim(),
    ctaUrl,
    footerText: String(parsed.footer_text ?? `— ${context.storeName}`).trim(),
    layout,
    blocks,
    products,
    heroImageUrl: heroImage,
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
    reasoning: String(parsed.reasoning ?? "Campaign composed from brief and audience."),
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
        name: "crm_campaign",
        strict: true,
        schema: COMPOSE_JSON_SCHEMA,
      },
    },
    input: JSON.stringify({
      store_name: context.storeName,
      brief,
      audience_count: audienceCount,
      products: products.map((p) => ({
        title: p.title,
        subtitle: p.subtitle,
        price: p.price,
        original_price: p.originalPrice,
        badge: p.badge,
        on_sale: p.onSale,
        url: p.url,
      })),
      promotion: brief.promo,
      style_profile: context.styleProfile,
      performance_hints: performanceHints(context),
      default_cta_url: marketplaceUrl,
    }),
  });

  const parsed = parseJsonFromModel<ComposeModelOutput>(extractOutputText(response));
  if (!parsed) {
    throw new Error("Failed to compose campaign from model");
  }

  return applyComposeModelOutput(parsed, brief, products, context, userId);
}
