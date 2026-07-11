import { getOptionalEnv } from "../env.ts";
import type { AgentLoopResult, TurnInput } from "../orchestrator/types.ts";
import type { RouterContext } from "../orchestrator/build-context.ts";
import { buildHeyCompLoopResult } from "./lane-result.ts";

type VercelRuntimeResponse = {
  text?: string;
  model?: string;
  status?: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string | null;
  toolCalls?: Array<
    { name?: string; input?: unknown; output?: unknown; error?: string | null }
  >;
  /** Mirrored from Vercel runtime for admin turn_traces / debug UI. */
  systemPrompt?: string;
  error?: string | null;
};

function senderAllowedForVercelRuntime(senderHandle: string): boolean {
  const allowlist = (getOptionalEnv("HEY_COMP_VERCEL_RUNTIME_ALLOWLIST") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(senderHandle);
}

function runtimeUrl(): string | null {
  const explicit = getOptionalEnv("HEY_COMP_AGENT_RUNTIME_URL");
  if (explicit) return explicit;
  const site = getOptionalEnv("NEST_PUBLIC_SITE_URL") ??
    getOptionalEnv("NEST_PUBLIC_URL");
  return site ? `${site.replace(/\/$/, "")}/api/hey-comp-agent` : null;
}

export function shouldUseHeyCompVercelRuntime(input: TurnInput): boolean {
  return getOptionalEnv("HEY_COMP_VERCEL_RUNTIME_ENABLED") === "true" &&
    senderAllowedForVercelRuntime(input.senderHandle) &&
    Boolean(runtimeUrl());
}

export function shouldShadowHeyCompVercelRuntime(input: TurnInput): boolean {
  return getOptionalEnv("HEY_COMP_VERCEL_RUNTIME_SHADOW") === "true" &&
    senderAllowedForVercelRuntime(input.senderHandle) &&
    Boolean(runtimeUrl());
}

export async function runHeyCompVercelSmartLane(args: {
  input: TurnInput;
  turnId: string;
  routerCtx: RouterContext;
}): Promise<AgentLoopResult> {
  const url = runtimeUrl();
  const secret = getOptionalEnv("INTERNAL_EDGE_SHARED_SECRET") ??
    getOptionalEnv("NEST_INTERNAL_EDGE_SHARED_SECRET");
  if (!url || !secret) {
    throw new Error("Hey Comp Vercel runtime is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({
      mode: "user_turn",
      turnId: args.turnId,
      chatId: args.input.chatId,
      authUserId: args.input.authUserId,
      senderHandle: args.input.senderHandle,
      userMessage: args.input.userMessage,
      timezone: args.input.timezone ?? null,
      history: args.routerCtx.recentTurns.slice(-12),
    }),
  });

  const body = await response.json().catch(() => ({})) as VercelRuntimeResponse;
  if (!response.ok) {
    throw new Error(
      body.error ?? `Hey Comp Vercel runtime failed with ${response.status}`,
    );
  }

  const toolCalls = (body.toolCalls ?? []).map((call) => ({
    tool: call.name ?? "unknown",
    detail: call.error ?? undefined,
  }));

  const historySlice = args.routerCtx.recentTurns.slice(-12);
  const initialMessages = [
    ...historySlice.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: args.input.userMessage },
  ];

  return buildHeyCompLoopResult({
    text: body.text ?? body.confirmationPrompt ?? null,
    systemPrompt:
      typeof body.systemPrompt === "string" && body.systemPrompt.trim()
        ? body.systemPrompt.trim()
        : "Hey Comp Vercel Runtime (systemPrompt missing from runtime response)",
    initialMessages,
    availableToolNames: [],
    effectiveModel: body.model ?? "vercel-ai-sdk",
    toolsUsed: toolCalls,
  });
}

export async function runHeyCompVercelTriggerRun(args: {
  turnId: string;
  chatId: string;
  authUserId: string | null;
  senderHandle: string;
  triggerPayload: Record<string, unknown>;
  agentId?: string | null;
}): Promise<VercelRuntimeResponse> {
  const url = runtimeUrl();
  const secret = getOptionalEnv("INTERNAL_EDGE_SHARED_SECRET") ??
    getOptionalEnv("NEST_INTERNAL_EDGE_SHARED_SECRET");
  if (!url || !secret) {
    throw new Error("Hey Comp Vercel runtime is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({
      mode: "trigger_run",
      turnId: args.turnId,
      chatId: args.chatId,
      authUserId: args.authUserId,
      senderHandle: args.senderHandle,
      userMessage: "Run this Hey Comp trigger event.",
      triggerPayload: args.triggerPayload,
      agentId: args.agentId ?? null,
    }),
  });

  const body = await response.json().catch(() => ({})) as VercelRuntimeResponse;
  if (!response.ok) {
    throw new Error(
      body.error ?? `Hey Comp Vercel runtime failed with ${response.status}`,
    );
  }
  return body;
}

export async function runHeyCompVercelScheduledRun(args: {
  turnId: string;
  chatId: string;
  authUserId: string | null;
  senderHandle: string;
  scheduledPayload: Record<string, unknown>;
  agentId?: string | null;
}): Promise<VercelRuntimeResponse> {
  const url = runtimeUrl();
  const secret = getOptionalEnv("INTERNAL_EDGE_SHARED_SECRET") ??
    getOptionalEnv("NEST_INTERNAL_EDGE_SHARED_SECRET");
  if (!url || !secret) {
    throw new Error("Hey Comp Vercel runtime is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({
      mode: "scheduled_run",
      turnId: args.turnId,
      chatId: args.chatId,
      authUserId: args.authUserId,
      senderHandle: args.senderHandle,
      userMessage: "Run this Hey Comp scheduled job.",
      scheduledPayload: args.scheduledPayload,
      agentId: args.agentId ?? null,
    }),
  });

  const body = await response.json().catch(() => ({})) as VercelRuntimeResponse;
  if (!response.ok) {
    throw new Error(
      body.error ?? `Hey Comp Vercel runtime failed with ${response.status}`,
    );
  }
  return body;
}
