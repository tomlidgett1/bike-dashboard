/**
 * Genie Store Agent — streaming, READ + PROPOSE only.
 *
 * Authenticated to verified bicycle stores. Lets a store manage their storefront
 * conversationally: reorder/show/hide carousels, and apply percentage discounts.
 *
 * This endpoint NEVER mutates. Read tools fetch state; "propose_*" tools compute
 * an exact change and emit a `proposal` SSE event. The UI previews it and, on
 * Apply, POSTs the proposal to /api/genie/agent/apply which does the mutation.
 */

import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Agent, Runner, assistant as assistantMessage, tool, user as userMessage, webSearchTool, type AgentInputItem } from '@openai/agents'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import type {
  LightspeedCategory,
  LightspeedCustomer,
  LightspeedItem,
  LightspeedItemShop,
  LightspeedSale,
  LightspeedSaleLine,
} from '@/lib/services/lightspeed'
import type {
  CarouselSizeOption,
  GenieProposal,
  CarouselLayoutProposal,
  CarouselCreateProposal,
  CarouselRenameProposal,
  DiscountApplyProposal,
  DiscountRemoveProposal,
  PriceUpdateProposal,
} from '@/lib/types/genie-agent'
import { NEW_CAROUSEL_SLOT } from '@/lib/types/genie-agent'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const MODEL = 'gpt-5.4'
const STORE_TIME_ZONE = 'Australia/Brisbane'
const STORE_UTC_OFFSET = '+10:00'
const storeAgentRunner = new Runner({
  tracingDisabled: true,
  traceIncludeSensitiveData: false,
})
let cachedLightspeedInstructions: string | null = null

function getLightspeedInstructions(): string {
  if (cachedLightspeedInstructions != null) return cachedLightspeedInstructions
  cachedLightspeedInstructions = fs.readFileSync(path.join(process.cwd(), 'lightspeed.md'), 'utf8')
  return cachedLightspeedInstructions
}

function getStoreToday(): string {
  return storeDateFromDate(new Date())
}

function storeDateFromDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function buildSystemPrompt(storeName: string): string {
  const today = getStoreToday()
  return `You are the Yellow Jersey Store Agent — a sharp, efficient assistant that helps "${storeName}" manage their storefront on Yellow Jersey. Today is ${today}.

WHAT YOU CAN DO
1. Carousels — the rows of products on the store's public page. You can:
   • Create a new carousel of products from a description (e.g. "make a 'Summer Sale' row of all Clif bars"). Give it a name and, optionally, where it sits.
   • Rename an existing carousel.
   • Reorder them, show/hide them, and set a size (featured | normal | compact). The FIRST carousel is the featured collection.
2. Discounts — apply a percentage discount to one or more products (e.g. "50% off all Clif bars"), optionally with an end date after which it lapses.
3. Pricing — view cost prices and adjust retail prices. You can:
   • Answer questions about cost, margin, or markup for any products.
   • Set retail prices to achieve a target markup % on cost (e.g. "set all Clif bars to 40% markup").
   • Set specific retail prices for named products.
   • Identify products with low margins or where cost exceeds/equals retail.
4. Lightspeed activity — answer live questions about sales, sold products, item cost, gross profit, margin, and inventory stock from the store's connected Lightspeed account.
5. Lightspeed customers — answer live customer questions, including customer lookup, contact details, purchase history, top customers, customer sales value, and customer lists from the connected Lightspeed account.
6. Web research — search the live web for current cycling, product, pricing, standards, compatibility, supplier, event, and market information when the answer depends on up-to-date external facts.

HOW TO WORK
- Read first: call get_store_carousels / search_store_products / get_product_costs / list_active_discounts to ground yourself in the store's ACTUAL data before proposing anything.
- Then propose: call exactly one propose_* tool to stage the change. You never apply changes yourself — the store reviews a preview and clicks Apply.
- For Lightspeed sales/inventory/cost/profit/margin/customer questions: follow the Lightspeed instructions below, call record_lightspeed_plan first, then call the required live Lightspeed tools. These are answer-only tools; do not create proposals for Lightspeed reporting.
- For current external questions, use web_search. Use it for public information only. Never use web search instead of Lightspeed tools for store sales, sale lines, inventory, stock-on-hand, or private store activity.
- Creating a carousel: choose a clear name (use the store's own words if they gave one), and pass "match" to fill it by description ("all Clif bars" → match:"Clif"); use product_ids only for specific picks. To place it, pass position (1 = top/featured slot); omit to add it at the end.
- Renaming: use get_store_carousels to find the carousel id, then propose_rename_carousel with the new name.
- For discounts by description ("all Clif bars"), pass the keyword as "match" and let the system find the products. Only pass product_ids if the store picked specific items.
- Expiry: if the store gives a deadline ("until Sunday"), compute the ISO date from today (${today}) and pass it as ends_at. No deadline → omit it.
- For pricing: call get_product_costs first to see cost data, then propose_price_update with either markup_percent (applied to cost) or explicit new_prices (id→price map). Prices are always rounded to 2 decimal places. Never propose a price below cost.

STYLE
- Concise and confident. No preamble, no "let me…".
- Use clean Markdown in final answers: short headings, bullets, bold labels for important metrics, and compact tables only for rankings or comparisons.
- After proposing, briefly say what's staged and that they can review & Apply. Don't restate every item — the preview card shows detail.
- For Lightspeed answers, use the planning status/tool first, but do not include a Plan section in the final answer. Give the result directly in structured Markdown.
- If a request is ambiguous or matches nothing, say so in one line and ask a single sharp question.
- Stay on storefront management and Lightspeed sales/inventory/cost/profit/margin/customer activity. Politely redirect anything else.

LIGHTSPEED INSTRUCTIONS
${getLightspeedInstructions()}`
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface StreamToolItem {
  name?: string
  rawItem?: {
    name?: string
    toolName?: string
  }
}

interface RawModelDeltaEvent {
  type?: string
  delta?: unknown
  text?: unknown
  part?: {
    text?: unknown
  }
  event?: {
    type?: string
    delta?: unknown
    text?: unknown
    part?: {
      text?: unknown
    }
  }
}

function toAgentInputMessages(messages: Message[]): AgentInputItem[] {
  return messages.map(message =>
    message.role === 'user'
      ? userMessage(message.content)
      : assistantMessage(message.content),
  )
}

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

/** Strip characters that would break a PostgREST .or() ilike filter. */
function sanitizeMatch(term: string): string {
  return term.replace(/[,()*]/g, ' ').trim()
}

const SIZE_VALUES: CarouselSizeOption[] = ['featured', 'normal', 'compact']
function normalizeSize(v: unknown): CarouselSizeOption {
  return SIZE_VALUES.includes(v as CarouselSizeOption) ? (v as CarouselSizeOption) : 'normal'
}

type Supa = Awaited<ReturnType<typeof createClient>>

interface StoreCarouselRow {
  id: string
  name: string
  source: string
  display_order: number
  is_active: boolean | null
  carousel_size: unknown
  product_ids: unknown
}

interface ProductRow {
  id: string
  display_name: string | null
  description: string | null
  price?: number | string | null
  category_name?: string | null
  manufacturer_name?: string | null
  discount_percent?: number | string | null
  discount_active?: boolean | null
  discount_ends_at?: string | null
  sale_price?: number | string | null
  default_cost?: number | string | null
  avg_cost?: number | string | null
}

// ── Read helpers ────────────────────────────────────────────────────────────

async function getStoreCarousels(supabase: Supa, userId: string) {
  const { data } = await supabase
    .from('store_categories')
    .select('id, name, source, display_order, is_active, carousel_size, product_ids')
    .eq('user_id', userId)
    .order('display_order', { ascending: true })

  const rows = (data ?? []) as StoreCarouselRow[]
  return rows.map(c => ({
    id: c.id as string,
    name: c.name as string,
    source: c.source as string,
    display_order: c.display_order as number,
    is_active: c.is_active !== false,
    carousel_size: normalizeSize(c.carousel_size),
    product_count: Array.isArray(c.product_ids) ? c.product_ids.length : 0,
  }))
}

async function searchStoreProducts(supabase: Supa, userId: string, query: string) {
  const term = sanitizeMatch(query)
  let q = supabase
    .from('products')
    .select('id, display_name, description, price, category_name, manufacturer_name, discount_percent, discount_active')
    .eq('user_id', userId)
    .limit(40)

  if (term) {
    const like = `%${term}%`
    q = q.or(
      [
        `display_name.ilike.${like}`,
        `description.ilike.${like}`,
        `category_name.ilike.${like}`,
        `manufacturer_name.ilike.${like}`,
        `full_category_path.ilike.${like}`,
      ].join(','),
    )
  }

  const { data } = await q
  const rows = (data ?? []) as ProductRow[]
  return rows.map(p => ({
    id: p.id as string,
    name: p.display_name || p.description || 'Unnamed product',
    price: Number(p.price) || 0,
    currently_discounted: p.discount_active === true && p.discount_percent != null,
    discount_percent: p.discount_percent != null ? Number(p.discount_percent) : null,
  }))
}

async function listActiveDiscounts(supabase: Supa, userId: string) {
  const { data } = await supabase
    .from('products')
    .select('id, display_name, description, price, discount_percent, discount_ends_at, sale_price')
    .eq('user_id', userId)
    .eq('discount_active', true)

  const rows = (data ?? []) as ProductRow[]
  return rows.map(p => ({
    id: p.id as string,
    name: p.display_name || p.description || 'Unnamed product',
    price: Number(p.price) || 0,
    discount_percent: p.discount_percent != null ? Number(p.discount_percent) : null,
    sale_price: p.sale_price != null ? Number(p.sale_price) : null,
    ends_at: p.discount_ends_at ?? null,
  }))
}

async function getProductCosts(supabase: Supa, userId: string, query?: string) {
  let q = supabase
    .from('products')
    .select('id, display_name, description, price, default_cost, avg_cost, category_name, manufacturer_name')
    .eq('user_id', userId)
    .limit(100)

  if (query && sanitizeMatch(query)) {
    const like = `%${sanitizeMatch(query)}%`
    q = q.or(
      [
        `display_name.ilike.${like}`,
        `description.ilike.${like}`,
        `category_name.ilike.${like}`,
        `manufacturer_name.ilike.${like}`,
        `full_category_path.ilike.${like}`,
      ].join(','),
    )
  }

  const { data } = await q
  const rows = (data ?? []) as ProductRow[]
  return rows.map(p => {
    const price = Number(p.price) || 0
    // Prefer avg_cost when non-zero (more accurate), fall back to default_cost
    const cost =
      p.avg_cost != null && Number(p.avg_cost) > 0
        ? Number(p.avg_cost)
        : p.default_cost != null && Number(p.default_cost) > 0
          ? Number(p.default_cost)
          : null
    const margin_percent =
      cost != null && price > 0 ? Math.round(((price - cost) / price) * 100 * 10) / 10 : null
    return {
      id: p.id as string,
      name: p.display_name || p.description || 'Unnamed product',
      price,
      cost,
      margin_percent,
    }
  })
}

// ── Lightspeed live reporting helpers ────────────────────────────────────────

type Emit = (data: object) => void

type VisualValueFormat = 'currency' | 'number' | 'percent'

interface VisualPrefs {
  chart: boolean
  line: boolean
  table: boolean
}

interface GenieChartSeries {
  key: string
  label: string
  color?: string
}

interface GenieChartPoint {
  label: string
  [key: string]: string | number | null
}

interface GenieChartPayload {
  kind: 'bar' | 'line'
  title: string
  subtitle?: string
  xKey: 'label'
  series: GenieChartSeries[]
  data: GenieChartPoint[]
  valueFormatter?: VisualValueFormat
}

interface GenieTableColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: VisualValueFormat
}

interface GenieTablePayload {
  title: string
  subtitle?: string
  columns: GenieTableColumn[]
  rows: Array<Record<string, string | number | null>>
}

type SalesBucket = 'day' | 'week' | 'month' | 'year'
type CostMethod = 'avg' | 'fifo'
type SalesTimeseriesMetric =
  | 'gross_sales'
  | 'net_sales'
  | 'sale_count'
  | 'average_sale_value'
  | 'total_cost'
  | 'gross_profit'
  | 'gross_margin_percent'
type SoldProductTimeseriesMetric =
  | 'units_sold'
  | 'revenue'
  | 'sale_line_count'
  | 'total_cost'
  | 'gross_profit'
  | 'margin_percent'
  | 'average_unit_cost'
type LightspeedSaleLineRelation = 'none' | 'lines' | 'lines_with_items'

function emitStatus(emit: Emit, phase: string, text: string) {
  emit({ event: 'status', phase, text })
}

function emitProgress(emit: Emit | undefined, phase: string, text: string) {
  if (emit) emitStatus(emit, phase, text)
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

interface LightspeedPageProgress {
  pagesFetched: number
  pageCount: number
  totalCount: number
  hasNextPage: boolean
  hitPageLimit: boolean
}

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toOptionalNum(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10
}

function latestUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i]?.content ?? ''
  }
  return ''
}

function visualPrefsForMessages(messages: Message[]): VisualPrefs {
  const text = latestUserText(messages).toLowerCase()
  return {
    chart: /\b(bar|line|trend)\s*(chart|graph)\b|\b(chart|graph)\b|\bplot\b|\bvisuali[sz]e\b|\bbar\s+chart\b|\bbar\s+graph\b|\bline\s+chart\b|\bline\s+graph\b/.test(text),
    line: /\bline\s*(chart|graph)\b|\btrend\s*(line|chart|graph)\b/.test(text),
    table: /\btable\b|\btabular\b|\bspreadsheet\b|\bbreakdown\b|\bcomparison\b|\branking\b|\brankings\b|\btop\b|\blist(?:ed|ing)?\b|\btransactions?\b|\breceipts?\b|\borders?\b|\bevery\s+sale\b|\beach\s+sale\b/.test(text),
  }
}

function isoDateToUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function isoDateFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime())
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

function addUtcYears(date: Date, years: number): Date {
  const next = new Date(date.getTime())
  next.setUTCFullYear(next.getUTCFullYear() + years)
  return next
}

function startOfSalesBucket(date: Date, bucket: SalesBucket): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

  if (bucket === 'week') {
    const mondayOffset = (start.getUTCDay() + 6) % 7
    return addUtcDays(start, -mondayOffset)
  }

  if (bucket === 'month') {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  }

  if (bucket === 'year') {
    return new Date(Date.UTC(start.getUTCFullYear(), 0, 1))
  }

  return start
}

function nextSalesBucketStart(date: Date, bucket: SalesBucket): Date {
  if (bucket === 'day') return addUtcDays(date, 1)
  if (bucket === 'week') return addUtcDays(date, 7)
  if (bucket === 'month') return addUtcMonths(date, 1)
  return addUtcYears(date, 1)
}

function endOfSalesBucket(date: Date, bucket: SalesBucket): Date {
  return addUtcDays(nextSalesBucketStart(date, bucket), -1)
}

function clampUtcDate(date: Date, min: Date, max: Date): Date {
  if (date.getTime() < min.getTime()) return min
  if (date.getTime() > max.getTime()) return max
  return date
}

function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = isoDateToUtcDate(startDate).getTime()
  const end = isoDateToUtcDate(endDate).getTime()
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1)
}

function defaultSalesBucket(startDate: string, endDate: string): SalesBucket {
  const days = inclusiveDayCount(startDate, endDate)
  if (days <= 45) return 'day'
  if (days <= 120) return 'week'
  if (days <= 800) return 'month'
  return 'year'
}

function salesBucketLabel(bucketStart: Date, bucket: SalesBucket): string {
  if (bucket === 'day') {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    }).format(bucketStart)
  }

  if (bucket === 'week') {
    return `Week of ${new Intl.DateTimeFormat('en-AU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    }).format(bucketStart)}`
  }

  if (bucket === 'month') {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'UTC',
      month: 'short',
      year: 'numeric',
    }).format(bucketStart)
  }

  return String(bucketStart.getUTCFullYear())
}

function salesMetricLabel(metric: SalesTimeseriesMetric): string {
  if (metric === 'net_sales') return 'Net Sales'
  if (metric === 'sale_count') return 'Sales Count'
  if (metric === 'average_sale_value') return 'Average Sale'
  if (metric === 'total_cost') return 'Cost'
  if (metric === 'gross_profit') return 'Gross Profit'
  if (metric === 'gross_margin_percent') return 'Gross Margin'
  return 'Gross Sales'
}

function soldProductMetricLabel(metric: SoldProductTimeseriesMetric): string {
  if (metric === 'revenue') return 'Revenue'
  if (metric === 'sale_line_count') return 'Sale Lines'
  if (metric === 'total_cost') return 'Cost'
  if (metric === 'gross_profit') return 'Gross Profit'
  if (metric === 'margin_percent') return 'Margin'
  if (metric === 'average_unit_cost') return 'Average Unit Cost'
  return 'Units Sold'
}

function salesBucketLabelTitle(bucket: SalesBucket): string {
  if (bucket === 'day') return 'Day'
  if (bucket === 'week') return 'Week'
  if (bucket === 'month') return 'Month'
  return 'Year'
}

function ensureLsArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function assertIsoDate(value: string, label: string): string {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
    throw new Error(`${label} must be an ISO date in YYYY-MM-DD format.`)
  }
  return text
}

function completeTimeFilter(startDate: string, endDate: string): string {
  const startUtc = storeLocalTimeToUtcTimestamp(startDate, '00:00:00')
  const endUtc = storeLocalTimeToUtcTimestamp(endDate, '23:59:59')
  return `><,${startUtc},${endUtc}`
}

function saleLines(sale: LightspeedSale): LightspeedSaleLine[] {
  return ensureLsArray(sale.SaleLines?.SaleLine)
}

