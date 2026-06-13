// Genie agent core runner: router → direct paths → planner → executor, emitting SSE-shaped
// events through an injected emit callback. Shared by the SSE route and background jobs —
// callers own transport (HTTP stream vs job-row persistence); this module owns the run.
import { Agent, user as userMessage } from '@openai/agents'
import { randomUUID } from 'crypto'
import {
  GenieOrchestrationDecision,
  latestUserText,
} from '@/lib/genie/orchestration'
import {
  canRunParallelTools,
  maxToolConcurrencyForRoute,
} from '@/lib/genie/agent-runtime-policy'
import { compactGenieProgressText } from '@/lib/genie/progress-text'
import { persistGenieAgentRun } from '@/lib/genie/telemetry'
import {
  STREAM_HEARTBEAT_MS,
  createGenieRunner,
  genieTraceId,
} from './runtime'
import {
  DEFAULT_GENIE_MODELS,
  getGenieModelConfig,
  getGenieRuntimePolicy,
  type GenieModelConfig,
  type GenieModelProfile,
} from './model-profiles'
import {
  buildCasualPrompt,
  buildDirectAnswerInstructions,
  buildSystemPrompt,
  type GenieExecutionPlan,
} from './prompts'
import { createGenieOrchestrationDecision, createGenieExecutionPlan } from './orchestrator'
import type { ComposioSessionIds, Message, RawModelDeltaEvent, StreamToolItem } from './context'
import { compactCustomerProfileForContext, toAgentInputMessages } from './context'
import {
  buildAgentTools,
  buildLightspeedCustomerProfile,
  emitAnalysisPlan,
  emitCustomerProfile,
  executorModelForRoute,
  toAnalysisPlanPayload,
  visualPrefsForMessages,
  type Supa,
} from './tools'
import {
  customerBikeProfileAnswer,
  customerProfileAnswer,
  directSalesSummaryAnswer,
  getDirectSalesSummary,
  latestCustomerReferenceFromMessages,
  resolveDirectSalesSummaryLookup,
  resolveDirectSalesSummaryPeriod,
} from './direct-paths'
import {
  statusAfterTool,
  statusForExecutionStart,
  statusForRoute,
  statusForTool,
} from './status'

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(1, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanDirectEntityQuery(value: string | undefined): string | null {
  const cleaned = (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/g, '')
    .replace(/\bplease\b$/i, '')
    .trim()
  if (cleaned.length < 2 || cleaned.length > 120) return null
  return cleaned
}

function resolveObviousLightspeedDirectPath(
  latestUserMessage: string,
  messages: Message[],
): Pick<GenieOrchestrationDecision, 'direct_path' | 'entity_query' | 'reason'> | null {
  const text = latestUserMessage.trim()
  const normalised = text.toLowerCase().replace(/\s+/g, ' ')
  if (!normalised) return null

  const salesLookup = resolveDirectSalesSummaryLookup(text)
  const salesPeriodLookup = resolveDirectSalesSummaryPeriod(text)
  const hasSimpleSalesIntent = /\b(any sales|sales?|takings?|revenue|turnover|gross sales|net sales|gross profit|profit|margin|made|took)\b/i.test(text)
  const hasSalesBreakdownIntent = /\b(top|best|rank|ranking|list|every|each|transaction|transactions|receipt|receipts|orders?|line items?|products?|items?|services?|customers?|category|categories|breakdown|trend|chart|graph|compare|comparison|vs|versus|between|from .+ to)\b/i.test(text)
  if (hasSimpleSalesIntent && salesPeriodLookup && !hasSalesBreakdownIntent) {
    return {
      direct_path: 'sales_summary',
      entity_query: salesPeriodLookup.label,
      reason: 'Deterministic fast path for a simple sales summary period.',
    }
  }
  if (salesLookup) {
    return {
      direct_path: 'sales_summary',
      entity_query: salesLookup.label,
      reason: 'Deterministic fast path for a simple sales summary period.',
    }
  }

  const fitmentIntent = /\b(bottom bracket|bb|brake|pad|rotor|headset|seatpost|axle|bearing|freehub|cassette|chain|tyre|tire|drivetrain|compatib|standard|need)\b/i
  if (fitmentIntent.test(text)) return null

  const priorCustomer = latestCustomerReferenceFromMessages(messages)
  const pronounBikeLookup = /\bwhat\s+bikes?\s+(?:does|do)\s+(?:she|he|they|this customer|that customer)\s+(?:have|own|ride|use)\b/i
  if (pronounBikeLookup.test(text) && priorCustomer?.query) {
    return {
      direct_path: 'customer_bikes',
      entity_query: priorCustomer.query,
      reason: 'Deterministic fast path for a customer bike follow-up.',
    }
  }

  const bikePatterns = [
    /\bwhat\s+bikes?\s+does\s+(.+?)\s+(?:have|own|ride|use)\b/i,
    /\bwhat\s+bikes?\s+do\s+(.+?)\s+(?:have|own|ride|use)\b/i,
    /\bwhich\s+bikes?\s+does\s+(.+?)\s+(?:have|own|ride|use)\b/i,
    /\b(?:show|list)\s+(?:me\s+)?(?:the\s+)?bikes?\s+(?:for|owned by)\s+(.+?)$/i,
    /\bcustomer\s+bikes?\s+(?:for\s+)?(.+?)$/i,
    /^(.+?)'s\s+bikes?$/i,
  ]
  for (const pattern of bikePatterns) {
    const entity = cleanDirectEntityQuery(text.match(pattern)?.[1])
    if (entity) {
      return {
        direct_path: 'customer_bikes',
        entity_query: entity,
        reason: 'Deterministic fast path for a customer bike lookup.',
      }
    }
  }

  const profilePatterns = [
    /^(?:customer|customer profile|profile for)\s+(.+?)$/i,
    /^(?:tell me about|show me|show|pull up|history for|what do we know about)\s+customer\s+(.+?)$/i,
  ]
  for (const pattern of profilePatterns) {
    const entity = cleanDirectEntityQuery(text.match(pattern)?.[1])
    if (entity) {
      return {
        direct_path: 'customer_profile',
        entity_query: entity,
        reason: 'Deterministic fast path for a customer profile lookup.',
      }
    }
  }

  return null
}

// Matches the route segment's maxDuration. Past the warn ratio, every tool
// result carries a wrap-up directive so long analyses land before the platform
// kills the function instead of relying on turn count alone.
const RUN_TIME_BUDGET_MS = 600_000
const RUN_TIME_BUDGET_WARN_RATIO = 0.6

function applyTimeBudgetToTools(
  tools: unknown[],
  startedAt: number,
  budgetMs: number,
  fastMode = false,
): void {
  for (const candidate of tools) {
    const fnTool = candidate as { type?: string; invoke?: (...args: never[]) => Promise<unknown> }
    if (fnTool.type !== 'function' || typeof fnTool.invoke !== 'function') continue
    const original = fnTool.invoke.bind(candidate)
    ;(candidate as { invoke: unknown }).invoke = async (...args: never[]) => {
      const output = await original(...args)
      const elapsed = Date.now() - startedAt
      if (elapsed < budgetMs * RUN_TIME_BUDGET_WARN_RATIO) return output
      const note = fastMode
        ? `[time_budget] ${Math.round(elapsed / 1000)}s of the ${Math.round(budgetMs / 1000)}s run budget used — wrap up now: consolidate the evidence you already have into the final answer and do not start new broad lookups.`
        : `[time_budget] ${Math.round(elapsed / 1000)}s of the ${Math.round(budgetMs / 1000)}s run budget used — wrap up now: consolidate the evidence you already have into the final answer, run verify_question_answered, and do not start new broad lookups.`
      if (typeof output === 'string') return `${output}\n\n${note}`
      if (isRecord(output)) return { ...output, time_budget: note }
      return output
    }
  }
}

/**
 * Streams a fast-model answer grounded in prefetched direct-path data. The LLM
 * router decided the path; this keeps the answer faithful to the user's actual
 * phrasing instead of emitting a canned template. Falls back to the template
 * answer if the model produces nothing.
 */
async function streamGroundedDirectAnswer(args: {
  storeName: string
  userId: string
  requestId: string
  route: GenieOrchestrationDecision['route']
  question: string
  groundingLabel: string
  grounding: string
  fallbackAnswer: string
  models: GenieModelConfig
  emit: (data: object) => void
  signal: AbortSignal
  onFirstText: () => void
}): Promise<void> {
  let produced = false
  try {
    const directAgent = new Agent({
      name: 'Yellow Jersey Direct Answer Agent',
      model: args.models.executor,
      instructions: buildDirectAnswerInstructions(args.storeName, args.groundingLabel, args.grounding),
      tools: [],
      modelSettings: {
        parallelToolCalls: false,
        store: false,
        reasoning: { effort: 'low', summary: 'auto' },
        text: { verbosity: 'low' },
      },
    })
    const runner = createGenieRunner({
      requestId: args.requestId,
      userId: args.userId,
      storeName: args.storeName,
      route: args.route,
      stage: 'direct_answer',
      workflowName: 'Yellow Jersey Genie Direct Answer',
    })
    const stream = await runner.run(directAgent, [userMessage(args.question)], {
      stream: true,
      maxTurns: 1,
      signal: args.signal,
      reasoningItemIdPolicy: 'omit',
    })

    for await (const event of stream) {
      if (event.type !== 'raw_model_stream_event') continue
      const raw = event.data as RawModelDeltaEvent
      const rawType = raw.type ?? raw.event?.type
      const delta =
        typeof raw.delta === 'string'
          ? raw.delta
          : typeof raw.event?.delta === 'string'
            ? raw.event.delta
            : ''
      if ((rawType === 'output_text_delta' || rawType === 'response.output_text.delta') && delta) {
        if (!produced) {
          produced = true
          args.onFirstText()
        }
        args.emit({ event: 'text_delta', text: delta })
      }
    }

    await stream.completed
  } catch (error) {
    if (args.signal.aborted) throw error
    console.warn('[Genie Agent] direct answer stream failed; using template fallback', {
      requestId: args.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (!produced) {
    args.onFirstText()
    args.emit({ event: 'text_delta', text: args.fallbackAnswer })
  }
}

export interface ExecuteGenieAgentArgs {
  supabase: Supa
  userId: string
  storeName: string
  messages: Message[]
  conversationId: string | null
  composioSessionIds: ComposioSessionIds
  modelProfile?: GenieModelProfile
  /** Receives every SSE-shaped event ({event: 'status'|'text_delta'|...}). */
  emit: (data: object) => void
  /** Aborts the run (job cancellation or client disconnect when the caller ties it to the request). */
  signal: AbortSignal
}

export async function executeGenieAgent(options: ExecuteGenieAgentArgs): Promise<void> {
  const { supabase, userId, storeName, messages, conversationId, composioSessionIds, signal } = options
  const modelProfile = options.modelProfile ?? 'default'
  const models = getGenieModelConfig(modelProfile)
  const runtime = getGenieRuntimePolicy(modelProfile)
  const visualPrefs = visualPrefsForMessages(messages)
  const requestId = randomUUID()
  const requestStartedAt = Date.now()

  let lastStatusKey = ''
  let lastStatusPhase = 'thinking'
  let lastStatusText = 'Working'
  let finalRoute: GenieOrchestrationDecision['route'] | null = null
  let plannerUsed = false
  let orchestrationSource: 'model' | 'deterministic' | null = null
  let routerInvoked = false
  let executorModel: string | null = null
  let firstTextAt: number | null = null
  let runStatus: 'completed' | 'error' | 'cancelled' = 'completed'
  let runErrorMessage: string | null = null
  let toolCallCount = 0
  const toolCallNames: Record<string, number> = {}
  let activeToolName: string | null = null

  const emit = (data: object) => {
    if ('event' in data && (data as { event?: unknown }).event === 'status') {
      const status = data as { phase?: unknown; text?: unknown }
      const phase = String(status.phase ?? '')
      const text = compactGenieProgressText(String(status.text ?? ''), phase)
      const key = `${phase}:${text}`
      if (key === lastStatusKey) return
      lastStatusKey = key
      lastStatusPhase = phase
      lastStatusText = text
      options.emit({ event: 'status', phase, text })
      return
    }
    options.emit(data)
  }

  const heartbeatTimer = setInterval(() => {
    const elapsedMs = Date.now() - requestStartedAt
    try {
      options.emit({
        event: 'heartbeat',
        elapsed_ms: elapsedMs,
        route: finalRoute,
        planner_used: plannerUsed,
        phase: lastStatusPhase,
        text: `Still ${lastStatusText.toLowerCase()} (${formatElapsed(elapsedMs)})`,
      })
    } catch (error) {
      clearInterval(heartbeatTimer)
      console.warn('[Genie Agent] heartbeat emit failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, STREAM_HEARTBEAT_MS)

  try {
    emit({ event: 'status', phase: 'context', text: 'Reading conversation context' })

    const latestUserMessage = latestUserText(messages)
    const inputMessages = toAgentInputMessages(messages)
    const orchestrationStartedAt = Date.now()
    const directPathOverride = resolveObviousLightspeedDirectPath(latestUserMessage, messages)
    let orchestration: GenieOrchestrationDecision

    if (directPathOverride) {
      routerInvoked = false
      orchestrationSource = 'deterministic'
      orchestration = {
        route: 'lightspeed_sql',
        needs_plan: false,
        direct_path: directPathOverride.direct_path,
        entity_query: directPathOverride.entity_query,
        reason: directPathOverride.reason,
      }
      emit({ event: 'status', phase: 'routing_done', text: 'Using fast Lightspeed path' })
    } else {
      routerInvoked = true
      orchestrationSource = 'model'
      emit({ event: 'status', phase: 'routing', text: 'Choosing the best workflow' })
      orchestration = await createGenieOrchestrationDecision({
        storeName,
        userId,
        requestId,
        messages,
        signal,
        models,
      })
      emit({ event: 'status', phase: 'routing_done', text: statusForRoute(orchestration.route) })
    }
    finalRoute = orchestration.route
    console.info('[Genie Agent] orchestration', {
      requestId,
      conversation_id: conversationId,
      orchestration_source: orchestrationSource,
      router_model: models.orchestrator,
      router_invoked: routerInvoked,
      route: orchestration.route,
      needs_plan: orchestration.needs_plan,
      reason: orchestration.reason,
      message_count: messages.length,
      latest_user_chars: messages.at(-1)?.content?.length ?? 0,
      ms: Date.now() - orchestrationStartedAt,
    })

    if (orchestration.route === 'casual_chat' || orchestration.route === 'unsupported') {
      const casualAgent = new Agent({
        name: 'Yellow Jersey Casual Agent',
        model: models.executor,
        instructions: buildCasualPrompt(storeName),
        tools: [],
        modelSettings: {
          parallelToolCalls: false,
          store: false,
          reasoning: { effort: 'low', summary: 'auto' },
          text: { verbosity: 'low' },
        },
      })

      const casualRunner = createGenieRunner({
        requestId,
        userId,
        storeName,
        route: orchestration.route,
        stage: 'casual',
        workflowName: 'Yellow Jersey Genie Casual',
      })
      const casualStream = await casualRunner.run(casualAgent, inputMessages, {
        stream: true,
        maxTurns: 1,
        signal,
        reasoningItemIdPolicy: 'omit',
      })

      for await (const event of casualStream) {
        if (event.type !== 'raw_model_stream_event') continue
        const raw = event.data as RawModelDeltaEvent
        const rawType = raw.type ?? raw.event?.type
        const delta =
          typeof raw.delta === 'string'
            ? raw.delta
            : typeof raw.event?.delta === 'string'
              ? raw.event.delta
              : ''
        const reasoningText =
          typeof raw.text === 'string'
            ? raw.text
            : typeof raw.event?.text === 'string'
              ? raw.event.text
              : typeof raw.part?.text === 'string'
                ? raw.part.text
                : typeof raw.event?.part?.text === 'string'
                  ? raw.event.part.text
                  : ''

        if (rawType === 'response.reasoning_summary_text.delta' && delta) {
          emit({ event: 'reasoning_delta', text: delta })
        }

        if (
          (rawType === 'response.reasoning_summary_text.done' ||
            rawType === 'response.reasoning_summary_part.done') &&
          reasoningText
        ) {
          emit({ event: 'reasoning_done', text: reasoningText })
        }

        if (rawType === 'output_text_delta' || rawType === 'response.output_text.delta') {
          if (firstTextAt == null && delta) {
            firstTextAt = Date.now()
            console.info('[Genie Agent] first_text', {
              requestId,
              route: finalRoute,
              ms: firstTextAt - requestStartedAt,
            })
          }
          emit({ event: 'text_delta', text: delta })
        }
      }

      await casualStream.completed
      emit({ event: 'done' })
      return
    }

    // Direct paths come from either a conservative deterministic pre-router
    // shortcut or the structured LLM router decision. Data is prefetched
    // deterministically, then a fast model streams an answer grounded in it.
    const directPath = orchestration.route === 'lightspeed_sql' ? orchestration.direct_path : 'none'
    const entityQuery = orchestration.entity_query?.trim() || null

    const markDirectFirstText = (path: string) => () => {
      if (firstTextAt != null) return
      firstTextAt = Date.now()
      console.info('[Genie Agent] first_text', {
        requestId,
        route: finalRoute,
        ms: firstTextAt - requestStartedAt,
        direct_path: path,
      })
    }

    if ((directPath === 'customer_profile' || directPath === 'customer_bikes') && entityQuery) {
      executorModel = 'direct_customer_profile'
      toolCallCount += 1
      toolCallNames.get_lightspeed_customer_profile = 1
      emit({ event: 'status', phase: 'setup', text: 'Preparing customer profile' })
      emit({ event: 'status', phase: 'lightspeed_customers', text: `Building customer profile for ${entityQuery}` })

      // For bike-ownership follow-ups, prefer the customer already resolved in
      // prior structured context when the router's entity matches it.
      const contextCustomer = directPath === 'customer_bikes' ? latestCustomerReferenceFromMessages(messages) : null
      const contextMatches = Boolean(
        contextCustomer?.customer_id &&
        (contextCustomer.query.toLowerCase().includes(entityQuery.toLowerCase()) ||
          entityQuery.toLowerCase().includes(contextCustomer.query.toLowerCase())),
      )

      const profile = await buildLightspeedCustomerProfile(userId, {
        customer_id: contextMatches ? contextCustomer?.customer_id : undefined,
        query: entityQuery,
        include_workorders: true,
        sales_row_limit: 20_000,
      }, emit)
      emitCustomerProfile(emit, profile)

      const fallbackAnswer = directPath === 'customer_bikes'
        ? customerBikeProfileAnswer(profile)
        : customerProfileAnswer(profile)
      emit({ event: 'status', phase: 'responding', text: 'Writing answer' })
      await streamGroundedDirectAnswer({
        storeName,
        userId,
        requestId,
        route: orchestration.route,
        question: latestUserMessage,
        groundingLabel: directPath === 'customer_bikes' ? 'customer bikes + profile' : 'customer profile',
        grounding: compactCustomerProfileForContext(profile),
        fallbackAnswer,
        models,
        emit,
        signal,
        onFirstText: markDirectFirstText(directPath),
      })
      emit({ event: 'done' })
      return
    }

    if (directPath === 'sales_summary') {
      const lookup = (entityQuery ? resolveDirectSalesSummaryPeriod(entityQuery) : null)
        ?? resolveDirectSalesSummaryPeriod(latestUserMessage)
        ?? resolveDirectSalesSummaryLookup(latestUserMessage)
      if (lookup) {
        executorModel = 'direct_sales_summary'
        toolCallCount += 1
        toolCallNames.direct_sales_summary = 1
        emit({ event: 'status', phase: 'setup', text: 'Preparing fast sales summary' })
        emit({ event: 'status', phase: 'lightspeed_sales', text: `Reading sales for ${lookup.label}` })
        const result = await getDirectSalesSummary(userId, lookup, emit, visualPrefs)
        emit({ event: 'status', phase: 'responding', text: 'Writing answer' })
        await streamGroundedDirectAnswer({
          storeName,
          userId,
          requestId,
          route: orchestration.route,
          question: latestUserMessage,
          groundingLabel: `sales summary for ${lookup.label}`,
          grounding: JSON.stringify(result, null, 1),
          fallbackAnswer: directSalesSummaryAnswer(result),
          models,
          emit,
          signal,
          onFirstText: markDirectFirstText('direct_sales_summary'),
        })
        emit({ event: 'done' })
        return
      }
      // Period didn't resolve to a known range — fall through to the executor.
    }

    let executionPlan: GenieExecutionPlan | null = null
    const shouldPlan = orchestration.needs_plan && !runtime.skipPlanner

    if (shouldPlan) {
      plannerUsed = true
      emit({ event: 'status', phase: 'planning', text: 'Planning the smart workflow' })
      const planningStartedAt = Date.now()
      executionPlan = await createGenieExecutionPlan({
        storeName,
        userId,
        requestId,
        inputMessages,
        route: orchestration.route,
        signal,
        models,
        emit,
      })
      if (executionPlan) {
        emitAnalysisPlan(emit, toAnalysisPlanPayload(executionPlan))
        emit({
          event: 'status',
          phase: 'planning_done',
          text: `Planned ${executionPlan.execution_steps.length} steps`,
        })
      }
      console.info('[Genie Agent] planning', {
        requestId,
        route: orchestration.route,
        planned: Boolean(executionPlan),
        ms: Date.now() - planningStartedAt,
      })
      emit({
        event: 'status',
        phase: 'planning_done',
        text: 'Plan ready',
      })
    } else {
      if (orchestration.needs_plan && runtime.skipPlanner) {
        emit({ event: 'status', phase: 'setup', text: 'Fast mode — skipping planner' })
      } else {
        emit({ event: 'status', phase: 'setup', text: 'Preparing route tools' })
      }
    }

    const planned = shouldPlan && Boolean(executionPlan)
    executorModel = executorModelForRoute(orchestration.route, planned, models)
    const agentTools = buildAgentTools(
      supabase,
      userId,
      emit,
      visualPrefs,
      latestUserMessage,
      orchestration.route,
      executionPlan,
      composioSessionIds,
      models,
      modelProfile,
    )
    applyTimeBudgetToTools(agentTools, requestStartedAt, RUN_TIME_BUDGET_MS, runtime.fastAnswerPrompt)
    const agentToolNames = agentTools.map(candidate =>
      'name' in candidate && candidate.name ? String(candidate.name) : 'hosted_web_search',
    )
    emit({
      event: 'status',
      phase: 'setup',
      text: `Preparing ${agentTools.length} route tool${agentTools.length === 1 ? '' : 's'}`,
    })
    console.info('[Genie Agent] executor', {
      requestId,
      conversation_id: conversationId,
      route: orchestration.route,
      model: executorModel,
      tool_count: agentTools.length,
      tool_names: agentToolNames,
      parallel_tool_calls: canRunParallelTools(orchestration.route, modelProfile),
      max_tool_concurrency: maxToolConcurrencyForRoute(orchestration.route, modelProfile),
      model_profile: modelProfile,
    })

    const reasoningEffort = runtime.executorReasoningEffort(orchestration.route, planned)
    const agent = new Agent({
      name: 'Yellow Jersey Store Agent',
      model: executorModel,
      instructions: buildSystemPrompt(storeName, executionPlan, orchestration.route, runtime.fastAnswerPrompt),
      tools: agentTools,
      modelSettings: {
        parallelToolCalls: canRunParallelTools(orchestration.route, modelProfile),
        store: false,
        reasoning: reasoningEffort === 'medium'
          ? { effort: 'medium', summary: 'concise' }
          : reasoningEffort === 'none'
            ? { effort: 'none', summary: 'auto' }
            : { effort: 'low', summary: 'auto' },
        text: { verbosity: orchestration.route === 'business_analysis' && !runtime.fastAnswerPrompt ? 'medium' : 'low' },
      },
    })

    const executorRunner = createGenieRunner({
      requestId,
      userId,
      storeName,
      route: orchestration.route,
      stage: 'executor',
      workflowName: 'Yellow Jersey Genie Executor',
    })
    const runExecutorStream = async () => {
      const agentStream = await executorRunner.run(agent, inputMessages, {
        stream: true,
        maxTurns: runtime.maxTurnsForRoute(orchestration.route, planned),
        signal,
        toolExecution: { maxFunctionToolConcurrency: maxToolConcurrencyForRoute(orchestration.route, modelProfile) },
        toolNotFoundBehavior: 'return_error_to_model',
        reasoningItemIdPolicy: 'omit',
        errorHandlers: {
          maxTurns: () => ({
            finalOutput: 'I hit the analysis turn limit before I could finish. I can continue with a narrower follow-up, or this should be moved to a background analysis job for a full long-running report.',
            includeInHistory: true,
          }),
        },
      })

      emit({
        event: 'status',
        phase: 'thinking',
        text: statusForExecutionStart(orchestration.route, agentTools.length),
      })

      for await (const event of agentStream) {
        if (event.type === 'run_item_stream_event') {
          const item = event.item as StreamToolItem
          const toolName = item.rawItem?.name || item.rawItem?.toolName || item.name
          if (event.name === 'reasoning_item_created' && lastStatusKey === '') {
            emit({ event: 'status', phase: 'thinking', text: compactGenieProgressText('Thinking', 'thinking') })
          }
          if (event.name === 'tool_called' && toolName) {
            toolCallCount += 1
            toolCallNames[toolName] = (toolCallNames[toolName] ?? 0) + 1
            activeToolName = toolName
            let toolArgs: Record<string, unknown> | undefined
            const rawArguments = item.rawItem?.arguments
            if (typeof rawArguments === 'string' && rawArguments.length > 1 && rawArguments.length < 20000) {
              try {
                const parsed: unknown = JSON.parse(rawArguments)
                if (isRecord(parsed)) toolArgs = parsed
              } catch { /* malformed args — fall back to the static status text */ }
            }
            emit({ event: 'status', ...statusForTool(toolName, toolArgs) })
          }
          if (event.name === 'tool_output') {
            // verify_question_answered emits its own result-aware status; a generic
            // override here would mislabel the not-ready path.
            if (activeToolName && activeToolName !== 'verify_question_answered') {
              emit({ event: 'status', ...statusAfterTool(activeToolName) })
            }
            activeToolName = null
          }
        }

        if (event.type === 'raw_model_stream_event') {
          const raw = event.data as RawModelDeltaEvent
          const rawType = raw.type ?? raw.event?.type
          const rawRecord = raw as unknown as Record<string, unknown>
          const rawItem = isRecord(rawRecord.item) ? rawRecord.item : null
          const rawEvent = isRecord(rawRecord.event) ? rawRecord.event : null
          const rawEventItem = rawEvent && isRecord(rawEvent.item) ? rawEvent.item : null
          const rawItemType =
            typeof rawItem?.type === 'string'
              ? rawItem.type
              : typeof rawEventItem?.type === 'string'
                ? rawEventItem.type
                : ''
          const delta =
            typeof raw.delta === 'string'
              ? raw.delta
              : typeof raw.event?.delta === 'string'
                ? raw.event.delta
                : ''
          const reasoningText =
            typeof raw.text === 'string'
              ? raw.text
              : typeof raw.event?.text === 'string'
                ? raw.event.text
                : typeof raw.part?.text === 'string'
                  ? raw.part.text
                  : typeof raw.event?.part?.text === 'string'
                    ? raw.event.part.text
                    : ''

          if (rawType === 'response.reasoning_summary_text.delta' && delta) {
            emit({ event: 'reasoning_delta', text: delta })
          }

          if (rawType === 'response.web_search_call.in_progress' || rawItemType === 'web_search_call') {
            emit({ event: 'status', phase: 'web_search', text: compactGenieProgressText('Searching web', 'web_search') })
          }

          if (rawType === 'response.web_search_call.searching') {
            emit({ event: 'status', phase: 'web_search', text: compactGenieProgressText('Searching web', 'web_search') })
          }

          if (rawType === 'response.web_search_call.completed') {
            emit({ event: 'status', phase: 'web_search_done', text: compactGenieProgressText('Web search done', 'web_search_done') })
          }

          if (
            (rawType === 'response.reasoning_summary_text.done' ||
              rawType === 'response.reasoning_summary_part.done') &&
            reasoningText
          ) {
            emit({ event: 'reasoning_done', text: reasoningText })
          }

          if (rawType === 'output_text_delta' || rawType === 'response.output_text.delta') {
            if (firstTextAt == null && delta) {
              firstTextAt = Date.now()
              console.info('[Genie Agent] first_text', {
                requestId,
                route: finalRoute,
                ms: firstTextAt - requestStartedAt,
              })
            }
            emit({ event: 'text_delta', text: delta })
          }
        }
      }

      await agentStream.completed
    }

    // The model stream can occasionally end a turn without producing a final
    // response (SDK ModelBehaviorError) or drop mid-flight. Retry once from the
    // top so the user still gets an answer instead of an error — but never after
    // answer text has already reached the client, which would duplicate content.
    const EXECUTOR_TRANSIENT_ERROR = /did not produce a final response|premature close|terminated|econnreset|socket hang up|fetch failed|network/i
    // Only retry a failure that happened EARLY. Re-running a multi-minute
    // analysis run that already burned its budget just doubles the wait before
    // the same failure — better to surface the error immediately in that case.
    const RETRY_MAX_ELAPSED_MS = 45_000
    let executorAttempt = 0
    while (true) {
      executorAttempt += 1
      try {
        await runExecutorStream()
        break
      } catch (executorError) {
        const message = executorError instanceof Error ? executorError.message : String(executorError)
        const elapsedMs = Date.now() - requestStartedAt
        const retryable =
          executorAttempt < 2 &&
          !signal.aborted &&
          firstTextAt == null &&
          elapsedMs < RETRY_MAX_ELAPSED_MS &&
          EXECUTOR_TRANSIENT_ERROR.test(message)
        if (!retryable) throw executorError
        console.warn('[Genie Agent] transient executor failure, retrying', {
          requestId,
          attempt: executorAttempt,
          error: message,
        })
        activeToolName = null
        emit({ event: 'status', phase: 'rechecking', text: 'Hit a snag — retrying the lookup' })
      }
    }

    emit({ event: 'done' })
  } catch (err) {
    runStatus = signal.aborted ? 'cancelled' : 'error'
    runErrorMessage = err instanceof Error ? err.message : 'Unknown error'
    try {
      // The raw error goes to telemetry/logs only — users get a human message.
      emit({
        event: 'error',
        message: 'I hit a technical snag and could not finish that answer. Please send the question again — it usually works on a retry.',
      })
    } catch {
      // Emit channel already closed.
    }
  } finally {
    clearInterval(heartbeatTimer)
    const totalMs = Date.now() - requestStartedAt
    console.info('[Genie Agent] completed', {
      requestId,
      conversation_id: conversationId,
      route: finalRoute,
      planner_used: plannerUsed,
      orchestration_source: orchestrationSource,
      router_invoked: routerInvoked,
      executor_model: executorModel,
      first_text_ms: firstTextAt == null ? null : firstTextAt - requestStartedAt,
      tool_call_count: toolCallCount,
      tool_call_names: toolCallNames,
      status: runStatus,
      trace_id: genieTraceId(requestId, 'executor'),
      ms: totalMs,
    })
    await persistGenieAgentRun({
      request_id: requestId,
      user_id: userId,
      route: finalRoute,
      status: runStatus,
      orchestration_source: orchestrationSource,
      router_invoked: routerInvoked,
      planner_used: plannerUsed,
      executor_model: executorModel,
      first_text_ms: firstTextAt == null ? null : firstTextAt - requestStartedAt,
      total_ms: totalMs,
      tool_call_count: toolCallCount,
      tool_call_names: toolCallNames,
      trace_id: genieTraceId(requestId, 'executor'),
      error_message: runErrorMessage,
    }).catch(error => {
      console.warn('[Genie Agent] telemetry insert failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
}
