import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";
import { buildNestBusinessTurnContextBlock } from "@/lib/nest-portal/lib/opening-schedule";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  COACH_CONFIG_FIELDS,
  type PromptCoachChatMessage,
} from "@/lib/nest/prompt-coach-types";
import { loadPromptCoachContext } from "@/lib/nest/prompt-coach";
import { buildNestTestTrace } from "@/lib/nest/nest-test-prompt-sources";
import type { NestProductionTestTrace } from "@/lib/nest/nest-workspace-types";

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function extractOpenAiText(openaiData: Record<string, unknown>): string {
  if (typeof openaiData.output_text === "string") return openaiData.output_text;
  if (Array.isArray(openaiData.output)) {
    for (const item of openaiData.output) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: string }).type === "message" &&
        Array.isArray((item as { content?: unknown }).content)
      ) {
        for (const block of (item as { content: unknown[] }).content) {
          if (
            block &&
            typeof block === "object" &&
            (block as { type?: string }).type === "output_text" &&
            typeof (block as { text?: string }).text === "string"
          ) {
            return (block as { text: string }).text;
          }
        }
      }
    }
  }
  return "";
}

function buildBrandTestInstructions(args: {
  brandKey: string;
  config: Record<string, string>;
  knowledge: Array<{ title: string; content_text: string; summary?: string }>;
  businessTimezone?: string | null;
}): string {
  const displayName =
    args.config.business_display_name?.trim() || args.brandKey;
  const turnContext = buildNestBusinessTurnContextBlock(args.businessTimezone);

  const configBlock = COACH_CONFIG_FIELDS.map((field) => {
    const value = args.config[field]?.trim();
    if (!value) return null;
    return `### ${field}\n${truncate(value, 1200)}`;
  })
    .filter(Boolean)
    .join("\n\n");

  const knowledgeBlock =
    args.knowledge.length === 0
      ? "(none)"
      : args.knowledge
          .slice(0, 30)
          .map(
            (item) =>
              `- ${item.title}: ${truncate(item.summary || item.content_text, 500)}`,
          )
          .join("\n");

  return `You are the Nest customer chatbot for ${displayName}, an Australian bike shop.

Reply as the shop would over SMS / iMessage:
- Short Australian English, warm and direct
- 1–3 short sentences unless the customer asks for detail
- Use ONLY the business facts below — do not invent hours, prices, stock, or policies
- If something is not in the facts, say you are not sure and offer to have the team confirm
- Do not mention that you are an AI, Nest, or a test mode
- Do not use tools or claim you checked live stock / bookings unless the facts already say so

${turnContext}

## Business facts

${configBlock || "(no structured config yet)"}

## Knowledge base
${knowledgeBlock}`;
}

/**
 * Fast portal Test path: same Nest config/knowledge as Train, answered on YJ
 * without the ~40s Nest brand-chat edge stack.
 */
export async function runNestTestChatLocal(args: {
  brandKey: string;
  message: string;
  chatHistory?: PromptCoachChatMessage[];
}): Promise<{ reply: string; brand: string; trace: NestProductionTestTrace }> {
  const openaiKey = pickServerEnv(["OPENAI_API_KEY", "NEST_OPENAI_API_KEY"]);
  if (!openaiKey) {
    throw new Error("AI is not configured for Nest Test.");
  }

  const message = args.message.trim();
  if (!message) {
    throw new Error("message is required");
  }

  const ctx = await loadPromptCoachContext(args.brandKey);
  const displayName =
    ctx.config.business_display_name?.trim() || args.brandKey;
  const history = (args.chatHistory ?? []).slice(-12);

  const input: { role: string; content: string }[] = [
    ...history.map((turn) => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text,
    })),
    { role: "user", content: message },
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      instructions: buildBrandTestInstructions({
        brandKey: args.brandKey,
        config: ctx.config,
        knowledge: ctx.knowledge,
        businessTimezone: ctx.businessTimezone,
      }),
      input,
      store: false,
      max_output_tokens: 400,
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error(
      "[nest-test-chat] OpenAI error:",
      openaiRes.status,
      errText.slice(0, 400),
    );
    throw new Error(`Nest Test failed (${openaiRes.status})`);
  }

  const openaiData = (await openaiRes.json()) as Record<string, unknown>;
  const reply = extractOpenAiText(openaiData).trim();
  if (!reply) {
    throw new Error("Nest did not return a reply.");
  }

  return {
    reply,
    brand: displayName,
    trace: buildNestTestTrace({
      question: message,
      reply,
      config: ctx.config,
      knowledge: ctx.knowledge,
      model: "gpt-5.4-mini",
      route: "Local Nest test",
    }),
  };
}