function saleTotal(sale: LightspeedSale): number {
  return toNum(sale.calcTotal || sale.total || sale.displayableTotal)
}

function lineName(line: LightspeedSaleLine): string {
  return line.Item?.description || (line.itemID ? `Item ${line.itemID}` : 'Unknown item')
}

function positiveQuantity(line: LightspeedSaleLine): number {
  return Math.max(0, toNum(line.unitQuantity))
}

function itemDefaultCost(item: LightspeedItem | undefined): number | null {
  return toOptionalNum(item?.defaultCost)
}

function itemAverageCost(item: LightspeedItem | undefined): number | null {
  return toOptionalNum(item?.avgCost)
}

function itemEffectiveCost(item: LightspeedItem | undefined): number | null {
  const averageCost = itemAverageCost(item)
  if (averageCost != null && averageCost > 0) return averageCost
  const defaultCost = itemDefaultCost(item)
  return defaultCost != null ? defaultCost : null
}

function lineUnitCost(line: LightspeedSaleLine, method: CostMethod = 'avg'): number | null {
  const primary = method === 'fifo' ? toOptionalNum(line.fifoCost) : toOptionalNum(line.avgCost)
  if (primary != null && primary > 0) return primary

  const secondary = method === 'fifo' ? toOptionalNum(line.avgCost) : toOptionalNum(line.fifoCost)
  if (secondary != null && secondary > 0) return secondary

  return itemEffectiveCost(line.Item)
}

function lineCost(line: LightspeedSaleLine, method: CostMethod = 'avg'): number {
  const cost = lineUnitCost(line, method)
  if (cost == null) return 0
  return cost * positiveQuantity(line)
}

function lineRevenue(line: LightspeedSaleLine): number {
  return toNum(line.calcSubtotal || line.displayableSubtotal || line.calcTotal)
}

function saleCost(sale: LightspeedSale, method: CostMethod = 'avg'): number {
  const saleLevelCost = method === 'fifo'
    ? toOptionalNum(sale.calcFIFOCost)
    : toOptionalNum(sale.calcAvgCost)
  if (saleLevelCost != null && saleLevelCost > 0) return saleLevelCost

  const fallbackSaleCost = method === 'fifo'
    ? toOptionalNum(sale.calcAvgCost)
    : toOptionalNum(sale.calcFIFOCost)
  if (fallbackSaleCost != null && fallbackSaleCost > 0) return fallbackSaleCost

  return saleLines(sale).reduce((sum, line) => sum + lineCost(line, method), 0)
}

function profitMetrics(revenue: number, cost: number) {
  const grossProfit = revenue - cost
  return {
    total_cost: roundMoney(cost),
    gross_profit: roundMoney(grossProfit),
    margin_percent: revenue > 0 ? roundPercent((grossProfit / revenue) * 100) : null,
  }
}

function saleCompletedAt(sale: LightspeedSale): string | null {
  return sale.completeTime || sale.createTime || sale.timeStamp || null
}

function storeLocalTimeToUtcTimestamp(isoDate: string, time: '00:00:00' | '23:59:59'): string {
  return new Date(`${isoDate}T${time}${STORE_UTC_OFFSET}`).toISOString().replace('.000Z', 'Z')
}

function saleCompletedStoreDate(sale: LightspeedSale): string | null {
  const completedAt = saleCompletedAt(sale)
  if (!completedAt) return null
  const date = new Date(completedAt)
  if (Number.isNaN(date.getTime())) return null
  return storeDateFromDate(date)
}

function formatStoreDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

function compactQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundMoney(value))
}

function saleUnits(lines: LightspeedSaleLine[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + Math.max(0, toNum(line.unitQuantity)), 0))
}

function saleItemsSummary(lines: LightspeedSaleLine[], maxItems = 4): string {
  const positiveLines = lines.filter(line => toNum(line.unitQuantity) > 0)
  if (positiveLines.length === 0) return 'No item detail'

  const labels = positiveLines.slice(0, maxItems).map(line => {
    const quantity = toNum(line.unitQuantity)
    const prefix = quantity === 1 ? '' : `${compactQuantity(quantity)} x `
    return `${prefix}${lineName(line)}`
  })
  const extra = positiveLines.length - labels.length
  return extra > 0 ? `${labels.join(', ')} +${extra} more` : labels.join(', ')
}

function itemPrice(item: LightspeedItem): number {
  const prices = ensureLsArray(item.Prices?.ItemPrice)
  const defaultPrice = prices.find(p => p.useType?.toLowerCase() === 'default') ?? prices[0]
  return toNum(defaultPrice?.amount)
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function singularToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (token.endsWith('sses') && token.length > 5) return token.slice(0, -2)
  if (/(ches|shes|xes|zes)$/.test(token) && token.length > 4) return token.slice(0, -2)
  if (token.endsWith('ses') && token.length > 4) return token.slice(0, -1)
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1)
  return token
}

function tokenVariants(token: string): string[] {
  const variants = new Set([token])
  variants.add(singularToken(token))
  if (token.endsWith('ies') && token.length > 4) variants.add(`${token.slice(0, -3)}y`)
  if (token.endsWith('es') && token.length > 3) variants.add(token.slice(0, -2))
  if (token.endsWith('s') && token.length > 3) variants.add(token.slice(0, -1))
  return Array.from(variants)
}

function queryTokens(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(t => t.length > 1)
}

function hasToken(text: string, token: string): boolean {
  return tokenVariants(token).some(v => text.includes(v))
}

function fuzzyTextScore(query: string, text: unknown): number {
  const q = normalizeText(query)
  const haystack = normalizeText(text)
  if (!q || !haystack) return 0

  let score = 0
  if (haystack === q) score += 80
  if (haystack.includes(q)) score += 40

  const singularPhrase = queryTokens(query).map(singularToken).join(' ')
  if (singularPhrase && haystack.includes(singularPhrase)) score += 30

  const tokens = queryTokens(query)
  if (tokens.length > 0 && tokens.every(t => hasToken(haystack, t))) score += 25
  for (const token of tokens) {
    if (hasToken(haystack, token)) score += 4
  }

  return score
}

const GENERIC_INVENTORY_TOKENS = new Set([
  'a',
  'an',
  'any',
  'available',
  'availability',
  'do',
  'does',
  'for',
  'have',
  'how',
  'in',
  'inventory',
  'many',
  'of',
  'on',
  'qoh',
  'quantity',
  'stock',
  'the',
  'we',
])

const GENERIC_PRODUCT_TOKENS = new Set([
  'bike',
  'bikes',
  'bicycle',
  'bicycles',
  'cycle',
  'cycles',
  'product',
  'products',
  'item',
  'items',
])

function meaningfulQueryTokens(query: string): string[] {
  return queryTokens(query).filter(token => (
    token.length > 1 &&
    !GENERIC_INVENTORY_TOKENS.has(token) &&
    !GENERIC_PRODUCT_TOKENS.has(token)
  ))
}

function queryHasBikeIntent(query: string): boolean {
  const tokens = queryTokens(query)
  return tokens.some(token => ['bike', 'bikes', 'bicycle', 'bicycles'].includes(token))
}

function textHasBikeIntent(text: string): boolean {
  return ['bike', 'bikes', 'bicycle', 'bicycles'].some(token => hasToken(normalizeText(text), token))
}

function brandScore(query: string, brandName: unknown): number {
  const name = normalizeText(brandName)
  const q = normalizeText(query)
  if (!name || !q) return 0

  let score = 0
  if (q === name) score += 120
  if (q.includes(name)) score += 95

  for (const token of meaningfulQueryTokens(query)) {
    const variants = tokenVariants(token)
    if (variants.includes(name)) score += 100
    else if (hasToken(name, token)) score += 55
  }

  if (score === 0) score = fuzzyTextScore(query, name)
  return Math.min(score, 140)
}

function categoryQueryScore(query: string, category: LightspeedCategory): number {
  return Math.max(
    fuzzyTextScore(query, category.name),
    fuzzyTextScore(query, category.fullPathName),
  )
}

function inventoryScore(
  query: string,
  item: LightspeedItem,
  categoryMap: Map<string, LightspeedCategory>,
  manufacturerMap: Map<string, string>,
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  const skuFields = [
    ['system SKU', item.systemSku],
    ['custom SKU', item.customSku],
    ['UPC', item.upc],
    ['EAN', item.ean],
    ['manufacturer SKU', item.manufacturerSku],
  ] as const

  const normalizedQuery = normalizeText(query)
  for (const [label, value] of skuFields) {
    const normalizedValue = normalizeText(value)
    if (normalizedValue && normalizedValue === normalizedQuery) {
      score += 120
      reasons.push(`matched ${label}`)
    }
  }

  const manufacturerName = item.manufacturerID ? manufacturerMap.get(String(item.manufacturerID)) : null
  const manufacturerScore = brandScore(query, manufacturerName)
  if (manufacturerScore > 0) {
    score += manufacturerScore
    reasons.push('matched brand')
  }

  const descriptionScore = fuzzyTextScore(query, item.description)
  if (descriptionScore > 0) {
    score += descriptionScore
    reasons.push('matched item name')
  }

  const category = categoryMap.get(String(item.categoryID ?? ''))
  const categoryText = [category?.name, category?.fullPathName].filter(Boolean).join(' ')
  const categoryScore = fuzzyTextScore(query, categoryText)
  if (categoryScore > 0) {
    score += Math.round(categoryScore * 0.8)
    reasons.push('matched category')
  }

  const productText = [item.description, categoryText, item.itemType].filter(Boolean).join(' ')
  if (queryHasBikeIntent(query)) {
    if (textHasBikeIntent(productText)) {
      score += 15
      reasons.push('matched bike category')
    } else {
      score -= 80
    }
  }

  return { score: Math.max(0, score), reasons: Array.from(new Set(reasons)) }
}

function summarizeItemShops(itemShops: LightspeedItemShop[]) {
  const totalRow = itemShops.find(s => String(s.shopID) === '0')
  const shopRows = itemShops.filter(s => String(s.shopID) !== '0')
  const totalQoh = totalRow
    ? toNum(totalRow.qoh)
    : shopRows.reduce((sum, row) => sum + toNum(row.qoh), 0)
  const totalSellable = totalRow
    ? toNum(totalRow.sellable)
    : shopRows.reduce((sum, row) => sum + toNum(row.sellable), 0)

  return {
    total_qoh: totalQoh,
    total_sellable: totalSellable,
    shops: shopRows.map(row => ({
      shop_id: row.shopID,
      qoh: toNum(row.qoh),
      sellable: toNum(row.sellable),
    })),
  }
}

function lightspeedContainsFilter(term: string): string {
  const normalized = normalizeText(term).replace(/%/g, '').trim()
  return `~,%${normalized}%`
}

function lightspeedSaleLineItemFilter(itemIds: string[]): string | undefined {
  const ids = Array.from(new Set(itemIds.map(id => String(id).trim()).filter(Boolean)))
  if (ids.length === 0) return undefined
  if (ids.length === 1) return ids[0]
  return `IN,[${ids.join(',')}]`
}

function itemDescriptionSearchTerms(query: string): string[] {
  const tokens = meaningfulQueryTokens(query)
  const singularTokens = tokens.map(singularToken)
  const normalizedQuery = normalizeText(query)
  const singularPhrase = singularTokens.join(' ')
  const terms = [
    normalizedQuery,
    singularPhrase,
    ...tokens,
    ...singularTokens,
  ]

  return Array.from(new Set(
    terms
      .map(term => normalizeText(term))
      .filter(term => term.length >= 3),
  )).slice(0, 8)
}

async function resolveLightspeedSaleLineItems(
  userId: string,
  query: string,
  options?: { maxItems?: number; emit?: Emit },
) {
  const client = createLightspeedClient(userId)
  const searchTerms = itemDescriptionSearchTerms(query)
  const maxItems = options?.maxItems ?? 20
  emitProgress(options?.emit, 'lightspeed_sales', `Matching "${query}" to live Lightspeed item names...`)

  type ItemSearchResult = {
    term: string
    items: LightspeedItem[]
    pagesFetched: number
    hitPageLimit: boolean
    error?: string
  }

  const searchResults: ItemSearchResult[] = await Promise.all(
    searchTerms.map(async term => {
      try {
        const result = await client.getAllItemsCursor({
          archived: 'false',
          description: lightspeedContainsFilter(term),
        }, {
          maxPages: term.includes(' ') ? 2 : 1,
          limit: 100,
          onPage: progress => emitProgress(
            options?.emit,
            'lightspeed_sales',
            `Searching item names for "${term}" — ${plural(progress.totalCount, 'candidate')} found...`,
          ),
        })

        return {
          term,
          items: result.items,
          pagesFetched: result.pagesFetched,
          hitPageLimit: result.hitPageLimit,
        }
      } catch (error) {
        return {
          term,
          items: [],
          pagesFetched: 0,
          hitPageLimit: false,
          error: error instanceof Error ? error.message : 'Lightspeed item search failed',
        }
      }
    }),
  )

  const itemById = new Map<string, LightspeedItem>()
  for (const result of searchResults) {
    for (const item of result.items) {
      itemById.set(String(item.itemID), item)
    }
  }

  const scored = Array.from(itemById.values())
    .map(item => ({
      item,
      score: fuzzyTextScore(query, item.description),
    }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || String(a.item.description).localeCompare(String(b.item.description)))

  const topScore = scored[0]?.score ?? 0
  const strongThreshold = topScore >= 60
    ? Math.max(45, topScore - 15)
    : topScore >= 35
      ? topScore
      : Math.max(25, topScore)

  const matchedItems = topScore > 0
    ? scored.filter(row => row.score >= strongThreshold).slice(0, Math.min(Math.max(maxItems, 1), 40))
    : []

  if (matchedItems.length > 0) {
    const preview = matchedItems.slice(0, 3).map(row => row.item.description || `Item ${row.item.itemID}`).join(', ')
    emitProgress(options?.emit, 'lightspeed_sales', `Matched ${plural(matchedItems.length, 'Lightspeed item')}: ${preview}`)
  } else {
    emitProgress(options?.emit, 'lightspeed_sales', `No strong live Lightspeed item match found for "${query}".`)
  }

  return {
    query,
    search_terms: searchTerms,
    candidates_found: itemById.size,
    matched_items: matchedItems.map(row => ({
      item_id: String(row.item.itemID),
      name: row.item.description || `Item ${row.item.itemID}`,
      score: row.score,
      item_type: row.item.itemType || null,
      default_cost: itemDefaultCost(row.item),
      average_cost: itemAverageCost(row.item),
      effective_cost: itemEffectiveCost(row.item),
      retail_price: itemPrice(row.item),
      manufacturer_id: row.item.manufacturerID || null,
      category_id: row.item.categoryID || null,
    })),
    top_score: topScore,
    strong_threshold: strongThreshold,
    searches: searchResults.map(result => ({
      term: result.term,
      item_count: result.items.length,
      pages_fetched: result.pagesFetched,
      page_cap_reached: result.hitPageLimit,
      error: result.error ?? null,
    })),
    pages_fetched: searchResults.reduce((sum, result) => sum + result.pagesFetched, 0),
    page_cap_reached: searchResults.some(result => result.hitPageLimit),
  }
}

async function getLightspeedSalesForRange(args: {
  userId: string
  startDate: string
  endDate: string
  includeLines: boolean
  lineRelation?: LightspeedSaleLineRelation
  extraLoadRelations?: string[]
  customerID?: string
  saleLineItemIds?: string[]
  onPage?: (progress: LightspeedPageProgress) => void
  maxPages?: number
}) {
  const client = createLightspeedClient(args.userId)
  const lineRelation = args.lineRelation ?? (args.includeLines ? 'lines_with_items' : 'none')
  const saleLineItemFilter = lightspeedSaleLineItemFilter(args.saleLineItemIds ?? [])
  const loadRelations = new Set<string>(args.extraLoadRelations ?? [])
  if (lineRelation === 'lines_with_items') {
    loadRelations.add('SaleLines')
    loadRelations.add('SaleLines.Item')
  }
  if (lineRelation === 'lines') {
    loadRelations.add('SaleLines')
  }
  const { sales, pagesFetched, hitPageLimit } = await client.getAllSalesCursor({
    completed: 'true',
    archived: 'false',
    voided: 'false',
    completeTime: completeTimeFilter(args.startDate, args.endDate),
    ...(args.customerID ? { customerID: args.customerID } : {}),
    ...(loadRelations.size > 0 ? { load_relations: JSON.stringify(Array.from(loadRelations)) } : {}),
    ...(saleLineItemFilter ? { 'SaleLines.itemID': saleLineItemFilter } : {}),
  }, {
    maxPages: args.maxPages ?? (lineRelation === 'none' ? 220 : 120),
    limit: 100,
    onPage: args.onPage,
  })

  return { sales, pagesFetched, hitPageLimit }
}

async function getLightspeedSalesSummary(
  userId: string,
  args: { start_date: string; end_date: string; cost_method?: CostMethod; max_pages?: number },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  const costMethod = args.cost_method ?? 'avg'
  emitProgress(emit, 'lightspeed_sales', `Fetching completed Lightspeed sales from ${startDate} to ${endDate}...`)
  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines: false,
    maxPages: args.max_pages,
    onPage: progress => emitProgress(
      emit,
      'lightspeed_sales',
      `Fetched ${plural(progress.totalCount, 'completed sale')} from Lightspeed (${plural(progress.pagesFetched, 'page')})...`,
    ),
  })
  emitProgress(emit, 'lightspeed_sales', `Calculating totals for ${plural(sales.length, 'completed sale')}...`)

  const grossSales = sales.reduce((sum, sale) => sum + saleTotal(sale), 0)
  const subtotal = sales.reduce((sum, sale) => sum + toNum(sale.calcSubtotal), 0)
  const tax = sales.reduce((sum, sale) => sum + toNum(sale.calcTax1) + toNum(sale.calcTax2), 0)
  const discounts = sales.reduce((sum, sale) => sum + toNum(sale.calcDiscount), 0)
  const totalCost = sales.reduce((sum, sale) => sum + saleCost(sale, costMethod), 0)
  const profit = profitMetrics(subtotal, totalCost)

  return {
    source: 'live_lightspeed_api',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: costMethod,
    sale_count: sales.length,
    gross_sales: roundMoney(grossSales),
    net_sales: roundMoney(subtotal),
    subtotal: roundMoney(subtotal),
    tax: roundMoney(tax),
    discounts: roundMoney(discounts),
    total_cost: profit.total_cost,
    gross_profit: profit.gross_profit,
    gross_margin_percent: profit.margin_percent,
    average_sale_value: sales.length > 0 ? roundMoney(grossSales / sales.length) : 0,
    pages_fetched: pagesFetched,
    complete: !hitPageLimit,
    page_cap_reached: hitPageLimit,
  }
}

