// Iterate on an existing agent campaign via natural-language edits.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentComposeResult,
  AgentProductPick,
  AudienceRule,
  CrmAgentBrief,
  CrmAgentProgressEvent,
  CrmAgentRunResult,
} from "./types";
import { REFINE_INSTRUCTIONS } from "./prompts";
import { REFINE_JSON_SCHEMA } from "./schemas";
import { CRM_AGENT_MODEL, extractOutputText, getCrmOpenAI, parseJsonFromModel } from "./openai";
import { applyComposeModelOutput } from "./compose-campaign";
import { loadStoreAgentContext } from "./store-context";
import { resolveAudience } from "./resolve-audience";
import { renderCampaignEmail } from "../templates";

type RefineModelOutput = {
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

export type RefineCampaignOptions = {
  message: string;
  current: CrmAgentRunResult;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  onProgress?: (event: CrmAgentProgressEvent) => void;
};

export async function refineCrmCampaign(
  supabase: SupabaseClient,
  userId: string,
  options: RefineCampaignOptions,
): Promise<CrmAgentRunResult> {
  const emit = options.onProgress ?? (() => {});
  const { current, message } = options;

  emit({ type: "step", step: "refine", message: "Applying your changes…" });

  const context = await loadStoreAgentContext(supabase, userId);
  const openai = getCrmOpenAI();
  const currentHtml = renderCampaignEmail({
    templateKey: current.campaign.templateKey,
    content: current.campaign.content,
    store: { name: context.storeName, logoUrl: context.logoUrl },
    unsubscribeUrl: "https://yellowjersey.store/unsubscribe?token=preview",
  }).html;

  const response = await openai.responses.create({
    model: CRM_AGENT_MODEL,
    instructions: REFINE_INSTRUCTIONS,
    text: {
      format: {
        type: "json_schema",
        name: "crm_campaign_refine",
        strict: true,
        schema: REFINE_JSON_SCHEMA,
      },
    },
    input: JSON.stringify({
      edit_request: message.trim(),
      conversation: options.conversation?.slice(-8) ?? [],
      rendered_html: currentHtml,
      brief: current.brief,
      audience_rules: current.audience.rules,
      audience_count: current.audience.count,
      products: current.products,
      campaign: {
        subject: current.campaign.subject,
        subject_variants: current.campaign.subjectVariants,
        template_key: current.campaign.templateKey,
        content: current.campaign.content,
        reasoning: current.campaign.reasoning,
      },
      store_name: context.storeName,
    }),
  });

  const parsed = parseJsonFromModel<RefineModelOutput>(extractOutputText(response));
  if (!parsed) {
    throw new Error("Failed to apply campaign edits");
  }

  const layout =
    parsed.layout_preference ?? current.brief.layout_preference;
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

  const campaign: AgentComposeResult = applyComposeModelOutput(
    parsed,
    brief,
    current.products,
    context,
    userId,
    layout,
  );

  emit({ type: "campaign", campaign });

  const result: CrmAgentRunResult = {
    runId: current.runId,
    brief,
    audience,
    products: current.products,
    campaign,
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
      reasoning: campaign.reasoning,
    })
    .eq("id", current.runId)
    .eq("user_id", userId);

  emit({
    type: "complete",
    result: {
      ...result,
      campaign: {
        ...campaign,
        reasoning: `${parsed.assistant_summary}\n\n${campaign.reasoning}`,
      },
    },
  });

  return {
    ...result,
    campaign: {
      ...campaign,
      reasoning: `${parsed.assistant_summary}\n\n${campaign.reasoning}`,
    },
  };
}
