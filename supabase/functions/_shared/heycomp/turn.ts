import { classifyConfirmation } from "../ai/models.ts";
import { buildRouterContext, type RouterContext } from "../orchestrator/build-context.ts";
import { persistTurn } from "../orchestrator/persist-turn.ts";
import type {
  AgentLoopResult,
  RouteDecision,
  TurnInput,
  TurnResult,
  TurnTrace,
} from "../orchestrator/types.ts";
import {
  getComposioRouterInstructionsSource,
  getComposioRouterModel,
  routeComposioTurn,
} from "../orchestrator/composio-chat-mode.ts";
import { createAckScheduler } from "./ack-scheduler.ts";
import { runHeyCompChatLane } from "./chat-lane.ts";
import { executeConfirmedHeyCompTool, runHeyCompSmartLane } from "./smart-lane.ts";
import {
  runHeyCompVercelSmartLane,
  shouldShadowHeyCompVercelRuntime,
  shouldUseHeyCompVercelRuntime,
} from "./vercel-runtime.ts";
import {
  getLatestHeyCompPendingConfirmation,
  logHeyCompRouterDecision,
  markHeyCompPendingConfirmation,
} from "./persistence.ts";

async function tracePromptHash(systemPrompt: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(systemPrompt));
  return Array.from(new Uint8Array(bytes))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildTrace(args: {
  turnId: string;
  turnStart: number;
  input: TurnInput;
  route: RouteDecision;
  routerCtx: RouterContext;
  routerContextMs: number;
  loopResult: AgentLoopResult;
  agentLoopLatencyMs: number;
}): Promise<TurnTrace> {
  const toolTotalLatencyMs = args.loopResult.toolCallTraces.reduce((sum, t) => sum + t.latencyMs, 0);
  return tracePromptHash(args.loopResult.systemPrompt).then((systemPromptHash) => ({
    turnId: args.turnId,
    chatId: args.input.chatId,
    senderHandle: args.input.senderHandle,
    timestamp: new Date().toISOString(),
    userMessage: args.input.userMessage.substring(0, 2000),
    timezoneResolved: args.input.timezone ?? null,
    routeDecision: args.route,
    routeLayer: args.route.routeLayer as TurnTrace["routeLayer"],
    routeReason: args.route.routeReason,
    matchedDisqualifierBucket: args.route.matchedDisqualifierBucket,
    hadPendingState: args.route.hadPendingState,
    classifierLatencyMs: args.route.routerLatencyMs,
    systemPromptLength: args.loopResult.systemPromptLength,
    systemPromptHash,
    memoryItemsLoaded: 0,
    ragEvidenceBlocks: 0,
    summariesLoaded: 0,
    connectedAccountsCount: 0,
    historyMessagesCount: args.routerCtx.recentTurns.length,
    contextBuildLatencyMs: 0,
    contextSubTimings: null,
    resolvedUserContext: null,
    agentName: args.route.agent,
    modelUsed: args.loopResult.effectiveModel,
    agentLoopRounds: args.loopResult.rounds,
    agentLoopLatencyMs: args.agentLoopLatencyMs,
    roundTraces: args.loopResult.roundTraces,
    promptComposeMs: args.loopResult.promptComposeMs,
    toolFilterMs: args.loopResult.toolFilterMs,
    toolCalls: args.loopResult.toolCallTraces,
    toolCallsBlocked: args.loopResult.toolCallsBlocked,
    toolCallCount: args.loopResult.toolCallTraces.length,
    toolTotalLatencyMs,
    inputTokens: args.loopResult.inputTokens,
    outputTokens: args.loopResult.outputTokens,
    cachedTokens: args.loopResult.cachedTokens,
    responseText: args.loopResult.text?.substring(0, 5000) ?? null,
    responseLength: args.loopResult.text?.length ?? 0,
    totalLatencyMs: Date.now() - args.turnStart,
    routerContextMs: args.routerContextMs,
    contextPath: "minimal",
    pendingActionDebug: {
      pendingEmailSendCount: 0,
      pendingEmailSendId: null,
      pendingEmailSendStatus: null,
      draftIdPresent: false,
      accountPresent: false,
      confirmationResult: args.route.confirmationState ?? "not_checked",
      heyComp: true,
    },
    systemPrompt: args.loopResult.systemPrompt,
    initialMessages: args.loopResult.initialMessages,
    availableToolNames: args.loopResult.availableToolNames,
  }));
}