async function getLightspeedSalesList(
  userId: string,
  args: {
    start_date: string
    end_date: string
    limit?: number
    include_line_items?: boolean
    include_profit?: boolean
    cost_method?: CostMethod
    max_pages?: number
  },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  const dayCount = Math.max(
    1,
    Math.floor((isoDateToUtcDate(endDate).getTime() - isoDateToUtcDate(startDate).getTime()) / 86_400_000) + 1,
  )
  const includeLines = args.include_line_items ?? dayCount <= 31
  const includeProfit = args.include_profit ?? false
  const costMethod = args.cost_method ?? 'avg'
  const limit = Math.min(Math.max(args.limit ?? (includeLines ? 150 : 300), 1), 500)
  emitProgress(emit, 'lightspeed_sales', `Fetching sale transactions from ${startDate} to ${endDate}${includeLines ? ' with item summaries' : ''}${includeProfit ? ' and margin data' : ''}...`)

  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines: includeLines || includeProfit,
    maxPages: args.max_pages,
    onPage: progress => emitProgress(
      emit,
      'lightspeed_sales',
      `Fetched ${plural(progress.totalCount, 'sale transaction')} from Lightspeed (${plural(progress.pagesFetched, 'page')})...`,
    ),
  })
  emitProgress(emit, 'lightspeed_sales', `Sorting ${plural(sales.length, 'sale transaction')} by completion time...`)

  const sortedSales = [...sales].sort((a, b) => {
    const aTime = saleCompletedAt(a) ?? ''
    const bTime = saleCompletedAt(b) ?? ''
    return bTime.localeCompare(aTime)
  })

  const rows = sortedSales.slice(0, limit).map(sale => {
    const lines = saleLines(sale)
    const subtotal = toNum(sale.calcSubtotal)
    const tax = toNum(sale.calcTax1) + toNum(sale.calcTax2)
    const totalCost = includeProfit ? saleCost(sale, costMethod) : 0
    const profit = includeProfit ? profitMetrics(subtotal, totalCost) : null

    return {
      sale_id: sale.saleID,
      completed_at: formatStoreDateTime(saleCompletedAt(sale)),
      completed_at_utc: saleCompletedAt(sale),
      ticket_number: sale.ticketNumber || null,
      reference_number: sale.referenceNumber || null,
      items: includeLines ? saleItemsSummary(lines) : null,
      units: includeLines ? saleUnits(lines) : null,
      line_count: includeLines ? lines.length : null,
      subtotal: roundMoney(subtotal),
      tax: roundMoney(tax),
      discounts: roundMoney(toNum(sale.calcDiscount)),
      total: roundMoney(saleTotal(sale)),
      total_cost: profit?.total_cost ?? null,
      gross_profit: profit?.gross_profit ?? null,
      gross_margin_percent: profit?.margin_percent ?? null,
      shop_id: sale.shopID || null,
      register_id: sale.registerID || null,
      employee_id: sale.employeeID || null,
    }
  })

  const netSales = sales.reduce((sum, sale) => sum + toNum(sale.calcSubtotal), 0)
  const totalCost = sales.reduce((sum, sale) => sum + saleCost(sale, costMethod), 0)

  return {
    source: 'live_lightspeed_api',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    total_sales: sales.length,
    returned_count: rows.length,
    row_limit: limit,
    limited: sortedSales.length > rows.length,
    include_line_items: includeLines,
    include_profit: includeProfit,
    cost_method: costMethod,
    sales: rows,
    gross_sales: roundMoney(sales.reduce((sum, sale) => sum + saleTotal(sale), 0)),
    net_sales: roundMoney(netSales),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(netSales - totalCost),
    gross_margin_percent: netSales > 0 ? roundPercent(((netSales - totalCost) / netSales) * 100) : null,
    pages_fetched: pagesFetched,
    complete: !hitPageLimit,
    page_cap_reached: hitPageLimit,
  }
}

async function getLightspeedSalesTimeseries(
  userId: string,
  args: {
    start_date: string
    end_date: string
    bucket?: SalesBucket
    metric?: SalesTimeseriesMetric
    cost_method?: CostMethod
    max_pages?: number
  },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  const bucket = args.bucket ?? defaultSalesBucket(startDate, endDate)
  const metric = args.metric ?? 'gross_sales'
  const costMethod = args.cost_method ?? 'avg'
  const rangeStart = isoDateToUtcDate(startDate)
  const rangeEnd = isoDateToUtcDate(endDate)
  emitProgress(emit, 'lightspeed_sales', `Fetching sales for a ${bucket} ${salesMetricLabel(metric).toLowerCase()} chart...`)

  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines: false,
    maxPages: args.max_pages,
    onPage: progress => emitProgress(
      emit,
      'lightspeed_sales',
      `Fetched ${plural(progress.totalCount, 'completed sale')} for charting (${plural(progress.pagesFetched, 'page')})...`,
    ),
  })
  emitProgress(emit, 'lightspeed_sales', `Bucketing ${plural(sales.length, 'completed sale')} by ${bucket}...`)

  const bucketRows = new Map<string, {
    label: string
    bucket_start: string
    bucket_end: string
    sale_count: number
    gross_sales: number
    net_sales: number
    total_cost: number
  }>()

  for (
    let cursor = startOfSalesBucket(rangeStart, bucket);
    cursor.getTime() <= rangeEnd.getTime();
    cursor = nextSalesBucketStart(cursor, bucket)
  ) {
    const bucketStart = clampUtcDate(cursor, rangeStart, rangeEnd)
    const bucketEnd = clampUtcDate(endOfSalesBucket(cursor, bucket), rangeStart, rangeEnd)
    const key = isoDateFromUtcDate(cursor)
    bucketRows.set(key, {
      label: salesBucketLabel(cursor, bucket),
      bucket_start: isoDateFromUtcDate(bucketStart),
      bucket_end: isoDateFromUtcDate(bucketEnd),
      sale_count: 0,
      gross_sales: 0,
      net_sales: 0,
      total_cost: 0,
    })
  }

  for (const sale of sales) {
    const saleDateText = saleCompletedStoreDate(sale) ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDateText)) continue

    const saleDate = isoDateToUtcDate(saleDateText)
    const key = isoDateFromUtcDate(startOfSalesBucket(saleDate, bucket))
    const row = bucketRows.get(key)
    if (!row) continue

    row.sale_count += 1
    row.gross_sales += saleTotal(sale)
    row.net_sales += toNum(sale.calcSubtotal)
    row.total_cost += saleCost(sale, costMethod)
  }

  const buckets = Array.from(bucketRows.values()).map(row => ({
    ...row,
    gross_sales: roundMoney(row.gross_sales),
    net_sales: roundMoney(row.net_sales),
    total_cost: roundMoney(row.total_cost),
    gross_profit: roundMoney(row.net_sales - row.total_cost),
    gross_margin_percent: row.net_sales > 0 ? roundPercent(((row.net_sales - row.total_cost) / row.net_sales) * 100) : null,
    average_sale_value: row.sale_count > 0 ? roundMoney(row.gross_sales / row.sale_count) : 0,
  }))
  const netSales = sales.reduce((sum, sale) => sum + toNum(sale.calcSubtotal), 0)
  const totalCost = sales.reduce((sum, sale) => sum + saleCost(sale, costMethod), 0)

  return {
    source: 'live_lightspeed_api',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: costMethod,
    bucket,
    metric,
    metric_label: salesMetricLabel(metric),
    bucket_label: salesBucketLabelTitle(bucket),
    buckets,
    sale_count: sales.length,
    gross_sales: roundMoney(sales.reduce((sum, sale) => sum + saleTotal(sale), 0)),
    net_sales: roundMoney(netSales),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(netSales - totalCost),
    gross_margin_percent: netSales > 0 ? roundPercent(((netSales - totalCost) / netSales) * 100) : null,
    pages_fetched: pagesFetched,
    complete: !hitPageLimit,
    page_cap_reached: hitPageLimit,
  }
}

async function getLightspeedTopSoldProducts(
  userId: string,
  args: {
    start_date: string
    end_date: string
    limit?: number
    query?: string
    rank_by?: 'quantity' | 'revenue' | 'gross_profit' | 'margin_percent'
    include_manual_lines?: boolean
    cost_method?: CostMethod
    max_pages?: number
  },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  const costMethod = args.cost_method ?? 'avg'
  emitProgress(emit, 'lightspeed_sales', `Fetching sales with sale lines from ${startDate} to ${endDate}...`)
  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines: true,
    maxPages: args.max_pages,
    onPage: progress => emitProgress(
      emit,
      'lightspeed_sales',
      `Fetched ${plural(progress.totalCount, 'sale')} with sale lines (${plural(progress.pagesFetched, 'page')})...`,
    ),
  })
  emitProgress(emit, 'lightspeed_sales', `Aggregating sold items across ${plural(sales.length, 'sale')}...`)

  const byItem = new Map<string, {
    item_id: string
    name: string
    units_sold: number
    revenue: number
    total_cost: number
    gross_profit: number
    sale_line_count: number
    current_default_cost: number | null
    current_average_cost: number | null
  }>()
  let excludedManualLines = 0
  let matchedLineCount = 0

  for (const sale of sales) {
    for (const line of saleLines(sale)) {
      const itemId = line.itemID || line.Item?.itemID || 'unknown'
      if (!args.include_manual_lines && itemId === '0') {
        excludedManualLines++
        continue
      }

      const name = lineName(line)
      if (args.query && fuzzyTextScore(args.query, name) === 0) continue

      const qty = toNum(line.unitQuantity)
      if (qty <= 0) continue
      const revenue = lineRevenue(line)
      const totalCost = lineCost(line, costMethod)

      const prev = byItem.get(itemId) ?? {
        item_id: itemId,
        name,
        units_sold: 0,
        revenue: 0,
        total_cost: 0,
        gross_profit: 0,
        sale_line_count: 0,
        current_default_cost: itemDefaultCost(line.Item),
        current_average_cost: itemAverageCost(line.Item),
      }
      prev.units_sold += qty
      prev.revenue += revenue
      prev.total_cost += totalCost
      prev.gross_profit += revenue - totalCost
      prev.sale_line_count += 1
      prev.current_default_cost ??= itemDefaultCost(line.Item)
      prev.current_average_cost ??= itemAverageCost(line.Item)
      byItem.set(itemId, prev)
      matchedLineCount++
    }
  }

  const rankBy = args.rank_by ?? 'quantity'
  const top = Array.from(byItem.values())
    .map(row => ({
      ...row,
      units_sold: roundMoney(row.units_sold),
      revenue: roundMoney(row.revenue),
      average_unit_cost: row.units_sold > 0 ? roundMoney(row.total_cost / row.units_sold) : null,
      total_cost: roundMoney(row.total_cost),
      gross_profit: roundMoney(row.gross_profit),
      margin_percent: row.revenue > 0 ? roundPercent((row.gross_profit / row.revenue) * 100) : null,
    }))
    .sort((a, b) => (
      rankBy === 'revenue'
        ? b.revenue - a.revenue || b.units_sold - a.units_sold
        : rankBy === 'gross_profit'
          ? b.gross_profit - a.gross_profit || b.revenue - a.revenue
          : rankBy === 'margin_percent'
            ? (b.margin_percent ?? -Infinity) - (a.margin_percent ?? -Infinity) || b.gross_profit - a.gross_profit
            : b.units_sold - a.units_sold || b.revenue - a.revenue
    ))
    .slice(0, Math.min(Math.max(args.limit ?? 5, 1), 20))
  const netSales = Array.from(byItem.values()).reduce((sum, row) => sum + row.revenue, 0)
  const totalCost = Array.from(byItem.values()).reduce((sum, row) => sum + row.total_cost, 0)

  return {
    source: 'live_lightspeed_api',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: costMethod,
    rank_by: rankBy,
    query: args.query || null,
    sales_scanned: sales.length,
    matched_sale_lines: matchedLineCount,
    excluded_manual_lines: excludedManualLines,
    net_sales: roundMoney(netSales),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(netSales - totalCost),
    gross_margin_percent: netSales > 0 ? roundPercent(((netSales - totalCost) / netSales) * 100) : null,
    top_products: top,
    pages_fetched: pagesFetched,
    complete: !hitPageLimit,
    page_cap_reached: hitPageLimit,
  }
}

async function getLightspeedSoldProductTimeseries(
  userId: string,
  args: {
    start_date: string
    end_date: string
    query: string
    bucket?: SalesBucket
    metric?: SoldProductTimeseriesMetric
    include_manual_lines?: boolean
    cost_method?: CostMethod
    max_pages?: number
  },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  const query = args.query.trim()
  if (!query) throw new Error('query is required.')

  const bucket = args.bucket ?? defaultSalesBucket(startDate, endDate)
  const metric = args.metric ?? 'units_sold'
  const costMethod = args.cost_method ?? 'avg'
  const rangeStart = isoDateToUtcDate(startDate)
  const rangeEnd = isoDateToUtcDate(endDate)
  const itemLookup = await resolveLightspeedSaleLineItems(userId, query, { emit })
  const matchedItemIds = itemLookup.matched_items.map(item => item.item_id)
  const matchedItemIdSet = new Set(matchedItemIds)
  if (matchedItemIds.length > 0) {
    emitProgress(
      emit,
      'lightspeed_sales',
      `Fetching sales containing ${plural(matchedItemIds.length, 'matched item')} from ${startDate} to ${endDate}...`,
    )
  }

  const {
    sales,
    pagesFetched,
    hitPageLimit,
  } = matchedItemIds.length > 0
    ? await getLightspeedSalesForRange({
        userId,
        startDate,
        endDate,
        includeLines: true,
        lineRelation: 'lines',
        saleLineItemIds: matchedItemIds,
        maxPages: args.max_pages ?? 18,
        onPage: progress => emitProgress(
          emit,
          'lightspeed_sales',
          `Fetched ${plural(progress.totalCount, 'matching sale')} from Lightspeed (${plural(progress.pagesFetched, 'page')})...`,
        ),
      })
    : { sales: [], pagesFetched: 0, hitPageLimit: false }
  emitProgress(emit, 'lightspeed_sales', `Aggregating ${plural(sales.length, 'matching sale')} into ${bucket} buckets...`)

  const bucketRows = new Map<string, {
    label: string
    bucket_start: string
    bucket_end: string
    units_sold: number
    revenue: number
    total_cost: number
    gross_profit: number
    sale_line_count: number
  }>()

  for (
    let cursor = startOfSalesBucket(rangeStart, bucket);
    cursor.getTime() <= rangeEnd.getTime();
    cursor = nextSalesBucketStart(cursor, bucket)
  ) {
    const bucketStart = clampUtcDate(cursor, rangeStart, rangeEnd)
    const bucketEnd = clampUtcDate(endOfSalesBucket(cursor, bucket), rangeStart, rangeEnd)
    const key = isoDateFromUtcDate(cursor)
    bucketRows.set(key, {
      label: salesBucketLabel(cursor, bucket),
      bucket_start: isoDateFromUtcDate(bucketStart),
      bucket_end: isoDateFromUtcDate(bucketEnd),
      units_sold: 0,
      revenue: 0,
      total_cost: 0,
      gross_profit: 0,
      sale_line_count: 0,
    })
  }

  const matchedProducts = new Map<string, {
    item_id: string
    name: string
    units_sold: number
    revenue: number
    total_cost: number
    gross_profit: number
    sale_line_count: number
    current_default_cost: number | null
    current_average_cost: number | null
  }>()
  let excludedManualLines = 0
  let matchedLineCount = 0
  const itemNameById = new Map(itemLookup.matched_items.map(item => [item.item_id, item.name]))
  const itemCandidateById = new Map(itemLookup.matched_items.map(item => [item.item_id, item]))

  for (const sale of sales) {
    const saleDateText = saleCompletedStoreDate(sale) ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDateText)) continue

    const saleDate = isoDateToUtcDate(saleDateText)
    const bucketKey = isoDateFromUtcDate(startOfSalesBucket(saleDate, bucket))
    const bucketRow = bucketRows.get(bucketKey)
    if (!bucketRow) continue

    for (const line of saleLines(sale)) {
      const itemId = line.itemID || line.Item?.itemID || 'unknown'
      if (!matchedItemIdSet.has(String(itemId))) continue
      if (!args.include_manual_lines && itemId === '0') {
        excludedManualLines++
        continue
      }

      const name = itemNameById.get(String(itemId)) ?? lineName(line)

      const qty = toNum(line.unitQuantity)
      if (qty <= 0) continue

      const revenue = lineRevenue(line)
      const totalCost = lineCost(line, costMethod)
      bucketRow.units_sold += qty
      bucketRow.revenue += revenue
      bucketRow.total_cost += totalCost
      bucketRow.gross_profit += revenue - totalCost
      bucketRow.sale_line_count += 1
      matchedLineCount++

      const itemCandidate = itemCandidateById.get(String(itemId))
      const prev = matchedProducts.get(itemId) ?? {
        item_id: itemId,
        name,
        units_sold: 0,
        revenue: 0,
        total_cost: 0,
        gross_profit: 0,
        sale_line_count: 0,
        current_default_cost: itemCandidate?.default_cost ?? null,
        current_average_cost: itemCandidate?.average_cost ?? null,
      }
      prev.units_sold += qty
      prev.revenue += revenue
      prev.total_cost += totalCost
      prev.gross_profit += revenue - totalCost
      prev.sale_line_count += 1
      matchedProducts.set(itemId, prev)
    }
  }

  const buckets = Array.from(bucketRows.values()).map(row => ({
    ...row,
    units_sold: roundMoney(row.units_sold),
    revenue: roundMoney(row.revenue),
    total_cost: roundMoney(row.total_cost),
    gross_profit: roundMoney(row.gross_profit),
    margin_percent: row.revenue > 0 ? roundPercent((row.gross_profit / row.revenue) * 100) : null,
    average_unit_cost: row.units_sold > 0 ? roundMoney(row.total_cost / row.units_sold) : null,
  }))
  emitProgress(emit, 'lightspeed_sales', `Preparing ${soldProductMetricLabel(metric).toLowerCase()} chart and table for "${query}"...`)
  const totals = buckets.reduce((sum, row) => ({
    units_sold: sum.units_sold + row.units_sold,
    revenue: sum.revenue + row.revenue,
    total_cost: sum.total_cost + row.total_cost,
    gross_profit: sum.gross_profit + row.gross_profit,
    sale_line_count: sum.sale_line_count + row.sale_line_count,
  }), { units_sold: 0, revenue: 0, total_cost: 0, gross_profit: 0, sale_line_count: 0 })

  return {
    source: 'live_lightspeed_api',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: costMethod,
    query,
    bucket,
    bucket_label: salesBucketLabelTitle(bucket),
    metric,
    metric_label: soldProductMetricLabel(metric),
    buckets,
    totals: {
      units_sold: roundMoney(totals.units_sold),
      revenue: roundMoney(totals.revenue),
      total_cost: roundMoney(totals.total_cost),
      gross_profit: roundMoney(totals.gross_profit),
      margin_percent: totals.revenue > 0 ? roundPercent((totals.gross_profit / totals.revenue) * 100) : null,
      average_unit_cost: totals.units_sold > 0 ? roundMoney(totals.total_cost / totals.units_sold) : null,
      sale_line_count: totals.sale_line_count,
    },
    matched_products: Array.from(matchedProducts.values())
      .map(row => ({
        ...row,
        units_sold: roundMoney(row.units_sold),
        revenue: roundMoney(row.revenue),
        total_cost: roundMoney(row.total_cost),
        gross_profit: roundMoney(row.gross_profit),
        margin_percent: row.revenue > 0 ? roundPercent((row.gross_profit / row.revenue) * 100) : null,
        average_unit_cost: row.units_sold > 0 ? roundMoney(row.total_cost / row.units_sold) : null,
      }))
      .sort((a, b) => b.units_sold - a.units_sold || b.revenue - a.revenue)
      .slice(0, 12),
    matched_item_candidates: itemLookup.matched_items,
    item_lookup: {
      search_terms: itemLookup.search_terms,
      candidates_found: itemLookup.candidates_found,
      top_score: itemLookup.top_score,
      strong_threshold: itemLookup.strong_threshold,
      searches: itemLookup.searches,
      pages_fetched: itemLookup.pages_fetched,
      page_cap_reached: itemLookup.page_cap_reached,
    },
    sales_scanned: sales.length,
    matched_sale_lines: matchedLineCount,
    excluded_manual_lines: excludedManualLines,
    pages_fetched: pagesFetched,
    sale_pages_fetched: pagesFetched,
    complete: !hitPageLimit && !itemLookup.page_cap_reached,
    page_cap_reached: hitPageLimit || itemLookup.page_cap_reached,
  }
}

