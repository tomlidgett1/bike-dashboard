const MAX_DETAIL_CHARS = 72
const LIVE_COMFORTABLE_CHARS = 52

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
    case 'planning':
    case 'planning_done':
      return 'Planning'
    case 'thinking':
      return 'Thinking'
    case 'web_search':
      return 'Searching web'
    case 'web_search_done':
      return 'Web search done'
    case 'lightspeed_sales':
      return 'Checking sales'
    case 'lightspeed_inventory':
      return 'Checking stock'
    case 'lightspeed_customers':
      return 'Checking customers'
    case 'rechecking':
      return 'Retrying lookup'
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
    [/waiting for genie|reading your request/i, 'Thinking'],
    [/planning the smart workflow/i, 'Planning'],
    [/planning complete|planning fallback ready|starting execution/i, 'Running analysis'],
    [/reasoning about the requested workflow/i, 'Thinking'],
    [/opening web search|searching the web|browsing cycling resources/i, 'Searching web'],
    [/web research done/i, 'Web search done'],
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
    [/querying sql customer sales|querying sql sales for/i, 'Customer sales'],
    [/aggregating sql top customers|aggregating top customers from sql/i, 'Top customers'],
    [/reading your carousels/i, 'Carousels'],
    [/finding products/i, 'Products'],
    [/checking active discounts/i, 'Discounts'],
    [/looking up cost prices/i, 'Costs'],
    [/preparing changes/i, 'Preparing changes'],
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

  const compact = applyPatternRules(trimmed)
  if (!compact) return phaseFallback(phase)
  if (shouldUsePhaseFallback(compact, trimmed, MAX_DETAIL_CHARS)) {
    return phaseFallback(phase)
  }
  return compact
}

/** User-facing line shown while Genie is still working — never ends with an ellipsis. */
export function liveGenieProgressPreview(text: string, phase?: string): string {
  const trimmed = text.trim()
  if (!trimmed) return phaseFallback(phase)

  const compact = applyPatternRules(trimmed)
  if (!compact) return phaseFallback(phase)
  if (shouldUsePhaseFallback(compact, trimmed, LIVE_COMFORTABLE_CHARS)) {
    return phaseFallback(phase)
  }
  return compact
}
