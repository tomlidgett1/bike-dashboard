import { Agent, user as userMessage } from '@openai/agents'
import type { GenieChartPayload, GenieTablePayload } from '@/lib/genie/visual-payloads'
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
} from '@/lib/types/genie-agent'
import { createGenieRunner } from './runtime'
import type { GenieModelConfig } from './model-profiles'
import type { RawModelDeltaEvent } from './context'
import { businessAnalysisPresentationContract } from './prompts'

export type BusinessAnalysisSynthesisInput = {
  storeName: string
  userQuestion: string
  analysisPlan?: GenieAnalysisPlanPayload
  analysisQueries?: GenieAnalysisQueryPayload[]
  charts?: GenieChartPayload[]
  tables?: GenieTablePayload[]
  reasoningSummary?: string
  investigatorDraft?: string
}

export function businessAnalysisDossierHasEvidence(input: BusinessAnalysisSynthesisInput): boolean {
  const hasSuccessfulQueries =
    input.analysisQueries?.some((query) => query.status === 'ok') ?? false
  return (
    hasSuccessfulQueries ||
    (input.tables?.length ?? 0) > 0 ||
    (input.charts?.length ?? 0) > 0
  )
}

function successfulAnalysisQueries(input: BusinessAnalysisSynthesisInput): GenieAnalysisQueryPayload[] {
  return input.analysisQueries?.filter((query) => query.status === 'ok') ?? []
}

function isBroadBusinessAnalysis(input: BusinessAnalysisSynthesisInput): boolean {
  const plan = input.analysisPlan
  if (!plan) return false
  return (
    plan.execution_steps.length >= 3 ||
    (plan.answer_success_criteria?.length ?? 0) >= 3 ||
    /trend|ranking|rank|opportunit|margin|discount|inventory|customer|profit|revenue|sales/i.test(
      [plan.user_intent, plan.sql_strategy_summary, plan.recheck_strategy].filter(Boolean).join(' '),
    )
  )
}

type BusinessEvidenceKind =
  | 'setup'
  | 'sales'
  | 'trend'
  | 'ranking'
  | 'inventory'
  | 'discount'
  | 'margin'
  | 'customer'
  | 'financial'
  | 'other'

function classifyAnalysisQueryPurpose(query: GenieAnalysisQueryPayload): Set<BusinessEvidenceKind> {
  const text = [
    query.purpose,
    query.visual?.chart_title,
    query.visual?.table_title,
    query.visual?.pivot_table?.title,
  ].filter(Boolean).join(' ').toLowerCase()
  const kinds = new Set<BusinessEvidenceKind>()

  if (/\b(classif|universe|identify|setup|scope|candidate set|match(?:ed|ing)? products?)\b/.test(text)) {
    kinds.add('setup')
  }
  if (/\b(overall|headline|summary|sales?|revenue|units?|gross profit|net sales|performance)\b/.test(text)) {
    kinds.add('sales')
  }
  if (/\b(month|weekly|daily|trend|time ?series|period|prior|year over year|yoy)\b/.test(text)) {
    kinds.add('trend')
  }
  if (/\b(top|best|worst|leaderboard|ranking|rank|products? by|sellers?|drivers?|winners?|losers?)\b/.test(text)) {
    kinds.add('ranking')
  }
  if (/\b(inventory|stock|qoh|sellable|on hand|cover|dead|stale|slow mover|poor mover|cash tied|stock value)\b/.test(text)) {
    kinds.add('inventory')
  }
  if (/\b(discount|clearance|markdown|leakage|promo)\b/.test(text)) {
    kinds.add('discount')
  }
  if (/\b(margin|price|pricing|gross margin|low margin|price increase|cost review)\b/.test(text)) {
    kinds.add('margin')
  }
  if (/\b(customer|repeat|retention|concentration|buyers?|purchasers?)\b/.test(text)) {
    kinds.add('customer')
  }
  if (/\b(xero|p&l|profit and loss|balance sheet|cash|expenses?|payables?|receivables?|net profit)\b/.test(text)) {
    kinds.add('financial')
  }

  if (kinds.size === 0) kinds.add('other')
  return kinds
}