async function searchLightspeedInventory(
  userId: string,
  args: { query: string; limit?: number; max_item_pages?: number },
  emit?: Emit,
) {
  const query = String(args.query || '').trim()
  if (!query) return { error: 'A product, category, SKU, or UPC search query is required.' }

  const client = createLightspeedClient(userId)
  const meaningfulTokens = meaningfulQueryTokens(query)
  const manufacturerSearchTokens = meaningfulTokens.slice(0, 4)
  emitProgress(emit, 'lightspeed_inventory', `Resolving Lightspeed brands, categories, and shops for "${query}"...`)
  const [categories, manufacturerResults, shops] = await Promise.all([
    client.getAllCategories({ archived: 'false' }),
    Promise.all(
      manufacturerSearchTokens.map(token =>
        client.getAllManufacturers({ name: lightspeedContainsFilter(token) }).catch(() => []),
      ),
    ),
    client.getShops({ archived: 'false' }).catch(() => []),
  ])
  const manufacturerById = new Map<string, { manufacturerID: string; name: string }>()
  for (const manufacturer of manufacturerResults.flat()) {
    manufacturerById.set(String(manufacturer.manufacturerID), manufacturer)
  }
  const manufacturers = Array.from(manufacturerById.values())

  const categoryMap = new Map(categories.map(cat => [String(cat.categoryID), cat]))
  const manufacturerMap = new Map(manufacturers.map(m => [String(m.manufacturerID), m.name]))
  const shopNameMap = new Map(shops.map(shop => [String(shop.shopID), shop.name]))
  const effectiveMaxItemPages = Math.min(Math.max(args.max_item_pages ?? 120, 80), 120)

  const matchedManufacturers = manufacturers
    .map(manufacturer => ({
      ...manufacturer,
      score: brandScore(query, manufacturer.name),
    }))
    .filter(manufacturer => manufacturer.score >= 60)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 8)

  const matchedCategories = categories
    .map(category => ({
      ...category,
      score: categoryQueryScore(query, category),
    }))
    .filter(category => category.score >= 30)
    .sort((a, b) => b.score - a.score || (a.fullPathName || a.name).localeCompare(b.fullPathName || b.name))
    .slice(0, 8)
  emitProgress(
    emit,
    'lightspeed_inventory',
    `Matched ${plural(matchedManufacturers.length, 'brand')} and ${plural(matchedCategories.length, 'category')} for "${query}"...`,
  )

  type ItemFetchResult = {
    label: string
    items: LightspeedItem[]
    pagesFetched: number
    hitPageLimit: boolean
    error?: string
  }

  const fetchFocusedItems = async (
    label: string,
    params: Record<string, string | number | undefined>,
    maxPages = 80,
  ): Promise<ItemFetchResult> => {
    try {
      emitProgress(emit, 'lightspeed_inventory', `Searching live Lightspeed items by ${label}...`)
      const result = await client.getAllItemsCursor({ archived: 'false', ...params }, {
        maxPages: Math.min(Math.max(maxPages, 1), 120),
        limit: 100,
        onPage: progress => emitProgress(
          emit,
          'lightspeed_inventory',
          `Found ${plural(progress.totalCount, 'item candidate')} by ${label} (${plural(progress.pagesFetched, 'page')})...`,
        ),
      })
      return {
        label,
        items: result.items,
        pagesFetched: result.pagesFetched,
        hitPageLimit: result.hitPageLimit,
      }
    } catch (error) {
      return {
        label,
        items: [],
        pagesFetched: 0,
        hitPageLimit: false,
        error: error instanceof Error ? error.message : 'Focused Lightspeed item search failed',
      }
    }
  }

  const brandFetches = await Promise.all(
    matchedManufacturers.map(manufacturer =>
      fetchFocusedItems(`brand:${manufacturer.name}`, { manufacturerID: manufacturer.manufacturerID }, 120),
    ),
  )
  const brandItemCount = brandFetches.reduce((sum, fetchResult) => sum + fetchResult.items.length, 0)
  const fallbackFocusedFetches = brandItemCount > 0
    ? []
    : await Promise.all([
        ...matchedCategories.map(category =>
          fetchFocusedItems(`category:${category.fullPathName || category.name}`, { categoryID: category.categoryID }, 80),
        ),
        ...meaningfulTokens.slice(0, 4).map(token =>
          fetchFocusedItems(`description:${token}`, { description: lightspeedContainsFilter(token) }, 50),
        ),
      ])
  const focusedFetches = [...brandFetches, ...fallbackFocusedFetches]

  const itemById = new Map<string, LightspeedItem>()
  for (const fetchResult of focusedFetches) {
    for (const item of fetchResult.items) {
      itemById.set(String(item.itemID), item)
    }
  }

  let fallbackItemResult: { items: LightspeedItem[]; pagesFetched: number; hitPageLimit: boolean } | null = null
  if (itemById.size === 0) {
    emitProgress(emit, 'lightspeed_inventory', `Focused search found no items; scanning live Lightspeed inventory for "${query}"...`)
    fallbackItemResult = await client.getAllItemsCursor({ archived: 'false' }, {
      maxPages: effectiveMaxItemPages,
      limit: 100,
      onPage: progress => emitProgress(
        emit,
        'lightspeed_inventory',
        `Scanned ${plural(progress.totalCount, 'live item')} from Lightspeed (${plural(progress.pagesFetched, 'page')})...`,
      ),
    })
    for (const item of fallbackItemResult.items) {
      itemById.set(String(item.itemID), item)
    }
  }

  const itemResult = {
    items: Array.from(itemById.values()),
    pagesFetched: focusedFetches.reduce((sum, fetchResult) => sum + fetchResult.pagesFetched, 0) + (fallbackItemResult?.pagesFetched ?? 0),
    hitPageLimit: focusedFetches.some(fetchResult => fetchResult.hitPageLimit) || Boolean(fallbackItemResult?.hitPageLimit),
  }

  const scored = itemResult.items
    .map(item => {
      const match = inventoryScore(query, item, categoryMap, manufacturerMap)
      return { item, ...match }
    })
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.item.description || '').localeCompare(b.item.description || ''))
  emitProgress(emit, 'lightspeed_inventory', `Scored ${plural(itemResult.items.length, 'item candidate')} against "${query}"...`)

  if (scored.length === 0) {
    return {
      source: 'live_lightspeed_api',
      query,
      matches: [],
      items_scanned: itemResult.items.length,
      pages_fetched: itemResult.pagesFetched,
      focused_searches: focusedFetches.map(fetchResult => ({
        label: fetchResult.label,
        item_count: fetchResult.items.length,
        pages_fetched: fetchResult.pagesFetched,
        page_cap_reached: fetchResult.hitPageLimit,
        error: fetchResult.error ?? null,
      })),
      matched_brands: matchedManufacturers.map(manufacturer => ({
        manufacturer_id: manufacturer.manufacturerID,
        name: manufacturer.name,
        score: manufacturer.score,
      })),
      matched_categories: matchedCategories.map(category => ({
        category_id: category.categoryID,
        name: category.fullPathName || category.name,
        score: category.score,
      })),
      complete: !itemResult.hitPageLimit,
      page_cap_reached: itemResult.hitPageLimit,
      message: `No live Lightspeed items matched "${query}".`,
    }
  }

  const topScore = scored[0]?.score ?? 0
  const strongThreshold = Math.max(35, topScore >= 80 ? topScore - 20 : topScore - 10)
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50)
  const stockLookupLimit = 100
  const rowsForStock = new Map<string, typeof scored[number]>()
  for (const row of scored.filter(candidate => candidate.score >= strongThreshold).slice(0, stockLookupLimit)) {
    rowsForStock.set(String(row.item.itemID), row)
  }
  for (const row of scored.slice(0, limit)) {
    rowsForStock.set(String(row.item.itemID), row)
  }
  const selected = Array.from(rowsForStock.values())
  emitProgress(emit, 'lightspeed_inventory', `Fetching stock rows for ${plural(selected.length, 'matched item')}...`)
  const stockResult = await client.getAllItemShopsForItemIdsCursor(
    selected.map(candidate => candidate.item.itemID),
    {
      batchSize: 50,
      maxPagesPerBatch: 5,
      limit: 100,
      onPage: progress => emitProgress(
        emit,
        'lightspeed_inventory',
        `Fetched ${plural(progress.totalCount, 'stock row')} (${plural(progress.pagesFetched, 'stock page')}, batch ${progress.batchIndex}/${progress.batchCount})...`,
      ),
    },
  )
  const stockByItemId = new Map<string, LightspeedItemShop[]>()
  for (const itemShop of stockResult.itemShops) {
    const itemId = String(itemShop.itemID)
    const rows = stockByItemId.get(itemId) ?? []
    rows.push(itemShop)
    stockByItemId.set(itemId, rows)
  }

  const matches = []
  for (const candidate of selected) {
    const itemStockRows = stockByItemId.get(String(candidate.item.itemID)) ?? []
    const stockSummary = summarizeItemShops(itemStockRows)
    const category = categoryMap.get(String(candidate.item.categoryID ?? ''))
    const price = itemPrice(candidate.item)
    const defaultCost = itemDefaultCost(candidate.item)
    const averageCost = itemAverageCost(candidate.item)
    const effectiveCost = itemEffectiveCost(candidate.item)
    const retailProfit = effectiveCost != null ? price - effectiveCost : null

    matches.push({
      item_id: candidate.item.itemID,
      name: candidate.item.description,
      system_sku: candidate.item.systemSku || null,
      custom_sku: candidate.item.customSku || null,
      upc: candidate.item.upc || null,
      manufacturer_id: candidate.item.manufacturerID || null,
      manufacturer: candidate.item.manufacturerID ? (manufacturerMap.get(String(candidate.item.manufacturerID)) ?? null) : null,
      category_id: candidate.item.categoryID || null,
      category: category?.fullPathName || category?.name || null,
      price,
      default_cost: defaultCost,
      average_cost: averageCost,
      effective_cost: effectiveCost,
      retail_gross_profit: retailProfit != null ? roundMoney(retailProfit) : null,
      retail_margin_percent: effectiveCost != null && price > 0 ? roundPercent((retailProfit ?? 0) / price * 100) : null,
      score: candidate.score,
      confidence: candidate.score >= strongThreshold ? 'strong' : 'possible',
      match_reasons: candidate.reasons,
      total_qoh: stockSummary.total_qoh,
      total_sellable: stockSummary.total_sellable,
      shops: stockSummary.shops.map(row => ({
        ...row,
        shop_name: shopNameMap.get(String(row.shop_id)) ?? null,
      })),
      stock_pages_fetched: stockResult.pagesFetched,
      stock_page_cap_reached: stockResult.hitPageLimit,
    })
  }

  const strongMatches = matches.filter(match => match.confidence === 'strong')
  const focusedSearches = focusedFetches.map(fetchResult => ({
    label: fetchResult.label,
    item_count: fetchResult.items.length,
    pages_fetched: fetchResult.pagesFetched,
    page_cap_reached: fetchResult.hitPageLimit,
    error: fetchResult.error ?? null,
  }))

  return {
    source: 'live_lightspeed_api',
    query,
    matches,
    matched_brands: matchedManufacturers.map(manufacturer => ({
      manufacturer_id: manufacturer.manufacturerID,
      name: manufacturer.name,
      score: manufacturer.score,
    })),
    matched_categories: matchedCategories.map(category => ({
      category_id: category.categoryID,
      name: category.fullPathName || category.name,
      score: category.score,
    })),
    strong_match_count: strongMatches.length,
    strong_matches_total_qoh: strongMatches.reduce((sum, match) => sum + match.total_qoh, 0),
    strong_matches_total_sellable: strongMatches.reduce((sum, match) => sum + match.total_sellable, 0),
    stock_lookup_count: matches.length,
    stock_lookup_limit: stockLookupLimit,
    stock_batches_fetched: stockResult.batchesFetched,
    stock_pages_fetched: stockResult.pagesFetched,
    strong_match_count_may_be_capped: scored.filter(candidate => candidate.score >= strongThreshold).length > stockLookupLimit,
    items_scanned: itemResult.items.length,
    item_pages_fetched: itemResult.pagesFetched,
    focused_searches: focusedSearches,
    used_full_inventory_fallback: Boolean(fallbackItemResult),
    complete: !itemResult.hitPageLimit,
    page_cap_reached: itemResult.hitPageLimit,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord)
  return isRecord(value) ? [value] : []
}

function customerContact(customer: LightspeedCustomer): Record<string, unknown> | null {
  return isRecord(customer.Contact) ? customer.Contact : null
}

function customerNestedRows(customer: LightspeedCustomer, relation: string, rowName: string): Array<Record<string, unknown>> {
  const contact = customerContact(customer)
  const container = isRecord(contact?.[relation]) ? contact[relation] as Record<string, unknown> : null
  return container ? recordArray(container[rowName]) : []
}

function stringField(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key].trim() : ''
}

function boolLike(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1'
}

function customerName(customer: LightspeedCustomer): string {
  const name = [customer.firstName, customer.lastName].map(part => String(part ?? '').trim()).filter(Boolean).join(' ')
  return name || String(customer.company ?? '').trim() || `Customer ${customer.customerID}`
}

function customerPhones(customer: LightspeedCustomer): Array<{ number: string; use_type: string | null }> {
  return customerNestedRows(customer, 'Phones', 'ContactPhone')
    .map(row => ({
      number: stringField(row, 'number'),
      use_type: stringField(row, 'useType') || null,
    }))
    .filter(row => row.number)
}

function customerEmails(customer: LightspeedCustomer): Array<{ address: string; use_type: string | null }> {
  return customerNestedRows(customer, 'Emails', 'ContactEmail')
    .map(row => ({
      address: stringField(row, 'address'),
      use_type: stringField(row, 'useType') || null,
    }))
    .filter(row => row.address)
}