/**
 * Owner Test Nest path. This calls the same brand-chat edge function as live
 * customer messages, then returns only safe trace metadata.
 */
export async function runNestProductionTestTurn(args: {
  brandKey: string;
  chatId: string;
  message: string;
}): Promise<{
  reply: string;
  brand: string;
  trace: NestProductionTestTrace;
}> {
  const supabaseUrl = pickServerEnv([
    "SUPABASE_URL",
    "NEST_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);
  const secret = pickServerEnv([
    "INTERNAL_EDGE_SHARED_SECRET",
    "NEST_INTERNAL_EDGE_SHARED_SECRET",
  ]);
  if (!supabaseUrl || !secret) {
    throw new Error("Production Nest testing is not configured in this environment.");
  }

  const message = args.message.trim();
  if (!message) throw new Error("message is required");
  const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/brand-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({
      chatId: args.chatId,
      senderHandle: `portal-test@${args.brandKey}`,
      brandKey: args.brandKey,
      message,
    }),
    cache: "no-store",
  });

  const raw = await edgeResponse.text();
  if (!edgeResponse.ok) {
    console.error(
      "[nest-test-chat] production brand-chat error:",
      edgeResponse.status,
      raw.slice(0, 500),
    );
    throw new Error("Production Nest did not respond. Try again shortly.");
  }

  let reply = "";
  try {
    const payload = JSON.parse(raw) as { text?: unknown };
    reply = typeof payload.text === "string" ? payload.text.trim() : "";
  } catch {
    throw new Error("Production Nest returned an invalid response.");
  }
  if (!reply) throw new Error("Production Nest did not return a reply.");

  const [context, traceRow, toolRows] = await Promise.all([
    loadPromptCoachContext(args.brandKey),
    createServiceRoleClient()
      .from("turn_traces")
      .select(
        "model_used, route_agent, total_latency_ms, input_tokens, output_tokens, tool_calls",
      )
      .eq("chat_id", args.chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    createServiceRoleClient()
      .from("tool_traces")
      .select("tool_name")
      .eq("chat_id", args.chatId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const traceData = traceRow.data as Record<string, unknown> | null;
  const toolNames = new Set<string>();
  for (const row of toolRows.data ?? []) {
    if (typeof row.tool_name === "string") toolNames.add(row.tool_name);
  }
  if (Array.isArray(traceData?.tool_calls)) {
    for (const call of traceData.tool_calls) {
      if (
        call &&
        typeof call === "object" &&
        typeof (call as { name?: unknown }).name === "string"
      ) {
        toolNames.add((call as { name: string }).name);
      }
    }
  }

  return {
    reply,
    brand: context.config.business_display_name?.trim() || args.brandKey,
    trace: {
      ...buildNestTestTrace({
        question: message,
        reply,
        config: context.config,
        knowledge: context.knowledge,
        model:
          typeof traceData?.model_used === "string" ? traceData.model_used : null,
        route:
          typeof traceData?.route_agent === "string" ? traceData.route_agent : null,
      }),
      totalLatencyMs:
        typeof traceData?.total_latency_ms === "number"
          ? traceData.total_latency_ms
          : null,
      inputTokens:
        typeof traceData?.input_tokens === "number"
          ? traceData.input_tokens
          : null,
      outputTokens:
        typeof traceData?.output_tokens === "number"
          ? traceData.output_tokens
          : null,
      toolsUsed: [...toolNames],
    },
  };
}