function requiredEvidenceKinds(input: BusinessAnalysisSynthesisInput): Set<BusinessEvidenceKind> {
  const text = [
    input.userQuestion,
    input.analysisPlan?.user_intent,
    input.analysisPlan?.sql_strategy_summary,
    input.analysisPlan?.recheck_strategy,
    input.analysisPlan?.execution_steps.join(' '),
    input.analysisPlan?.answer_success_criteria?.join(' '),
  ].filter(Boolean).join(' ').toLowerCase()
  const required = new Set<BusinessEvidenceKind>(['sales'])

  if (/\btrend|month|weekly|daily|period|prior|year over year|yoy|compared?\b/.test(text)) required.add('trend')
  if (/\brank|ranking|top|best|worst|seller|leaderboard|winners?|losers?|driver\b/.test(text)) required.add('ranking')
  if (/\binventory|stock|qoh|sellable|dead|stale|slow|poor mover|cash tied|cover\b/.test(text)) required.add('inventory')
  if (/\bdiscount|clearance|markdown|leakage|promo\b/.test(text)) required.add('discount')
  if (/\bmargin|price|pricing|cost|price increase|gross profit\b/.test(text)) required.add('margin')
  if (/\bcustomer|repeat|retention|concentration|buyers?|purchasers?\b/.test(text)) required.add('customer')
  if (/\bxero|p&l|profit and loss|balance sheet|cash|expenses?|net profit|financial\b/.test(text)) required.add('financial')

  // A broad analysis can still synthesise a partial answer when it has the core
  // commercial lenses. Missing optional criteria should be named in the answer,
  // not block forever after good evidence has been gathered.
  return required
}

function hasSemanticBusinessEvidence(input: BusinessAnalysisSynthesisInput): boolean {
  const successfulQueries = successfulAnalysisQueries(input)
  if (successfulQueries.length === 0) return false

  const covered = new Set<BusinessEvidenceKind>()
  let substantiveQueryCount = 0
  for (const query of successfulQueries) {
    const kinds = classifyAnalysisQueryPurpose(query)
    for (const kind of kinds) covered.add(kind)
    if ([...kinds].some((kind) => kind !== 'setup' && kind !== 'other')) {
      substantiveQueryCount += 1
    }
  }

  if (substantiveQueryCount < 2) return false
  if (!covered.has('sales')) return false

  const required = requiredEvidenceKinds(input)
  const requiredCovered = [...required].filter((kind) => covered.has(kind)).length
  const coreCommercialKinds: BusinessEvidenceKind[] = ['sales', 'trend', 'ranking', 'inventory', 'discount', 'margin']
  const coreCovered = coreCommercialKinds.filter((kind) => covered.has(kind)).length

  return requiredCovered >= Math.min(3, required.size) || coreCovered >= 3
}

export function businessAnalysisDossierHasSufficientEvidence(input: BusinessAnalysisSynthesisInput): boolean {
  if (!businessAnalysisDossierHasEvidence(input)) return false

  const successfulQueries = successfulAnalysisQueries(input)
  const structuredOutputCount = (input.tables?.length ?? 0) + (input.charts?.length ?? 0)
  if (!isBroadBusinessAnalysis(input)) {
    return successfulQueries.length > 0 || structuredOutputCount > 0
  }

  // A broad planned analysis usually starts with a classification/setup query.
  // Do not let that single broad query trigger synthesis before sales, margin,
  // ranking, discount, or inventory evidence has been collected.
  return hasSemanticBusinessEvidence(input) || structuredOutputCount > 0
}

function readRawDelta(raw: RawModelDeltaEvent): { rawType: string; delta: string } {
  const record = raw as unknown as {
    type?: string
    event?: { type?: string; delta?: string }
    delta?: string
  }
  const rawType = record.type ?? record.event?.type ?? ''
  const delta =
    typeof record.delta === 'string'
      ? record.delta
      : typeof record.event?.delta === 'string'
        ? record.event.delta
        : ''
  return { rawType, delta }
}

const OUTPUT_TEXT_TYPES = new Set(['output_text_delta', 'response.output_text.delta'])

export function formatRowsForDossierPreview(rows: unknown[], maxRows = 15, maxChars = 6000): string {
  if (!rows.length) return '(no rows)'
  const sample = rows.slice(0, maxRows)
  const text = JSON.stringify(sample, null, 1)
  const suffix = rows.length > maxRows ? `\n… ${rows.length - maxRows} more rows` : ''
  const combined = text + suffix
  return combined.length <= maxChars ? combined : `${combined.slice(0, maxChars)}…`
}