function customerAddresses(customer: LightspeedCustomer): Array<{
  address1: string
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}> {
  return customerNestedRows(customer, 'Addresses', 'ContactAddress')
    .map(row => ({
      address1: stringField(row, 'address1'),
      city: stringField(row, 'city') || null,
      state: stringField(row, 'state') || null,
      zip: stringField(row, 'zip') || null,
      country: stringField(row, 'country') || null,
    }))
    .filter(row => row.address1 || row.city || row.zip)
}

function customerOptOuts(customer: LightspeedCustomer): { no_email: boolean; no_phone: boolean; no_mail: boolean } {
  const contact = customerContact(customer)
  return {
    no_email: boolLike(contact?.noEmail),
    no_phone: boolLike(contact?.noPhone),
    no_mail: boolLike(contact?.noMail),
  }
}

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, '')
}

function customerSearchText(customer: LightspeedCustomer): string {
  return [
    customer.customerID,
    customer.firstName,
    customer.lastName,
    customer.company,
    customer.title,
    ...customerPhones(customer).map(phone => phone.number),
    ...customerEmails(customer).map(email => email.address),
    ...customerAddresses(customer).flatMap(address => [address.address1, address.city, address.state, address.zip, address.country]),
  ].filter(Boolean).join(' ')
}

function customerMatchScore(query: string, customer: LightspeedCustomer): { score: number; reasons: string[] } {
  const q = normalizeText(query)
  const reasons: string[] = []
  let score = 0

  if (!q) return { score: 1, reasons: ['unfiltered'] }

  if (String(customer.customerID) === query.trim()) {
    score += 180
    reasons.push('matched customer ID')
  }

  const fullName = customerName(customer)
  const nameScore = fuzzyTextScore(query, fullName)
  if (nameScore > 0) {
    score += nameScore
    reasons.push('matched name')
  }

  const companyScore = fuzzyTextScore(query, customer.company)
  if (companyScore > 0) {
    score += Math.round(companyScore * 0.9)
    reasons.push('matched company')
  }

  const queryEmail = query.trim().toLowerCase()
  for (const email of customerEmails(customer)) {
    const address = email.address.toLowerCase()
    if (address === queryEmail) {
      score += 170
      reasons.push('matched email')
    } else if (queryEmail.includes('@') && address.includes(queryEmail)) {
      score += 110
      reasons.push('matched partial email')
    } else {
      const emailScore = fuzzyTextScore(query, address)
      if (emailScore > 0) {
        score += Math.round(emailScore * 0.6)
        reasons.push('matched email')
      }
    }
  }

  const qDigits = phoneDigits(query)
  if (qDigits.length >= 3) {
    for (const phone of customerPhones(customer)) {
      const digits = phoneDigits(phone.number)
      if (!digits) continue
      if (digits === qDigits) {
        score += 170
        reasons.push('matched phone')
      } else if (digits.endsWith(qDigits) || qDigits.endsWith(digits)) {
        score += qDigits.length >= 7 ? 140 : 90
        reasons.push('matched phone ending')
      } else if (digits.includes(qDigits)) {
        score += 80
        reasons.push('matched phone digits')
      }
    }
  }

  const addressScore = Math.max(
    ...customerAddresses(customer).map(address =>
      fuzzyTextScore(query, [address.address1, address.city, address.state, address.zip, address.country].filter(Boolean).join(' ')),
    ),
    0,
  )
  if (addressScore > 0) {
    score += Math.round(addressScore * 0.5)
    reasons.push('matched address')
  }

  if (score === 0 && fuzzyTextScore(query, customerSearchText(customer)) > 0) {
    score += fuzzyTextScore(query, customerSearchText(customer))
    reasons.push('matched customer profile')
  }

  return { score, reasons: Array.from(new Set(reasons)) }
}

function customerRow(customer: LightspeedCustomer, extra?: Record<string, string | number | boolean | null>) {
  const optOuts = customerOptOuts(customer)
  return {
    customer_id: customer.customerID,
    name: customerName(customer),
    company: customer.company || null,
    phones: customerPhones(customer),
    emails: customerEmails(customer),
    addresses: customerAddresses(customer),
    no_email: optOuts.no_email,
    no_phone: optOuts.no_phone,
    no_mail: optOuts.no_mail,
    created_at: formatStoreDateTime(customer.createTime) ?? customer.createTime ?? null,
    updated_at: formatStoreDateTime(customer.timeStamp) ?? customer.timeStamp ?? null,
    archived: String(customer.archived) === 'true',
    ...extra,
  }
}

type LightspeedCustomerRow = ReturnType<typeof customerRow>
type LightspeedCustomerMatch = LightspeedCustomerRow & {
  score?: number
  confidence?: string
  match_reasons?: string[]
}

async function getLightspeedCustomerProfile(
  userId: string,
  args: { customer_id: string },
  emit?: Emit,
) {
  const customerId = String(args.customer_id || '').trim()
  if (!customerId) return { error: 'customer_id is required.' }

  emitProgress(emit, 'lightspeed_customers', `Fetching Lightspeed customer ${customerId} with contact details...`)
  const client = createLightspeedClient(userId)
  const customer = await client.getCustomer(customerId, { load_relations: '["Contact"]' })

  return {
    source: 'live_lightspeed_api',
    customer: customerRow(customer),
  }
}

async function searchLightspeedCustomers(
  userId: string,
  args: {
    query?: string
    limit?: number
    include_archived?: boolean
    created_start_date?: string
    created_end_date?: string
    max_pages?: number
  },
  emit?: Emit,
) {
  const query = String(args.query ?? '').trim()
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)
  const maxPages = Math.min(Math.max(args.max_pages ?? 50, 1), 120)
  const client = createLightspeedClient(userId)
  const createdStart = args.created_start_date ? assertIsoDate(args.created_start_date, 'created_start_date') : null
  const createdEnd = args.created_end_date ? assertIsoDate(args.created_end_date, 'created_end_date') : null

  const baseParams: Record<string, string | number | undefined> = {
    load_relations: '["Contact"]',
    ...(args.include_archived ? { archive: 1 } : { archived: 'false' }),
    ...(createdStart || createdEnd
      ? {
          createTime: completeTimeFilter(createdStart ?? '1900-01-01', createdEnd ?? getStoreToday()),
        }
      : {}),
  }

  emitProgress(
    emit,
    'lightspeed_customers',
    query ? `Searching live Lightspeed customers for "${query}"...` : 'Fetching live Lightspeed customers...',
  )

  type CustomerFetch = {
    label: string
    customers: LightspeedCustomer[]
    pagesFetched: number
    hitPageLimit: boolean
    error?: string
  }

  const fetchCustomers = async (
    label: string,
    params: Record<string, string | number | undefined>,
    pages = maxPages,
  ): Promise<CustomerFetch> => {
    try {
      const result = await client.getAllCustomersCursor({ ...baseParams, ...params }, {
        maxPages: pages,
        limit: 100,
        onPage: progress => emitProgress(
          emit,
          'lightspeed_customers',
          `Fetched ${plural(progress.totalCount, 'customer')} from Lightspeed (${plural(progress.pagesFetched, 'page')})...`,
        ),
      })
      return {
        label,
        customers: result.customers,
        pagesFetched: result.pagesFetched,
        hitPageLimit: result.hitPageLimit,
      }
    } catch (error) {
      return {
        label,
        customers: [],
        pagesFetched: 0,
        hitPageLimit: false,
        error: error instanceof Error ? error.message : 'Lightspeed customer search failed',
      }
    }
  }

  const customerById = new Map<string, LightspeedCustomer>()
  const fetches: CustomerFetch[] = []

  if (/^\d+$/.test(query)) {
    try {
      const profile = await client.getCustomer(query, { load_relations: '["Contact"]' })
      customerById.set(String(profile.customerID), profile)
      fetches.push({ label: 'customer_id', customers: [profile], pagesFetched: 1, hitPageLimit: false })
    } catch {
      // Fall through to broader search.
    }
  }

  const terms = query
    ? Array.from(new Set([normalizeText(query), ...queryTokens(query)].filter(term => term.length >= 2))).slice(0, 6)
    : []

  const focusedFetches = query
    ? await Promise.all(terms.flatMap(term => ([
        fetchCustomers(`firstName:${term}`, { firstName: lightspeedContainsFilter(term) }, 2),
        fetchCustomers(`lastName:${term}`, { lastName: lightspeedContainsFilter(term) }, 2),
        fetchCustomers(`company:${term}`, { company: lightspeedContainsFilter(term) }, 2),
      ])))
    : []
  fetches.push(...focusedFetches)

  for (const fetchResult of fetches) {
    for (const customer of fetchResult.customers) {
      customerById.set(String(customer.customerID), customer)
    }
  }

  const needsContactFallback = Boolean(query) && (
    customerById.size === 0 ||
    query.includes('@') ||
    phoneDigits(query).length >= 3
  )
  if (!query || needsContactFallback) {
    emitProgress(
      emit,
      'lightspeed_customers',
      query ? `Scanning customer contact details for "${query}"...` : 'Scanning customer records...',
    )
    const fallback = await fetchCustomers('contact_scan', {}, maxPages)
    fetches.push(fallback)
    for (const customer of fallback.customers) {
      customerById.set(String(customer.customerID), customer)
    }
  }

  const scored = Array.from(customerById.values())
    .map(customer => {
      const match = customerMatchScore(query, customer)
      return { customer, ...match }
    })
    .filter(row => !query || row.score > 0)
    .sort((a, b) => b.score - a.score || customerName(a.customer).localeCompare(customerName(b.customer)))

  const matches = scored.slice(0, limit).map(row => ({
    ...customerRow(row.customer, {
      score: row.score,
      confidence: row.score >= Math.max(45, (scored[0]?.score ?? 0) - 20) ? 'strong' : 'possible',
    }),
    match_reasons: row.reasons,
  }))

  return {
    source: 'live_lightspeed_api',
    query: query || null,
    include_archived: Boolean(args.include_archived),
    created_range: createdStart || createdEnd ? { start_date: createdStart, end_date: createdEnd, timezone: STORE_TIME_ZONE } : null,
    returned_count: matches.length,
    candidate_count: scored.length,
    matches,
    focused_searches: fetches.map(fetchResult => ({
      label: fetchResult.label,
      customer_count: fetchResult.customers.length,
      pages_fetched: fetchResult.pagesFetched,
      page_cap_reached: fetchResult.hitPageLimit,
      error: fetchResult.error ?? null,
    })),
    pages_fetched: fetches.reduce((sum, fetchResult) => sum + fetchResult.pagesFetched, 0),
    complete: !fetches.some(fetchResult => fetchResult.hitPageLimit),
    page_cap_reached: fetches.some(fetchResult => fetchResult.hitPageLimit),
  }
}

async function resolveLightspeedCustomer(
  userId: string,
  args: { customer_id?: string; query?: string },
  emit?: Emit,
) {
  if (args.customer_id) {
    const profile = await getLightspeedCustomerProfile(userId, { customer_id: args.customer_id }, emit)
    if ('customer' in profile && profile.customer) {
      return {
        status: 'resolved' as const,
        customer_id: profile.customer.customer_id,
        customer: profile.customer,
        candidates: [profile.customer],
      }
    }
  }

  if (!String(args.query ?? '').trim()) {
    return { status: 'not_found' as const, candidates: [] }
  }

  const search = await searchLightspeedCustomers(userId, { query: args.query, limit: 5 }, emit)
  const candidates = (Array.isArray(search.matches) ? search.matches : []) as LightspeedCustomerMatch[]
  const first = candidates[0]
  const second = candidates[1]
  if (!first) {
    return { status: 'not_found' as const, candidates: [], search }
  }

  if (
    !args.customer_id &&
    second &&
    Number(first.score ?? 0) < 90 &&
    Number(second.score ?? 0) >= Number(first.score ?? 0) - 10
  ) {
    return { status: 'ambiguous' as const, candidates, search }
  }

  return {
    status: 'resolved' as const,
    customer_id: String(first.customer_id),
    customer: first,
    candidates,
    search,
  }
}

async function getLightspeedCustomerSales(
  userId: string,
  args: {
    start_date: string
    end_date: string
    customer_id?: string
    query?: string
    include_line_items?: boolean
    limit?: number
    max_pages?: number
  },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  const resolved = await resolveLightspeedCustomer(userId, { customer_id: args.customer_id, query: args.query }, emit)
  if (resolved.status !== 'resolved') {
    return {
      source: 'live_lightspeed_api',
      status: resolved.status,
      date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
      candidates: resolved.candidates,
      message: resolved.status === 'ambiguous'
        ? 'Multiple Lightspeed customers matched. Ask the user to choose a customer.'
        : 'No matching Lightspeed customer was found.',
    }
  }

  const includeLines = args.include_line_items ?? inclusiveDayCount(startDate, endDate) <= 180
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
  emitProgress(
    emit,
    'lightspeed_customers',
    `Fetching completed sales for ${resolved.customer.name} from ${startDate} to ${endDate}...`,
  )

  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines,
    customerID: resolved.customer_id,
    maxPages: args.max_pages ?? (includeLines ? 80 : 160),
    onPage: progress => emitProgress(
      emit,
      'lightspeed_customers',
      `Fetched ${plural(progress.totalCount, 'customer sale')} (${plural(progress.pagesFetched, 'page')})...`,
    ),
  })

  const sortedSales = [...sales].sort((a, b) => (saleCompletedAt(b) ?? '').localeCompare(saleCompletedAt(a) ?? ''))
  const rows = sortedSales.slice(0, limit).map(sale => {
    const lines = saleLines(sale)
    return {
      sale_id: sale.saleID,
      completed_at: formatStoreDateTime(saleCompletedAt(sale)),
      ticket_number: sale.ticketNumber || null,
      reference_number: sale.referenceNumber || null,
      items: includeLines ? saleItemsSummary(lines) : null,
      units: includeLines ? saleUnits(lines) : null,
      line_count: includeLines ? lines.length : null,
      subtotal: roundMoney(toNum(sale.calcSubtotal)),
      tax: roundMoney(toNum(sale.calcTax1) + toNum(sale.calcTax2)),
      discounts: roundMoney(toNum(sale.calcDiscount)),
      total: roundMoney(saleTotal(sale)),
    }
  })

  const grossSales = sales.reduce((sum, sale) => sum + saleTotal(sale), 0)
  const firstPurchase = sortedSales[sortedSales.length - 1]
  const lastPurchase = sortedSales[0]

  return {
    source: 'live_lightspeed_api',
    status: 'resolved',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    customer: resolved.customer,
    total_sales: sales.length,
    returned_count: rows.length,
    row_limit: limit,
    limited: sortedSales.length > rows.length,
    include_line_items: includeLines,
    gross_sales: roundMoney(grossSales),
    average_sale_value: sales.length > 0 ? roundMoney(grossSales / sales.length) : 0,
    first_purchase_at: firstPurchase ? formatStoreDateTime(saleCompletedAt(firstPurchase)) : null,
    last_purchase_at: lastPurchase ? formatStoreDateTime(saleCompletedAt(lastPurchase)) : null,
    sales: rows,
    pages_fetched: pagesFetched,
    complete: !hitPageLimit,
    page_cap_reached: hitPageLimit,
  }
}

