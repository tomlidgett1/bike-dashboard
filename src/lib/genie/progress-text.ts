const MAX_DETAIL_CHARS = 72
/** ~2 lines in the home chat shimmer at 15px / relaxed leading. */
const LIVE_COMFORTABLE_CHARS = 112

function quoteFragment(value: string, maxWords = 4): string {
  const cleaned = value.replace(/["']/g, '').trim()
  if (!cleaned) return ''
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return words.slice(0, maxWords).join(' ')
}

function shouldUsePhaseFallback(compact: string, original: string, max: number): boolean {
  if (compact.length <= max) return false
  // Raw technical status that pattern rules did not shorten — use a phase label instead.
  if (compact === original.trim()) return true
  return compact.length > max
}

function phaseFallback(phase?: string): string {
  switch (phase) {
    case 'context':
      return 'Reading context'
    case 'routing':
      return 'Choosing workflow'
    case 'routing_done':
      return 'Workflow selected'
    case 'setup':
      return 'Preparing tools'
    case 'planning':
    case 'planning_done':
      return 'Planning'
    case 'thinking':
      return 'Thinking'
    case 'web_search':
      return 'Searching web'
    case 'web_search_done':
      return 'Web search done'
    case 'image_search':
      return 'Finding images'
    case 'image_search_done':
      return 'Images ready'
    case 'video_search':
      return 'Finding video'
    case 'video_search_done':
      return 'Video ready'
    case 'lightspeed_sales':
      return 'Checking sales'
    case 'lightspeed_inventory':
      return 'Checking stock'
    case 'lightspeed_customers':
      return 'Checking customers'
    case 'lightspeed_workorders':
      return 'Checking work orders'
    case 'customer_context':
      return 'Checking customer bike'
    case 'specialist':
      return 'Specialist review'
    case 'rechecking':
      return 'Retrying lookup'
    case 'tool_done':
      return 'Tool result ready'
    case 'gmail':
      return 'Checking Gmail'
    case 'gmail_done':
      return 'Gmail done'
    case 'xero':
      return 'Checking Xero'
    case 'xero_done':
      return 'Xero result ready'
    case 'deputy':
      return 'Checking Deputy'
    case 'deputy_done':
      return 'Deputy result ready'
    case 'verifying':
      return 'Quality check'
    case 'product_search':
      return 'Searching marketplace'
    case 'responding':
      return 'Writing answer'
    case 'tool':
      return 'Working'
    default:
      return 'Working'
  }
}

function applyPatternRules(text: string): string {
  let value = text.trim()

  const rules: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
    [/waiting for genie/i, 'Thinking'],
    [/reading your request|reading conversation context/i, 'Reading context'],
    [/choosing (?:the )?(?:best )?workflow|classifying request/i, 'Choosing workflow'],
    [/using model router/i, 'Checking best workflow'],
    [/workflow selected: (.+)/i, (m) => `Workflow: ${quoteFragment(m[1], 5)}`],
    [/preparing (?:\d+ )?(?:route )?tools|selecting route tools/i, 'Preparing tools'],
    [/starting store agent|starting execution|starting store lookup|starting lightspeed lookup/i, 'Starting lookup'],
    [/starting deputy lookup/i, 'Deputy lookup'],
    [/starting xero lookup/i, 'Xero lookup'],
    [/starting gmail lookup/i, 'Gmail lookup'],
    [/workflow selected: store lookup/i, 'Workflow: Store lookup'],
    [/workflow selected: lightspeed lookup/i, 'Workflow: Store lookup'],
    [/using fast lookup path|using fast lightspeed path/i, 'Fast lookup path'],
    [/planning the smart workflow/i, 'Planning'],
    [/planning complete|planning fallback ready/i, 'Plan ready'],
    [/planned (\d+) steps?/i, 'Planned $1 steps'],
    [/reasoning about the requested workflow/i, 'Thinking'],
    [/opening web search|searching the web|browsing cycling resources/i, 'Searching web'],
    [/web research done/i, 'Web search done'],
    [/finding customer context for "(.+?)"/i, (m) => `Customer: ${quoteFragment(m[1])}`],
    [/resolving customer bike context/i, 'Checking customer bike'],
    [/reading customer bike records/i, 'Reading bike records'],
    [/reading workorder bike records/i, 'Workorder bike links'],
    [/reading previous customer sales/i, 'Reading customer sales'],
    [/customer match weak, checking work orders/i, 'Checking work orders'],
    [/reading customer work orders/i, 'Reading work orders'],
    [/customer bike evidence ready/i, 'Bike evidence ready'],
    [/checking fitment with mechanic specialist/i, 'Mechanic review'],
    [/mechanic specialist check ready/i, 'Mechanic check ready'],
    [/reviewing analysis with store specialist/i, 'Store analyst review'],
    [/store analyst review ready/i, 'Analyst review ready'],
    [/writing the lightspeed lookup plan/i, 'Planning lookup'],
    [/choosing a second sql lookup strategy/i, 'Alternate query'],
    [/running the lightspeed sql report/i, 'Running SQL'],
    [/querying the sql sales totals/i, 'Sales totals'],
    [/querying the sql transaction list/i, 'Sale list'],
    [/querying the sql sales chart/i, 'Sales chart'],
    [/aggregating sql sale lines/i, 'Top products'],
    [/querying the sql product trend/i, 'Product trend'],
    [/searching the inventory mirror|searching sql/i, 'Searching stock'],
    [/querying stale inventory cash/i, 'Stale stock value'],
    [/searching sql customer sales rows|listing customers from sql sales report/i, 'Finding customers'],
    [/querying sql product purchasers|finding purchasers of "(.+?)"/i, (m) => `Buyers: ${quoteFragment(m[1])}`],
    [/looking up the sql customer profile|looking up customer \d+ in the sql sales report/i, 'Customer profile'],
    [/building customer profile for (.+)/i, (m) => `Profile: ${quoteFragment(m[1])}`],
    [/resolving customer profile for "(.+?)"/i, (m) => `Resolving: ${quoteFragment(m[1])}`],
    [/searching work order notes for "(.+?)"/i, (m) => `Notes: ${quoteFragment(m[1])}`],
    [/reading sales, bikes, and workshop history for (.+)/i, (m) => `History: ${quoteFragment(m[1])}`],
    [/profiling (\d+) sale rows? and (\d+) work orders?/i, 'Profiling history'],
    [/customer profile ready/i, 'Profile ready'],
    [/querying sql customer sales|querying sql sales for/i, 'Customer sales'],
    [/aggregating sql top customers|aggregating top customers from sql/i, 'Top customers'],
    [/reading your carousels/i, 'Carousels'],
    [/finding products/i, 'Products'],
    [/checking active discounts/i, 'Discounts'],
    [/looking up cost prices/i, 'Costs'],
    [/preparing changes/i, 'Preparing changes'],
    [/tool result ready/i, 'Tool result ready'],
    [/sql result ready/i, 'SQL result ready'],
    [/stock result ready/i, 'Stock result ready'],
    [/work order result ready/i, 'Work order result ready'],
    [/gmail result ready/i, 'Gmail result ready'],
    [/checking whether the answer is complete/i, 'Checking answer'],
    [/writing the final answer|writing answer/i, 'Writing answer'],
    [/checking the marketplace/i, 'Marketplace search'],
    [/composing.*answer/i, 'Writing answer'],

    [/fetched (\d+) completed sale/i, 'Loading sales ($1)'],
    [/fetched (\d+) sale transaction/i, 'Loading sales ($1)'],
    [/fetched (\d+) matching sale/i, 'Loading matches ($1)'],
    [/fetched (\d+) (?:live )?item(?: detail)?/i, 'Loading items ($1)'],
    [/fetched (\d+) stock row/i, 'Loading stock ($1)'],
    [/fetched (\d+) customer/i, 'Loading customers ($1)'],
    [/fetched (\d+) positive-stock row/i, 'Loading stock ($1)'],
    [/fetched (\d+) older matching sale/i, 'Loading history ($1)'],
    [/fetched (\d+) customer-linked sale/i, 'Loading sales ($1)'],
    [/fetched (\d+) customer sale/i, 'Loading sales ($1)'],
    [/found (\d+) (?:item|product) candidate/i, 'Found $1 matches'],
    [/scanned (\d+) live item/i, 'Scanned $1 items'],
    [/checked (\d+) recent sale/i, 'Checked $1 sales'],
    [/scored (\d+) item candidate/i, 'Ranked $1 items'],

    [/calculating totals for \d+ completed sale/i, 'Totalling sales'],
    [/sorting \d+ sale transaction/i, 'Sorting sales'],
    [/bucketing \d+ completed sale|aggregating \d+ matching sale/i, 'Grouping sales'],
    [/aggregating \d+ sale by customer/i, 'Grouping customers'],
    [/aggregating \d+ sale from sql rows/i, 'Grouping sales'],

    [/querying sales report sql from/i, 'Querying sales'],
    [/querying sale transactions from the sales report/i, 'Querying sales'],
    [/querying sql sales rows for/i, 'Building chart'],
    [/fetching completed lightspeed sales from/i, 'Fetching sales'],
    [/fetching sale transactions from/i, 'Fetching sales'],
    [/fetching sales for a .+ chart/i, 'Building chart'],
    [/fetching stock rows for \d+ matched item/i, 'Loading stock'],
    [/fetching details for \d+ matched customer/i, 'Loading customers'],
    [/fetching lightspeed customer \d+/i, 'Loading customer'],
    [/fetching sales with customer links from/i, 'Fetching sales'],

    [
      /searching (?:the )?lightspeed inventory mirror for "(.+?)"/i,
      (m) => `Stock: ${quoteFragment(m[1])}`,
    ],
    [
      /resolving live lightspeed products for "(.+?)"/i,
      (m) => `Products: ${quoteFragment(m[1])}`,
    ],
    [
      /querying sql sale lines for "(.+?)"/i,
      (m) => `Trend: ${quoteFragment(m[1])}`,
    ],
    [
      /preparing .+ chart and table for "(.+?)"/i,
      (m) => `Chart: ${quoteFragment(m[1])}`,
    ],
    [
      /focused search found no items; scanning live lightspeed inventory for "(.+?)"/i,
      (m) => `Scanning: ${quoteFragment(m[1])}`,
    ],
    [
      /searching sql sales customers for "(.+?)"/i,
      (m) => `Customers: ${quoteFragment(m[1])}`,
    ],
    [/reading .+?: \d+ rows? from sql|reading .+ rows? from sql/i, 'Reading SQL rows'],
    [/matched \d+ lightspeed product/i, 'Matched products'],
    [/no strong live lightspeed product match/i, 'No product match'],
    [/resolving lightspeed brands, categories, and shops for "(.+?)"/i, (m) => `Resolving: ${quoteFragment(m[1])}`],
    [/searching live lightspeed items by/i, 'Searching items'],
    [/running ([a-z0-9_]+)/i, (m) => `Running ${m[1].replaceAll('_', ' ')}`],
  ]

  for (const [pattern, replacement] of rules) {
    if (!pattern.test(value)) continue
    value = typeof replacement === 'function'
      ? value.replace(pattern, (...args) => replacement(args as RegExpMatchArray))
      : value.replace(pattern, replacement)
    value = value.replace(/\s+/g, ' ').trim()
    break
  }

  value = value.replace(/\.\.\./g, '…').replace(/\.{2,}/g, '…')
  return value
}

/** Compact status for timeline rows and server emissions. */
export function compactGenieProgressText(text: string, phase?: string): string {
  const trimmed = text.trim()
  if (!trimmed) return phaseFallback(phase)

  if (/^i'll treat this as /i.test(trimmed)) {
    if (trimmed.length <= MAX_DETAIL_CHARS) return trimmed
    const slice = trimmed.slice(0, MAX_DETAIL_CHARS)
    const lastSpace = slice.lastIndexOf(' ')
    return `${(lastSpace > 24 ? slice.slice(0, lastSpace) : slice).trim()}…`
  }

  const compact = applyPatternRules(trimmed)
  if (!compact) return phaseFallback(phase)
  if (shouldUsePhaseFallback(compact, trimmed, MAX_DETAIL_CHARS)) {
    return phaseFallback(phase)
  }
  return compact
}

export type GenieProgressStepLike = {
  phase: string
  text: string
  sourceText?: string
}

export function isRoutingFramingText(text: string): boolean {
  return /^i'll treat this as /i.test(text.trim())
}

/** Latest progress step for the live shimmer — always follow the most recent activity. */
export function liveGenieDisplayStep<T extends GenieProgressStepLike>(steps: T[]): T | undefined {
  if (!steps.length) return undefined
  return steps[steps.length - 1]
}

export type GenieSubCommentaryContext = {
  mainLabel?: string
  analysisQueries?: Array<{ purpose: string; status: string }>
  analysisPlan?: {
    execution_steps?: string[]
    sql_strategy_summary?: string | null
    user_intent?: string | null
    date_range_label?: string | null
  }
}

const LIVE_SUB_CHARS = 140

function normalizeProgressCompare(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function clipSubCommentary(value: string, max = LIVE_SUB_CHARS): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  const slice = trimmed.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  return `${(lastSpace > 48 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`
}

function extractExplicitSubDetail(raw: string): string | null {
  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^running sql report:\s*(.+)/i, (match) => match[1]],
    [/^planning \d+ steps?:\s*(.+)/i, (match) => match[1]],
    [/^rechecking:\s*(.+)/i, (match) => match[1]],
    [/^finding images for "(.+?)"/i, (match) => `Image search: ${match[1]}`],
    [/^opening web search:\s*(.+)/i, (match) => match[1]],
    [/^searching (?:the )?web(?:\s+for)?\s*[:"]?\s*(.+)/i, (match) => match[1]],
    [/^browsing cycling resources:\s*(.+)/i, (match) => match[1]],
    [/^sql:\s*(.+)/i, (match) => match[1]],
    [/^workflow selected:\s*(.+)/i, (match) => match[1]],
    [/^querying sql .+ for (.+)/i, (match) => match[1]],
    [/^rendering .+ for "(.+?)"/i, (match) => match[1]],
    [/^searching (?:the )?lightspeed inventory mirror for "(.+?)"/i, (match) => `Stock lookup: ${match[1]}`],
    [/^resolving live lightspeed products for "(.+?)"/i, (match) => `Product lookup: ${match[1]}`],
    [/^finding customer context for "(.+?)"/i, (match) => `Customer: ${match[1]}`],
    [/^building customer profile for (.+)/i, (match) => `Profile: ${match[1]}`],
  ]

  for (const [pattern, pick] of patterns) {
    const match = raw.match(pattern)
    if (!match) continue
    const detail = pick(match).trim()
    if (detail) return detail
  }

  return null
}

/** Secondary line under the live shimmer — concrete detail about the current action. */
export function liveGenieSubCommentary(
  step: (GenieProgressStepLike & { kind?: 'status' | 'reasoning' }) | undefined,
  context?: GenieSubCommentaryContext,
): string | null {
  const runningQuery = context?.analysisQueries
    ?.filter((query) => query.status === 'running')
    .slice(-1)[0]
  if (runningQuery?.purpose?.trim()) {
    return clipSubCommentary(runningQuery.purpose)
  }

  if (!step) {
    const planSummary = context?.analysisPlan?.sql_strategy_summary?.trim()
    if (planSummary) return clipSubCommentary(planSummary)
    return null
  }

  const raw = (step.sourceText ?? step.text).trim()
  if (!raw) return null

  const mainLabel = context?.mainLabel?.trim()
    || (step.kind === 'reasoning'
      ? 'Thinking it through'
      : liveGenieProgressPreview(raw, step.phase))

  if (step.kind === 'reasoning') {
    const lines = raw
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.length > 0)
    if (lines.length <= 1) return null
    const rest = lines.slice(1).join(' · ')
    if (!rest || normalizeProgressCompare(rest) === normalizeProgressCompare(mainLabel)) return null
    return clipSubCommentary(rest)
  }

  if (/^i'll treat this as /i.test(raw)) {
    const intent = context?.analysisPlan?.user_intent?.trim()
    if (intent && normalizeProgressCompare(intent) !== normalizeProgressCompare(mainLabel)) {
      return clipSubCommentary(intent)
    }
    return null
  }

  const explicit = extractExplicitSubDetail(raw)
  if (explicit && normalizeProgressCompare(explicit) !== normalizeProgressCompare(mainLabel)) {
    return clipSubCommentary(explicit)
  }

  if (step.sourceText?.trim() && step.sourceText.trim() !== step.text.trim()) {
    const source = step.sourceText.trim()
    const compactSource = compactGenieProgressText(source, step.phase)
    if (
      normalizeProgressCompare(source) !== normalizeProgressCompare(mainLabel)
      && normalizeProgressCompare(compactSource) !== normalizeProgressCompare(mainLabel)
    ) {
      return clipSubCommentary(source)
    }
  }

  const compact = compactGenieProgressText(raw, step.phase)
  if (
    compact
    && normalizeProgressCompare(compact) !== normalizeProgressCompare(mainLabel)
    && !shouldUsePhaseFallback(compact, raw, MAX_DETAIL_CHARS)
  ) {
    return clipSubCommentary(compact)
  }

  if (step.phase === 'planning' || step.phase === 'planning_done') {
    const planSummary = context?.analysisPlan?.sql_strategy_summary?.trim()
    if (planSummary && normalizeProgressCompare(planSummary) !== normalizeProgressCompare(mainLabel)) {
      return clipSubCommentary(planSummary)
    }
    const steps = context?.analysisPlan?.execution_steps?.filter(Boolean) ?? []
    if (steps.length) {
      const joined = steps.slice(0, 3).join(' → ')
      if (normalizeProgressCompare(joined) !== normalizeProgressCompare(mainLabel)) {
        return clipSubCommentary(joined)
      }
    }
  }

  if (step.phase === 'lightspeed_sales' || step.phase === 'lightspeed_inventory') {
    const dateRange = context?.analysisPlan?.date_range_label?.trim()
    if (dateRange && normalizeProgressCompare(dateRange) !== normalizeProgressCompare(mainLabel)) {
      return clipSubCommentary(dateRange)
    }
  }

  return null
}

/** User-facing line shown while Genie is still working — never ends with an ellipsis. */
export function liveGenieProgressPreview(text: string, phase?: string): string {
  const trimmed = text.trim()
  if (!trimmed) return phaseFallback(phase)

  if (/^i'll treat this as /i.test(trimmed)) {
    if (trimmed.length <= LIVE_COMFORTABLE_CHARS) return trimmed
    const slice = trimmed.slice(0, LIVE_COMFORTABLE_CHARS)
    const lastSpace = slice.lastIndexOf(' ')
    return (lastSpace > 24 ? slice.slice(0, lastSpace) : slice).trim()
  }

  const compact = applyPatternRules(trimmed)
  if (!compact) return phaseFallback(phase)
  if (compact.length <= LIVE_COMFORTABLE_CHARS) return compact
  if (shouldUsePhaseFallback(compact, trimmed, LIVE_COMFORTABLE_CHARS)) {
    return phaseFallback(phase)
  }
  const slice = compact.slice(0, LIVE_COMFORTABLE_CHARS)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim()
}