async function persistAndReturn(args: {
  turnId: string;
  turnStart: number;
  input: TurnInput;
  route: RouteDecision;
  routerCtx: RouterContext;
  routerContextMs: number;
  loopResult: AgentLoopResult;
  agentLoopLatencyMs: number;
}): Promise<TurnResult> {
  const trace = await buildTrace(args);
  persistTurn(args.input, args.loopResult, trace).catch((err) =>
    console.warn("[heycomp] persistTurn failed:", err instanceof Error ? err.message : err)
  );
  return {
    text: args.loopResult.text,
    reaction: args.loopResult.reaction,
    effect: args.loopResult.effect,
    rememberedUser: args.loopResult.rememberedUser,
    generatedImage: args.loopResult.generatedImage,
    trace,
  };
}

export async function runHeyCompTurn(
  input: TurnInput,
  opts: { turnId: string; turnStart: number },
): Promise<TurnResult> {
  const routerCtxStart = Date.now();
  const routerCtx = await buildRouterContext(input);
  const routerContextMs = Date.now() - routerCtxStart;

  const pending = await getLatestHeyCompPendingConfirmation(input.chatId);
  if (pending) {
    const confirmed = await classifyConfirmation(input.userMessage, pending.promptText);
    if (confirmed) {
      const route: RouteDecision = {
        mode: "single_agent",
        agent: "smart",
        allowedNamespaces: ["composio.read", "composio.write"],
        needsMemoryRead: false,
        needsMemoryWriteCandidate: false,
        needsWebFreshness: false,
        userStyle: "normal",
        confidence: 1,
        fastPathUsed: false,
        routerLatencyMs: 0,
        primaryDomain: "general",
        memoryDepth: "none",
        forcedToolChoice: "auto",
        routeLayer: "comp",
        routeReason: "pending_confirmation_confirmed",
        confirmationState: "confirmed",
      };
      const loopStart = Date.now();
      const loopResult = await executeConfirmedHeyCompTool({ input, pending });
      return persistAndReturn({
        turnId: opts.turnId,
        turnStart: opts.turnStart,
        input,
        route,
        routerCtx,
        routerContextMs,
        loopResult,
        agentLoopLatencyMs: Date.now() - loopStart,
      });
    }

    await markHeyCompPendingConfirmation(pending.id, "cancelled");
  }

  const routeStart = Date.now();
  const route = await routeComposioTurn(input, routerCtx);
  const routeMs = Date.now() - routeStart;
  await logHeyCompRouterDecision({
    turnId: opts.turnId,
    chatId: input.chatId,
    senderHandle: input.senderHandle,
    authUserId: input.authUserId,
    messageText: input.userMessage,
    mode: route.agent === "smart" ? "smart" : "chat",
    reason: route.routeReason ?? "unknown",
    model: getComposioRouterModel(),
    latencyMs: route.routerLatencyMs || routeMs,
    promptSource: getComposioRouterInstructionsSource(),
  });

  const loopStart = Date.now();
  let loopResult: AgentLoopResult;
  if (route.agent === "chat") {
    loopResult = await runHeyCompChatLane(input);
  } else {
    const ack = createAckScheduler({
      turnId: opts.turnId,
      chatId: input.chatId,
      senderHandle: input.senderHandle,
      userText: input.userMessage,
      routeReason: route.routeReason ?? "smart",
      send: async (text) => {
        if (typeof input.onPreAck === "function") await input.onPreAck(text);
      },
    });
    const ackPromise = ack.fireInitial();
    ack.armFollowup(10_000);
    try {
      if (shouldUseHeyCompVercelRuntime(input)) {
        loopResult = await runHeyCompVercelSmartLane({ input, turnId: opts.turnId, routerCtx });
      } else {
        if (shouldShadowHeyCompVercelRuntime(input)) {
          runHeyCompVercelSmartLane({
            input,
            turnId: crypto.randomUUID(),
            routerCtx,
          }).catch((error) =>
            console.warn("[heycomp] Vercel shadow runtime failed:", error instanceof Error ? error.message : error)
          );
        }
        loopResult = await runHeyCompSmartLane({
          input,
          turnId: opts.turnId,
          routeReason: route.routeReason ?? "smart",
        });
      }
    } finally {
      ack.markFinal();
      ackPromise.catch((error) =>
        console.warn("[heycomp] initial ack failed:", error instanceof Error ? error.message : error)
      );
    }
  }

  return persistAndReturn({
    turnId: opts.turnId,
    turnStart: opts.turnStart,
    input,
    route,
    routerCtx,
    routerContextMs,
    loopResult,
    agentLoopLatencyMs: Date.now() - loopStart,
  });
}