async function getLightspeedTopCustomers(
  userId: string,
  args: {
    start_date: string
    end_date: string
    limit?: number
    rank_by?: 'gross_sales' | 'sale_count' | 'average_sale_value'
    include_contact_details?: boolean
    include_walk_in?: boolean
    max_pages?: number
  },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)
  const rankBy = args.rank_by ?? 'gross_sales'
  emitProgress(emit, 'lightspeed_customers', `Fetching sales with customer links from ${startDate} to ${endDate}...`)
  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines: false,
    extraLoadRelations: ['Customer'],
    maxPages: args.max_pages ?? 220,
    onPage: progress => emitProgress(
      emit,
      'lightspeed_customers',
      `Fetched ${plural(progress.totalCount, 'customer-linked sale')} (${plural(progress.pagesFetched, 'page')})...`,
    ),
  })

  emitProgress(emit, 'lightspeed_customers', `Aggregating ${plural(sales.length, 'sale')} by customer...`)

  const byCustomer = new Map<string, {
    customer_id: string
    customer?: LightspeedCustomer
    name: string
    gross_sales: number
    sale_count: number
    first_purchase_at: string | null
    last_purchase_at: string | null
  }>()
  let walkInSales = 0

  for (const sale of sales) {
    const customerId = String(sale.customerID || sale.Customer?.customerID || '').trim()
    if (!customerId || customerId === '0') {
      walkInSales++
      if (!args.include_walk_in) continue
    }
    const id = customerId || '0'
    const completedAt = saleCompletedAt(sale)
    const prev = byCustomer.get(id) ?? {
      customer_id: id,
      customer: sale.Customer,
      name: sale.Customer ? customerName(sale.Customer) : id === '0' ? 'Walk-in / no customer' : `Customer ${id}`,
      gross_sales: 0,
      sale_count: 0,
      first_purchase_at: null,
      last_purchase_at: null,
    }
    prev.customer = prev.customer ?? sale.Customer
    prev.gross_sales += saleTotal(sale)
    prev.sale_count += 1
    if (completedAt) {
      if (!prev.first_purchase_at || completedAt < prev.first_purchase_at) prev.first_purchase_at = completedAt
      if (!prev.last_purchase_at || completedAt > prev.last_purchase_at) prev.last_purchase_at = completedAt
    }
    byCustomer.set(id, prev)
  }

  const ranked = Array.from(byCustomer.values())
    .map(row => ({
      ...row,
      gross_sales: roundMoney(row.gross_sales),
      average_sale_value: row.sale_count > 0 ? roundMoney(row.gross_sales / row.sale_count) : 0,
    }))
    .sort((a, b) => (
      rankBy === 'sale_count'
        ? b.sale_count - a.sale_count || b.gross_sales - a.gross_sales
        : rankBy === 'average_sale_value'
          ? b.average_sale_value - a.average_sale_value || b.gross_sales - a.gross_sales
          : b.gross_sales - a.gross_sales || b.sale_count - a.sale_count
    ))
    .slice(0, limit)

  const client = createLightspeedClient(userId)
  const detailById = new Map<string, ReturnType<typeof customerRow>>()
  const detailIds = ranked
    .map(row => row.customer_id)
    .filter(id => id && id !== '0')
    .slice(0, args.include_contact_details ? limit : Math.min(limit, 12))

  await Promise.all(detailIds.map(async customerId => {
    try {
      const customer = await client.getCustomer(customerId, { load_relations: '["Contact"]' })
      detailById.set(customerId, customerRow(customer))
    } catch {
      // Keep aggregate row even if customer detail lookup fails.
    }
  }))

  const topCustomers = ranked.map((row, index) => {
    const details = detailById.get(row.customer_id)
    return {
      rank: index + 1,
      customer_id: row.customer_id,
      name: details?.name ?? row.name,
      company: details?.company ?? row.customer?.company ?? null,
      phones: args.include_contact_details ? details?.phones ?? [] : [],
      emails: args.include_contact_details ? details?.emails ?? [] : [],
      gross_sales: row.gross_sales,
      sale_count: row.sale_count,
      average_sale_value: row.average_sale_value,
      first_purchase_at: row.first_purchase_at ? formatStoreDateTime(row.first_purchase_at) : null,
      last_purchase_at: row.last_purchase_at ? formatStoreDateTime(row.last_purchase_at) : null,
    }
  })

  return {
    source: 'live_lightspeed_api',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    rank_by: rankBy,
    total_sales_scanned: sales.length,
    customer_count: byCustomer.size,
    walk_in_or_unassigned_sales: walkInSales,
    include_walk_in: Boolean(args.include_walk_in),
    include_contact_details: Boolean(args.include_contact_details),
    top_customers: topCustomers,
    gross_sales: roundMoney(sales.reduce((sum, sale) => sum + saleTotal(sale), 0)),
    pages_fetched: pagesFetched,
    complete: !hitPageLimit,
    page_cap_reached: hitPageLimit,
  }
}

type LightspeedSalesListResult = Awaited<ReturnType<typeof getLightspeedSalesList>>
type LightspeedSalesTimeseriesResult = Awaited<ReturnType<typeof getLightspeedSalesTimeseries>>
type LightspeedTopSoldProductsResult = Awaited<ReturnType<typeof getLightspeedTopSoldProducts>>
type LightspeedSoldProductTimeseriesResult = Awaited<ReturnType<typeof getLightspeedSoldProductTimeseries>>
type LightspeedInventorySearchResult = Awaited<ReturnType<typeof searchLightspeedInventory>>
type LightspeedCustomerSearchResult = Awaited<ReturnType<typeof searchLightspeedCustomers>>
type LightspeedCustomerSalesResult = Awaited<ReturnType<typeof getLightspeedCustomerSales>>
type LightspeedTopCustomersResult = Awaited<ReturnType<typeof getLightspeedTopCustomers>>

function emitVisuals(emit: Emit, prefs: VisualPrefs, visuals: { chart?: GenieChartPayload; table?: GenieTablePayload }) {
  if (prefs.chart && visuals.chart) emit({ event: 'chart', chart: visuals.chart })
  if (prefs.table && visuals.table) emit({ event: 'table', table: visuals.table })
}

function buildSalesListTable(result: LightspeedSalesListResult): GenieTablePayload | undefined {
  if (!result.sales.length) return undefined

  const subtitleParts = [
    `${result.date_range.start_date} to ${result.date_range.end_date}`,
    `${result.returned_count} of ${result.total_sales} sales`,
  ]
  if (result.limited) subtitleParts.push(`limited to ${result.row_limit} rows`)
  if (result.page_cap_reached) subtitleParts.push('page cap reached')

  return {
    title: 'Individual Sales',
    subtitle: subtitleParts.join(' · '),
    columns: [
      { key: 'completed_at', label: 'Completed' },
      { key: 'sale_id', label: 'Sale ID' },
      { key: 'ticket_number', label: 'Ticket' },
      ...(result.include_line_items
        ? [
            { key: 'items', label: 'Items' },
            { key: 'units', label: 'Units', align: 'right' as const, format: 'number' as const },
          ]
        : []),
      { key: 'subtotal', label: 'Subtotal', align: 'right', format: 'currency' },
      ...(result.include_profit
        ? [
            { key: 'total_cost', label: 'Cost', align: 'right' as const, format: 'currency' as const },
            { key: 'gross_profit', label: 'Gross Profit', align: 'right' as const, format: 'currency' as const },
            { key: 'gross_margin_percent', label: 'Margin', align: 'right' as const, format: 'percent' as const },
          ]
        : []),
      { key: 'tax', label: 'Tax', align: 'right', format: 'currency' },
      { key: 'discounts', label: 'Discount', align: 'right', format: 'currency' },
      { key: 'total', label: 'Total', align: 'right', format: 'currency' },
    ],
    rows: result.sales.map(sale => ({
      completed_at: sale.completed_at,
      sale_id: sale.sale_id,
      ticket_number: sale.ticket_number,
      items: sale.items,
      units: sale.units,
      subtotal: sale.subtotal,
      total_cost: sale.total_cost,
      gross_profit: sale.gross_profit,
      gross_margin_percent: sale.gross_margin_percent,
      tax: sale.tax,
      discounts: sale.discounts,
      total: sale.total,
    })),
  }
}

function buildSalesTimeseriesVisuals(result: LightspeedSalesTimeseriesResult, prefs?: VisualPrefs): {
  chart?: GenieChartPayload
  table?: GenieTablePayload
} {
  if (!result.buckets.length) return {}

  const metric = result.metric
  const metricFormat: VisualValueFormat =
    metric === 'sale_count'
      ? 'number'
      : metric === 'gross_margin_percent'
        ? 'percent'
        : 'currency'
  const metricLabel = result.metric_label
  const subtitle = `${result.date_range.start_date} to ${result.date_range.end_date} · ${result.bucket_label} buckets`

  return {
    chart: {
      kind: prefs?.line ? 'line' : 'bar',
      title: `${metricLabel} By ${result.bucket_label}`,
      subtitle,
      xKey: 'label',
      valueFormatter: metricFormat,
      series: [{ key: metric, label: metricLabel }],
      data: result.buckets.map(bucket => ({
        label: bucket.label,
        [metric]: metric === 'sale_count'
          ? bucket.sale_count
          : metric === 'average_sale_value'
            ? bucket.average_sale_value
            : metric === 'net_sales'
              ? bucket.net_sales
              : metric === 'total_cost'
                ? bucket.total_cost
                : metric === 'gross_profit'
                  ? bucket.gross_profit
                  : metric === 'gross_margin_percent'
                    ? bucket.gross_margin_percent
                    : bucket.gross_sales,
      })),
    },
    table: {
      title: `Sales By ${result.bucket_label}`,
      subtitle,
      columns: [
        { key: 'period', label: 'Period' },
        { key: 'gross_sales', label: 'Gross Sales', align: 'right', format: 'currency' },
        { key: 'net_sales', label: 'Net Sales', align: 'right', format: 'currency' },
        { key: 'total_cost', label: 'Cost', align: 'right', format: 'currency' },
        { key: 'gross_profit', label: 'Gross Profit', align: 'right', format: 'currency' },
        { key: 'gross_margin_percent', label: 'Margin', align: 'right', format: 'percent' },
        { key: 'sale_count', label: 'Sales', align: 'right', format: 'number' },
        { key: 'average_sale_value', label: 'Average Sale', align: 'right', format: 'currency' },
      ],
      rows: result.buckets.map(bucket => ({
        period: bucket.label,
        gross_sales: bucket.gross_sales,
        net_sales: bucket.net_sales,
        total_cost: bucket.total_cost,
        gross_profit: bucket.gross_profit,
        gross_margin_percent: bucket.gross_margin_percent,
        sale_count: bucket.sale_count,
        average_sale_value: bucket.average_sale_value,
      })),
    },
  }
}

function buildTopSoldVisuals(result: LightspeedTopSoldProductsResult): {
  chart?: GenieChartPayload
  table?: GenieTablePayload
} {
  const rows = result.top_products.slice(0, 12)
  if (!rows.length) return {}

  const valueKey =
    result.rank_by === 'revenue'
      ? 'revenue'
      : result.rank_by === 'gross_profit'
        ? 'gross_profit'
        : result.rank_by === 'margin_percent'
          ? 'margin_percent'
          : 'units_sold'
  const valueLabel =
    result.rank_by === 'revenue'
      ? 'Revenue'
      : result.rank_by === 'gross_profit'
        ? 'Gross Profit'
        : result.rank_by === 'margin_percent'
          ? 'Margin'
          : 'Units Sold'
  const valueFormatter: VisualValueFormat = result.rank_by === 'margin_percent'
    ? 'percent'
    : result.rank_by === 'revenue' || result.rank_by === 'gross_profit'
      ? 'currency'
      : 'number'
  const subtitleParts = [`${result.date_range.start_date} to ${result.date_range.end_date}`]
  if (result.query) subtitleParts.push(`filtered by "${result.query}"`)

  return {
    chart: {
      kind: 'bar',
      title:
        result.rank_by === 'revenue'
          ? 'Top Products By Revenue'
          : result.rank_by === 'gross_profit'
            ? 'Top Products By Gross Profit'
            : result.rank_by === 'margin_percent'
              ? 'Top Products By Margin'
              : 'Top Products By Units Sold',
      subtitle: subtitleParts.join(' · '),
      xKey: 'label',
      valueFormatter,
      series: [{ key: valueKey, label: valueLabel }],
      data: rows.map(row => ({
        label: row.name || `Item ${row.item_id}`,
        [valueKey]: row[valueKey],
      })),
    },
    table: {
      title: 'Top Sold Products',
      subtitle: subtitleParts.join(' · '),
      columns: [
        { key: 'rank', label: 'Rank', align: 'right', format: 'number' },
        { key: 'product', label: 'Product' },
        { key: 'units_sold', label: 'Units', align: 'right', format: 'number' },
        { key: 'revenue', label: 'Revenue', align: 'right', format: 'currency' },
        { key: 'average_unit_cost', label: 'Avg Unit Cost', align: 'right', format: 'currency' },
        { key: 'total_cost', label: 'Cost', align: 'right', format: 'currency' },
        { key: 'gross_profit', label: 'Gross Profit', align: 'right', format: 'currency' },
        { key: 'margin_percent', label: 'Margin', align: 'right', format: 'percent' },
      ],
      rows: rows.map((row, index) => ({
        rank: index + 1,
        product: row.name || `Item ${row.item_id}`,
        units_sold: row.units_sold,
        revenue: row.revenue,
        average_unit_cost: row.average_unit_cost,
        total_cost: row.total_cost,
        gross_profit: row.gross_profit,
        margin_percent: row.margin_percent,
      })),
    },
  }
}

function buildSoldProductTimeseriesVisuals(result: LightspeedSoldProductTimeseriesResult, prefs?: VisualPrefs): {
  chart?: GenieChartPayload
  table?: GenieTablePayload
} {
  if (!result.buckets.length) return {}

  const metric = result.metric
  const metricFormat: VisualValueFormat =
    metric === 'revenue' || metric === 'total_cost' || metric === 'gross_profit' || metric === 'average_unit_cost'
      ? 'currency'
      : metric === 'margin_percent'
        ? 'percent'
        : 'number'
  const metricLabel = result.metric_label
  const subtitle = `${result.date_range.start_date} to ${result.date_range.end_date} · ${result.bucket_label} buckets · "${result.query}"`

  return {
    chart: {
      kind: prefs?.line ? 'line' : 'bar',
      title: `${metricLabel} For ${result.query}`,
      subtitle,
      xKey: 'label',
      valueFormatter: metricFormat,
      series: [{ key: metric, label: metricLabel }],
      data: result.buckets.map(bucket => ({
        label: bucket.label,
        [metric]: metric === 'revenue'
          ? bucket.revenue
          : metric === 'sale_line_count'
            ? bucket.sale_line_count
            : metric === 'total_cost'
              ? bucket.total_cost
              : metric === 'gross_profit'
                ? bucket.gross_profit
                : metric === 'margin_percent'
                  ? bucket.margin_percent
                  : metric === 'average_unit_cost'
                    ? bucket.average_unit_cost
                    : bucket.units_sold,
      })),
    },
    table: {
      title: `${result.query} By ${result.bucket_label}`,
      subtitle,
      columns: [
        { key: 'period', label: 'Period' },
        { key: 'units_sold', label: 'Units', align: 'right', format: 'number' },
        { key: 'revenue', label: 'Revenue', align: 'right', format: 'currency' },
        { key: 'average_unit_cost', label: 'Avg Unit Cost', align: 'right', format: 'currency' },
        { key: 'total_cost', label: 'Cost', align: 'right', format: 'currency' },
        { key: 'gross_profit', label: 'Gross Profit', align: 'right', format: 'currency' },
        { key: 'margin_percent', label: 'Margin', align: 'right', format: 'percent' },
        { key: 'sale_line_count', label: 'Sale Lines', align: 'right', format: 'number' },
      ],
      rows: result.buckets.map(bucket => ({
        period: bucket.label,
        units_sold: bucket.units_sold,
        revenue: bucket.revenue,
        average_unit_cost: bucket.average_unit_cost,
        total_cost: bucket.total_cost,
        gross_profit: bucket.gross_profit,
        margin_percent: bucket.margin_percent,
        sale_line_count: bucket.sale_line_count,
      })),
    },
  }
}

function buildInventoryVisuals(result: LightspeedInventorySearchResult): {
  chart?: GenieChartPayload
  table?: GenieTablePayload
} {
  if ('error' in result || !Array.isArray(result.matches) || result.matches.length === 0) return {}

  const strongMatches = result.matches.filter(match => match.confidence === 'strong')
  const rows = (strongMatches.length > 0 ? strongMatches : result.matches).slice(0, 12)
  const subtitle = `Live Lightspeed matches for "${result.query}"`

  return {
    chart: {
      kind: 'bar',
      title: 'Inventory On Hand',
      subtitle,
      xKey: 'label',
      valueFormatter: 'number',
      series: [
        { key: 'total_qoh', label: 'QOH' },
        { key: 'total_sellable', label: 'Sellable' },
      ],
      data: rows.map(row => ({
        label: row.name || `Item ${row.item_id}`,
        total_qoh: row.total_qoh,
        total_sellable: row.total_sellable,
      })),
    },
    table: {
      title: 'Inventory Matches',
      subtitle,
      columns: [
        { key: 'product', label: 'Product' },
        { key: 'brand', label: 'Brand' },
        { key: 'category', label: 'Category' },
        { key: 'price', label: 'Price', align: 'right', format: 'currency' },
        { key: 'cost', label: 'Cost', align: 'right', format: 'currency' },
        { key: 'retail_profit', label: 'Retail GP', align: 'right', format: 'currency' },
        { key: 'margin', label: 'Margin', align: 'right', format: 'percent' },
        { key: 'qoh', label: 'QOH', align: 'right', format: 'number' },
        { key: 'sellable', label: 'Sellable', align: 'right', format: 'number' },
        { key: 'confidence', label: 'Match' },
      ],
      rows: rows.map(row => ({
        product: row.name || `Item ${row.item_id}`,
        brand: row.manufacturer ?? '—',
        category: row.category ?? '—',
        price: row.price,
        cost: row.effective_cost,
        retail_profit: row.retail_gross_profit,
        margin: row.retail_margin_percent,
        qoh: row.total_qoh,
        sellable: row.total_sellable,
        confidence: row.confidence,
      })),
    },
  }
}

function contactList(values: Array<{ number?: string; address?: string; use_type?: string | null }> | undefined, key: 'number' | 'address'): string {
  if (!Array.isArray(values) || values.length === 0) return ''
  return values.map(value => String(value[key] ?? '').trim()).filter(Boolean).join(', ')
}

function buildCustomerSearchVisuals(result: LightspeedCustomerSearchResult): {
  table?: GenieTablePayload
} {
  if (!Array.isArray(result.matches) || result.matches.length === 0) return {}

  return {
    table: {
      title: 'Lightspeed Customers',
      subtitle: result.query ? `Matches for "${result.query}"` : 'Live customer records',
      columns: [
        { key: 'name', label: 'Customer' },
        { key: 'company', label: 'Company' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'customer_id', label: 'ID' },
        { key: 'match', label: 'Match' },
      ],
      rows: result.matches.map(customer => {
        const match = customer as LightspeedCustomerMatch
        return {
          name: match.name,
          company: match.company ?? '',
          phone: contactList(match.phones, 'number'),
          email: contactList(match.emails, 'address'),
          customer_id: match.customer_id,
          match: String(match.confidence ?? ''),
        }
      }),
    },
  }
}

