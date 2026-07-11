/**
 * Hey Comp router.
 *
 * Production contract: GPT-5.4 mini classifies `chat` vs `smart`.
 * The editable markdown prompt is mirrored into a TypeScript string module because
 * Supabase Edge does not expose arbitrary markdown assets to runtime file reads.
 * The parity test catches drift between the markdown source and runtime string.
 */
import {
  getOpenAIClient,
  getResponseText,
  REASONING_EFFORT,
  type ResponsesCreateResult,
} from "../ai/models.ts";
import type { RouteDecision, ToolNamespace, TurnInput } from "./types.ts";
import type { RouterContext } from "./build-context.ts";
import { COMPOSIO_ROUTER_SYSTEM_INSTRUCTIONS } from "./composio-router/system-instructions.ts";

function getOptionalRouterEnv(name: string): string | undefined {
  try {
    const value = Deno.env.get(name);
    return value && value.trim().length > 0 ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

const ROUTER_CONTEXT_TURNS = 10;
export const HEY_COMP_ROUTER_MODEL = "gpt-5.4-mini";

const COMPOSIO_CHAT_NAMESPACES: ToolNamespace[] = [];

const COMPOSIO_SMART_NAMESPACES: ToolNamespace[] = [
  "composio.read",
  "composio.write",
  "web.search",
  "knowledge.search",
  "travel.search",
  "weather.search",
];

export function loadComposioRouterSystemInstructions(): string {
  return COMPOSIO_ROUTER_SYSTEM_INSTRUCTIONS.trim();
}

export function getComposioRouterInstructionsSource(): "compiled_ts" {
  return "compiled_ts";
}

export function getComposioRouterModel(): string {
  return getOptionalRouterEnv("COMPOSIO_CHAT_ROUTER_MODEL") || HEY_COMP_ROUTER_MODEL;
}

export function buildComposioRouterTranscript(
  turns: RouterContext["recentTurns"],
  maxMessages: number,
): string {
  const slice = turns.slice(-maxMessages);
  const blocks: string[] = [];
  for (const t of slice) {
    const body = (t.content ?? "").trim() || "(no text)";
    blocks.push(`${t.role.toUpperCase()}: ${body}`);
  }
  return blocks.join("\n\n---\n\n");
}

export type ComposioOrchestrationResult = { mode: "chat" | "smart"; reason: string };

async function classifyComposioModeWithLlm(
  turns: RouterContext["recentTurns"],
  latestUserText: string,
): Promise<ComposioOrchestrationResult> {
  const model = getComposioRouterModel();
  const instructions = loadComposioRouterSystemInstructions();
  const transcript = buildComposioRouterTranscript(turns, ROUTER_CONTEXT_TURNS);
  const latest = latestUserText.trim();

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model,
    instructions,
    input: [
      {
        role: "user",
        content:
          `Conversation context (up to ${ROUTER_CONTEXT_TURNS} most recent turns, oldest first in this window):\n\n${transcript}\n\nLatest user message (your classification applies to this turn only):\n${latest}\n\nClassify which Hey Comp mode should be used. Output JSON only.`,
      },
    ],
    max_output_tokens: 256,
    store: false,
    reasoning: { effort: REASONING_EFFORT.brand_chat },
  } as Parameters<typeof client.responses.create>[0]);

  const text = getResponseText(response as ResponsesCreateResult);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`heycomp router: no JSON in model output: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as { mode?: string; reason?: string };
  const mode = parsed.mode === "smart"
    ? "smart"
    : parsed.mode === "chat" || parsed.mode === "casual"
    ? "chat"
    : null;
  if (!mode) throw new Error(`heycomp router: invalid mode in ${jsonMatch[0]}`);

  const reason = (parsed.reason ?? "").trim() || "llm_router";
  return { mode, reason: `llm_router:${reason}` };
}

const COMPOSIO_ROUTER_LLM_ATTEMPTS = 2;

export async function resolveComposioChatMode(
  turns: RouterContext["recentTurns"],
  latestUserText: string,
): Promise<ComposioOrchestrationResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= COMPOSIO_ROUTER_LLM_ATTEMPTS; attempt++) {
    try {
      return await classifyComposioModeWithLlm(turns, latestUserText);
    } catch (error) {
      lastError = error;
      console.warn(
        `[heycomp] classifyComposioModeWithLlm attempt ${attempt}/${COMPOSIO_ROUTER_LLM_ATTEMPTS} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  console.error("[heycomp] LLM router failed after retries; using smart fallback", lastError);
  return { mode: "smart", reason: "llm_router_exhausted_fallback_smart" };
}

export async function routeComposioTurn(
  input: TurnInput,
  context: RouterContext,
): Promise<RouteDecision> {
  const start = Date.now();
  const { mode, reason } = await resolveComposioChatMode(
    context.recentTurns,
    input.userMessage,
  );
  const latency = Date.now() - start;

  console.log(`[heycomp] mode=${mode} reason=${reason} (${latency}ms)`);

  if (mode === "chat") {
    return {
      mode: "single_agent",
      agent: "chat",
      allowedNamespaces: COMPOSIO_CHAT_NAMESPACES,
      needsMemoryRead: false,
      needsMemoryWriteCandidate: false,
      needsWebFreshness: false,
      userStyle: "normal",
      confidence: 0.95,
      fastPathUsed: false,
      routerLatencyMs: latency,
      primaryDomain: "general",
      memoryDepth: "none",
      forcedToolChoice: "auto",
      routeLayer: "comp",
      routeReason: reason,
    };
  }

  return {
    mode: "single_agent",
    agent: "smart",
    allowedNamespaces: COMPOSIO_SMART_NAMESPACES,
    needsMemoryRead: false,
    needsMemoryWriteCandidate: false,
    needsWebFreshness: false,
    userStyle: "normal",
    confidence: 1,
    fastPathUsed: false,
    routerLatencyMs: latency,
    primaryDomain: "general",
    memoryDepth: "none",
    forcedToolChoice: "auto",
    routeLayer: "comp",
    routeReason: reason,
  };
}
