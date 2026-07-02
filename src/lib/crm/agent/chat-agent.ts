// CRM campaign chat agent — conversational tool-calling loop over the
// Lightspeed mirror + CRM contacts, streaming SSE-shaped events through an
// injected emit callback. Same @openai/agents runtime as the Genie agent.

import {
  Agent,
  Runner,
  assistant as assistantMessage,
  user as userMessage,
  type AgentInputItem,
} from "@openai/agents";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CRM_AGENT_MODEL } from "./openai";
import { loadStoreAgentContext } from "./store-context";
import { buildCrmChatStateMessage, buildCrmChatSystemPrompt } from "./chat-prompt";
import {
  buildCrmChatTools,
  createCrmChatToolState,
  seedCrmChatToolState,
} from "./chat-tools";
import type { CrmChatEvent, CrmChatMessage, CrmChatClientState } from "./chat-types";

const MAX_TURNS = 24;
const MAX_HISTORY_MESSAGES = 24;

type ToolStreamItem = {
  rawItem?: { name?: string; toolName?: string; arguments?: string };
  name?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clip(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/** Shimmer status line for a tool call, built from its real arguments. */
function statusForCrmTool(toolName: string, args?: Record<string, unknown>): { phase: string; text: string } {
  const argText = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = args?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  switch (toolName) {
    case "run_lightspeed_sql": {
      const purpose = argText("purpose");
      return { phase: "sql", text: purpose ? `Lightspeed SQL: ${clip(purpose, 90)}` : "Querying Lightspeed data" };
    }
    case "resolve_audience": {
      const name = argText("name");
      return { phase: "audience", text: name ? `Resolving audience: ${clip(name, 80)}` : "Resolving audience with exact counts" };
    }
    case "lookup_customers": {
      const query = argText("query");
      return { phase: "customers", text: query ? `Customer lookup: ${clip(query, 80)}` : "Looking up customers" };
    }
    case "search_store_products": {
      const query = argText("query");
      return { phase: "products", text: query ? `Searching catalogue: ${clip(query, 80)}` : "Searching product catalogue" };
    }
    case "set_campaign_email": {
      const subject = argText("subject");
      return { phase: "compose", text: subject ? `Designing email: ${clip(subject, 76)}` : "Designing your email" };
    }
    case "save_email_template":
      return { phase: "template", text: `Saving template${argText("name") ? `: ${clip(argText("name")!, 60)}` : ""}` };
    case "load_email_template":
      return { phase: "template", text: `Loading template${argText("name_or_id") ? `: ${clip(argText("name_or_id")!, 60)}` : ""}` };
    case "list_email_templates":
      return { phase: "template", text: "Checking saved templates" };
    case "suggest_next_steps":
      return { phase: "suggest", text: "Preparing suggestions" };
    default:
      return { phase: "tool", text: `Running ${toolName.replaceAll("_", " ")}` };
  }
}

export async function runCrmChatAgent(args: {
  supabase: SupabaseClient;
  userId: string;
  messages: CrmChatMessage[];
  clientState?: CrmChatClientState;
  emit: (event: CrmChatEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { supabase, userId, emit } = args;

  const latestUserMessage = [...args.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Run row for history/automation parity with the legacy pipeline.
  const { data: runRow } = await supabase
    .from("crm_agent_runs")
    .insert({ user_id: userId, prompt: latestUserMessage.slice(0, 2000), status: "running" })
    .select("id")
    .single();
  const runId = runRow ? String(runRow.id) : null;

  try {
    emit({ type: "status", phase: "context", text: "Loading store context" });
    const context = await loadStoreAgentContext(supabase, userId);

    const state = createCrmChatToolState(context);
    seedCrmChatToolState(state, {
      campaign: args.clientState?.campaign ?? null,
      audienceRules: args.clientState?.audienceRules ?? null,
    });

    const tools = buildCrmChatTools({ supabase, userId, context, state, emit });

    const agent = new Agent({
      name: "CRM Campaign Agent",
      model: CRM_AGENT_MODEL,
      instructions: buildCrmChatSystemPrompt(context),
      tools,
      modelSettings: {
        parallelToolCalls: false,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        text: { verbosity: "low" },
      },
    });

    const history = args.messages.slice(-MAX_HISTORY_MESSAGES);
    const input: AgentInputItem[] = history.map((message) =>
      message.role === "user" ? userMessage(message.content) : assistantMessage(message.content),
    );
    const stateMessage = buildCrmChatStateMessage(args.clientState);
    if (stateMessage && input.length > 0) {
      // Inject draft context just before the latest user message so edits
      // always see the current HTML/audience.
      input.splice(input.length - 1, 0, userMessage(`[CRM DRAFT CONTEXT — not written by the owner]\n${stateMessage}`));
    }

    const runner = new Runner({
      tracingDisabled: true,
      workflowName: "CRM Campaign Agent",
      groupId: userId,
    });

    emit({ type: "status", phase: "thinking", text: "Thinking about your campaign" });

    const stream = await runner.run(agent, input, {
      stream: true,
      maxTurns: MAX_TURNS,
      signal: args.signal,
      toolNotFoundBehavior: "return_error_to_model",
      // store:false means reasoning items aren't persisted server-side; without
      // this, follow-up turns reference rs_* ids and 404 ("Item ... not found").
      reasoningItemIdPolicy: "omit",
      errorHandlers: {
        maxTurns: () => ({
          finalOutput:
            "I hit my working-turn limit before finishing. Tell me to continue and I'll pick up where I left off.",
          includeInHistory: true,
        }),
      },
    });

    let streamedText = "";
    for await (const event of stream) {
      if (event.type === "run_item_stream_event") {
        const item = event.item as ToolStreamItem;
        const toolName = item.rawItem?.name || item.rawItem?.toolName || item.name;
        if (event.name === "tool_called" && toolName) {
          let toolArgs: Record<string, unknown> | undefined;
          const rawArguments = item.rawItem?.arguments;
          if (typeof rawArguments === "string" && rawArguments.length > 1 && rawArguments.length < 40_000) {
            try {
              const parsed: unknown = JSON.parse(rawArguments);
              if (isRecord(parsed)) toolArgs = parsed;
            } catch {
              // malformed args — fall back to the static status text
            }
          }
          emit({ type: "status", ...statusForCrmTool(toolName, toolArgs) });
        }
      }

      if (event.type === "raw_model_stream_event") {
        const raw = event.data as { type?: string; delta?: string; event?: { type?: string; delta?: string } };
        const rawType = raw.type ?? raw.event?.type;
        const delta = typeof raw.delta === "string" ? raw.delta : typeof raw.event?.delta === "string" ? raw.event.delta : "";
        if (rawType === "response.output_text.delta" && delta) {
          streamedText += delta;
          emit({ type: "assistant_delta", text: delta });
        }
      }
    }

    const finalOutput = typeof stream.finalOutput === "string" ? stream.finalOutput : streamedText;
    emit({ type: "assistant_message", text: finalOutput || "Done." });

    if (runId) {
      await supabase
        .from("crm_agent_runs")
        .update({
          status: "completed",
          audience_rules: state.audience?.rules ?? null,
          audience_count: state.audience?.count ?? null,
          audience_sample: state.audience?.sample ?? null,
          products: state.featuredProducts.length > 0 ? state.featuredProducts : null,
          campaign_content: state.campaign?.content ?? null,
          subject_variants: state.campaign?.subjectVariants ?? null,
          reasoning: state.campaign?.reasoning ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("user_id", userId);
    }

    emit({ type: "done", runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    if (runId) {
      await supabase
        .from("crm_agent_runs")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("user_id", userId);
    }
    emit({ type: "error", message });
    emit({ type: "done", runId });
  }
}