function buildCustomerSalesTable(result: LightspeedCustomerSalesResult): GenieTablePayload | undefined {
  if (
    result.status !== 'resolved' ||
    !('customer' in result) ||
    !result.customer ||
    !Array.isArray(result.sales) ||
    result.sales.length === 0
  ) return undefined

  return {
    title: `Sales For ${result.customer.name}`,
    subtitle: `${result.date_range.start_date} to ${result.date_range.end_date} · ${result.returned_count} of ${result.total_sales} sales`,
    columns: [
      { key: 'completed_at', label: 'Completed' },
      { key: 'sale_id', label: 'Sale ID' },
      { key: 'ticket_number', label: 'Ticket' },
      ...(result.include_line_items
        ? [
            { key: 'items', label: 'Items' },
            { key: 'units', label: 'Units', align: 'right' as const, format: 'number' as const },
          ]
        : []),
      { key: 'subtotal', label: 'Subtotal', align: 'right', format: 'currency' },
      { key: 'tax', label: 'Tax', align: 'right', format: 'currency' },
      { key: 'discounts', label: 'Discount', align: 'right', format: 'currency' },
      { key: 'total', label: 'Total', align: 'right', format: 'currency' },
    ],
    rows: result.sales.map(sale => ({
      completed_at: sale.completed_at,
      sale_id: sale.sale_id,
      ticket_number: sale.ticket_number,
      items: sale.items,
      units: sale.units,
      subtotal: sale.subtotal,
      tax: sale.tax,
      discounts: sale.discounts,
      total: sale.total,
    })),
  }
}

function buildTopCustomersVisuals(result: LightspeedTopCustomersResult): {
  chart?: GenieChartPayload
  table?: GenieTablePayload
} {
  const rows = result.top_customers.slice(0, 20)
  if (!rows.length) return {}

  const valueKey = result.rank_by
  const valueLabel = result.rank_by === 'sale_count'
    ? 'Sales'
    : result.rank_by === 'average_sale_value'
      ? 'Average Sale'
      : 'Gross Sales'
  const valueFormatter: VisualValueFormat = result.rank_by === 'sale_count' ? 'number' : 'currency'
  const subtitle = `${result.date_range.start_date} to ${result.date_range.end_date}`

  return {
    chart: {
      kind: 'bar',
      title: 'Top Customers',
      subtitle,
      xKey: 'label',
      valueFormatter,
      series: [{ key: valueKey, label: valueLabel }],
      data: rows.slice(0, 12).map(row => ({
        label: row.name,
        [valueKey]: row[valueKey],
      })),
    },
    table: {
      title: 'Top Customers',
      subtitle,
      columns: [
        { key: 'rank', label: 'Rank', align: 'right', format: 'number' },
        { key: 'name', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'gross_sales', label: 'Gross Sales', align: 'right', format: 'currency' },
        { key: 'sale_count', label: 'Sales', align: 'right', format: 'number' },
        { key: 'average_sale_value', label: 'Average Sale', align: 'right', format: 'currency' },
      ],
      rows: rows.map(row => ({
        rank: row.rank,
        name: row.name,
        phone: contactList(row.phones, 'number'),
        email: contactList(row.emails, 'address'),
        gross_sales: row.gross_sales,
        sale_count: row.sale_count,
        average_sale_value: row.average_sale_value,
      })),
    },
  }
}

// ── Proposal builders ─────────────────────────────────────────────────────────

async function buildCarouselProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; layout?: Array<{ id: string; is_active?: boolean; carousel_size?: string }> },
): Promise<{ proposal?: CarouselLayoutProposal; output: object }> {
  const current = await getStoreCarousels(supabase, userId)
  if (current.length === 0) {
    return { output: { error: 'This store has no carousels yet. Create one in Store Settings first.' } }
  }
  const byId = new Map(current.map(c => [c.id, c]))
  const layout = (args.layout ?? []).filter(l => byId.has(l.id))

  // Final order: layout entries first (in given order), then any untouched carousels.
  const orderedIds = layout.map(l => l.id)
  for (const c of current) if (!orderedIds.includes(c.id)) orderedIds.push(c.id)

  const layoutById = new Map(layout.map(l => [l.id, l]))
  const changes: CarouselLayoutProposal['changes'] = []
  const order_preview: CarouselLayoutProposal['order_preview'] = []

  orderedIds.forEach((id, index) => {
    const cur = byId.get(id)!
    const ov = layoutById.get(id)
    const nextActive = ov?.is_active ?? cur.is_active
    const nextSize = ov?.carousel_size ? normalizeSize(ov.carousel_size) : cur.carousel_size

    order_preview.push({ name: cur.name, is_active: nextActive, carousel_size: nextSize })

    if (
      index !== cur.display_order ||
      nextActive !== cur.is_active ||
      nextSize !== cur.carousel_size
    ) {
      changes.push({
        id,
        name: cur.name,
        display_order: index,
        is_active: nextActive,
        carousel_size: nextSize,
        prev_display_order: cur.display_order,
        prev_is_active: cur.is_active,
        prev_carousel_size: cur.carousel_size,
      })
    }
  })

  if (changes.length === 0) {
    return { output: { status: 'no_change', message: 'The requested layout already matches the current one.' } }
  }

  const proposal: CarouselLayoutProposal = {
    kind: 'carousel_layout',
    summary: args.summary?.trim() || 'Update carousel layout',
    changes,
    order_preview,
  }
  return {
    proposal,
    output: {
      status: 'proposed',
      kind: 'carousel_layout',
      changed_count: changes.length,
      new_order: order_preview.map(o => o.name),
    },
  }
}

async function buildCreateCarouselProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; name?: string; match?: string; product_ids?: string[]; position?: number; carousel_size?: string },
): Promise<{ proposal?: CarouselCreateProposal; output: object }> {
  const name = (args.name ?? '').trim()
  if (!name) {
    return { output: { error: 'A name is required to create a carousel.' } }
  }

  const current = await getStoreCarousels(supabase, userId)
  if (current.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    return { output: { error: `A carousel named "${name}" already exists. Pick a different name or rename the existing one.` } }
  }

  const targets = await resolveProductTargets(supabase, userId, args.match, args.product_ids)
  if (targets.length === 0) {
    return {
      output: {
        error: args.match || args.product_ids?.length
          ? `No products found${args.match ? ` matching "${args.match}"` : ''} — nothing to put in the carousel.`
          : 'Tell me which products to include (a keyword like "Clif", or specific items).',
      },
    }
  }

  const size = normalizeSize(args.carousel_size)

  // Where the new carousel sits. position is 1-based; clamp to [0, length].
  // Omitted → append at the end.
  const len = current.length
  let insertAt = len
  if (Number.isFinite(args.position)) {
    insertAt = Math.max(0, Math.min(len, Math.round(Number(args.position)) - 1))
  }

  const ordered_ids: string[] = current.map(c => c.id)
  ordered_ids.splice(insertAt, 0, NEW_CAROUSEL_SLOT)

  const order_preview = ordered_ids.map(id => {
    if (id === NEW_CAROUSEL_SLOT) {
      return { name, is_active: true, carousel_size: size, is_new: true }
    }
    const c = current.find(x => x.id === id)!
    return { name: c.name, is_active: c.is_active, carousel_size: c.carousel_size, is_new: false }
  })

  const match_label = args.product_ids?.length
    ? `${targets.length} selected product${targets.length === 1 ? '' : 's'}`
    : `${targets.length} product${targets.length === 1 ? '' : 's'}${args.match ? ` matching "${args.match}"` : ''}`

  const proposal: CarouselCreateProposal = {
    kind: 'carousel_create',
    summary: args.summary?.trim() || `Create "${name}" carousel`,
    name,
    carousel_size: size,
    match_label,
    product_ids: targets.map(t => t.id),
    products_preview: targets.slice(0, 12).map(t => ({ id: t.id, name: t.name })),
    ordered_ids,
    order_preview,
  }
  return {
    proposal,
    output: {
      status: 'proposed',
      kind: 'carousel_create',
      name,
      product_count: targets.length,
      position: insertAt + 1,
    },
  }
}

async function buildRenameCarouselProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; id?: string; name?: string },
): Promise<{ proposal?: CarouselRenameProposal; output: object }> {
  const newName = (args.name ?? '').trim()
  if (!args.id || !newName) {
    return { output: { error: 'Both the carousel id and a new name are required.' } }
  }

  const current = await getStoreCarousels(supabase, userId)
  const target = current.find(c => c.id === args.id)
  if (!target) {
    return { output: { error: 'That carousel was not found. Call get_store_carousels for valid ids.' } }
  }
  if (target.name === newName) {
    return { output: { status: 'no_change', message: `The carousel is already named "${newName}".` } }
  }
  if (current.some(c => c.id !== target.id && c.name.toLowerCase() === newName.toLowerCase())) {
    return { output: { error: `Another carousel is already named "${newName}".` } }
  }

  const proposal: CarouselRenameProposal = {
    kind: 'carousel_rename',
    summary: args.summary?.trim() || `Rename "${target.name}" to "${newName}"`,
    id: target.id,
    prev_name: target.name,
    name: newName,
  }
  return {
    proposal,
    output: { status: 'proposed', kind: 'carousel_rename', from: target.name, to: newName },
  }
}

async function buildPriceUpdateProposal(
  supabase: Supa,
  userId: string,
  args: {
    summary?: string
    match?: string
    product_ids?: string[]
    markup_percent?: number
    new_prices?: Record<string, number>
  },
): Promise<{ proposal?: PriceUpdateProposal; output: object }> {
  // Fetch cost data for the targets
  const costData = await getProductCosts(supabase, userId, args.match)
  let targets = costData

  if (args.product_ids && args.product_ids.length > 0) {
    const idSet = new Set(args.product_ids)
    targets = costData.filter(p => idSet.has(p.id))
    // Also fetch any explicitly listed ids that the match query missed
    if (targets.length < args.product_ids.length) {
      const missing = args.product_ids.filter(id => !targets.some(t => t.id === id))
      if (missing.length > 0) {
        const extra = await getProductCosts(supabase, userId, undefined)
        const extraFiltered = extra.filter(p => missing.includes(p.id))
        targets = [...targets, ...extraFiltered]
      }
    }
  } else if (!args.match && !args.new_prices) {
    return { output: { error: 'Provide a keyword (match), specific product_ids, or new_prices to target products.' } }
  }

  if (targets.length === 0) {
    return { output: { error: `No products found${args.match ? ` matching "${args.match}"` : ''}.` } }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100

  // Compute new prices
  const new_prices: Record<string, number> = {}

  if (args.new_prices && Object.keys(args.new_prices).length > 0) {
    // Explicit price map — apply as-is (validate against cost)
    for (const [id, price] of Object.entries(args.new_prices)) {
      const t = targets.find(p => p.id === id)
      if (!t) continue
      if (t.cost != null && price < t.cost) {
        return { output: { error: `Cannot set "${t.name}" below its cost price ($${t.cost.toFixed(2)}). Minimum price is $${t.cost.toFixed(2)}.` } }
      }
      new_prices[id] = round2(price)
    }
  } else if (Number.isFinite(args.markup_percent) && (args.markup_percent as number) > 0) {
    // markup_percent: retail = cost × (1 + markup/100)
    const markup = args.markup_percent as number
    for (const t of targets) {
      if (t.cost == null || t.cost === 0) continue // skip products without cost
      const retail = t.cost * (1 + markup / 100)
      new_prices[t.id] = round2(retail)
    }
    if (Object.keys(new_prices).length === 0) {
      return { output: { error: 'None of the matched products have a cost price on file, so markup cannot be calculated. Check cost prices in your Lightspeed catalogue first.' } }
    }
  } else {
    return { output: { error: 'Provide either markup_percent (e.g. 40 for 40% above cost) or an explicit new_prices map.' } }
  }

  const products_preview = targets
    .filter(t => t.id in new_prices)
    .slice(0, 12)
    .map(t => {
      const newPrice = new_prices[t.id]
      const margin =
        t.cost != null && newPrice > 0
          ? Math.round(((newPrice - t.cost) / newPrice) * 100 * 10) / 10
          : null
      return {
        id: t.id,
        name: t.name,
        current_price: t.price,
        new_price: newPrice,
        cost: t.cost,
        margin_percent: margin,
      }
    })

  const affected = Object.keys(new_prices).length
  const match_label = args.product_ids?.length
    ? `${affected} selected product${affected === 1 ? '' : 's'}`
    : `${affected} product${affected === 1 ? '' : 's'}${args.match ? ` matching "${args.match}"` : ''}`

  const proposal: PriceUpdateProposal = {
    kind: 'price_update',
    summary: args.summary?.trim() || (args.markup_percent != null ? `Set ${args.markup_percent}% markup` : 'Update retail prices'),
    match_label,
    product_ids: Object.keys(new_prices),
    new_prices,
    products_preview,
  }
  return {
    proposal,
    output: { status: 'proposed', kind: 'price_update', product_count: affected },
  }
}

async function resolveProductTargets(
  supabase: Supa,
  userId: string,
  match: string | undefined,
  productIds: string[] | undefined,
) {
  let q = supabase
    .from('products')
    .select('id, display_name, description, price')
    .eq('user_id', userId)

  if (productIds && productIds.length > 0) {
    q = q.in('id', productIds)
  } else if (match && sanitizeMatch(match)) {
    const like = `%${sanitizeMatch(match)}%`
    q = q.or(
      [
        `display_name.ilike.${like}`,
        `description.ilike.${like}`,
        `category_name.ilike.${like}`,
        `manufacturer_name.ilike.${like}`,
        `full_category_path.ilike.${like}`,
      ].join(','),
    )
  } else {
    return []
  }

  const { data } = await q.limit(500)
  const rows = (data ?? []) as ProductRow[]
  return rows.map(p => ({
    id: p.id as string,
    name: p.display_name || p.description || 'Unnamed product',
    price: Number(p.price) || 0,
  }))
}

async function buildDiscountProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; match?: string; product_ids?: string[]; discount_percent?: number; ends_at?: string | null },
): Promise<{ proposal?: DiscountApplyProposal; output: object }> {
  const pct = Number(args.discount_percent)
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { output: { error: 'discount_percent must be a number between 1 and 100.' } }
  }

  let endsAt: string | null = null
  if (args.ends_at) {
    const d = new Date(args.ends_at)
    if (isNaN(d.getTime())) {
      return { output: { error: 'ends_at is not a valid date.' } }
    }
    endsAt = d.toISOString()
  }

  const targets = await resolveProductTargets(supabase, userId, args.match, args.product_ids)
  if (targets.length === 0) {
    return { output: { error: `No products found${args.match ? ` matching "${args.match}"` : ''}.` } }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const products_preview = targets.slice(0, 12).map(t => ({
    id: t.id,
    name: t.name,
    price: t.price,
    sale_price: round2(t.price * (1 - pct / 100)),
  }))

  const match_label = args.product_ids?.length
    ? `${targets.length} selected product${targets.length === 1 ? '' : 's'}`
    : `${targets.length} product${targets.length === 1 ? '' : 's'} matching "${args.match}"`

  const proposal: DiscountApplyProposal = {
    kind: 'discount_apply',
    summary: args.summary?.trim() || `Apply ${Math.round(pct)}% discount`,
    match_label,
    discount_percent: round2(pct),
    ends_at: endsAt,
    product_ids: targets.map(t => t.id),
    products_preview,
  }
  return {
    proposal,
    output: {
      status: 'proposed',
      kind: 'discount_apply',
      percent: Math.round(pct),
      product_count: targets.length,
      ends_at: endsAt,
    },
  }
}

async function buildRemoveDiscountProposal(
  supabase: Supa,
  userId: string,
  args: { summary?: string; match?: string; product_ids?: string[] },
): Promise<{ proposal?: DiscountRemoveProposal; output: object }> {
  // Only consider currently-discounted products.
  let q = supabase
    .from('products')
    .select('id, display_name, description')
    .eq('user_id', userId)
    .eq('discount_active', true)

  if (args.product_ids && args.product_ids.length > 0) {
    q = q.in('id', args.product_ids)
  } else if (args.match && sanitizeMatch(args.match)) {
    const like = `%${sanitizeMatch(args.match)}%`
    q = q.or(
      [
        `display_name.ilike.${like}`,
        `description.ilike.${like}`,
        `category_name.ilike.${like}`,
        `manufacturer_name.ilike.${like}`,
        `full_category_path.ilike.${like}`,
      ].join(','),
    )
  }

  const { data } = await q.limit(500)
  const rows = (data ?? []) as ProductRow[]
  const targets = rows.map(p => ({ id: p.id, name: p.display_name || p.description || 'Unnamed product' }))
  if (targets.length === 0) {
    return { output: { error: 'No matching products currently have an active discount.' } }
  }

  const proposal: DiscountRemoveProposal = {
    kind: 'discount_remove',
    summary: args.summary?.trim() || 'Remove discount',
    match_label: args.match ? `products matching "${args.match}"` : `${targets.length} discounted product${targets.length === 1 ? '' : 's'}`,
    product_ids: targets.map(t => t.id),
    products_preview: targets.slice(0, 12),
  }
  return {
    proposal,
    output: { status: 'proposed', kind: 'discount_remove', product_count: targets.length },
  }
}

// ── Agent SDK tools ──────────────────────────────────────────────────────────

