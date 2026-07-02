// Iterate on an existing agent campaign by editing the HTML document directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentComposeResult,
  AudienceRule,
  CrmAgentBrief,
  CrmAgentProgressEvent,
  CrmAgentRunResult,
} from "./types";
import { REFINE_INSTRUCTIONS } from "./prompts";
import { REFINE_JSON_SCHEMA } from "./schemas";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI, parseJsonFromModel } from "./openai";
import { applyHtmlCampaignOutput } from "./compose-campaign";
import { loadStoreAgentContext } from "./store-context";
import { resolveAudience } from "./resolve-audience";
import { getStoredCampaignHtml } from "../campaign-html";
import { renderCampaignEmail } from "../templates";

type RefineHtmlModelOutput = {
  update_audience: boolean;
  audience_rules: AudienceRule[];
  layout_preference: CrmAgentBrief["layout_preference"];
  subject: string;
  subject_variants: string[];
  title: string;
  body: string;
  cta_text: string;
  cta_url: string;
  footer_text: string;
  reasoning: string;
  assistant_summary: string;
  html: string;
};

export type RefineCampaignOptions = {
  message: string;
  current: CrmAgentRunResult;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  onProgress?: (event: CrmAgentProgressEvent) => void;
};

function isRedesignRequest(message: string): boolean {
  return /\b(redesign|re-design|start over|from scratch|completely new|new layout|new design|different layout|different design|overhaul|rebuild| remake)\b/i.test(
    message,
  );
}

export async function refineCrmCampaign(
  supabase: SupabaseClient,
  userId: string,
  options: RefineCampaignOptions,
): Promise<CrmAgentRunResult> {
  const emit = options.onProgress ?? (() => {});
  const { current, message } = options;

  emit({ type: "step", step: "refine", message: "Updating email HTML…" });

  const context = await loadStoreAgentContext(supabase, userId);

  const storedHtml = getStoredCampaignHtml(current.campaign.content);
  const currentHtml =
    storedHtml ??
    renderCampaignEmail({
      templateKey: current.campaign.templateKey,
      content: current.campaign.content,
      store: { name: context.storeName, logoUrl: context.logoUrl },
      unsubscribeUrl: "{{UNSUBSCRIBE_URL}}",
    }).html;

  const redesign = isRedesignRequest(message);

  const response = await openaiRefine({
    message,
    conversation: options.conversation?.slice(-8) ?? [],
    currentHtml,
    current,
    context,
    redesign,
  });

  const parsed = parseJsonFromModel<RefineHtmlModelOutput>(extractOutputText(response));
  if (!parsed?.html?.trim()) {
    throw new Error("Failed to apply campaign HTML edits");
  }

  const layout = parsed.layout_preference ?? current.brief.layout_preference;
  const brief: CrmAgentBrief = {
    ...current.brief,
    layout_preference: layout,
  };

  let audience = current.audience;
  let rules = current.audience.rules;

  if (parsed.update_audience && parsed.audience_rules?.length) {
    emit({ type: "step", step: "audience", message: "Updating audience…" });
    rules = parsed.audience_rules;
    audience = await resolveAudience(supabase, userId, rules, brief.max_recipients);
    if (audience.count === 0) {
      throw new Error("No eligible contacts match the updated audience rules");
    }
    emit({ type: "audience", audience });
  }

  const campaign: AgentComposeResult = applyHtmlCampaignOutput(
    parsed,
    brief,
    current.products,
    context,
    userId,
  );

  emit({ type: "campaign", campaign });

  const result: CrmAgentRunResult = {
    runId: current.runId,
    brief,
    audience,
    products: current.products,
    campaign: {
      ...campaign,
      reasoning: `${parsed.assistant_summary}\n\n${campaign.reasoning}`,
    },
  };

  await supabase
    .from("crm_agent_runs")
    .update({
      brief,
      audience_rules: rules,
      audience_count: audience.count,
      audience_sample: audience.sample,
      campaign_content: campaign.content,
      subject_variants: campaign.subjectVariants,
      reasoning: result.campaign.reasoning,
    })
    .eq("id", current.runId)
    .eq("user_id", userId);

  emit({ type: "complete", result });
  return result;
}

async function openaiRefine(args: {
  message: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  currentHtml: string;
  current: CrmAgentRunResult;
  context: Awaited<ReturnType<typeof loadStoreAgentContext>>;
  redesign: boolean;
}) {
  const openai = getCrmOpenAI();

  const extraInstruction = args.redesign
    ? "\n\nREDESIGN REQUEST DETECTED: You must produce a substantially different HTML layout, visual hierarchy, and styling. Do not reuse the same section structure with minor copy edits."
    : "";

  return openai.responses.create({
    model: CRM_AGENT_MODEL,
    instructions: REFINE_INSTRUCTIONS + extraInstruction,
    text: {
      format: {
        type: "json_schema",
        name: "crm_campaign_refine_html",
        strict: true,
        schema: REFINE_JSON_SCHEMA,
      },
    },
    input: JSON.stringify({
      edit_request: args.message.trim(),
      conversation: args.conversation,
      current_html: args.currentHtml,
      brief: args.current.brief,
      audience_rules: args.current.audience.rules,
      audience_count: args.current.audience.count,
      products: args.current.products.map((p) => ({
        title: p.title,
        subtitle: p.subtitle,
        price: p.price,
        original_price: p.originalPrice,
        badge: p.badge,
        on_sale: p.onSale,
        image_url: p.imageUrl,
        url: p.url,
      })),
      store_name: args.context.storeName,
      store_logo_url: args.context.logoUrl,
      unsubscribe_placeholder: "{{UNSUBSCRIBE_URL}}",
    }),
  });
}
