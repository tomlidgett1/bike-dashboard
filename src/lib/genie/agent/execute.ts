// Genie agent core runner: LLM router → direct paths → planner → executor, emitting SSE-shaped
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
import { getActiveLessonsForUser, formatLessonsForPrompt } from '@/lib/genie/learned-lessons'
import { runDeepResearchInvestigation } from '@/lib/genie/deep-research/run-deep-research'
import type { ComposioSessionIds, Message, RawModelDeltaEvent, StreamToolItem } from './context'
import { compactCustomerProfileForContext, toAgentInputMessages } from './context'
import {
  buildAgentTools,
  buildLightspeedCustomerProfile,
  emitAnalysisPlan,
  emitCustomerProfile,
  executorModelForRoute,
  runBusinessAnalysisRecoveryPasses,
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
import {
  buildDeepResearchFramingMessage,
  buildRoutingFramingMessage,
} from '@/lib/genie/routing-framing'
import {
  accumulateBusinessAnalysisSynthesisEvent,
  businessAnalysisDossierHasEvidence,
  businessAnalysisDossierHasSufficientEvidence,
  runBusinessAnalysisSynthesis,
  type BusinessAnalysisSynthesisInput,
} from '@/lib/genie/agent/business-analysis-synthesis'

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

function cleanProgressFragment(value: string, max = 82): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function hostnameFromUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '')
    return hostname || null
  } catch {
    return null
  }
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 3): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const cleaned = value?.trim()
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    output.push(cleaned)
    if (output.length >= limit) break
  }
  return output
}

function webSearchActionStatus(action: Record<string, unknown>, completed = false): string | null {
  const type = typeof action.type === 'string' ? action.type : ''
  if (type === 'open_page') {
    const host = hostnameFromUrl(action.url)
    return host ? `Opening ${host}` : 'Opening web page'
  }

  if (type === 'find_in_page') {
    const host = hostnameFromUrl(action.url)
    const pattern = typeof action.pattern === 'string' ? cleanProgressFragment(action.pattern, 38) : ''
    if (host && pattern) return `Checking ${host} for "${pattern}"`
    return host ? `Checking ${host}` : 'Searching within page'
  }

  if (type === 'search') {
    const sources = Array.isArray(action.sources)
      ? action.sources
          .map((source) => (isRecord(source) ? hostnameFromUrl(source.url) : null))
      : []
    const sourceHosts = uniqueStrings(sources)
    if (sourceHosts.length > 0) {
      return `${completed ? 'Checked' : 'Searching'} ${sourceHosts.join(', ')}`
    }

    const queries = Array.isArray(action.queries)
      ? action.queries.filter((query): query is string => typeof query === 'string')
      : typeof action.query === 'string'
        ? [action.query]
        : []
    const [query] = uniqueStrings(queries, 1)
    if (query) return `Searching: ${cleanProgressFragment(query)}`
  }

  return null
}

function webSearchStatusFromRecords(records: Array<Record<string, unknown> | null>, completed = false): string | null {
  for (const record of records) {
    const action = record && isRecord(record.action) ? record.action : null
    if (!action) continue
    const status = webSearchActionStatus(action, completed)
    if (status) return status
  }
  return null
}

// Matches the route segment's maxDuration. Past the warn ratio, every tool
// result carries a wrap-up directive so long analyses land before the platform
// kills the function instead of relying on turn count alone.
const RUN_TIME_BUDGET_MS = 600_000
// If the executor's model stream produces NO real event (token, tool call, or
// status) for this long, treat it as a dead/stalled stream and abort so the run
// can finalize. The 15s heartbeat keeps the job row's updated_at fresh, so the
// 3-min stale-job sweeper never reclaims a hung stream — this is the real guard.
const STREAM_IDLE_TIMEOUT_MS = Number(process.env.GENIE_STREAM_IDLE_TIMEOUT_MS) || 120_000
const RUN_TIME_BUDGET_WARN_RATIO = 0.6

function debugErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 8).join('\n'),
    }
  }
  return { message: String(error) }
}

function executorToolChoice(
  route: GenieOrchestrationDecision['route'],
  planned: boolean,
  toolNames: string[],
): string | undefined {
  if (route === 'web_research') return 'web_search'
  if (route === 'business_analysis' && planned) {
    if (toolNames.includes('run_lightspeed_sql_query')) return 'run_lightspeed_sql_query'
    return toolNames.length > 0 ? 'required' : undefined
  }
  return undefined
}

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
      instructions: buildDirectAnswerInstructions(
        args.storeName,
        args.groundingLabel,
        args.grounding,
      ),
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
  /** When true, runs the multi-phase Deep Business Review instead of a normal chat turn. */
  deepResearch?: boolean
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
  let orchestrationSource: 'model' | null = null
  let routerInvoked = false
  let executorModel: string | null = null
  let firstTextAt: number | null = null
  let runStatus: 'completed' | 'error' | 'cancelled' = 'completed'
  let runErrorMessage: string | null = null
  let toolCallCount = 0
  const toolCallNames: Record<string, number> = {}
  let activeToolName: string | null = null
  // Shared with verify_question_answered: when a within-budget verification pass
  // returns not-ready, the model is free to EITHER gather more or answer anyway.
  // We no longer guess — the verify tool flips this flag and the next real action
  // (a tool call → "continuing lookup", or answer text → "Writing the answer")
  // sets an honest status. Stops a complete, efficient run from flashing
  // "Answer incomplete — continuing lookup" right before it answers.
  const verifyGate = { awaitingContinuation: false }
  // Set by the executor stream loop to reset its stall watchdog on every real
  // event. No-op outside that loop; heartbeats bypass `emit` so they never
  // count as activity (a hung stream must not keep its own watchdog alive).
  let bumpIdle: () => void = () => {}
  let useBusinessAnalysisSynthesis = false
  let businessAnalysisSynthesis: BusinessAnalysisSynthesisInput | null = null

  const finishBusinessAnalysisFromDossier = async (): Promise<boolean> => {
    if (!useBusinessAnalysisSynthesis || !businessAnalysisSynthesis || signal.aborted) return false

    if (businessAnalysisDossierHasSufficientEvidence(businessAnalysisSynthesis)) {
      emit({
        event: 'status',
        phase: 'responding',
        text: compactGenieProgressText('Synthesising executive summary', 'responding'),
      })
      const synthesisResult = await runBusinessAnalysisSynthesis({
        input: businessAnalysisSynthesis,
        models,
        emit,
        signal,
        requestId,
        userId,
        storeName,
        onFirstText: () => {
          if (firstTextAt != null) return
          firstTextAt = Date.now()
          console.info('[Genie Agent] first_text', {
            requestId,
            route: finalRoute,
            ms: firstTextAt - requestStartedAt,
            stage: 'business_analysis_synthesis',
          })
        },
      })
      if (!synthesisResult.emittedAnswer && businessAnalysisSynthesis.investigatorDraft?.trim()) {
        emit({ event: 'text_delta', text: businessAnalysisSynthesis.investigatorDraft })
        if (firstTextAt == null) firstTextAt = Date.now()
      }
      return true
    }

    if (businessAnalysisDossierHasEvidence(businessAnalysisSynthesis)) {
      emit({ event: 'status', phase: 'responding', text: 'Could not complete planned analysis' })
      emit({
        event: 'text_delta',
        text: 'I could not complete enough of the planned data passes to answer this properly. The run collected some setup evidence, but not enough sales, margin, ranking, discount, inventory, or opportunity data to make supported recommendations. Please run it again; if it repeats, the executor is stopping early and needs investigation.',
      })
      if (firstTextAt == null) firstTextAt = Date.now()
      return true
    }

    if (businessAnalysisSynthesis.investigatorDraft?.trim()) {
      emit({ event: 'status', phase: 'responding', text: 'Writing answer from available notes' })
      emit({ event: 'text_delta', text: businessAnalysisSynthesis.investigatorDraft })
      if (firstTextAt == null) firstTextAt = Date.now()
      return true
    }

    emit({ event: 'status', phase: 'responding', text: 'Could not fetch store data' })
    emit({
      event: 'text_delta',
      text: 'I could not pull the store data needed for a YTD comparison — the investigation pass finished without running the planned SQL or Xero lookups. Please send the question again; if it keeps happening, check that Lightspeed and Xero are connected for this store.',
    })
    if (firstTextAt == null) firstTextAt = Date.now()
    return true
  }

  const emit = (data: object) => {
    // Any real event (token, tool call/result, status, chart…) is proof of life
    // for the executor stream — reset the stall watchdog. Heartbeats go through
    // options.emit directly, bypassing this wrapper, so they never reset it.
    bumpIdle()
    if ('event' in data && (data as { event?: unknown }).event === 'status') {
      const status = data as { phase?: unknown; text?: unknown }
      const phase = String(status.phase ?? '')
      const text = String(status.text ?? '').trim()
      if (!text) return
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
    // Deep Business Review: a separate long-running, multi-phase forensic
    // investigation. Reuses this function's emit/heartbeat/telemetry shell and
    // the full tool pipeline, but bypasses the router/planner/executor entirely.
    if (options.deepResearch) {
      finalRoute = 'business_analysis'
      emit({ event: 'status', phase: 'routing_done', text: buildDeepResearchFramingMessage() })
      await runDeepResearchInvestigation({
        supabase,
        userId,
        storeName,
        messages,
        composioSessionIds,
        models,
        emit,
        signal,
        requestId,
      })
      emit({ event: 'done' })
      return
    }

    emit({ event: 'status', phase: 'context', text: 'Reading conversation context' })

    const latestUserMessage = latestUserText(messages)
    const inputMessages = toAgentInputMessages(messages)
    const orchestrationStartedAt = Date.now()
    routerInvoked = true
    orchestrationSource = 'model'
    emit({ event: 'status', phase: 'routing', text: 'Choosing the best workflow' })
    const orchestration = await createGenieOrchestrationDecision({
      storeName,
      userId,
      requestId,
      messages,
      signal,
      models,
    })
    finalRoute = orchestration.route
    const routingFraming = buildRoutingFramingMessage({
      orchestration,
      userMessage: latestUserMessage,
    })
    emit({
      event: 'status',
      phase: 'routing_done',
      text: routingFraming ?? statusForRoute(orchestration.route, undefined, latestUserMessage),
    })
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
          // Casual chat has no tools and a single turn — skip the reasoning pass
          // so greetings and quick conversational replies start streaming faster.
          reasoning: { effort: 'none', summary: 'auto' },
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

    // LLM router may nominate a direct_path for simple Lightspeed lookups. Data
    // is prefetched, then a fast model streams an answer grounded in it.
    const directPath = orchestration.route === 'lightspeed_sql' ? orchestration.direct_path : 'none'
    const entityQuery = orchestration.entity_query?.trim() || null

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
    useBusinessAnalysisSynthesis =
      orchestration.route === 'business_analysis' && !runtime.fastAnswerPrompt
    businessAnalysisSynthesis = useBusinessAnalysisSynthesis
      ? { storeName, userQuestion: latestUserMessage }
      : null
    const pipelineEmit: typeof emit = useBusinessAnalysisSynthesis
      ? (data: object) => {
          businessAnalysisSynthesis = accumulateBusinessAnalysisSynthesisEvent(
            businessAnalysisSynthesis!,
            data as Record<string, unknown>,
          )
          if ((data as { event?: string }).event === 'text_delta') return
          emit(data)
        }
      : emit

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
        emit: pipelineEmit,
      })
      if (executionPlan) {
        emitAnalysisPlan(pipelineEmit, toAnalysisPlanPayload(executionPlan))
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
      pipelineEmit,
      visualPrefs,
      latestUserMessage,
      orchestration.route,
      executionPlan,
      composioSessionIds,
      models,
      modelProfile,
      verifyGate,
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
    const initialToolChoice = executorToolChoice(orchestration.route, planned, agentToolNames)
    console.info('[Genie Agent] executor', {
      requestId,
      conversation_id: conversationId,
      route: orchestration.route,
      model: executorModel,
      tool_count: agentTools.length,
      tool_names: agentToolNames,
      initial_tool_choice: initialToolChoice,
      parallel_tool_calls: canRunParallelTools(orchestration.route, modelProfile),
      max_tool_concurrency: maxToolConcurrencyForRoute(orchestration.route, modelProfile),
      model_profile: modelProfile,
    })
    emit({
      event: '_debug',
      stage: 'executor_config',
      route: orchestration.route,
      planned,
      model: executorModel,
      tool_count: agentTools.length,
      tool_names: agentToolNames,
      initial_tool_choice: initialToolChoice,
      max_turns: runtime.maxTurnsForRoute(orchestration.route, planned),
      max_tool_concurrency: maxToolConcurrencyForRoute(orchestration.route, modelProfile),
    })

    const reasoningEffort = runtime.executorReasoningEffort(orchestration.route, planned)
    let executorInputMessages = inputMessages
    // Inject the store's learned playbook (self-improvement) into the dynamic
    // tail of the prompt. Defensive: returns '' if the table/migration is absent.
    const learnedLessons = await getActiveLessonsForUser(supabase, userId, { route: orchestration.route })
    const learnedPlaybook = formatLessonsForPrompt(learnedLessons)
    const agent = new Agent({
      name: 'Yellow Jersey Store Agent',
      model: executorModel,
      instructions: buildSystemPrompt(
        storeName,
        executionPlan,
        orchestration.route,
        runtime.fastAnswerPrompt,
        learnedPlaybook,
        useBusinessAnalysisSynthesis,
      ),
      tools: agentTools,
      modelSettings: {
        parallelToolCalls: canRunParallelTools(orchestration.route, modelProfile),
        toolChoice: initialToolChoice,
        store: false,
        providerData: orchestration.route === 'web_research'
          ? { include: ['web_search_call.action.sources'] }
          : undefined,
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
      const streamEmit = pipelineEmit
      let hasDetailedWebSearchStatus = false
      // Stall watchdog (see STREAM_IDLE_TIMEOUT_MS). resetIdle() runs on every
      // real emit; if the timer ever fires, the stream has gone silent and we
      // abort it so the run can finalize/retry instead of hanging forever.
      const idleController = new AbortController()
      let stalled = false
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      const resetIdle = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          stalled = true
          idleController.abort()
        }, STREAM_IDLE_TIMEOUT_MS)
      }
      const onParentAbort = () => idleController.abort()
      if (signal.aborted) idleController.abort()
      else signal.addEventListener('abort', onParentAbort, { once: true })
      bumpIdle = resetIdle
      resetIdle()

      try {
      const agentStream = await executorRunner.run(agent, executorInputMessages, {
        stream: true,
        maxTurns: runtime.maxTurnsForRoute(orchestration.route, planned),
        signal: idleController.signal,
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

      streamEmit({
        event: 'status',
        phase: 'thinking',
        text: statusForExecutionStart(
          orchestration.route,
          agentTools.length,
          executionPlan?.primary_tools,
          latestUserMessage,
        ),
      })

      for await (const event of agentStream) {
        if (event.type === 'run_item_stream_event') {
          const item = event.item as StreamToolItem
          const toolName = item.rawItem?.name || item.rawItem?.toolName || item.name
          if (event.name === 'reasoning_item_created' && lastStatusKey === '') {
            streamEmit({ event: 'status', phase: 'thinking', text: compactGenieProgressText('Thinking', 'thinking') })
          }
          if (event.name === 'tool_called' && toolName) {
            // The model really did go back for more after a not-ready verdict —
            // NOW "continuing lookup" is true. (The tool's own status follows and
            // usually supersedes this, but it makes the intent explicit.)
            if (verifyGate.awaitingContinuation) {
              verifyGate.awaitingContinuation = false
              streamEmit({ event: 'status', phase: 'rechecking', text: 'Answer incomplete — continuing lookup' })
            }
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
            streamEmit({ event: 'status', ...statusForTool(toolName, toolArgs) })
          }
          if (event.name === 'tool_output') {
            // verify_question_answered emits its own result-aware status; a generic
            // override here would mislabel the not-ready path.
            if (activeToolName && activeToolName !== 'verify_question_answered') {
              streamEmit({ event: 'status', ...statusAfterTool(activeToolName) })
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
            streamEmit({ event: 'reasoning_delta', text: delta })
          }

          const webActionStatus = webSearchStatusFromRecords([
            rawRecord,
            rawItem,
            rawEvent,
            rawEventItem,
          ])
          const completedWebActionStatus = webSearchStatusFromRecords([
            rawRecord,
            rawItem,
            rawEvent,
            rawEventItem,
          ], true)

          if (rawType === 'response.web_search_call.in_progress') {
            if (webActionStatus) {
              hasDetailedWebSearchStatus = true
              streamEmit({
                event: 'status',
                phase: 'web_search',
                text: webActionStatus,
              })
            } else if (!hasDetailedWebSearchStatus) {
              streamEmit({
                event: 'status',
                phase: 'web_search',
                text: 'Searching web',
              })
            }
          }

          if (rawItemType === 'web_search_call' && webActionStatus) {
            hasDetailedWebSearchStatus = true
            streamEmit({
              event: 'status',
              phase: 'web_search',
              text: webActionStatus,
            })
          }

          if (rawType === 'response.web_search_call.searching') {
            if (webActionStatus) {
              hasDetailedWebSearchStatus = true
              streamEmit({
                event: 'status',
                phase: 'web_search',
                text: webActionStatus,
              })
            } else if (!hasDetailedWebSearchStatus) {
              streamEmit({
                event: 'status',
                phase: 'web_search',
                text: 'Searching web',
              })
            }
          }

          if (rawType === 'response.web_search_call.completed') {
            streamEmit({
              event: 'status',
              phase: 'web_search_done',
              text: completedWebActionStatus ?? 'Web search done',
            })
          }

          if (
            (rawType === 'response.reasoning_summary_text.done' ||
              rawType === 'response.reasoning_summary_part.done') &&
            reasoningText
          ) {
            streamEmit({ event: 'reasoning_done', text: reasoningText })
          }

          if (rawType === 'output_text_delta' || rawType === 'response.output_text.delta') {
            if (!useBusinessAnalysisSynthesis && firstTextAt == null && delta) {
              firstTextAt = Date.now()
              // The model judged it had enough after a not-ready verdict and is
              // answering now — so show that, not a stale "continuing lookup".
              if (verifyGate.awaitingContinuation) {
                verifyGate.awaitingContinuation = false
                streamEmit({ event: 'status', phase: 'responding', text: 'Writing the answer' })
              }
              console.info('[Genie Agent] first_text', {
                requestId,
                route: finalRoute,
                ms: firstTextAt - requestStartedAt,
              })
            }
            streamEmit({ event: 'text_delta', text: delta })
          }
        }
      }

      await agentStream.completed
      } catch (streamError) {
        // A watchdog abort surfaces as a generic AbortError. Relabel it so the
        // retry harness below treats it like any transient "no final response"
        // failure (retry if no text yet, else surface a clean error) instead of
        // leaving the job hung on a dead stream with a ticking heartbeat.
        streamEmit({
          event: '_debug',
          stage: 'executor_stream_error',
          stalled,
          error: debugErrorPayload(streamError),
          elapsed_ms: Date.now() - requestStartedAt,
        })
        if (stalled) throw new Error('model stream stalled — did not produce a final response')
        throw streamError
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
        bumpIdle = () => {}
        signal.removeEventListener('abort', onParentAbort)
      }
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
    let investigationRetried = false
    let executorError: unknown = null
    while (true) {
      executorAttempt += 1
      try {
        await runExecutorStream()
        executorError = null
        break
      } catch (err) {
        executorError = err
        const message = err instanceof Error ? err.message : String(err)
        const elapsedMs = Date.now() - requestStartedAt
        const retryable =
          executorAttempt < 2 &&
          !signal.aborted &&
          firstTextAt == null &&
          elapsedMs < RETRY_MAX_ELAPSED_MS &&
          EXECUTOR_TRANSIENT_ERROR.test(message)
        emit({
          event: '_debug',
          stage: 'executor_attempt_failed',
          attempt: executorAttempt,
          retryable,
          elapsed_ms: elapsedMs,
          error: debugErrorPayload(err),
        })
        if (!retryable) break
        console.warn('[Genie Agent] transient executor failure, retrying', {
          requestId,
          attempt: executorAttempt,
          error: message,
        })
        activeToolName = null
        emit({ event: 'status', phase: 'rechecking', text: 'Hit a snag — retrying the lookup' })
      }
    }

    const needsInvestigationRetry =
      useBusinessAnalysisSynthesis &&
      businessAnalysisSynthesis &&
      !businessAnalysisDossierHasSufficientEvidence(businessAnalysisSynthesis) &&
      !investigationRetried &&
      !signal.aborted

    if (needsInvestigationRetry) {
      const synthesisForRetry = businessAnalysisSynthesis
      if (!synthesisForRetry) throw new Error('Business analysis synthesis state missing during retry')
      investigationRetried = true
      emit({
        event: '_debug',
        stage: 'business_analysis_investigation_retry',
        reason: 'insufficient_evidence',
        successful_queries: synthesisForRetry.analysisQueries?.filter((query) => query.status === 'ok').length ?? 0,
        total_queries: synthesisForRetry.analysisQueries?.length ?? 0,
        has_evidence: businessAnalysisDossierHasEvidence(synthesisForRetry),
        has_sufficient_evidence: businessAnalysisDossierHasSufficientEvidence(synthesisForRetry),
      })
      console.warn('[Genie Agent] business analysis investigation produced no evidence, retrying', {
        requestId,
        tool_call_count: toolCallCount,
        prior_executor_error: executorError instanceof Error ? executorError.message : executorError,
      })
      emit({
        event: 'status',
        phase: 'rechecking',
        text: 'Running planned data passes',
      })
      const completedEvidence = synthesisForRetry.analysisQueries
        ?.filter((query) => query.status === 'ok')
        .map((query) => `- ${query.purpose}`)
        .join('\n') || '- none'
      executorInputMessages = [
        ...inputMessages,
        userMessage(
          `Investigation incomplete: the dossier does not yet contain enough evidence for the planned business analysis.

Completed evidence so far:
${completedEvidence}

Continue the hidden execution plan NOW using run_lightspeed_sql_query, get_xero_financial_report, find_discount_candidates, and any other planned tools. Do not stop after setup/classification queries. Do not repeat completed setup work unless it must be refined. Gather the actual sales, margin, ranking, discount, inventory, and opportunity evidence needed by the success criteria. Call independent reads in parallel where possible. Do not write an executive report — only tool results matter for the synthesis pass.`,
        ),
      ]
      try {
        await runExecutorStream()
        executorError = null
      } catch (investigationError) {
        const message = investigationError instanceof Error ? investigationError.message : String(investigationError)
        const latestSynthesis = businessAnalysisSynthesis ?? synthesisForRetry
        console.warn('[Genie Agent] investigation retry stream failed', {
          requestId,
          error: message,
          has_evidence: businessAnalysisDossierHasEvidence(latestSynthesis),
          has_sufficient_evidence: businessAnalysisDossierHasSufficientEvidence(latestSynthesis),
        })
        emit({
          event: '_debug',
          stage: 'business_analysis_investigation_retry_failed',
          elapsed_ms: Date.now() - requestStartedAt,
          has_evidence: businessAnalysisDossierHasEvidence(latestSynthesis),
          has_sufficient_evidence: businessAnalysisDossierHasSufficientEvidence(latestSynthesis),
          successful_queries: latestSynthesis.analysisQueries?.filter((query) => query.status === 'ok').length ?? 0,
          total_queries: latestSynthesis.analysisQueries?.length ?? 0,
          error: debugErrorPayload(investigationError),
        })
        if (!businessAnalysisDossierHasSufficientEvidence(latestSynthesis)) {
          executorError = investigationError
        } else {
          executorError = null
        }
      }
    }

    if (
      useBusinessAnalysisSynthesis &&
      businessAnalysisSynthesis &&
      !businessAnalysisDossierHasSufficientEvidence(businessAnalysisSynthesis) &&
      !signal.aborted
    ) {
      const beforeRecovery = businessAnalysisSynthesis
      const recovery = await runBusinessAnalysisRecoveryPasses({
        userId,
        latestUserMessage,
        executionPlan,
        emit: pipelineEmit,
        visualPrefs,
        signal,
      })
      if (recovery.attempted) {
        emit({
          event: '_debug',
          stage: 'business_analysis_recovery_complete',
          successful_queries: businessAnalysisSynthesis?.analysisQueries?.filter((query) => query.status === 'ok').length ?? 0,
          total_queries: businessAnalysisSynthesis?.analysisQueries?.length ?? 0,
          recovery_successful_queries: recovery.successful,
          had_sufficient_evidence_before: businessAnalysisDossierHasSufficientEvidence(beforeRecovery),
          has_sufficient_evidence_after: businessAnalysisSynthesis
            ? businessAnalysisDossierHasSufficientEvidence(businessAnalysisSynthesis)
            : false,
        })
        if (businessAnalysisSynthesis && businessAnalysisDossierHasSufficientEvidence(businessAnalysisSynthesis)) {
          executorError = null
        }
      }
    }

    if (executorError) {
      throw executorError
    }

    if (useBusinessAnalysisSynthesis && businessAnalysisSynthesis && !signal.aborted) {
      await finishBusinessAnalysisFromDossier()
    }

    emit({ event: 'done' })
  } catch (err) {
    if (
      useBusinessAnalysisSynthesis &&
      businessAnalysisSynthesis &&
      businessAnalysisDossierHasSufficientEvidence(businessAnalysisSynthesis) &&
      !signal.aborted
    ) {
      try {
        await finishBusinessAnalysisFromDossier()
        runStatus = 'completed'
        runErrorMessage = null
        emit({ event: 'done' })
        return
      } catch (recoveryError) {
        console.warn('[Genie Agent] synthesis recovery failed', {
          requestId,
          error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
        })
      }
    }

    runStatus = signal.aborted ? 'cancelled' : 'error'
    runErrorMessage = err instanceof Error ? err.message : 'Unknown error'
    try {
      // The raw error goes to telemetry/logs only — users get a human message.
      emit({
        event: '_debug',
        stage: 'execute_final_error',
        run_status: runStatus,
        elapsed_ms: Date.now() - requestStartedAt,
        route: finalRoute,
        tool_call_count: toolCallCount,
        tool_call_names: toolCallNames,
        has_business_analysis_evidence: businessAnalysisSynthesis
          ? businessAnalysisDossierHasEvidence(businessAnalysisSynthesis)
          : false,
        has_business_analysis_sufficient_evidence: businessAnalysisSynthesis
          ? businessAnalysisDossierHasSufficientEvidence(businessAnalysisSynthesis)
          : false,
        error: debugErrorPayload(err),
      })
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
