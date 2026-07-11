import type { AgentLoopResult, ToolCallBlockedTrace, ToolCallTrace } from "../orchestrator/types.ts";

export function buildHeyCompLoopResult(params: {
  text: string | null;
  systemPrompt: string;
  initialMessages: Array<{ role: string; content: unknown }>;
  availableToolNames: string[];
  effectiveModel: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  rounds?: number;
  toolCallTraces?: ToolCallTrace[];
  toolCallsBlocked?: ToolCallBlockedTrace[];
  toolsUsed?: Array<{ tool: string; detail?: string }>;
}): AgentLoopResult {
  return {
    text: params.text,
    reaction: null,
    effect: null,
    rememberedUser: null,
    generatedImage: null,
    toolCallTraces: params.toolCallTraces ?? [],
    toolCallsBlocked: params.toolCallsBlocked ?? [],
    rounds: params.rounds ?? 1,
    toolsUsed: params.toolsUsed ?? [],
    inputTokens: params.inputTokens ?? 0,
    outputTokens: params.outputTokens ?? 0,
    cachedTokens: params.cachedTokens ?? 0,
    systemPromptLength: params.systemPrompt.length,
    systemPrompt: params.systemPrompt,
    initialMessages: params.initialMessages,
    availableToolNames: params.availableToolNames,
    effectiveModel: params.effectiveModel,
    roundTraces: [],
    promptComposeMs: 0,
    toolFilterMs: 0,
  };
}
