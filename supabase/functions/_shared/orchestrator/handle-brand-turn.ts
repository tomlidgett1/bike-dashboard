import { BrandApiDebugCollector } from '../brand-api-debug.ts';
import {
  buildConciseHandoffSummary,
  fetchBrandImages,
  parseAndStripHandoffNotify,
  parseAndStripImageTags,
  parseInternalMode,
} from '../brand-chat-helpers.ts';
import { createBrandHandoffWorkorder } from '../brand-handoff-workorder.ts';
import type {
  BrandChatInput,
  BrandChatResult,
  BrandPromptContext,
} from '../brand-chat-types.ts';
import {
  buildUniversalSystemPrompt,
  fetchBrandChatConfig,
  normaliseLightspeedToolSettings,
} from '../brand-chat-config.ts';
import { enrichBusinessPromptWithKnowledge } from '../brand-knowledge.ts';
import { sendBrandHandoffStaffPing } from '../brand-handoff-notify.ts';
import {
  applyBookingClaimGuard,
  loadBookingState,
  tryDeterministicBookingCommit,
} from '../brand-lightspeed-booking.ts';
import { getBrandAsync } from '../brand-registry.ts';
import { getAdminClient } from '../supabase.ts';
import {
  buildBrandContext,
  buildBrandRouterContext,
  persistBrandInboundMessage,
} from './build-brand-context.ts';
import { persistTurn } from './persist-turn.ts';
import { routeBrandTurn } from './route-brand-turn.ts';
import { runAgentLoop } from './run-agent-loop.ts';
import { selectAgent } from './select-agent.ts';
import type { TurnInput, TurnTrace } from './types.ts';

function toTurnInput(input: BrandChatInput, brandContext: BrandPromptContext): TurnInput {
  return {
    chatId: input.chatId,
    userMessage: input.message,
    images: input.images ?? [],
    audio: input.audio ?? [],
    senderHandle: input.senderHandle,
    isGroupChat: input.isGroupChat ?? false,
    participantNames: input.participantNames ?? [],
    chatName: input.chatName ?? null,
    service: input.service,
    incomingEffect: input.incomingEffect,
    authUserId: null,
    isOnboarding: false,
    timezone: brandContext.config?.business_timezone ?? 'Australia/Melbourne',
    voiceMode: input.voiceMode ?? false,
    brandContext,
    providerMessageId: input.providerMessageId ?? null,
  };
}

async function buildBrandPromptContext(
  input: BrandChatInput,
): Promise<BrandPromptContext> {
  const { baseBrandKey, isInternal } = parseInternalMode(input.brandKey);
  const supabase = getAdminClient();
  const brand = await getBrandAsync(input.brandKey);
  if (!brand) {
    throw new Error(`Unknown brand: ${input.brandKey}`);
  }

  const config = await fetchBrandChatConfig(baseBrandKey);
  const lightspeedSettings = normaliseLightspeedToolSettings(
    config?.lightspeed_settings ?? null,
  );
  const displayName = config?.business_display_name?.trim() || brand.name;
  const businessBaseline = (config?.business_raw_prompt ?? '').trim()
    || brand.businessBaseline
    || (config?.core_system_prompt ?? '').trim();
  const businessPrompt = await enrichBusinessPromptWithKnowledge(
    supabase,
    baseBrandKey,
    businessBaseline,
  );
  const systemPrompt = buildUniversalSystemPrompt(displayName, config);
  const bookingState = !isInternal && lightspeedSettings.booking.enabled
    ? await loadBookingState(supabase, baseBrandKey, input.chatId)
    : null;
  const imageCatalog = isInternal ? [] : await fetchBrandImages(baseBrandKey);

  return {
    brandKey: input.brandKey,
    baseBrandKey,
    brandName: brand.name,
    displayName,
    businessBaseline: brand.businessBaseline,
    isInternal,
    sessionStartedAt: input.sessionStartedAt,
    config,
    lightspeedSettings,
    bookingState,
    handoffPhoneE164: config?.handoff_phone_e164?.trim() ?? null,
    imageCatalog,
    systemPrompt,
    businessPrompt,
  };
}