function buildAgentTools(supabase: Supa, userId: string, emit: Emit, visualPrefs: VisualPrefs) {
  const proposalToolOutput = (result: { proposal?: GenieProposal; output: object }) => {
    if (result.proposal) emit({ event: 'proposal', proposal: result.proposal })
    return result.output
  }

  return [
    webSearchTool({
      searchContextSize: 'medium',
      externalWebAccess: true,
    }),
    tool({
      name: 'record_lightspeed_plan',
      description: 'Record the short plan before answering any Lightspeed sales or inventory question. Call this before other Lightspeed tools.',
      parameters: z.object({
        steps: z.array(z.string()).min(1).max(8),
      }),
      async execute({ steps }) {
        const cleanSteps = steps.map(step => step.trim()).filter(Boolean)
        const summary = cleanSteps.slice(0, 3).join(' → ')
        emitStatus(emit, 'planning', summary ? `Planning ${plural(cleanSteps.length, 'step')}: ${summary}` : 'Planning Lightspeed lookup...')
        emit({ event: 'reasoning_done', text: cleanSteps.map(step => `- ${step}`).join('\n') })
        return { status: 'planned', steps: cleanSteps }
      },
    }),
    tool({
      name: 'get_lightspeed_sales_summary',
      description: 'Fetch completed, non-voided Lightspeed sales totals, net sales, total cost, gross profit, and gross margin for an ISO date range using the live Lightspeed API.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        cost_method: z.enum(['avg', 'fifo']).optional().describe('Cost method for margin/profit calculations. Defaults to avg.'),
        max_pages: z.number().int().min(1).max(220).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Preparing sales total lookup for ${args.start_date} to ${args.end_date}...`)
        return getLightspeedSalesSummary(userId, args, emit)
      },
    }),
    tool({
      name: 'get_lightspeed_sales_list',
      description: 'Fetch individual completed, non-voided Lightspeed sale transactions for an ISO date range using the live Lightspeed API. Use for every-sale, transaction, receipt, order, detailed sale-list, and sale-level profit/margin requests.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        limit: z.number().int().min(1).max(500).optional(),
        include_line_items: z.boolean().optional().describe('Load sale line item summaries. Use true for short ranges or when the user asks what was sold.'),
        include_profit: z.boolean().optional().describe('Include sale-level total cost, gross profit, and gross margin columns. Use true for profit/margin questions.'),
        cost_method: z.enum(['avg', 'fifo']).optional().describe('Cost method for margin/profit calculations. Defaults to avg.'),
        max_pages: z.number().int().min(1).max(220).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Preparing sale transaction list for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedSalesList(userId, args, emit)
        const table = buildSalesListTable(result)
        if (table) emit({ event: 'table', table })
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_sales_timeseries',
      description: 'Fetch completed Lightspeed sales and bucket them by day, week, month, or year for live sales, cost, gross profit, gross margin, graphs, bar charts, line charts, breakdowns, and tables.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        bucket: z.enum(['day', 'week', 'month', 'year']).optional(),
        metric: z.enum(['gross_sales', 'net_sales', 'sale_count', 'average_sale_value', 'total_cost', 'gross_profit', 'gross_margin_percent']).optional(),
        cost_method: z.enum(['avg', 'fifo']).optional().describe('Cost method for margin/profit calculations. Defaults to avg.'),
        max_pages: z.number().int().min(1).max(220).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Preparing ${args.bucket ?? 'auto-bucketed'} sales chart for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedSalesTimeseries(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildSalesTimeseriesVisuals(result, visualPrefs))
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_top_sold_products',
      description: 'Fetch completed Lightspeed sales with sale lines and aggregate top sold products by quantity, revenue, gross profit, or margin over an ISO date range. Returns item cost, total cost, gross profit, and margin from live Lightspeed sale-line costs.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        limit: z.number().int().min(1).max(20).optional(),
        query: z.string().optional().describe('Optional product/service/category text to filter sold lines.'),
        rank_by: z.enum(['quantity', 'revenue', 'gross_profit', 'margin_percent']).optional(),
        include_manual_lines: z.boolean().optional(),
        cost_method: z.enum(['avg', 'fifo']).optional().describe('Cost method for margin/profit calculations. Defaults to avg.'),
        max_pages: z.number().int().min(1).max(120).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Preparing top-sold product lookup for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedTopSoldProducts(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildTopSoldVisuals(result))
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_sold_product_timeseries',
      description: 'Fetch completed Lightspeed sales with sale lines, fuzzy-match a product/service/category query, and bucket matched sold lines by day, week, month, or year. Use for monthly charts/tables of units, revenue, item cost, gross profit, margin, or average unit cost for a specific product/service over time.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        query: z.string().describe('Product, service, category, SKU, or sale-line text to match, e.g. "General Services".'),
        bucket: z.enum(['day', 'week', 'month', 'year']).optional(),
        metric: z.enum(['units_sold', 'revenue', 'sale_line_count', 'total_cost', 'gross_profit', 'margin_percent', 'average_unit_cost']).optional(),
        include_manual_lines: z.boolean().optional(),
        cost_method: z.enum(['avg', 'fifo']).optional().describe('Cost method for margin/profit calculations. Defaults to avg.'),
        max_pages: z.number().int().min(1).max(180).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Preparing ${args.bucket ?? 'auto-bucketed'} trend for "${args.query}"...`)
        const result = await getLightspeedSoldProductTimeseries(userId, args, emit)
        emitStatus(emit, 'lightspeed_sales', `Rendering ${result.metric_label.toLowerCase()} visuals for "${result.query}"...`)
        emitVisuals(emit, visualPrefs, buildSoldProductTimeseriesVisuals(result, visualPrefs))
        return result
      },
    }),
    tool({
      name: 'search_lightspeed_inventory',
      description: 'Search live Lightspeed inventory across item names, brands/manufacturers, categories, SKUs, UPCs, costs, prices, margins, and ItemShop stock. Use for stock questions, item cost lookup, retail margin lookup, and brand/category inventory counts.',
      parameters: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_inventory', `Preparing inventory search for "${args.query}"...`)
        const result = await searchLightspeedInventory(userId, args, emit)
        emitStatus(emit, 'lightspeed_inventory', `Rendering inventory results for "${args.query}"...`)
        emitVisuals(emit, visualPrefs, buildInventoryVisuals(result))
        return result
      },
    }),
    tool({
      name: 'search_lightspeed_customers',
      description: 'Search live Lightspeed customers by name, company, customer ID, phone, email, or address and return contact details. Use for customer lookup, phone/email extraction, customer lists, and customer profile questions.',
      parameters: z.object({
        query: z.string().optional().describe('Customer name, company, customer ID, phone, email, or address. Omit only for broad customer lists/counts.'),
        limit: z.number().int().min(1).max(50).optional(),
        include_archived: z.boolean().optional(),
        created_start_date: z.string().optional().describe('YYYY-MM-DD customer create date start.'),
        created_end_date: z.string().optional().describe('YYYY-MM-DD customer create date end.'),
        max_pages: z.number().int().min(1).max(120).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_customers', args.query ? `Preparing customer search for "${args.query}"...` : 'Preparing customer list lookup...')
        const result = await searchLightspeedCustomers(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildCustomerSearchVisuals(result))
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_customer_profile',
      description: 'Fetch one Lightspeed customer by customer ID with Contact relation details such as phone numbers, email addresses, opt-out flags, and address fields.',
      parameters: z.object({
        customer_id: z.string(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_customers', `Preparing customer profile lookup for ${args.customer_id}...`)
        return getLightspeedCustomerProfile(userId, args, emit)
      },
    }),
    tool({
      name: 'get_lightspeed_customer_sales',
      description: 'Fetch completed, non-voided Lightspeed sales for one customer over a date range. Use for customer purchase history, what a customer bought, customer lifetime/recent spend, last purchase, and customer sales detail questions.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        customer_id: z.string().optional(),
        query: z.string().optional().describe('Customer name, company, phone, email, or address when customer_id is unknown.'),
        include_line_items: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        max_pages: z.number().int().min(1).max(220).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_customers', `Preparing customer sales lookup for ${args.customer_id ?? args.query ?? 'selected customer'}...`)
        const result = await getLightspeedCustomerSales(userId, args, emit)
        const table = buildCustomerSalesTable(result)
        if (table) emit({ event: 'table', table })
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_top_customers',
      description: 'Aggregate completed, non-voided Lightspeed sales by customer over a date range. Use for top customers, best customers, highest spenders, most frequent customers, average-sale customer rankings, and customer leaderboard questions.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        limit: z.number().int().min(1).max(50).optional(),
        rank_by: z.enum(['gross_sales', 'sale_count', 'average_sale_value']).optional(),
        include_contact_details: z.boolean().optional().describe('Set true when the user asks for phone numbers, emails, or contact details in the ranking.'),
        include_walk_in: z.boolean().optional().describe('Include unassigned/walk-in sales as a pseudo customer. Defaults false.'),
        max_pages: z.number().int().min(1).max(220).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_customers', `Preparing top customer analysis for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedTopCustomers(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildTopCustomersVisuals(result))
        return result
      },
    }),
    tool({
      name: 'get_store_carousels',
      description: 'List the store carousels in display order, with id, name, source, visibility, size, and product count. Call before proposing any layout change.',
      parameters: z.object({}),
      async execute() {
        emitStatus(emit, 'tool', 'Reading your carousels...')
        return { carousels: await getStoreCarousels(supabase, userId) }
      },
    }),
    tool({
      name: 'search_store_products',
      description: 'Search this store own Yellow Jersey products by keyword. Use for storefront discounts/carousels only, not Lightspeed stock or sales reporting.',
      parameters: z.object({
        query: z.string(),
      }),
      async execute({ query }) {
        emitStatus(emit, 'tool', 'Finding products...')
        return { products: await searchStoreProducts(supabase, userId, query) }
      },
    }),
    tool({
      name: 'list_active_discounts',
      description: 'List the store products that currently have an active Yellow Jersey storefront discount.',
      parameters: z.object({}),
      async execute() {
        emitStatus(emit, 'tool', 'Checking active discounts...')
        return { discounts: await listActiveDiscounts(supabase, userId) }
      },
    }),
    tool({
      name: 'propose_carousel_layout',
      description: 'Stage a new carousel layout for review. Pass carousels in desired display order. The first is the featured collection.',
      parameters: z.object({
        summary: z.string(),
        layout: z.array(z.object({
          id: z.string(),
          is_active: z.boolean().optional(),
          carousel_size: z.enum(['featured', 'normal', 'compact']).optional(),
        })),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing changes...')
        return proposalToolOutput(await buildCarouselProposal(supabase, userId, args))
      },
    }),
    tool({
      name: 'propose_create_carousel',
      description: 'Stage creation of a new carousel for review. Fill it via match text or specific product_ids. Optionally set position and size.',
      parameters: z.object({
        summary: z.string(),
        name: z.string(),
        match: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        position: z.number().optional(),
        carousel_size: z.enum(['featured', 'normal', 'compact']).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing new carousel...')
        return proposalToolOutput(await buildCreateCarouselProposal(supabase, userId, args))
      },
    }),
    tool({
      name: 'propose_rename_carousel',
      description: 'Stage renaming of an existing carousel for review. Get the id from get_store_carousels first.',
      parameters: z.object({
        summary: z.string(),
        id: z.string(),
        name: z.string(),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing rename...')
        return proposalToolOutput(await buildRenameCarouselProposal(supabase, userId, args))
      },
    }),
    tool({
      name: 'propose_discount',
      description: 'Stage a percentage storefront discount for review. Use match for description-based targeting; product_ids only for specific picks.',
      parameters: z.object({
        summary: z.string(),
        match: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        discount_percent: z.number(),
        ends_at: z.string().nullable().optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing discount...')
        return proposalToolOutput(await buildDiscountProposal(supabase, userId, args))
      },
    }),
    tool({
      name: 'propose_remove_discount',
      description: 'Stage removal of storefront discounts for review. Use match or product_ids to target; omit both to clear all active discounts.',
      parameters: z.object({
        summary: z.string(),
        match: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing discount removal...')
        return proposalToolOutput(await buildRemoveDiscountProposal(supabase, userId, args))
      },
    }),
    tool({
      name: 'get_product_costs',
      description: 'Fetch Yellow Jersey product cost, retail, and margin data for storefront pricing workflows. Optional query narrows results by keyword.',
      parameters: z.object({
        query: z.string().optional(),
      }),
      async execute({ query }) {
        emitStatus(emit, 'tool', 'Looking up cost prices...')
        return { products: await getProductCosts(supabase, userId, query) }
      },
    }),
    tool({
      name: 'propose_price_update',
      description: 'Stage Yellow Jersey retail price changes for review. Use markup_percent from cost or explicit new_prices map. Call get_product_costs first.',
      parameters: z.object({
        summary: z.string(),
        match: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        markup_percent: z.number().optional(),
        new_prices: z.record(z.string(), z.number()).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing price changes...')
        return proposalToolOutput(await buildPriceUpdateProposal(supabase, userId, args))
      },
    }),
  ]
}

function statusForTool(toolName: string): { phase: string; text: string } {
  if (toolName === 'web_search' || toolName === 'web_search_preview') return { phase: 'web_search', text: 'Searching the web...' }
  if (toolName === 'record_lightspeed_plan') return { phase: 'planning', text: 'Writing the Lightspeed lookup plan...' }
  if (toolName === 'get_lightspeed_sales_summary') return { phase: 'lightspeed_sales', text: 'Opening the Lightspeed sales total tool...' }
  if (toolName === 'get_lightspeed_sales_list') return { phase: 'lightspeed_sales', text: 'Opening the Lightspeed transaction list tool...' }
  if (toolName === 'get_lightspeed_sales_timeseries') return { phase: 'lightspeed_sales', text: 'Opening the Lightspeed sales chart tool...' }
  if (toolName === 'get_lightspeed_top_sold_products') return { phase: 'lightspeed_sales', text: 'Opening the Lightspeed sale-line aggregation tool...' }
  if (toolName === 'get_lightspeed_sold_product_timeseries') return { phase: 'lightspeed_sales', text: 'Opening the Lightspeed product trend tool...' }
  if (toolName === 'search_lightspeed_inventory') return { phase: 'lightspeed_inventory', text: 'Opening the Lightspeed inventory search tool...' }
  if (toolName === 'search_lightspeed_customers') return { phase: 'lightspeed_customers', text: 'Opening the Lightspeed customer search tool...' }
  if (toolName === 'get_lightspeed_customer_profile') return { phase: 'lightspeed_customers', text: 'Opening the Lightspeed customer profile tool...' }
  if (toolName === 'get_lightspeed_customer_sales') return { phase: 'lightspeed_customers', text: 'Opening the Lightspeed customer sales tool...' }
  if (toolName === 'get_lightspeed_top_customers') return { phase: 'lightspeed_customers', text: 'Opening the Lightspeed top customers tool...' }
  if (toolName === 'get_store_carousels') return { phase: 'tool', text: 'Reading your carousels...' }
  if (toolName === 'search_store_products') return { phase: 'tool', text: 'Finding products...' }
  if (toolName === 'list_active_discounts') return { phase: 'tool', text: 'Checking active discounts...' }
  if (toolName === 'get_product_costs') return { phase: 'tool', text: 'Looking up cost prices...' }
  if (toolName.startsWith('propose_')) return { phase: 'tool', text: 'Preparing changes...' }
  return { phase: 'tool', text: `Running ${toolName}...` }
}

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await request.json()
    const supabase = await createClient()

    // ── Auth: verified bicycle store only ──────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Please log in.' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store, business_name')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return new Response(JSON.stringify({ error: 'Store agent is only available to verified bicycle stores.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }

    const storeName = profile.business_name || 'your store'
    const visualPrefs = visualPrefsForMessages(messages)
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let lastStatusKey = ''
        const emit = (data: object) => {
          if ('event' in data && data.event === 'status') {
            const status = data as { phase?: unknown; text?: unknown }
            const key = `${String(status.phase ?? '')}:${String(status.text ?? '')}`
            if (key === lastStatusKey) return
            lastStatusKey = key
          }
          send(controller, encoder, data)
        }
        try {
          emit({ event: 'status', phase: 'thinking', text: 'Reading your request and choosing the next tool...' })

          const inputMessages = toAgentInputMessages(messages)

          const agent = new Agent({
            name: 'Yellow Jersey Store Agent',
            model: MODEL,
            instructions: buildSystemPrompt(storeName),
            tools: buildAgentTools(supabase, user.id, emit, visualPrefs),
            modelSettings: {
              parallelToolCalls: false,
              store: false,
              reasoning: { effort: 'medium', summary: 'concise' },
              text: { verbosity: 'low' },
            },
          })

          const agentStream = await storeAgentRunner.run(agent, inputMessages, {
            stream: true,
            maxTurns: 10,
            signal: request.signal,
            toolExecution: { maxFunctionToolConcurrency: 1 },
            toolNotFoundBehavior: 'return_error_to_model',
            reasoningItemIdPolicy: 'omit',
            errorHandlers: {
              maxTurns: () => ({
                finalOutput: 'I hit the tool-use limit before I could finish. Please narrow the request and try again.',
                includeInHistory: true,
              }),
            },
          })

          for await (const event of agentStream) {
            if (event.type === 'run_item_stream_event') {
              const item = event.item as StreamToolItem
              const toolName = item.rawItem?.name || item.rawItem?.toolName || item.name
              if (event.name === 'reasoning_item_created' && lastStatusKey === '') {
                emit({ event: 'status', phase: 'thinking', text: 'Reasoning about the requested workflow...' })
              }
              if (event.name === 'tool_called' && toolName) {
                emit({ event: 'status', ...statusForTool(toolName) })
              }
            }

            if (event.type === 'raw_model_stream_event') {
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

              if (rawType === 'response.web_search_call.in_progress') {
                emit({ event: 'status', phase: 'web_search', text: 'Opening web search...' })
              }

              if (rawType === 'response.web_search_call.searching') {
                emit({ event: 'status', phase: 'web_search', text: 'Searching the web...' })
              }

              if (rawType === 'response.web_search_call.completed') {
                emit({ event: 'status', phase: 'web_search_done', text: 'Web research done' })
              }

              if (
                (rawType === 'response.reasoning_summary_text.done' ||
                  rawType === 'response.reasoning_summary_part.done') &&
                reasoningText
              ) {
                emit({ event: 'reasoning_done', text: reasoningText })
              }

              if (rawType === 'output_text_delta' || rawType === 'response.output_text.delta') {
                emit({ event: 'text_delta', text: delta })
              }
            }
          }

          await agentStream.completed

          emit({ event: 'done' })
        } catch (err) {
          emit({ event: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