export function formatObjectForDossierPreview(value: unknown, maxChars = 6000): string {
  const text = JSON.stringify(value, null, 1)
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`
}

function compactSqlForDossier(sql: string, maxChars = 900): string {
  const compact = sql.replace(/\s+/g, ' ').trim()
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars).trimEnd()}…`
}

function compactPreviewForDossier(preview: string, maxChars = 4000): string {
  const trimmed = preview.trim()
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars).trimEnd()}…`
}

function formatTableForDossier(table: GenieTablePayload, maxRows = 10): string {
  if (!table.rows.length) return `${table.title}\n(no rows)`
  const header = `| ${table.columns.map((column) => column.label).join(' | ')} |`
  const separator = `| ${table.columns.map(() => '---').join(' | ')} |`
  const rows = table.rows.slice(0, maxRows).map((row) =>
    `| ${table.columns.map((column) => String(row[column.key] ?? '')).join(' | ')} |`,
  )
  const suffix = table.rows.length > maxRows ? `\n… ${table.rows.length - maxRows} more rows` : ''
  return [`### ${table.title}`, table.subtitle, header, separator, ...rows].filter(Boolean).join('\n') + suffix
}

function formatChartForDossier(chart: GenieChartPayload, maxPoints = 12): string {
  const lines = chart.data.slice(0, maxPoints).map((point) => {
    const values = chart.series
      .map((series) => `${series.label}: ${String(point[series.key] ?? '')}`)
      .join(', ')
    return `- ${point.label}: ${values}`
  })
  const suffix = chart.data.length > maxPoints ? `\n… ${chart.data.length - maxPoints} more points` : ''
  return [`### ${chart.title}`, chart.subtitle, ...lines].filter(Boolean).join('\n') + suffix
}

export function buildBusinessAnalysisDossier(input: BusinessAnalysisSynthesisInput): string {
  const sections: string[] = [
    `Store: ${input.storeName}`,
    `Question: ${input.userQuestion.trim()}`,
  ]

  if (input.analysisPlan) {
    sections.push(
      [
        '## Investigation plan',
        input.analysisPlan.user_intent ? `Intent: ${input.analysisPlan.user_intent}` : null,
        input.analysisPlan.date_range_label ? `Date range: ${input.analysisPlan.date_range_label}` : null,
        input.analysisPlan.sql_strategy_summary
          ? `SQL strategy: ${input.analysisPlan.sql_strategy_summary}`
          : null,
        input.analysisPlan.execution_steps.length
          ? `Steps:\n${input.analysisPlan.execution_steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`
          : null,
        input.analysisPlan.answer_success_criteria?.length
          ? `Success criteria:\n${input.analysisPlan.answer_success_criteria.map((item) => `- ${item}`).join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  if (input.analysisQueries?.length) {
    sections.push(
      [
        '## Queries executed',
        ...input.analysisQueries.map((query) => {
          const parts = [
            `- [${query.status}] ${query.purpose}`,
            query.row_count != null ? `  rows: ${query.row_count}` : null,
            query.error ? `  error: ${query.error}` : null,
            query.sql && query.status !== 'ok' ? `  sql: ${compactSqlForDossier(query.sql)}` : null,
            query.result_preview?.trim() ? `  results:\n${compactPreviewForDossier(query.result_preview)}` : null,
          ]
          return parts.filter(Boolean).join('\n')
        }),
      ].join('\n'),
    )
  }

  if (input.tables?.length) {
    sections.push(['## Tables returned', ...input.tables.map((table) => formatTableForDossier(table))].join('\n\n'))
  }

  if (input.charts?.length) {
    sections.push(['## Charts returned', ...input.charts.map((chart) => formatChartForDossier(chart))].join('\n\n'))
  }

  if (input.reasoningSummary?.trim()) {
    sections.push(`## Investigator reasoning\n${input.reasoningSummary.trim()}`)
  }

  if (input.investigatorDraft?.trim()) {
    sections.push(`## Investigator draft notes (internal)\n${input.investigatorDraft.trim()}`)
  }

  return sections.join('\n\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function previewRows(query: GenieAnalysisQueryPayload): Record<string, unknown>[] {
  if (!query.result_preview?.trim()) return []
  try {
    const parsed: unknown = JSON.parse(query.result_preview)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecord)
  } catch {
    return []
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function currency(value: unknown): string | null {
  const num = toNumber(value)
  if (num == null) return null
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: Math.abs(num) >= 100 ? 0 : 2,
  }).format(num)
}

function numberText(value: unknown): string | null {
  const num = toNumber(value)
  if (num == null) return null
  return new Intl.NumberFormat('en-AU', {
    maximumFractionDigits: Number.isInteger(num) ? 0 : 1,
  }).format(num)
}

function percentText(value: unknown): string | null {
  const num = toNumber(value)
  if (num == null) return null
  return `${new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(num)}%`
}

function rowValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null) return row[key]
  }
  return null
}

