import type { GenieChartPayload } from '@/lib/genie/visual-payloads'

export type VisualEmissionPrefs = {
  chart: boolean
  line: boolean
  table: boolean
}

export type VisualEmissionBudget = {
  maxCharts: number
  maxTables: number
  maxPivotTables: number
}

/** Minimum time-series / category points before auto-emitting a chart without an explicit chart ask. */
const AUTO_CHART_MIN_POINTS = 4

/**
 * Charts add value for trends and multi-bucket comparisons. Two-period A vs B
 * answers are clearer as a table unless the user asked for a chart.
 */
export function shouldEmitChart(
  prefs: VisualEmissionPrefs,
  chart: GenieChartPayload | undefined,
): boolean {
  if (!chart) return false
  if (prefs.chart || prefs.line) return true

  const points = chart.data?.length ?? 0
  if (points < AUTO_CHART_MIN_POINTS) return false

  return true
}

export function shouldEmitStructuredTable(
  prefs: VisualEmissionPrefs,
  hasTable: boolean,
  chartEmitted: boolean,
): boolean {
  if (!hasTable) return false
  if (prefs.table) return true
  return !chartEmitted
}

export function looksLikeDriverExplanationPrompt(prompt: string): boolean {
  return /\b(what\s+)?drove\b|\bwhat\s+caused\b|\bwhy\s+(did|was|were|is|the)\b|\bexplain\s+(this|that|the|why|what)\b|\bwhat\s+happened\b|\bbreak\s*down\b|\broot\s+cause\b|\bmain\s+(driver|reason)\b|\bwhat\s+changed\b|\bwhy\s+the\s+(drop|decline|fall|increase|rise|change)\b|\bwhat\s+explains\b/i.test(
    prompt,
  )
}

export function looksLikeComprehensiveReportPrompt(prompt: string): boolean {
  return /\b(deep\s+review|full\s+report|executive\s+summary|comprehensive|10x|business\s+analysis|how\s+can\s+we\s+make\s+more\s+money|profitability\s+review)\b/i.test(
    prompt,
  )
}

export function resolveVisualEmissionBudget(
  prompt: string,
  route: string,
  executionStepCount = 0,
): VisualEmissionBudget {
  if (looksLikeDriverExplanationPrompt(prompt)) {
    return { maxCharts: 0, maxTables: 1, maxPivotTables: 0 }
  }

  if (
    route === 'business_analysis'
    || looksLikeComprehensiveReportPrompt(prompt)
    || executionStepCount >= 4
  ) {
    return { maxCharts: 3, maxTables: 3, maxPivotTables: 2 }
  }

  if (/\b(chart|graph|visuali[sz]e|plot)\b/i.test(prompt)) {
    return { maxCharts: 2, maxTables: 2, maxPivotTables: 1 }
  }

  return { maxCharts: 1, maxTables: 1, maxPivotTables: 1 }
}

type Emit = (data: object) => void

export function createBoundedVisualEmit(emit: Emit, budget: VisualEmissionBudget): Emit {
  let charts = 0
  let tables = 0
  let pivots = 0

  return (data: object) => {
    if (typeof data === 'object' && data !== null && 'event' in data) {
      const event = String((data as { event: unknown }).event)
      if (event === 'chart') {
        if (charts >= budget.maxCharts) return
        charts += 1
      } else if (event === 'table') {
        if (tables >= budget.maxTables) return
        tables += 1
      } else if (event === 'pivot_table') {
        if (pivots >= budget.maxPivotTables) return
        pivots += 1
      }
    }
    emit(data)
  }
}
