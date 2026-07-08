// CRM 2.0 orchestrator — runs the full agent pipeline with progress callbacks.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudienceRule, CrmAgentProgressEvent, CrmAgentRunResult } from "./types";
import { loadStoreAgentContext } from "./store-context";
import { parseBrief } from "./parse-brief";
import { resolveAudience } from "./resolve-audience";
import { curateProducts } from "./curate-products";
import { composeCampaign } from "./compose-campaign";

export type OrchestrateOptions = {
  prompt: string;
  presetRules?: AudienceRule[];
  presetId?: string;
  onProgress?: (event: CrmAgentProgressEvent) => void;
};

export async function orchestrateCrmAgent(
  supabase: SupabaseClient,
  userId: string,
  options: OrchestrateOptions,
): Promise<CrmAgentRunResult> {
  const emit = options.onProgress ?? (() => {});

  const { data: runRow, error: runError } = await supabase
    .from("crm_agent_runs")
    .insert({
      user_id: userId,
      prompt: options.prompt.trim(),
      status: "running",
    })
    .select("id")
    .single();
  if (runError || !runRow) throw runError ?? new Error("Failed to create agent run");

  const runId = String(runRow.id);

  try {
    emit({ type: "step", step: "context", message: "Loading store context…" });
    const context = await loadStoreAgentContext(supabase, userId);

    emit({ type: "step", step: "brief", message: "Understanding your brief…" });
    const { brief, rules } = await parseBrief(options.prompt, context, options.presetRules);
    emit({ type: "brief", brief, rules });

    // Audience and product curation only need the brief/rules — run them together.
    emit({ type: "step", step: "audience", message: "Resolving audience and curating products…" });
    const [audience, products] = await Promise.all([
      resolveAudience(supabase, userId, rules, brief.max_recipients),
      curateProducts(supabase, userId, brief, rules),
    ]);
    if (audience.count === 0) {
      throw new Error("No eligible contacts match your audience rules");
    }
    emit({ type: "audience", audience });
    emit({ type: "products", products });

    emit({ type: "step", step: "compose", message: "Writing your campaign…" });
    const campaign = await composeCampaign(
      brief,
      products,
      audience.count,
      context,
      userId,
    );
    emit({ type: "campaign", campaign });

    const result: CrmAgentRunResult = {
      runId,
      brief,
      audience,
      products,
      campaign,
    };

    await supabase
      .from("crm_agent_runs")
      .update({
        status: "completed",
        brief,
        audience_rules: rules,
        audience_count: audience.count,
        audience_sample: audience.sample,
        products,
        campaign_content: campaign.content,
        subject_variants: campaign.subjectVariants,
        reasoning: campaign.reasoning,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("user_id", userId);

    emit({ type: "complete", result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    await supabase
      .from("crm_agent_runs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("user_id", userId);
    emit({ type: "error", message });
    throw error;
  }
}