async function buildPromptHash(seed: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(seed),
      ),
    ),
  ).slice(0, 8).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleBrandTurn(
  input: BrandChatInput,
): Promise<BrandChatResult> {
  const turnStarted = Date.now();
  const turnId = crypto.randomUUID();
  const brandApiDebug = new BrandApiDebugCollector();

  const promptContext = await buildBrandPromptContext(input);
  const turnInput = toTurnInput(input, promptContext);

  // Root-cause fix for booking hallucinations: when the customer sends an
  // unambiguous confirmation on a complete draft with a phone on file, commit
  // the workorder deterministically BEFORE the LLM runs. This removes the
  // model's authority over the commit decision for the unambiguous case — it
  // cannot "forget" to call the tool, because we do not call the tool at all;
  // we call the Lightspeed edge function directly. If anything is fuzzy
  // (missing fields, no phone, wobbly confirmation, Lightspeed error) we fall
  // through to the normal LLM path, which has the context to handle it.
  if (!promptContext.isInternal) {
    try {
      const deterministic = await tryDeterministicBookingCommit(
        {
          supabase: getAdminClient(),
          brandKey: promptContext.baseBrandKey,
          chatId: input.chatId,
          settings: promptContext.lightspeedSettings,
          brandApiDebug,
        },
        {
          bookingState: promptContext.bookingState,
          userMessage: input.message,
        },
      );
      if (deterministic.committed) {
        try {
          await persistBrandInboundMessage(turnInput);
          const { addMessage, insertToolTrace } = await import('../state.ts');
          const engagement = {
            scope: 'brand' as const,
            brandKey: promptContext.baseBrandKey,
          };
          await addMessage(input.chatId, 'assistant', deterministic.text, undefined, {
            isGroupChat: input.isGroupChat,
            chatName: input.chatName,
            participantNames: input.participantNames,
            service: input.service,
            engagement,
            metadata: {
              tools_used: [{ tool: 'brand_booking_create', detail: 'deterministic_commit' }],
            },
          });
          await insertToolTrace({
            chatId: input.chatId,
            engagement,
            toolName: 'brand_booking_create',
            outcome: 'success',
            safeSummary: 'deterministic confirmed booking commit',
          });
          const { error: traceError } = await getAdminClient().from('turn_traces').insert({
            turn_id: turnId,
            chat_id: input.chatId,
            sender_handle: input.senderHandle,
            user_message: input.message.substring(0, 2000),
            timezone_resolved: turnInput.timezone,
            route_agent: 'deterministic_booking_commit',
            route_mode: 'single_agent',
            route_fast_path: true,
            route_namespaces: ['brand.booking.create'],
            agent_name: 'deterministic_booking_commit',
            model_used: 'deterministic-commit',
            agent_loop_rounds: 0,
            agent_loop_latency_ms: 0,
            tool_calls: [{
              name: 'brand_booking_create',
              namespace: 'brand.booking.create',
              sideEffect: 'commit',
              latencyMs: Date.now() - turnStarted,
              outcome: 'success',
              approvalGranted: true,
              approvalMethod: 'explicit',
            }],
            tool_calls_blocked: [],
            tool_call_count: 1,
            input_tokens: 0,
            output_tokens: 0,
            cached_tokens: 0,
            response_text: deterministic.text.substring(0, 5000),
            response_length: deterministic.text.length,
            total_latency_ms: Date.now() - turnStarted,
            context_path: 'brand',
            pending_action_debug: {
              brand_key: promptContext.baseBrandKey,
              brand_mode: 'customer',
              workorder_id: deterministic.workorderId,
              deterministic_booking_commit: true,
            },
          });
          if (traceError) {
            console.warn(
              '[handle-brand-turn] deterministic turn trace insert failed:',
              traceError.message,
            );
          }
        } catch (persistError) {
          console.error(
            '[handle-brand-turn] deterministic booking persistence failed:',
            (persistError as Error).message,
          );
        }
        console.warn(
          '[handle-brand-turn] deterministic booking commit fired — skipping LLM',
          JSON.stringify({
            brand_key: promptContext.baseBrandKey,
            chat_id: input.chatId,
            workorder_id: deterministic.workorderId,
            latency_ms: Date.now() - turnStarted,
          }),
        );
        return {
          text: deterministic.text,
          brandName: promptContext.displayName,
          model: 'deterministic-commit',
          inputTokens: 0,
          outputTokens: 0,
          images: [],
          brandApiCalls: brandApiDebug.getCalls(),
        };
      }
    } catch (err) {
      console.error(
        '[handle-brand-turn] deterministic booking commit errored, falling through to LLM:',
        (err as Error).message,
      );
    }
  }

  const routerContextStarted = Date.now();
  const routerCtx = await buildBrandRouterContext(turnInput);
  const routerContextMs = Date.now() - routerContextStarted;

  const route = await routeBrandTurn(turnInput, routerCtx);

  const contextStarted = Date.now();
  const context = await buildBrandContext(turnInput, routerCtx);
  const contextBuildLatencyMs = Date.now() - contextStarted;

  const agent = selectAgent(route.agent);
  const loopStarted = Date.now();
  const loopResult = await runAgentLoop(
    agent,
    context,
    turnInput,
    route.allowedNamespaces,
    route.modelTierOverride,
    route.forcedToolChoice,
    route.primaryDomain,
    route.secondaryDomains,
    route.reasoningEffortOverride,
    route.classifierResult?.requiredCapabilities,
    route.modelOverride,
    route.routeLayer,
    brandApiDebug,
  );
  const agentLoopLatencyMs = Date.now() - loopStarted;
  const postToolBookingState = !promptContext.isInternal &&
      promptContext.lightspeedSettings.booking.enabled
    ? await loadBookingState(
        getAdminClient(),
        promptContext.baseBrandKey,
        input.chatId,
      )
    : null;

  const imageMap = new Map<string, string>();
  for (const image of promptContext.imageCatalog) {
    imageMap.set(image.id, image.url);
  }

  const rawText = loopResult.text ?? '';
  const { outputSansHandoff, handoffNotify } = parseAndStripHandoffNotify(rawText);
  const { cleanText, resolvedImages } = parseAndStripImageTags(
    outputSansHandoff,
    imageMap,
  );
  loopResult.text = cleanText;

  // Booking hallucination guard. If the LLM produced a "booked in / locked in /
  // got it set" style reply but never successfully ran brand_booking_create,
  // override the reply so we do not mislead the customer or create an
  // unconfirmed workorder.
  let guardedText = cleanText;
  const guardedBookingState = postToolBookingState;
  if (!promptContext.isInternal && promptContext.lightspeedSettings.booking.enabled) {
    try {
      const guardResult = await applyBookingClaimGuard(
        {
          supabase: getAdminClient(),
          brandKey: promptContext.baseBrandKey,
          chatId: input.chatId,
          senderHandle: input.senderHandle,
          settings: promptContext.lightspeedSettings,
          brandApiDebug,
        },
        {
          text: cleanText,
          bookingState: postToolBookingState,
          executedTools: loopResult.toolCallTraces.map((t) => ({
            name: t.name,
            outcome: t.outcome,
          })),
        },
      );
      if (guardResult.overrideReason) {
        console.warn(
          `[handle-brand-turn] booking guard fired (${guardResult.overrideReason})`,
          JSON.stringify({
            brand_key: promptContext.baseBrandKey,
            chat_id: input.chatId,
          }),
        );
        guardedText = guardResult.text;
        loopResult.text = guardResult.text;
      }
    } catch (err) {
      console.error('[handle-brand-turn] booking guard failed:', (err as Error).message);
    }
  }

  const shouldCreateHandoffWorkorder =
    !promptContext.isInternal &&
    handoffNotify &&
    promptContext.lightspeedSettings.handoff_workorder.enabled;

  if (!promptContext.isInternal && handoffNotify) {
    const summary = buildConciseHandoffSummary(context.history, input.message);

    if (promptContext.handoffPhoneE164) {
      sendBrandHandoffStaffPing({
        staffPhoneE164: promptContext.handoffPhoneE164,
        businessName: promptContext.displayName,
        customerE164: input.senderHandle,
        threadSummary: summary,
      }).catch((err) =>
        console.error('[handle-brand-turn] handoff ping failed:', (err as Error).message)
      );
    }

    if (shouldCreateHandoffWorkorder) {
      createBrandHandoffWorkorder({
        brandKey: promptContext.baseBrandKey,
        customerPhone: input.senderHandle,
        latestUserMessage: input.message,
        threadSummary: summary,
      }, brandApiDebug)
        .then((result) => {
          if (!result.ok) {
            console.error('[handle-brand-turn] handoff workorder failed:', result.error);
          }
        })
        .catch((err) =>
          console.error('[handle-brand-turn] handoff workorder failed:', (err as Error).message)
        );
    }
  }

  const toolTotalLatencyMs = loopResult.toolCallTraces.reduce(
    (sum, trace) => sum + trace.latencyMs,
    0,
  );
  const trace: TurnTrace = {
    turnId,
    chatId: turnInput.chatId,
    senderHandle: turnInput.senderHandle,
    timestamp: new Date().toISOString(),
    userMessage: turnInput.userMessage.substring(0, 2000),
    timezoneResolved: turnInput.timezone ?? null,
    routeDecision: route,
    classifierResult: route.classifierResult,
    routeLayer: route.routeLayer,
    routeReason: route.routeReason,
    matchedDisqualifierBucket: route.matchedDisqualifierBucket,
    hadPendingState: route.hadPendingState,
    classifierLatencyMs: route.routerLatencyMs,
    systemPromptLength: loopResult.systemPromptLength,
    systemPromptHash: await buildPromptHash(loopResult.systemPrompt),
    memoryItemsLoaded: context.memoryItems.length,
    ragEvidenceBlocks: context.ragEvidenceBlockCount,
    summariesLoaded: context.summaries.length,
    connectedAccountsCount: context.connectedAccounts.length,
    historyMessagesCount: context.history.length,
    contextBuildLatencyMs,
    contextSubTimings: context.subTimings ?? null,
    resolvedUserContext: context.resolvedUserContext,
    agentName: agent.name,
    modelUsed: loopResult.effectiveModel,
    agentLoopRounds: loopResult.rounds,
    agentLoopLatencyMs,
    roundTraces: loopResult.roundTraces,
    promptComposeMs: loopResult.promptComposeMs,
    toolFilterMs: loopResult.toolFilterMs,
    toolCalls: loopResult.toolCallTraces,
    toolCallsBlocked: loopResult.toolCallsBlocked,
    toolCallCount: loopResult.toolCallTraces.length,
    toolTotalLatencyMs,
    inputTokens: loopResult.inputTokens,
    outputTokens: loopResult.outputTokens,
    cachedTokens: loopResult.cachedTokens,
    responseText: guardedText.substring(0, 5000),
    responseLength: guardedText.length,
    totalLatencyMs: Date.now() - turnStarted,
    routerContextMs,
    contextPath: 'brand',
    pendingActionDebug: {
      pendingEmailSendCount: 0,
      pendingEmailSendId: null,
      pendingEmailSendStatus: null,
      draftIdPresent: false,
      accountPresent: false,
      confirmationResult: route.confirmationState ?? 'not_checked',
      brand_key: promptContext.brandKey,
      brand_name: promptContext.displayName,
      brand_mode: promptContext.isInternal ? 'internal' : 'customer',
      booking_state: guardedBookingState,
      brand_api_calls: brandApiDebug.getCalls(),
    },
    systemPrompt: loopResult.systemPrompt,
    initialMessages: loopResult.initialMessages,
    availableToolNames: loopResult.availableToolNames,
  };

  persistTurn(turnInput, loopResult, trace).catch((err) =>
    console.warn('[handle-brand-turn] persistTurn failed:', (err as Error).message)
  );

  return {
    text: guardedText,
    brandName: promptContext.displayName,
    model: loopResult.effectiveModel,
    inputTokens: loopResult.inputTokens,
    outputTokens: loopResult.outputTokens,
    images: resolvedImages,
    brandApiCalls: brandApiDebug.getCalls(),
  };
}