function formatMetricParts(parts: Array<string | null>): string {
  return parts.filter(Boolean).join(', ')
}

function productName(row: Record<string, unknown>): string | null {
  const value = row.product ?? row.name ?? row.description ?? row.item_name
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function likelyLooseLightMatch(name: string): boolean {
  return /\blight\s*grey\b|\blightgrey\b|\blightweight\b|\blite\b/i.test(name)
}

function buildFallbackFromEvidence(input: BusinessAnalysisSynthesisInput): string[] {
  const lines: string[] = []
  const okQueries = successfulAnalysisQueries(input)

  const overall = okQueries
    .flatMap((query) => previewRows(query))
    .find((row) => row.net_sales != null && row.units_sold != null && row.gross_profit != null)
  if (overall) {
    const period = typeof overall.period === 'string'
      ? overall.period
      : input.analysisPlan?.date_range_label
    lines.push(
      `For ${period ?? 'the analysed period'}, the collected evidence shows ${formatMetricParts([
        currency(overall.net_sales) ? `${currency(overall.net_sales)} net sales` : null,
        numberText(overall.units_sold) ? `${numberText(overall.units_sold)} units sold` : null,
        currency(overall.gross_profit) ? `${currency(overall.gross_profit)} gross profit` : null,
        percentText(overall.gross_margin_pct) ? `${percentText(overall.gross_margin_pct)} gross margin` : null,
        currency(overall.discount_dollars) ? `${currency(overall.discount_dollars)} discounts` : null,
        percentText(overall.discount_rate_pct) ? `${percentText(overall.discount_rate_pct)} discount rate` : null,
      ])}.`,
    )

    const stockLine = formatMetricParts([
      numberText(overall.current_light_skus_ranged) ? `${numberText(overall.current_light_skus_ranged)} ranged light SKUs` : null,
      numberText(overall.current_sellable_units) ? `${numberText(overall.current_sellable_units)} sellable units` : null,
      currency(overall.current_stock_value_at_cost) ? `${currency(overall.current_stock_value_at_cost)} stock at cost` : null,
      currency(overall.current_stock_value_at_retail) ? `${currency(overall.current_stock_value_at_retail)} stock at retail` : null,
    ])
    if (stockLine) lines.push(`Current inventory snapshot: ${stockLine}.`)
  }

  const trendRows = okQueries
    .flatMap((query) => previewRows(query))
    .filter((row) => typeof row.sale_month === 'string' && row.net_sales != null)
  if (trendRows.length) {
    const sortedBySales = [...trendRows].sort((a, b) => (toNumber(b.net_sales) ?? 0) - (toNumber(a.net_sales) ?? 0))
    const best = sortedBySales[0]
    const weakest = sortedBySales[sortedBySales.length - 1]
    const latest = [...trendRows].sort((a, b) => String(a.sale_month).localeCompare(String(b.sale_month))).at(-1)
    lines.push(
      `Trend check: best month was ${String(best.sale_month)} at ${currency(best.net_sales) ?? best.net_sales}; weakest was ${String(weakest.sale_month)} at ${currency(weakest.net_sales) ?? weakest.net_sales}; latest month in the data was ${String(latest?.sale_month)} at ${currency(latest?.net_sales) ?? latest?.net_sales}.`,
    )
  }

  const productRows = okQueries
    .flatMap((query) => previewRows(query))
    .filter((row) => productName(row) && row.net_sales != null)
  if (productRows.length) {
    const topProducts = productRows.slice(0, 5).map((row) => {
      const name = productName(row) ?? 'Unknown product'
      return `${name} (${formatMetricParts([
        currency(row.net_sales) ? `${currency(row.net_sales)} sales` : null,
        numberText(row.units_sold) ? `${numberText(row.units_sold)} units` : null,
        percentText(row.gross_margin_pct) ? `${percentText(row.gross_margin_pct)} margin` : null,
        numberText(row.sellable ?? row.qoh) ? `${numberText(row.sellable ?? row.qoh)} sellable/QOH` : null,
      ])})`
    })
    lines.push(`Top product evidence returned: ${topProducts.join('; ')}.`)

    const looseMatches = productRows
      .map((row) => productName(row))
      .filter((name): name is string => Boolean(name && likelyLooseLightMatch(name)))
      .slice(0, 3)
    if (looseMatches.length) {
      lines.push(
        `Data quality warning: the fallback light matcher appears too broad and included likely non-light items (${looseMatches.join(', ')}). Treat product rankings as directional until the filter is tightened.`,
      )
    }
  }

  return lines
}

export function buildBusinessAnalysisFallbackAnswer(input: BusinessAnalysisSynthesisInput): string {
  const okQueries = successfulAnalysisQueries(input)
  const failedQueries = input.analysisQueries?.filter((query) => query.status === 'error' || query.status === 'rejected') ?? []
  const evidenceLines = buildFallbackFromEvidence(input)
  const completed = okQueries.map((query) => `- ${query.purpose}${query.row_count != null ? ` (${query.row_count} rows)` : ''}`)
  const failed = failedQueries.map((query) => `- ${query.purpose}: ${query.error ?? query.status}`)

  return [
    'I hit a synthesis issue after the data pass, so here is the supported evidence that was actually collected.',
    '',
    input.analysisPlan?.user_intent ? `**Question analysed:** ${input.analysisPlan.user_intent}` : null,
    evidenceLines.length ? evidenceLines.join('\n\n') : null,
    completed.length ? `**Completed data passes**\n${completed.join('\n')}` : null,
    failed.length ? `**Failed / retried data passes**\n${failed.join('\n')}` : null,
    'I would not apply pricing or discount changes from this fallback alone; rerun the analysis after tightening any broad product matching so clearance and margin recommendations are based on cleaner SKU evidence.',
  ].filter(Boolean).join('\n\n')
}

export function accumulateBusinessAnalysisSynthesisEvent(
  input: BusinessAnalysisSynthesisInput,
  event: Record<string, unknown>,
): BusinessAnalysisSynthesisInput {
  const next: BusinessAnalysisSynthesisInput = { ...input }

  if (event.event === 'text_delta' && typeof event.text === 'string') {
    next.investigatorDraft = `${next.investigatorDraft ?? ''}${event.text}`
  }

  if (event.event === 'reasoning_done' && typeof event.text === 'string') {
    next.reasoningSummary = event.text
  } else if (event.event === 'reasoning_delta' && typeof event.text === 'string') {
    next.reasoningSummary = `${next.reasoningSummary ?? ''}${event.text}`
  }

  if (event.event === 'analysis_plan' && event.plan) {
    next.analysisPlan = event.plan as GenieAnalysisPlanPayload
  }

  if (event.event === 'analysis_query' && event.query) {
    const incoming = event.query as GenieAnalysisQueryPayload
    const current = next.analysisQueries ?? []
    const index = current.findIndex((query) => query.id === incoming.id)
    if (index >= 0) {
      const merged = [...current]
      merged[index] = { ...merged[index], ...incoming }
      next.analysisQueries = merged
    } else {
      next.analysisQueries = [...current, incoming].slice(-24)
    }
  }
  if (event.event === 'chart' && event.chart) {
    next.charts = [...(next.charts ?? []), event.chart as GenieChartPayload].slice(-8)
  }

  if (event.event === 'table' && event.table) {
    next.tables = [...(next.tables ?? []), event.table as GenieTablePayload].slice(-8)
  }

  return next
}

export async function runBusinessAnalysisSynthesis(args: {
  input: BusinessAnalysisSynthesisInput
  models: GenieModelConfig
  emit: (data: object) => void
  signal: AbortSignal
  requestId: string
  userId: string
  storeName: string
  onFirstText?: () => void
}): Promise<{ emittedAnswer: boolean }> {
  const dossier = buildBusinessAnalysisDossier(args.input)
  const today = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Brisbane',
  })

  const synthesisTask = [
    `You are the presentation specialist for "${args.storeName}". An investigator agent has already run the SQL/tool passes below. Write the final store-owner-facing answer.`,
    '',
    '=== INVESTIGATION DOSSIER ===',
    dossier,
    '=== END DOSSIER ===',
    '',
    `Today is ${today}. Use only numbers, periods, product/category names, and claims supported by the dossier. Quantify every performance claim. Do not invent data that is not in the dossier — if something is missing, say so briefly.`,
    '',
    'PRESENTATION RULES',
    businessAnalysisPresentationContract(),
    '',
    'The UI may already show charts returned during investigation — do not duplicate a chart as a giant raw data dump. Reference the headline trend in prose and keep tables compact.',
    'Write like a sharp bike-shop CFO briefing the owner: direct, warm, commercially useful, no preamble, no "let me…".',
  ].join('\n')

  const synthAgent = new Agent({
    name: 'Yellow Jersey Business Analysis — Synthesis',
    model: args.models.strategicExecutor,
    instructions:
      'You turn investigation evidence into the best possible executive answer for a bicycle store owner. Choose the clearest structure and formatting for this dossier — do not force a rigid template.',
    tools: [],
    modelSettings: {
      store: false,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'medium' },
    },
  })

  const runner = createGenieRunner({
    requestId: args.requestId,
    userId: args.userId,
    storeName: args.storeName,
    route: 'business_analysis',
    stage: 'business_analysis_synthesis',
    workflowName: 'Yellow Jersey Business Analysis Synthesis',
  })

  let emittedAnswer = false
  const emitEvidenceFallback = () => {
    if (emittedAnswer || args.signal.aborted) return
    emittedAnswer = true
    args.onFirstText?.()
    args.emit({ event: 'status', phase: 'responding', text: 'Writing answer from collected evidence' })
    args.emit({ event: 'text_delta', text: buildBusinessAnalysisFallbackAnswer(args.input) })
  }

  const emitNonStreamedSynthesis = async (): Promise<boolean> => {
    if (emittedAnswer || args.signal.aborted) return false
    const result = await runner.run(synthAgent, [userMessage(synthesisTask)], {
      maxTurns: 1,
      signal: args.signal,
    })
    const output = typeof result.finalOutput === 'string' ? result.finalOutput.trim() : ''
    if (!output) return false
    emittedAnswer = true
    args.onFirstText?.()
    args.emit({ event: 'status', phase: 'responding', text: 'Writing answer from settled synthesis' })
    args.emit({ event: 'text_delta', text: output })
    return true
  }

  try {
    const synthStream = await runner.run(synthAgent, [userMessage(synthesisTask)], {
      stream: true,
      maxTurns: 1,
      signal: args.signal,
    })

    for await (const event of synthStream) {
      if (args.signal.aborted) break
      if (event.type !== 'raw_model_stream_event') continue
      const { rawType, delta } = readRawDelta(event.data as RawModelDeltaEvent)
      if (!OUTPUT_TEXT_TYPES.has(rawType) || !delta) continue
      if (!emittedAnswer) {
        emittedAnswer = true
        args.onFirstText?.()
      }
      args.emit({ event: 'text_delta', text: delta })
    }

    await synthStream.completed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    args.emit({
      event: 'reasoning_done',
      text: `Synthesis stream failed (${message}); retrying settled synthesis from collected evidence.`,
    })
    try {
      if (await emitNonStreamedSynthesis()) return { emittedAnswer }
    } catch (settledError) {
      const settledMessage = settledError instanceof Error ? settledError.message : String(settledError)
      args.emit({
        event: 'reasoning_done',
        text: `Settled synthesis failed (${settledMessage}); using collected evidence fallback.`,
      })
    }
    emitEvidenceFallback()
  }

  emitEvidenceFallback()
  return { emittedAnswer }
}
