// Genie agent tools: Lightspeed data access, SQL reporting, visuals, proposals, Gmail, specialist agents, and buildAgentTools.

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Agent, tool, webSearchTool } from '@openai/agents'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { compactGenieProgressText } from '@/lib/genie/progress-text'
import {
  buildPivotTableFromRows,
  type GeniePivotTableConfig,
  type GeniePivotTablePayload,
} from '@/lib/genie/pivot-table'
import {
  latestUserText,
  type GenieOrchestrationDecision,
} from '@/lib/genie/orchestration'
import {
  shouldExposeHostedWebSearch,
  toolNameSetForRoute,
} from '@/lib/genie/agent-runtime-policy'
import {
  buildInventoryProductPreviews,
  buildStorefrontProductPreviews,
  inventoryMatchesForPreview,
  resolveInventoryItemImageUrls,
  shouldEmitStoreProductPreviews,
} from '@/lib/genie/store-product-previews'
import { searchWebImages } from '@/lib/genie/web-image-search'
import { buildXeroTools } from '@/lib/genie/agent/xero-tools'
import { buildDeputyTools } from '@/lib/genie/agent/deputy-tools'
import { buildPurchaseOrderTools } from '@/lib/genie/agent/purchase-order-tools'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import { resolveCategoryCreationTarget } from '@/lib/services/lightspeed/category-helpers'
import {
  buildWorkorderCardsPayload,
  getGenieWorkorder,
  listGenieWorkorders,
} from '@/lib/services/lightspeed/workorder-queries'
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieCustomerBikeProfile,
  GenieCustomerProfileCandidate,
  GenieCustomerProfileCustomer,
  GenieCustomerProfilePayload,
  GenieCustomerSaleLineProfile,
  GenieCustomerSaleProfile,
  GenieCustomerTopItemProfile,
  GenieWorkorderCard,
  GenieWorkorderCardsPayload,
} from '@/lib/types/genie-agent'
import type {
  LightspeedCategory,
  LightspeedCustomer,
  LightspeedCustomerBike,
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
  ProductBrandCategoryUpdateProposal,
  LightspeedCategoryCreateProposal,
  GmailEmailActionProposal,
  GmailConnectPayload,
} from '@/lib/types/genie-agent'
import { NEW_CAROUSEL_SLOT } from '@/lib/types/genie-agent'
import {
  getGmailConnection,
  isComposioConfigured,
  listGmailConnections,
  mintGmailConnectLink,
  readGmailMessages,
  searchGmailEmails,
} from '@/lib/composio/gmail'
import { getOrCreateGmailComposioSession, type ComposioSessionNotice } from '@/lib/composio/session'

import { verifyQuestionAnsweredWithJudge } from '@/lib/genie/answer-verification'
import { buildGmailAgentContextFromMessages, buildGmailAgentContextFromPayload } from '@/lib/genie/gmail-agent-context'

import { STORE_TIME_ZONE, STORE_UTC_OFFSET, getStoreToday, storeDateFromDate, isGenieTracingEnabled } from './runtime'
import {
  DEFAULT_GENIE_MODELS,
  getGenieRuntimePolicy,
  isToolExcludedForProfile,
  type GenieModelConfig,
  type GenieModelProfile,
} from './model-profiles'
import { type GenieExecutionPlan } from './prompts'
import { buildVisibleGmailPayload, fullWorkorderForAgent, type ComposioSessionIds, type Message } from './context'
import { DEPRECATED_LIGHTSPEED_ANALYTICAL_TOOL_NAMES, GENIE_LIGHTSPEED_INVENTORY_SQL_SCHEMA, GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW, GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS, GENIE_LIGHTSPEED_SQL_DEFAULT_LIMIT, GENIE_LIGHTSPEED_SQL_FALLBACK_MAX_LINES, GENIE_LIGHTSPEED_SQL_MAX_LIMIT, GENIE_LIGHTSPEED_SQL_RPC, GENIE_LIGHTSPEED_SQL_SCHEMA, GENIE_LIGHTSPEED_SQL_VIEW } from './sql-constants'

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
  emit({ event: 'status', phase, text: compactGenieProgressText(text, phase) })
}

function emitProgress(emit: Emit | undefined, phase: string, text: string) {
  if (emit) emitStatus(emit, phase, text)
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function productRecheckSuggestions(query: string): string[] {
  const cleaned = query.trim()
  return [
    `Try search_lightspeed_inventory with "${cleaned}" to inspect live item, brand, category, SKU, and stock matches.`,
    'Retry with a shorter brand, model, category, SKU, or singular/plural variant from the user phrase.',
    'If item IDs are needed for sales or customer lookup, resolve products first and then filter sales by SaleLines.itemID.',
  ]
}

function inventoryRecheckSuggestions(query: string): string[] {
  const cleaned = query.trim()
  return [
    `Retry inventory lookup with fewer words or a core brand/model/category token from "${cleaned}".`,
    'Try exact SKU, UPC, manufacturer, or category terms when the product name search is weak.',
    'Increase or split the item search only if the first result reports a page cap.',
  ]
}

function customerRecheckSuggestions(query?: string): string[] {
  const cleaned = String(query ?? '').trim()
  return [
    cleaned ? `Retry customer lookup with name pieces, company, email, phone digits, or address tokens from "${cleaned}".` : 'Retry customer lookup with a name, company, email, phone number, or customer ID.',
    'Use contact-detail scanning when name/company lookup returns no confident customer.',
    'If multiple plausible customers remain, ask the user to choose before exposing contact details.',
  ]
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

const AUD_FORMATTER = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 2,
})

function formatAud(value: number): string {
  return AUD_FORMATTER.format(value)
}

function visualPrefsForMessages(messages: Message[]): VisualPrefs {
  const text = latestUserText(messages).toLowerCase()
  return {
    chart: /\b(bar|line|trend)\s*(chart|graph)\b|\b(chart|graph)\b|\bplot\b|\bvisuali[sz]e\b|\bbar\s+chart\b|\bbar\s+graph\b|\bline\s+chart\b|\bline\s+graph\b/.test(text),
    line: /\bline\s*(chart|graph)\b|\btrend\s*(line|chart|graph)\b/.test(text),
    table: /\btable\b|\btabular\b|\bspreadsheet\b|\bbreakdown\b|\bcomparison\b|\branking\b|\brankings\b|\btop\b|\blist(?:ed|ing)?\b|\btransactions?\b|\breceipts?\b|\borders?\b|\bevery\s+sale\b|\beach\s+sale\b|\bwhich\s+products?\b|\bwhat\s+would\s+they\s+be\b|\bdiscount\s+\d+\s+products?\b|\bproducts?\s+.*\bdiscount\b|\bpivot(?:\s+table)?\b|\bcrosstab\b|\bcross[\s-]?tab\b/.test(text),
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

function daysBetweenIsoDates(startDate: string, endDate: string): number {
  return Math.max(0, Math.floor((isoDateToUtcDate(endDate).getTime() - isoDateToUtcDate(startDate).getTime()) / 86_400_000))
}

async function getLightspeedItemsForIds(
  userId: string,
  itemIds: string[],
  options?: {
    batchSize?: number
    emit?: Emit
    phase?: string
    label?: string
    maxPagesPerBatch?: number
  },
) {
  const client = createLightspeedClient(userId)
  const uniqueItemIds = Array.from(new Set(itemIds.map(id => String(id).trim()).filter(Boolean)))
  const batchSize = Math.min(Math.max(options?.batchSize ?? 100, 1), 100)
  const batchCount = Math.ceil(uniqueItemIds.length / batchSize)
  const items: LightspeedItem[] = []
  let pagesFetched = 0
  let hitPageLimit = false

  for (let index = 0; index < uniqueItemIds.length; index += batchSize) {
    const batch = uniqueItemIds.slice(index, index + batchSize)
    const batchIndex = Math.floor(index / batchSize) + 1
    emitProgress(
      options?.emit,
      options?.phase ?? 'lightspeed_inventory',
      `Fetching item cost details for ${options?.label ?? 'stocked items'} (${batchIndex}/${batchCount})...`,
    )
    const result = await client.getAllItemsCursor({
      archived: 'false',
      itemID: lightspeedSaleLineItemFilter(batch),
    }, {
      maxPages: options?.maxPagesPerBatch ?? 5,
      limit: 100,
      onPage: progress => emitProgress(
        options?.emit,
        options?.phase ?? 'lightspeed_inventory',
        `Fetched ${plural(progress.totalCount, 'item detail')} (${plural(progress.pagesFetched, 'item page')}, batch ${batchIndex}/${batchCount})...`,
      ),
    })
    items.push(...result.items)
    pagesFetched += result.pagesFetched
    hitPageLimit ||= result.hitPageLimit
  }

  return {
    items,
    pagesFetched,
    hitPageLimit,
    batchesFetched: batchCount,
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

async function resolveLightspeedProductItems(
  userId: string,
  query: string,
  options?: { maxItems?: number; emit?: Emit; phase?: string },
) {
  const client = createLightspeedClient(userId)
  const searchTerms = itemDescriptionSearchTerms(query)
  const maxItems = Math.min(Math.max(options?.maxItems ?? 30, 1), 80)
  const phase = options?.phase ?? 'lightspeed_sales'
  const meaningfulTokens = meaningfulQueryTokens(query).slice(0, 5)
  emitProgress(options?.emit, phase, `Resolving live Lightspeed products for "${query}"...`)

  type ItemSearchResult = {
    label: string
    items: LightspeedItem[]
    pagesFetched: number
    hitPageLimit: boolean
    error?: string
  }

  const fetchItems = async (
    label: string,
    params: Record<string, string | number | undefined>,
    maxPages: number,
  ): Promise<ItemSearchResult> => {
    try {
      const result = await client.getAllItemsCursor({ archived: 'false', ...params }, {
        maxPages: Math.min(Math.max(maxPages, 1), 80),
        limit: 100,
        onPage: progress => emitProgress(
          options?.emit,
          phase,
          `Found ${plural(progress.totalCount, 'product candidate')} by ${label} (${plural(progress.pagesFetched, 'page')})...`,
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
        error: error instanceof Error ? error.message : 'Lightspeed product search failed',
      }
    }
  }

  const [categories, manufacturerResults] = await Promise.all([
    client.getAllCategories({ archived: 'false' }).catch(() => [] as LightspeedCategory[]),
    Promise.all(
      meaningfulTokens.map(token =>
        client.getAllManufacturers({ name: lightspeedContainsFilter(token) }).catch(() => []),
      ),
    ),
  ])

  const manufacturerById = new Map<string, { manufacturerID: string; name: string }>()
  for (const manufacturer of manufacturerResults.flat()) {
    manufacturerById.set(String(manufacturer.manufacturerID), manufacturer)
  }
  const manufacturers = Array.from(manufacturerById.values())
  const categoryMap = new Map(categories.map(category => [String(category.categoryID), category]))
  const manufacturerMap = new Map(manufacturers.map(manufacturer => [String(manufacturer.manufacturerID), manufacturer.name]))

  const matchedManufacturers = manufacturers
    .map(manufacturer => ({
      ...manufacturer,
      score: brandScore(query, manufacturer.name),
    }))
    .filter(manufacturer => manufacturer.score >= 60)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 6)

  const matchedCategories = categories
    .map(category => ({
      ...category,
      score: categoryQueryScore(query, category),
    }))
    .filter(category => category.score >= 30)
    .sort((a, b) => b.score - a.score || (a.fullPathName || a.name).localeCompare(b.fullPathName || b.name))
    .slice(0, 6)

  emitProgress(
    options?.emit,
    phase,
    `Matched ${plural(matchedManufacturers.length, 'brand')} and ${plural(matchedCategories.length, 'category')} before sale lookup...`,
  )

  const brandCategorySearches = matchedManufacturers.length > 0 && matchedCategories.length > 0
    ? matchedManufacturers.slice(0, 4).flatMap(manufacturer =>
        matchedCategories.slice(0, 4).map(category =>
          fetchItems(
            `brand:${manufacturer.name} + category:${category.fullPathName || category.name}`,
            { manufacturerID: manufacturer.manufacturerID, categoryID: category.categoryID },
            8,
          ),
        ),
      )
    : []

  const brandSearches = matchedManufacturers.slice(0, 4).map(manufacturer =>
    fetchItems(`brand:${manufacturer.name}`, { manufacturerID: manufacturer.manufacturerID }, 24),
  )
  const categorySearches = matchedCategories.slice(0, 4).map(category =>
    fetchItems(`category:${category.fullPathName || category.name}`, { categoryID: category.categoryID }, 16),
  )
  const descriptionSearches = searchTerms.slice(0, 6).map(term =>
    fetchItems(`description:${term}`, { description: lightspeedContainsFilter(term) }, term.includes(' ') ? 3 : 2),
  )

  const searchResults = await Promise.all([
    ...brandCategorySearches,
    ...brandSearches,
    ...categorySearches,
    ...descriptionSearches,
  ])

  const itemById = new Map<string, LightspeedItem>()
  for (const result of searchResults) {
    for (const item of result.items) {
      itemById.set(String(item.itemID), item)
    }
  }

  const descriptorTokens = meaningfulTokens.filter(token => !matchedManufacturers.some(manufacturer => {
    const brand = normalizeText(manufacturer.name)
    return tokenVariants(token).includes(brand) || hasToken(brand, token)
  }))
  const hasBrandConstraint = matchedManufacturers.length > 0

  const scored = Array.from(itemById.values())
    .map(item => {
      const category = categoryMap.get(String(item.categoryID ?? ''))
      const productText = normalizeText([
        item.description,
        item.itemType,
        category?.name,
        category?.fullPathName,
      ].filter(Boolean).join(' '))
      const brandMatched = matchedManufacturers.some(manufacturer => (
        String(item.manufacturerID) === String(manufacturer.manufacturerID) ||
        hasToken(normalizeText(item.description), normalizeText(manufacturer.name))
      ))
      const descriptorHits = descriptorTokens.filter(token => hasToken(productText, token))
      const match = inventoryScore(query, item, categoryMap, manufacturerMap)
      if (descriptorHits.length > 0) {
        match.score += descriptorHits.length * 12
        match.reasons.push('matched specific product terms')
      }

      return {
        item,
        ...match,
        has_required_brand: !hasBrandConstraint || brandMatched,
        has_required_specificity: !hasBrandConstraint || descriptorTokens.length === 0 || !brandMatched || descriptorHits.length > 0,
      }
    })
    .filter(row => row.score > 0 && row.has_required_brand && row.has_required_specificity)
    .sort((a, b) => b.score - a.score || String(a.item.description).localeCompare(String(b.item.description)))

  const topScore = scored[0]?.score ?? 0
  const strongThreshold = topScore >= 100
    ? Math.max(65, topScore - 30)
    : topScore >= 60
      ? Math.max(45, topScore - 20)
      : topScore >= 35
        ? topScore
        : Math.max(25, topScore)

  const matchedItems = topScore > 0
    ? scored.filter(row => row.score >= strongThreshold).slice(0, maxItems)
    : []
  const pageCapReached = searchResults.some(result => result.hitPageLimit)

  if (matchedItems.length > 0) {
    const preview = matchedItems.slice(0, 3).map(row => row.item.description || `Item ${row.item.itemID}`).join(', ')
    emitProgress(options?.emit, phase, `Matched ${plural(matchedItems.length, 'Lightspeed product')}: ${preview}`)
  } else {
    emitProgress(options?.emit, phase, `No strong live Lightspeed product match found for "${query}".`)
  }

  return {
    query,
    search_terms: searchTerms,
    candidates_found: itemById.size,
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
    matched_items: matchedItems.map(row => ({
      item_id: String(row.item.itemID),
      name: row.item.description || `Item ${row.item.itemID}`,
      score: row.score,
      match_reasons: row.reasons,
      item_type: row.item.itemType || null,
      default_cost: itemDefaultCost(row.item),
      average_cost: itemAverageCost(row.item),
      effective_cost: itemEffectiveCost(row.item),
      retail_price: itemPrice(row.item),
      manufacturer_id: row.item.manufacturerID || null,
      manufacturer: row.item.manufacturerID ? (manufacturerMap.get(String(row.item.manufacturerID)) ?? null) : null,
      category_id: row.item.categoryID || null,
      category: row.item.categoryID
        ? categoryMap.get(String(row.item.categoryID))?.fullPathName ?? categoryMap.get(String(row.item.categoryID))?.name ?? null
        : null,
    })),
    top_score: topScore,
    strong_threshold: strongThreshold,
    searches: searchResults.map(result => ({
      label: result.label,
      item_count: result.items.length,
      pages_fetched: result.pagesFetched,
      page_cap_reached: result.hitPageLimit,
      error: result.error ?? null,
    })),
    pages_fetched: searchResults.reduce((sum, result) => sum + result.pagesFetched, 0),
    page_cap_reached: pageCapReached,
    recheck_required: matchedItems.length === 0 || pageCapReached,
    recheck_suggestions: matchedItems.length === 0
      ? productRecheckSuggestions(query)
      : pageCapReached
        ? ['Narrow the product/category/date scope or split the lookup to recover complete live data.']
        : [],
  }
}

async function resolveLightspeedSaleLineItems(
  userId: string,
  query: string,
  options?: { maxItems?: number; emit?: Emit },
) {
  return resolveLightspeedProductItems(userId, query, {
    maxItems: options?.maxItems ?? 30,
    emit: options?.emit,
    phase: 'lightspeed_sales',
  })
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
  const query = String(args.query ?? '').trim()
  const itemLookup = query
    ? await resolveLightspeedProductItems(userId, query, {
        maxItems: 80,
        emit,
        phase: 'lightspeed_sales',
      })
    : null
  const matchedItemIds = itemLookup?.matched_items.map(item => item.item_id) ?? []
  const matchedItemIdSet = new Set(matchedItemIds)
  const itemCandidateById = new Map(itemLookup?.matched_items.map(item => [item.item_id, item]) ?? [])

  if (query && itemLookup && matchedItemIds.length === 0) {
    return {
      source: 'live_lightspeed_api',
      date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
      cost_method: costMethod,
      rank_by: args.rank_by ?? 'quantity',
      query,
      api_strategy: 'product_first_item_lookup_then_sale_line_filter',
      sales_scanned: 0,
      matched_sale_lines: 0,
      excluded_manual_lines: 0,
      net_sales: 0,
      total_cost: 0,
      gross_profit: 0,
      gross_margin_percent: null,
      top_products: [],
      item_lookup: itemLookup,
      pages_fetched: 0,
      complete: !itemLookup.page_cap_reached,
      page_cap_reached: itemLookup.page_cap_reached,
      recheck_required: true,
      recheck_suggestions: productRecheckSuggestions(query),
      message: `No strong live Lightspeed product match found for "${query}".`,
    }
  }

  emitProgress(
    emit,
    'lightspeed_sales',
    query
      ? `Fetching sales containing ${plural(matchedItemIds.length, 'matched product')} from ${startDate} to ${endDate}...`
      : `Fetching sales with sale lines from ${startDate} to ${endDate}...`,
  )
  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines: true,
    lineRelation: query ? 'lines' : 'lines_with_items',
    saleLineItemIds: query ? matchedItemIds : undefined,
    maxPages: args.max_pages ?? (query ? 80 : undefined),
    onPage: progress => emitProgress(
      emit,
      'lightspeed_sales',
      query
        ? `Fetched ${plural(progress.totalCount, 'matching sale')} (${plural(progress.pagesFetched, 'page')})...`
        : `Fetched ${plural(progress.totalCount, 'sale')} with sale lines (${plural(progress.pagesFetched, 'page')})...`,
    ),
  })
  emitProgress(
    emit,
    'lightspeed_sales',
    query
      ? `Aggregating matched sale lines across ${plural(sales.length, 'sale')}...`
      : `Aggregating sold items across ${plural(sales.length, 'sale')}...`,
  )

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
      if (query && !matchedItemIdSet.has(String(itemId))) continue
      if (!args.include_manual_lines && itemId === '0') {
        excludedManualLines++
        continue
      }

      const itemCandidate = itemCandidateById.get(String(itemId))
      const name = itemCandidate?.name ?? lineName(line)

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
        current_default_cost: itemCandidate?.default_cost ?? itemDefaultCost(line.Item),
        current_average_cost: itemCandidate?.average_cost ?? itemAverageCost(line.Item),
      }
      prev.units_sold += qty
      prev.revenue += revenue
      prev.total_cost += totalCost
      prev.gross_profit += revenue - totalCost
      prev.sale_line_count += 1
      prev.current_default_cost ??= itemCandidate?.default_cost ?? itemDefaultCost(line.Item)
      prev.current_average_cost ??= itemCandidate?.average_cost ?? itemAverageCost(line.Item)
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
    query: query || null,
    api_strategy: query
      ? 'product_first_item_lookup_then_sale_line_filter'
      : 'range_sale_line_scan_for_overall_top_products',
    sales_scanned: sales.length,
    matched_sale_lines: matchedLineCount,
    excluded_manual_lines: excludedManualLines,
    net_sales: roundMoney(netSales),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(netSales - totalCost),
    gross_margin_percent: netSales > 0 ? roundPercent(((netSales - totalCost) / netSales) * 100) : null,
    top_products: top,
    item_lookup: itemLookup,
    pages_fetched: pagesFetched,
    complete: !hitPageLimit && !itemLookup?.page_cap_reached,
    page_cap_reached: hitPageLimit || Boolean(itemLookup?.page_cap_reached),
    recheck_required: Boolean(query && top.length === 0) || hitPageLimit || Boolean(itemLookup?.page_cap_reached),
    recheck_suggestions: query && top.length === 0
      ? [
          'Matched products were found, but no sale lines matched the date range. Recheck the date range before saying the product never sold.',
          ...productRecheckSuggestions(query),
        ]
      : hitPageLimit || Boolean(itemLookup?.page_cap_reached)
        ? ['Split the date range or narrow the product scope to recover a complete live result.']
        : [],
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
      recheck_required: true,
      recheck_suggestions: inventoryRecheckSuggestions(query),
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
    recheck_required: strongMatches.length === 0 || itemResult.hitPageLimit,
    recheck_suggestions: strongMatches.length === 0
      ? inventoryRecheckSuggestions(query)
      : itemResult.hitPageLimit
        ? ['Narrow the item/category scope or split the lookup because the live item page cap was reached.']
        : [],
  }
}

async function getLightspeedStaleInventoryCash(
  userId: string,
  args: {
    query?: string
    no_sale_days?: number
    old_stock_days?: number
    min_stock_value?: number
    limit?: number
    history_start_date?: string
    max_stock_pages?: number
    max_recent_sale_pages?: number
    max_history_sale_pages?: number
  },
  emit?: Emit,
) {
  const query = String(args.query ?? '').trim()
  const today = getStoreToday()
  const noSaleDays = Math.min(Math.max(Math.round(args.no_sale_days ?? 180), 1), 3650)
  const oldStockDays = Math.min(Math.max(Math.round(args.old_stock_days ?? 180), 1), 3650)
  const minStockValue = Math.max(0, Number(args.min_stock_value ?? 0))
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
  const recentStartDate = isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(today), -noSaleDays))
  const oldStockCutoffDate = isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(today), -oldStockDays))
  const historyStartDate = assertIsoDate(args.history_start_date ?? '2010-01-01', 'history_start_date')
  const historyEndDate = isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(recentStartDate), -1))
  const client = createLightspeedClient(userId)
  const recentSalesPromise = getLightspeedSalesForRange({
    userId,
    startDate: recentStartDate,
    endDate: today,
    includeLines: true,
    lineRelation: 'lines',
    maxPages: Math.min(Math.max(args.max_recent_sale_pages ?? 140, 1), 240),
    onPage: progress => emitProgress(
      emit,
      'lightspeed_sales',
      `Checked ${plural(progress.totalCount, 'recent sale')} for product movement (${plural(progress.pagesFetched, 'sale page')})...`,
    ),
  })
  const categoriesPromise = client.getAllCategories({ archived: 'false' }).catch(() => [] as LightspeedCategory[])
  const manufacturersPromise = client.getAllManufacturers().catch(() => [])

  emitProgress(
    emit,
    'lightspeed_inventory',
    `Fetching current positive stock from Lightspeed before checking stale cash...`,
  )
  const stockResult = await client.getAllItemShopsCursor({
    shopID: 0,
    qoh: '>,0',
  }, {
    maxPages: Math.min(Math.max(args.max_stock_pages ?? 260, 1), 400),
    limit: 100,
    onPage: progress => emitProgress(
      emit,
      'lightspeed_inventory',
      `Fetched ${plural(progress.totalCount, 'positive-stock row')} (${plural(progress.pagesFetched, 'stock page')})...`,
    ),
  })

  const stockByItemId = new Map<string, { qoh: number; sellable: number }>()
  for (const row of stockResult.itemShops) {
    const itemId = String(row.itemID)
    const prev = stockByItemId.get(itemId)
    const qoh = toNum(row.qoh)
    const sellable = toNum(row.sellable)
    if (!prev || String(row.shopID) === '0') {
      stockByItemId.set(itemId, { qoh, sellable })
    }
  }
  const stockedItemIds = Array.from(stockByItemId.entries())
    .filter(([, stock]) => stock.qoh > 0)
    .map(([itemId]) => itemId)

  emitProgress(
    emit,
    'lightspeed_inventory',
    `Found ${plural(stockedItemIds.length, 'stocked item')} with positive QOH; fetching costs and recent sales...`,
  )
  const [itemsResult, recentSalesResult, categories, manufacturers] = await Promise.all([
    getLightspeedItemsForIds(userId, stockedItemIds, {
      emit,
      phase: 'lightspeed_inventory',
      label: 'stocked items',
      maxPagesPerBatch: 5,
    }),
    recentSalesPromise,
    categoriesPromise,
    manufacturersPromise,
  ])

  const categoryMap = new Map(categories.map(category => [String(category.categoryID), category]))
  const manufacturerMap = new Map(manufacturers.map(manufacturer => [String(manufacturer.manufacturerID), manufacturer.name]))
  const recentMovementByItem = new Map<string, { last_sold_at: string; units_sold: number; revenue: number }>()

  for (const sale of recentSalesResult.sales) {
    const completedAt = saleCompletedAt(sale)
    for (const line of saleLines(sale)) {
      const itemId = String(line.itemID || line.Item?.itemID || '')
      if (!itemId || !stockByItemId.has(itemId)) continue
      const qty = positiveQuantity(line)
      if (qty <= 0) continue
      const prev = recentMovementByItem.get(itemId) ?? {
        last_sold_at: completedAt ?? '',
        units_sold: 0,
        revenue: 0,
      }
      if (completedAt && completedAt > prev.last_sold_at) prev.last_sold_at = completedAt
      prev.units_sold += qty
      prev.revenue += lineRevenue(line)
      recentMovementByItem.set(itemId, prev)
    }
  }

  emitProgress(
    emit,
    'lightspeed_inventory',
    `Scoring stocked items by cost value, age, and no recent sales...`,
  )
  const itemsById = new Map(itemsResult.items.map(item => [String(item.itemID), item]))
  const costMissingItemCount = stockedItemIds.filter(itemId => itemEffectiveCost(itemsById.get(itemId)) == null).length
  const candidates = stockedItemIds
    .map(itemId => {
      const item = itemsById.get(itemId)
      const stock = stockByItemId.get(itemId)
      if (!item || !stock) return null
      const createdDate = item.createTime ? storeDateFromDate(new Date(item.createTime)) : null
      const itemAgeDays = createdDate ? daysBetweenIsoDates(createdDate, today) : null
      const unitCost = itemEffectiveCost(item)
      const price = itemPrice(item)
      const stockValue = unitCost != null ? stock.qoh * unitCost : 0
      const category = categoryMap.get(String(item.categoryID ?? ''))
      const manufacturer = item.manufacturerID ? (manufacturerMap.get(String(item.manufacturerID)) ?? null) : null
      const queryScore = query ? inventoryScore(query, item, categoryMap, manufacturerMap).score : 1

      return {
        item,
        item_id: itemId,
        name: item.description || `Item ${itemId}`,
        system_sku: item.systemSku || null,
        custom_sku: item.customSku || null,
        manufacturer,
        category: category?.fullPathName || category?.name || null,
        qoh: stock.qoh,
        sellable: stock.sellable,
        unit_cost: unitCost,
        stock_value: stockValue,
        retail_price: price,
        retail_value: price * stock.qoh,
        created_date: createdDate,
        item_age_days: itemAgeDays,
        query_score: queryScore,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter(row => !query || row.query_score > 0)
    .filter(row => row.stock_value >= minStockValue)
    .filter(row => row.item_age_days == null || row.item_age_days >= oldStockDays)
    .filter(row => !recentMovementByItem.has(row.item_id))
    .sort((a, b) => b.stock_value - a.stock_value || b.qoh - a.qoh || a.name.localeCompare(b.name))

  const selected = candidates.slice(0, limit)
  const selectedIds = selected.map(row => row.item_id)
  const historyByItem = new Map<string, { last_sold_at: string; units_sold: number; revenue: number }>()
  let historyPagesFetched = 0
  let historyHitPageLimit = false
  let historySalesScanned = 0

  if (
    selectedIds.length > 0 &&
    isoDateToUtcDate(historyStartDate).getTime() <= isoDateToUtcDate(historyEndDate).getTime()
  ) {
    emitProgress(
      emit,
      'lightspeed_sales',
      `Looking up older sale history for the top ${plural(selectedIds.length, 'stale-stock item')}...`,
    )
    const historyResult = await getLightspeedSalesForRange({
      userId,
      startDate: historyStartDate,
      endDate: historyEndDate,
      includeLines: true,
      lineRelation: 'lines',
      saleLineItemIds: selectedIds,
      maxPages: Math.min(Math.max(args.max_history_sale_pages ?? 120, 1), 240),
      onPage: progress => emitProgress(
        emit,
        'lightspeed_sales',
        `Fetched ${plural(progress.totalCount, 'older matching sale')} (${plural(progress.pagesFetched, 'history page')})...`,
      ),
    })
    historyPagesFetched = historyResult.pagesFetched
    historyHitPageLimit = historyResult.hitPageLimit
    historySalesScanned = historyResult.sales.length
    const selectedIdSet = new Set(selectedIds)

    for (const sale of historyResult.sales) {
      const completedAt = saleCompletedAt(sale)
      for (const line of saleLines(sale)) {
        const itemId = String(line.itemID || line.Item?.itemID || '')
        if (!selectedIdSet.has(itemId)) continue
        const qty = positiveQuantity(line)
        if (qty <= 0) continue
        const prev = historyByItem.get(itemId) ?? {
          last_sold_at: completedAt ?? '',
          units_sold: 0,
          revenue: 0,
        }
        if (completedAt && completedAt > prev.last_sold_at) prev.last_sold_at = completedAt
        prev.units_sold += qty
        prev.revenue += lineRevenue(line)
        historyByItem.set(itemId, prev)
      }
    }
  }

  const rows = selected.map((row, index) => {
    const history = historyByItem.get(row.item_id)
    const lastSoldDate = history?.last_sold_at ? storeDateFromDate(new Date(history.last_sold_at)) : null
    return {
      rank: index + 1,
      item_id: row.item_id,
      product: row.name,
      system_sku: row.system_sku,
      custom_sku: row.custom_sku,
      brand: row.manufacturer,
      category: row.category,
      qoh: roundMoney(row.qoh),
      sellable: roundMoney(row.sellable),
      unit_cost: row.unit_cost != null ? roundMoney(row.unit_cost) : null,
      stock_value: roundMoney(row.stock_value),
      retail_price: roundMoney(row.retail_price),
      retail_value: roundMoney(row.retail_value),
      created_date: row.created_date,
      item_age_days: row.item_age_days,
      last_sold_at: history?.last_sold_at ? formatStoreDateTime(history.last_sold_at) : null,
      days_since_last_sale: lastSoldDate ? daysBetweenIsoDates(lastSoldDate, today) : null,
      historical_units_sold: history ? roundMoney(history.units_sold) : 0,
      historical_revenue: history ? roundMoney(history.revenue) : 0,
      stale_reason: history?.last_sold_at
        ? `No sales in last ${noSaleDays} days`
        : `No sales found since ${historyStartDate}`,
    }
  })

  const totalStaleStockValue = candidates.reduce((sum, row) => sum + row.stock_value, 0)
  const totalStaleQoh = candidates.reduce((sum, row) => sum + row.qoh, 0)
  const totalAnalysedStockValue = stockedItemIds.reduce((sum, itemId) => {
    const item = itemsById.get(itemId)
    const stock = stockByItemId.get(itemId)
    const cost = itemEffectiveCost(item)
    return sum + (stock && cost != null ? stock.qoh * cost : 0)
  }, 0)

  return {
    source: 'live_lightspeed_api',
    query: query || null,
    date_context: {
      today,
      no_sale_since: recentStartDate,
      old_stock_created_before: oldStockCutoffDate,
      history_start_date: historyStartDate,
      timezone: STORE_TIME_ZONE,
    },
    thresholds: {
      no_sale_days: noSaleDays,
      old_stock_days: oldStockDays,
      min_stock_value: minStockValue,
    },
    stocked_item_count: stockedItemIds.length,
    items_with_missing_cost: costMissingItemCount,
    stale_item_count: candidates.length,
    returned_count: rows.length,
    row_limit: limit,
    limited: candidates.length > rows.length,
    total_stale_stock_value: roundMoney(totalStaleStockValue),
    total_stale_qoh: roundMoney(totalStaleQoh),
    total_analysed_stock_value: roundMoney(totalAnalysedStockValue),
    stale_stock_value_percent_of_analysed: totalAnalysedStockValue > 0
      ? roundPercent((totalStaleStockValue / totalAnalysedStockValue) * 100)
      : null,
    rows,
    api_strategy: 'positive_qoh_stock_then_recent_sale_line_exclusion_then_top_candidate_history_lookup',
    stock_pages_fetched: stockResult.pagesFetched,
    item_pages_fetched: itemsResult.pagesFetched,
    item_batches_fetched: itemsResult.batchesFetched,
    recent_sale_pages_fetched: recentSalesResult.pagesFetched,
    recent_sales_scanned: recentSalesResult.sales.length,
    history_sale_pages_fetched: historyPagesFetched,
    history_sales_scanned: historySalesScanned,
    complete: !stockResult.hitPageLimit && !itemsResult.hitPageLimit && !recentSalesResult.hitPageLimit && !historyHitPageLimit,
    page_cap_reached: stockResult.hitPageLimit || itemsResult.hitPageLimit || recentSalesResult.hitPageLimit || historyHitPageLimit,
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
    recheck_required: matches.length === 0 || fetches.some(fetchResult => fetchResult.hitPageLimit),
    recheck_suggestions: matches.length === 0
      ? customerRecheckSuggestions(query)
      : fetches.some(fetchResult => fetchResult.hitPageLimit)
        ? ['Narrow the customer query or split created-date filters because the live customer page cap was reached.']
        : [],
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
      recheck_required: resolved.status === 'not_found',
      recheck_suggestions: resolved.status === 'ambiguous'
        ? ['Ask the user to choose from the candidate customers before fetching sales or exposing contact details.']
        : customerRecheckSuggestions(args.query),
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

async function getLightspeedProductPurchasers(
  userId: string,
  args: {
    query: string
    start_date?: string
    end_date?: string
    limit?: number
    include_contact_details?: boolean
    include_walk_in?: boolean
    rank_by?: 'matching_revenue' | 'sale_count' | 'units_sold' | 'last_purchase'
    max_item_matches?: number
    max_pages?: number
  },
  emit?: Emit,
) {
  const query = String(args.query || '').trim()
  if (!query) return { error: 'query is required.' }

  const startDate = assertIsoDate(args.start_date ?? '2010-01-01', 'start_date')
  const endDate = assertIsoDate(args.end_date ?? getStoreToday(), 'end_date')
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100)
  const rankBy = args.rank_by ?? 'last_purchase'
  const includeContactDetails = Boolean(args.include_contact_details)

  const itemLookup = await resolveLightspeedProductItems(userId, query, {
    maxItems: args.max_item_matches ?? 50,
    emit,
    phase: 'lightspeed_customers',
  })
  const matchedItemIds = itemLookup.matched_items.map(item => item.item_id)
  const matchedItemIdSet = new Set(matchedItemIds)
  const itemNameById = new Map(itemLookup.matched_items.map(item => [item.item_id, item.name]))

  if (matchedItemIds.length === 0) {
    return {
      source: 'live_lightspeed_api',
      query,
      status: 'no_product_match',
      date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
      matched_products: [],
      customers: [],
      customer_count: 0,
      sales_scanned: 0,
      matched_sale_lines: 0,
      item_lookup: itemLookup,
      complete: !itemLookup.page_cap_reached,
      page_cap_reached: itemLookup.page_cap_reached,
      recheck_required: true,
      recheck_suggestions: productRecheckSuggestions(query),
      message: `No strong live Lightspeed product match found for "${query}".`,
    }
  }

  emitProgress(
    emit,
    'lightspeed_customers',
    `Fetching sales that contain ${plural(matchedItemIds.length, 'matched product')} from ${startDate} to ${endDate}...`,
  )
  const { sales, pagesFetched, hitPageLimit } = await getLightspeedSalesForRange({
    userId,
    startDate,
    endDate,
    includeLines: true,
    lineRelation: 'lines',
    extraLoadRelations: ['Customer'],
    saleLineItemIds: matchedItemIds,
    maxPages: args.max_pages ?? 120,
    onPage: progress => emitProgress(
      emit,
      'lightspeed_customers',
      `Fetched ${plural(progress.totalCount, 'matching sale')} (${plural(progress.pagesFetched, 'sale page')})...`,
    ),
  })

  emitProgress(emit, 'lightspeed_customers', `Aggregating ${plural(sales.length, 'matching sale')} by customer...`)

  const byCustomer = new Map<string, {
    customer_id: string
    customer?: LightspeedCustomer
    name: string
    company: string | null
    matching_revenue: number
    units_sold: number
    sale_ids: Set<string>
    matched_sale_line_count: number
    first_purchase_at: string | null
    last_purchase_at: string | null
    products: Map<string, { item_id: string; name: string; units_sold: number; revenue: number }>
  }>()
  let walkInSales = 0
  let matchedSaleLines = 0

  for (const sale of sales) {
    const matchingLines = saleLines(sale).filter(line => {
      const itemId = String(line.itemID || line.Item?.itemID || '')
      return matchedItemIdSet.has(itemId) && positiveQuantity(line) > 0
    })
    if (matchingLines.length === 0) continue

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
      company: sale.Customer?.company || null,
      matching_revenue: 0,
      units_sold: 0,
      sale_ids: new Set<string>(),
      matched_sale_line_count: 0,
      first_purchase_at: null,
      last_purchase_at: null,
      products: new Map<string, { item_id: string; name: string; units_sold: number; revenue: number }>(),
    }
    prev.customer = prev.customer ?? sale.Customer
    prev.company = prev.company ?? sale.Customer?.company ?? null
    prev.sale_ids.add(String(sale.saleID))
    if (completedAt) {
      if (!prev.first_purchase_at || completedAt < prev.first_purchase_at) prev.first_purchase_at = completedAt
      if (!prev.last_purchase_at || completedAt > prev.last_purchase_at) prev.last_purchase_at = completedAt
    }

    for (const line of matchingLines) {
      const itemId = String(line.itemID || line.Item?.itemID || '')
      const qty = positiveQuantity(line)
      const revenue = lineRevenue(line)
      const product = prev.products.get(itemId) ?? {
        item_id: itemId,
        name: itemNameById.get(itemId) ?? lineName(line),
        units_sold: 0,
        revenue: 0,
      }
      product.units_sold += qty
      product.revenue += revenue
      prev.products.set(itemId, product)

      prev.units_sold += qty
      prev.matching_revenue += revenue
      prev.matched_sale_line_count += 1
      matchedSaleLines++
    }

    byCustomer.set(id, prev)
  }

  const ranked = Array.from(byCustomer.values())
    .map(row => ({
      customer_id: row.customer_id,
      name: row.name,
      company: row.company,
      matching_revenue: roundMoney(row.matching_revenue),
      units_sold: roundMoney(row.units_sold),
      sale_count: row.sale_ids.size,
      matched_sale_line_count: row.matched_sale_line_count,
      first_purchase_at: row.first_purchase_at,
      last_purchase_at: row.last_purchase_at,
      matched_products: Array.from(row.products.values())
        .map(product => ({
          ...product,
          units_sold: roundMoney(product.units_sold),
          revenue: roundMoney(product.revenue),
        }))
        .sort((a, b) => b.units_sold - a.units_sold || b.revenue - a.revenue),
    }))
    .sort((a, b) => {
      if (rankBy === 'matching_revenue') return b.matching_revenue - a.matching_revenue || b.units_sold - a.units_sold
      if (rankBy === 'sale_count') return b.sale_count - a.sale_count || b.matching_revenue - a.matching_revenue
      if (rankBy === 'units_sold') return b.units_sold - a.units_sold || b.matching_revenue - a.matching_revenue
      return (b.last_purchase_at ?? '').localeCompare(a.last_purchase_at ?? '') || b.matching_revenue - a.matching_revenue
    })

  const returned = ranked.slice(0, limit)
  const client = createLightspeedClient(userId)
  const detailById = new Map<string, ReturnType<typeof customerRow>>()
  const detailIds = returned
    .filter(row => row.customer_id && row.customer_id !== '0')
    .filter(row => includeContactDetails || row.name.startsWith('Customer '))
    .map(row => row.customer_id)

  if (detailIds.length > 0) {
    emitProgress(emit, 'lightspeed_customers', `Fetching details for ${plural(detailIds.length, 'matched customer')}...`)
  }
  await Promise.all(detailIds.map(async customerId => {
    try {
      const customer = await client.getCustomer(
        customerId,
        includeContactDetails ? { load_relations: '["Contact"]' } : undefined,
      )
      detailById.set(customerId, customerRow(customer))
    } catch {
      // Keep purchaser rows even if a customer profile lookup fails.
    }
  }))

  const customers = returned.map((row, index) => {
    const details = detailById.get(row.customer_id)
    return {
      rank: index + 1,
      customer_id: row.customer_id,
      name: details?.name ?? row.name,
      company: details?.company ?? row.company,
      phones: includeContactDetails ? details?.phones ?? [] : [],
      emails: includeContactDetails ? details?.emails ?? [] : [],
      matching_revenue: row.matching_revenue,
      units_sold: row.units_sold,
      sale_count: row.sale_count,
      matched_sale_line_count: row.matched_sale_line_count,
      first_purchase_at: row.first_purchase_at ? formatStoreDateTime(row.first_purchase_at) : null,
      last_purchase_at: row.last_purchase_at ? formatStoreDateTime(row.last_purchase_at) : null,
      matched_products: row.matched_products,
      matched_products_summary: row.matched_products
        .slice(0, 4)
        .map(product => `${compactQuantity(product.units_sold)} x ${product.name}`)
        .join(', '),
    }
  })

  const matchingRevenue = ranked.reduce((sum, row) => sum + row.matching_revenue, 0)
  const unitsSold = ranked.reduce((sum, row) => sum + row.units_sold, 0)

  return {
    source: 'live_lightspeed_api',
    query,
    status: 'resolved',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    rank_by: rankBy,
    include_contact_details: includeContactDetails,
    include_walk_in: Boolean(args.include_walk_in),
    matched_products: itemLookup.matched_items,
    matched_product_count: itemLookup.matched_items.length,
    customer_count: ranked.length,
    returned_count: customers.length,
    row_limit: limit,
    limited: ranked.length > customers.length,
    customers,
    matching_revenue: roundMoney(matchingRevenue),
    units_sold: roundMoney(unitsSold),
    matching_sales: sales.length,
    matched_sale_lines: matchedSaleLines,
    walk_in_or_unassigned_matching_sales: walkInSales,
    item_lookup: itemLookup,
    pages_fetched: pagesFetched,
    sale_pages_fetched: pagesFetched,
    complete: !hitPageLimit && !itemLookup.page_cap_reached,
    page_cap_reached: hitPageLimit || itemLookup.page_cap_reached,
    recheck_required: ranked.length === 0 || hitPageLimit || itemLookup.page_cap_reached,
    recheck_suggestions: ranked.length === 0
      ? [
          'Matched products were found, but no customer-linked sales matched the date range. Recheck the date range or ask whether walk-in sales should be included.',
          ...productRecheckSuggestions(query),
        ]
      : hitPageLimit || itemLookup.page_cap_reached
        ? ['Split the date range or narrow the product scope to recover a complete customer-purchaser result.']
        : [],
	  }
	}

// ── Lightspeed SQL sales report helpers ───────────────────────────────────────

type SalesReportCostSource = 'stored_sale_line_cost'

interface SalesReportLineRow {
  sale_id: string
  sale_line_id: string
  ticket_number: string | null
  complete_time: string | null
  line_time: string | null
  employee_id: string | null
  employee_name: string | null
  category_id: string | null
  category: string | null
  item_id: string | null
  sku: string | null
  description: string | null
  quantity: string | number | null
  retail: string | number | null
  subtotal: string | number | null
  discount: string | number | null
  total: string | number | null
  customer_id: string | null
  customer_full_name: string | null
  cost: string | number | null
  profit: string | number | null
  margin_pct: string | number | null
}

interface SalesReportCoverage {
  state_status: string | null
  row_count: number
  oldest_complete_time: string | null
  latest_complete_time: string | null
  oldest_sale_at: string | null
  last_synced_at: string | null
  complete: boolean
}

interface SalesReportFetchResult {
  rows: SalesReportLineRow[]
  rows_fetched: number
  sql_pages_fetched: number
  row_limit_reached: boolean
  coverage: SalesReportCoverage
  complete: boolean
}

interface GroupedSqlSale {
  sale_id: string
  completed_at: string | null
  completed_at_utc: string | null
  ticket_number: string | null
  reference_number: string | null
  customer_id: string | null
  customer_name: string | null
  employee_id: string | null
  employee_name: string | null
  lines: SalesReportLineRow[]
  subtotal: number
  tax: number
  discounts: number
  total: number
  total_cost: number
  gross_profit: number
  units: number
  line_count: number
}

const SALES_REPORT_SQL_SOURCE = 'sales_report_sql'
const SALES_REPORT_COST_SOURCE: SalesReportCostSource = 'stored_sale_line_cost'
const SALES_REPORT_SQL_PAGE_SIZE = 1000
const SALES_REPORT_SQL_DEFAULT_MAX_ROWS = 100_000
const SALES_REPORT_SQL_HARD_MAX_ROWS = 250_000
const SALES_REPORT_SQL_COLUMNS = [
  'sale_id',
  'sale_line_id',
  'ticket_number',
  'complete_time',
  'line_time',
  'employee_id',
  'employee_name',
  'category_id',
  'category',
  'item_id',
  'sku',
  'description',
  'quantity',
  'retail',
  'subtotal',
  'discount',
  'total',
  'customer_id',
  'customer_full_name',
  'cost',
  'profit',
  'margin_pct',
].join(',')

function sqlDateBounds(startDate: string, endDate: string) {
  return {
    startUtc: storeLocalTimeToUtcTimestamp(startDate, '00:00:00'),
    endUtc: storeLocalTimeToUtcTimestamp(endDate, '23:59:59'),
  }
}

function sqlLikeTerm(value: string): string {
  return sanitizeMatch(value).replace(/%/g, ' ').trim()
}

function sqlTextOrFilter(
  terms: string[],
  columns: Array<'description' | 'sku' | 'category' | 'customer_full_name' | 'customer_id' | 'item_id'>,
): string | null {
  const clauses: string[] = []
  for (const rawTerm of terms) {
    const term = sqlLikeTerm(rawTerm)
    if (!term) continue
    for (const column of columns) {
      if ((column === 'customer_id' || column === 'item_id') && /^\d+$/.test(term)) {
        clauses.push(`${column}.eq.${term}`)
      } else if (column !== 'customer_id' && column !== 'item_id') {
        clauses.push(`${column}.ilike.%${term}%`)
      }
    }
  }
  return clauses.length > 0 ? clauses.join(',') : null
}

function salesReportSearchTerms(query: string): string[] {
  const terms = [
    normalizeText(query),
    queryTokens(query).map(singularToken).join(' '),
    ...meaningfulQueryTokens(query),
    ...itemDescriptionSearchTerms(query),
  ]

  return Array.from(new Set(
    terms
      .map(term => normalizeText(term))
      .filter(term => term.length >= 2),
  )).slice(0, 10)
}

async function getSalesReportCoverage(userId: string): Promise<SalesReportCoverage> {
  const admin = createServiceRoleClient()
  const [stateResult, countResult, newestResult, oldestResult] = await Promise.all([
    admin
      .from('lightspeed_sales_report_backfill_state')
      .select('status, oldest_sale_at, last_synced_at')
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('lightspeed_sales_report_lines')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    admin
      .from('lightspeed_sales_report_lines')
      .select('complete_time')
      .eq('user_id', userId)
      .not('complete_time', 'is', null)
      .order('complete_time', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('lightspeed_sales_report_lines')
      .select('complete_time')
      .eq('user_id', userId)
      .not('complete_time', 'is', null)
      .order('complete_time', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (stateResult.error) throw new Error(`Failed to read Lightspeed sales report state: ${stateResult.error.message}`)
  if (countResult.error) throw new Error(`Failed to count Lightspeed sales report rows: ${countResult.error.message}`)
  if (newestResult.error) throw new Error(`Failed to read latest Lightspeed sales report row: ${newestResult.error.message}`)
  if (oldestResult.error) throw new Error(`Failed to read oldest Lightspeed sales report row: ${oldestResult.error.message}`)

  const state = stateResult.data as {
    status?: string | null
    oldest_sale_at?: string | null
    last_synced_at?: string | null
  } | null

  return {
    state_status: state?.status ?? null,
    row_count: countResult.count ?? 0,
    oldest_complete_time: oldestResult.data?.complete_time ?? null,
    latest_complete_time: newestResult.data?.complete_time ?? null,
    oldest_sale_at: state?.oldest_sale_at ?? null,
    last_synced_at: state?.last_synced_at ?? null,
    complete: state?.status === 'complete',
  }
}

async function fetchSalesReportRows(args: {
  userId: string
  startDate: string
  endDate: string
  order?: 'asc' | 'desc'
  orFilter?: string | null
  customerId?: string
  maxRows?: number
  emit?: Emit
  phase?: string
  progressLabel?: string
}): Promise<SalesReportFetchResult> {
  const admin = createServiceRoleClient()
  const { startUtc, endUtc } = sqlDateBounds(args.startDate, args.endDate)
  const maxRows = Math.min(Math.max(args.maxRows ?? SALES_REPORT_SQL_DEFAULT_MAX_ROWS, 1), SALES_REPORT_SQL_HARD_MAX_ROWS)
  const rows: SalesReportLineRow[] = []
  let sqlPagesFetched = 0
  let rowLimitReached = false

  for (let from = 0; from < maxRows; from += SALES_REPORT_SQL_PAGE_SIZE) {
    const to = Math.min(from + SALES_REPORT_SQL_PAGE_SIZE - 1, maxRows - 1)
    let query = admin
      .from('lightspeed_sales_report_lines')
      .select(SALES_REPORT_SQL_COLUMNS)
      .eq('user_id', args.userId)
      .not('complete_time', 'is', null)
      .gte('complete_time', startUtc)
      .lte('complete_time', endUtc)
      .order('complete_time', { ascending: args.order === 'asc' })
      .range(from, to)

    if (args.customerId) query = query.eq('customer_id', args.customerId)
    if (args.orFilter) query = query.or(args.orFilter)

    const { data, error } = await query
    if (error) throw new Error(`Failed to query Lightspeed sales report table: ${error.message}`)

    const pageRows = (data ?? []) as unknown as SalesReportLineRow[]
    rows.push(...pageRows)
    sqlPagesFetched++
    emitProgress(
      args.emit,
      args.phase ?? 'lightspeed_sales',
      `${args.progressLabel ?? 'Reading sales report rows'}: ${plural(rows.length, 'row')} from SQL...`,
    )

    if (pageRows.length < SALES_REPORT_SQL_PAGE_SIZE) break
    if (rows.length >= maxRows) rowLimitReached = true
  }

  const coverage = await getSalesReportCoverage(args.userId)
  return {
    rows,
    rows_fetched: rows.length,
    sql_pages_fetched: sqlPagesFetched,
    row_limit_reached: rowLimitReached,
    coverage,
    complete: coverage.complete && !rowLimitReached,
  }
}

function sqlLineQuantity(row: SalesReportLineRow): number {
  return toNum(row.quantity)
}

function sqlPositiveQuantity(row: SalesReportLineRow): number {
  return Math.max(0, sqlLineQuantity(row))
}

function sqlLineRevenue(row: SalesReportLineRow): number {
  return toNum(row.subtotal)
}

function sqlLineTotal(row: SalesReportLineRow): number {
  return toNum(row.total)
}

function sqlLineCost(row: SalesReportLineRow): number {
  return toNum(row.cost)
}

function sqlLineProfit(row: SalesReportLineRow): number {
  const storedProfit = toOptionalNum(row.profit)
  if (storedProfit != null) return storedProfit
  return sqlLineRevenue(row) - sqlLineCost(row)
}

function salesReportLineLabel(row: SalesReportLineRow): string {
  return String(row.description || row.sku || row.item_id || 'Unknown item')
}

function salesReportItemsSummary(lines: SalesReportLineRow[], maxItems = 4): string {
  const positiveLines = lines.filter(line => sqlPositiveQuantity(line) > 0)
  if (positiveLines.length === 0) return 'No item detail'

  const labels = positiveLines.slice(0, maxItems).map(line => {
    const quantity = sqlPositiveQuantity(line)
    const prefix = quantity === 1 ? '' : `${compactQuantity(quantity)} x `
    return `${prefix}${salesReportLineLabel(line)}`
  })
  const extra = positiveLines.length - labels.length
  return extra > 0 ? `${labels.join(', ')} +${extra} more` : labels.join(', ')
}

function groupSalesReportRows(rows: SalesReportLineRow[]): GroupedSqlSale[] {
  const bySale = new Map<string, GroupedSqlSale>()

  for (const row of rows) {
    const saleId = String(row.sale_id || '').trim()
    if (!saleId) continue

    const prev = bySale.get(saleId) ?? {
      sale_id: saleId,
      completed_at: formatStoreDateTime(row.complete_time),
      completed_at_utc: row.complete_time,
      ticket_number: row.ticket_number ?? null,
      reference_number: null,
      customer_id: row.customer_id ?? null,
      customer_name: row.customer_full_name ?? null,
      employee_id: row.employee_id ?? null,
      employee_name: row.employee_name ?? null,
      lines: [],
      subtotal: 0,
      tax: 0,
      discounts: 0,
      total: 0,
      total_cost: 0,
      gross_profit: 0,
      units: 0,
      line_count: 0,
    }

    prev.lines.push(row)
    prev.subtotal += sqlLineRevenue(row)
    prev.total += sqlLineTotal(row)
    prev.discounts += toNum(row.discount)
    prev.total_cost += sqlLineCost(row)
    prev.gross_profit += sqlLineProfit(row)
    prev.units += sqlPositiveQuantity(row)
    prev.line_count += 1
    prev.tax = prev.total - prev.subtotal
    prev.completed_at_utc = prev.completed_at_utc ?? row.complete_time
    prev.completed_at = prev.completed_at ?? formatStoreDateTime(row.complete_time)
    prev.ticket_number = prev.ticket_number ?? row.ticket_number ?? null
    prev.customer_id = prev.customer_id ?? row.customer_id ?? null
    prev.customer_name = prev.customer_name ?? row.customer_full_name ?? null
    prev.employee_id = prev.employee_id ?? row.employee_id ?? null
    prev.employee_name = prev.employee_name ?? row.employee_name ?? null
    bySale.set(saleId, prev)
  }

  return Array.from(bySale.values()).sort((a, b) => (b.completed_at_utc ?? '').localeCompare(a.completed_at_utc ?? ''))
}

function sqlCompletionFields(fetchResult: SalesReportFetchResult) {
  return {
    rows_fetched: fetchResult.rows_fetched,
    sql_pages_fetched: fetchResult.sql_pages_fetched,
    complete: fetchResult.complete,
    page_cap_reached: fetchResult.row_limit_reached,
    row_limit_reached: fetchResult.row_limit_reached,
    sales_report_coverage: fetchResult.coverage,
  }
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function inventorySqlSearchTerms(query: string): string[] {
  const terms = [
    normalizeText(query),
    queryTokens(query).map(singularToken).join(' '),
    ...meaningfulQueryTokens(query),
    ...itemDescriptionSearchTerms(query),
  ]

  return Array.from(new Set(
    terms
      .map(term => normalizeText(term))
      .filter(term => term.length >= 2),
  )).slice(0, 10)
}

function numericSqlCell(row: SqlResultRow, key: string): number | null {
  return toOptionalNum(row[key])
}

const GENIE_PRODUCT_CARD_LIMIT = 6
const GENIE_PRODUCT_CARD_SCAN_LIMIT = 20

interface InventoryProductCardMatch {
  item_id: string
  name: string
  price?: number
  category?: string | null
  brand?: string | null
  primary_image_url?: string | null
  total_qoh?: number
  is_in_stock?: boolean | null
  system_sku?: string | null
  custom_sku?: string | null
  confidence?: string
}

function shouldAutoEmitInventoryProductCards(latestUserMessage: string): boolean {
  const text = normalizeText(latestUserMessage)
  if (!text) return false

  const inventoryIntent = /\b(do we have|have any|in stock|stock|available|availability|on hand|qoh|sellable|carry|got any|price|how much|what .* cost)\b/.test(text)
  const analyticsIntent = /\b(top|rank|ranking|aggregate|breakdown|trend|revenue|profit|margin|gross profit|stale|cash tied|sold|sales history|last month|last quarter|last year|all products|every product)\b/.test(text)

  return inventoryIntent && !analyticsIntent
}

function firstSqlText(row: SqlResultRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return null
}

function firstSqlNumber(row: SqlResultRow, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toOptionalNum(row[key])
    if (value != null) return value
  }
  return undefined
}

function firstSqlBoolean(row: SqlResultRow, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim()
      if (['true', 'yes', '1'].includes(normalized)) return true
      if (['false', 'no', '0'].includes(normalized)) return false
    }
  }
  return null
}

function inventoryPreviewMatchesFromSqlRows(rows: SqlResultRow[]): InventoryProductCardMatch[] {
  return rows
    .slice(0, GENIE_PRODUCT_CARD_SCAN_LIMIT)
    .map(row => {
      const itemId = firstSqlText(row, ['item_id', 'lightspeed_item_id'])
      const name = firstSqlText(row, ['description', 'name', 'product_name', 'product'])
      if (!itemId || !name) return null

      const totalQoh = firstSqlNumber(row, ['total_qoh', 'qoh', 'quantity_on_hand', 'quantity'])
      const isInStock = firstSqlBoolean(row, ['is_in_stock', 'in_stock']) ?? (totalQoh != null ? totalQoh > 0 : null)

      return {
        item_id: itemId,
        name,
        price: firstSqlNumber(row, ['online_price', 'default_price', 'price', 'current_price', 'retail']),
        category: firstSqlText(row, ['category_path', 'category', 'category_name']),
        brand: firstSqlText(row, ['brand_name', 'brand', 'manufacturer']),
        primary_image_url: firstSqlText(row, ['primary_image_url', 'image_url']),
        total_qoh: totalQoh,
        is_in_stock: isInStock,
        system_sku: firstSqlText(row, ['system_sku', 'sku']),
        custom_sku: firstSqlText(row, ['custom_sku']),
        confidence: 'strong',
      }
    })
    .filter((match): match is NonNullable<typeof match> => match != null)
}

function productLinksFromPreviews(previews: Array<{
  id: string
  lightspeed_item_id?: string | null
  name: string
  sku: string | null
  product_url: string | null
}>) {
  return previews.map(preview => ({
    id: preview.id,
    lightspeed_item_id: preview.lightspeed_item_id ?? null,
    name: preview.name,
    sku: preview.sku,
    product_url: preview.product_url,
    has_live_listing: Boolean(preview.product_url),
  }))
}

async function maybeEmitInventoryProductCards(args: {
  supabase: SupabaseClient
  userId: string
  latestUserMessage: string
  query: string
  matches: InventoryProductCardMatch[]
  emit: Emit
  force?: boolean
}) {
  const showCards = args.force || shouldAutoEmitInventoryProductCards(args.latestUserMessage)
  const cardMatches = args.matches.filter(match => (
    match.is_in_stock === true || (match.total_qoh ?? 0) > 0
  ))
  if (
    !shouldEmitStoreProductPreviews(
      args.query || args.latestUserMessage,
      Math.min(cardMatches.length, GENIE_PRODUCT_CARD_LIMIT),
      cardMatches.filter(match => Boolean(match.primary_image_url)).length,
      showCards,
    )
  ) {
    return []
  }

  const previews = await buildInventoryProductPreviews(args.supabase, args.userId, cardMatches, {
    inStockOnly: true,
    requireApprovedImage: true,
  })
  const visiblePreviews = previews.filter(preview => (
    preview.in_stock === true && Boolean(preview.image)
  ))
  if (visiblePreviews.length > 0) args.emit({ event: 'products', products: visiblePreviews })
  return visiblePreviews
}

async function executeGeneratedLightspeedSql(userId: string, sql: string, limit: number) {
  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc(GENIE_LIGHTSPEED_SQL_RPC, {
    p_sql: sql,
    p_user_id: userId,
    p_limit: limit,
  })

  if (error) throw new Error(error.message)

  const result = isRecord(data) ? data : {}
  return {
    rows: coerceSqlRows(result.rows),
    row_count: typeof result.row_count === 'number' ? result.row_count : coerceSqlRows(result.rows).length,
    limit_applied: Boolean(result.limit_applied),
  }
}

async function searchLightspeedInventorySql(
  userId: string,
  args: {
    query: string
    limit?: number
    in_stock_only?: boolean
    include_archived?: boolean
  },
  emit?: Emit,
) {
  const query = String(args.query ?? '').trim()
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50)
  const terms = inventorySqlSearchTerms(query)
  const inStockOnly = args.in_stock_only ?? false
  const includeArchived = args.include_archived ?? false

  emitProgress(emit, 'lightspeed_inventory', `Searching the Lightspeed inventory mirror for "${query}"...`)

  if (!query || terms.length === 0) {
    return {
      source: 'lightspeed_inventory_sql',
      query,
      matches: [],
      returned_count: 0,
      complete: true,
      page_cap_reached: false,
      recheck_required: true,
      recheck_suggestions: ['Retry with a product name, SKU, barcode, brand, supplier, or category.'],
      message: 'Inventory search needs a product, SKU, barcode, brand, supplier, or category term.',
    }
  }

  const termPredicates = terms.map(term => {
    const literal = sqlLiteral(`%${term}%`)
    return [
      `search_text LIKE ${literal}`,
      `system_sku_l = ${sqlLiteral(term)}`,
      `custom_sku_l = ${sqlLiteral(term)}`,
      `manufacturer_sku_l = ${sqlLiteral(term)}`,
      `upc_l = ${sqlLiteral(term)}`,
      `ean_l = ${sqlLiteral(term)}`,
      /^\d+$/.test(term) ? `item_id = ${sqlLiteral(term)}` : null,
    ].filter(Boolean).join(' OR ')
  })

  const scoreParts = terms.flatMap(term => {
    const like = sqlLiteral(`%${term}%`)
    const literal = sqlLiteral(term)
    return [
      `CASE WHEN item_id = ${literal} THEN 180 ELSE 0 END`,
      `CASE WHEN system_sku_l = ${literal} OR custom_sku_l = ${literal} OR manufacturer_sku_l = ${literal} OR upc_l = ${literal} OR ean_l = ${literal} THEN 160 ELSE 0 END`,
      `CASE WHEN brand_l = ${literal} THEN 120 WHEN brand_l LIKE ${like} THEN 70 ELSE 0 END`,
      `CASE WHEN supplier_l = ${literal} THEN 90 WHEN supplier_l LIKE ${like} THEN 45 ELSE 0 END`,
      `CASE WHEN description_l LIKE ${like} THEN 50 ELSE 0 END`,
      `CASE WHEN category_l LIKE ${like} THEN 35 ELSE 0 END`,
      `CASE WHEN search_text LIKE ${like} THEN 10 ELSE 0 END`,
    ]
  })

  const sql = `
WITH base AS (
  SELECT
    *,
    lower(coalesce(item_id, '')) AS item_id_l,
    lower(coalesce(system_sku, '')) AS system_sku_l,
    lower(coalesce(custom_sku, '')) AS custom_sku_l,
    lower(coalesce(manufacturer_sku, '')) AS manufacturer_sku_l,
    lower(coalesce(upc, '')) AS upc_l,
    lower(coalesce(ean, '')) AS ean_l,
    lower(coalesce(description, name, '')) AS description_l,
    lower(coalesce(brand_name, '')) AS brand_l,
    lower(coalesce(supplier_name, '')) AS supplier_l,
    lower(coalesce(category_path, category_name, '')) AS category_l,
    lower(concat_ws(' ', item_id, system_sku, custom_sku, manufacturer_sku, upc, ean, description, brand_name, supplier_name, category_path, category_name)) AS search_text
  FROM ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}
  WHERE ${includeArchived ? 'true' : 'archived = false'}
    AND ${inStockOnly ? '(is_in_stock = true AND total_qoh > 0)' : 'true'}
),
scored AS (
  SELECT
    *,
    (${scoreParts.join(' + ')}) AS score
  FROM base
  WHERE ${termPredicates.map(predicate => `(${predicate})`).join(' OR ')}
)
SELECT
  item_id,
  description AS name,
  system_sku,
  custom_sku,
  manufacturer_sku,
  upc,
  ean,
  brand_id,
  brand_name,
  supplier_id,
  supplier_name,
  category_id,
  category_path AS category,
  default_price AS price,
  default_cost,
  avg_cost AS average_cost,
  COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0)) AS effective_cost,
  total_qoh,
  total_sellable,
  backorder,
  reorder_point,
  reorder_level,
  is_in_stock,
  archived,
  publish_to_ecom,
  primary_image_url,
  lightspeed_created_at,
  lightspeed_updated_at,
  inventory_updated_at,
  last_synced_at,
  score
FROM scored
WHERE score > 0
ORDER BY score DESC, is_in_stock DESC, total_qoh DESC, description ASC
LIMIT ${limit}`

  const result = await executeGeneratedLightspeedSql(userId, sql, limit)
  const topScore = Math.max(0, ...result.rows.map(row => toNum(row.score)))
  const strongThreshold = Math.max(45, topScore >= 120 ? topScore - 30 : topScore - 15)

  const matches = result.rows.map(row => {
    const price = numericSqlCell(row, 'price') ?? 0
    const effectiveCost = numericSqlCell(row, 'effective_cost')
    const retailProfit = effectiveCost != null ? price - effectiveCost : null
    const score = toNum(row.score)

    return {
      item_id: String(row.item_id ?? ''),
      name: String(row.name ?? row.item_id ?? ''),
      system_sku: row.system_sku,
      custom_sku: row.custom_sku,
      manufacturer_sku: row.manufacturer_sku,
      upc: row.upc,
      ean: row.ean,
      brand_id: row.brand_id,
      brand: row.brand_name,
      manufacturer: row.brand_name,
      supplier_id: row.supplier_id,
      supplier: row.supplier_name,
      category_id: row.category_id,
      category: row.category,
      price,
      default_cost: numericSqlCell(row, 'default_cost'),
      average_cost: numericSqlCell(row, 'average_cost'),
      effective_cost: effectiveCost,
      retail_gross_profit: retailProfit != null ? roundMoney(retailProfit) : null,
      retail_margin_percent: effectiveCost != null && price > 0 ? roundPercent((retailProfit ?? 0) / price * 100) : null,
      total_qoh: numericSqlCell(row, 'total_qoh') ?? 0,
      total_sellable: numericSqlCell(row, 'total_sellable') ?? 0,
      backorder: numericSqlCell(row, 'backorder') ?? 0,
      reorder_point: numericSqlCell(row, 'reorder_point') ?? 0,
      reorder_level: numericSqlCell(row, 'reorder_level') ?? 0,
      is_in_stock: row.is_in_stock,
      archived: row.archived,
      publish_to_ecom: row.publish_to_ecom,
      primary_image_url: row.primary_image_url,
      lightspeed_created_at: row.lightspeed_created_at,
      lightspeed_updated_at: row.lightspeed_updated_at,
      inventory_updated_at: row.inventory_updated_at,
      last_synced_at: row.last_synced_at,
      score,
      confidence: score >= strongThreshold ? 'strong' : 'possible',
      match_reasons: ['matched inventory mirror'],
      shops: [],
    }
  })

  const strongMatches = matches.filter(match => match.confidence === 'strong')

  return {
    source: 'lightspeed_inventory_sql',
    query,
    in_stock_only: inStockOnly,
    include_archived: includeArchived,
    matches,
    returned_count: matches.length,
    strong_match_count: strongMatches.length,
    strong_matches_total_qoh: roundMoney(strongMatches.reduce((sum, match) => sum + match.total_qoh, 0)),
    strong_matches_total_sellable: roundMoney(strongMatches.reduce((sum, match) => sum + match.total_sellable, 0)),
    complete: !result.limit_applied,
    page_cap_reached: result.limit_applied,
    recheck_required: matches.length === 0 || result.limit_applied,
    recheck_suggestions: matches.length === 0
      ? inventoryRecheckSuggestions(query)
      : result.limit_applied
        ? ['Narrow the inventory query by product, brand, supplier, category, SKU, barcode, or in_stock_only.']
        : [],
    available_columns: GENIE_LIGHTSPEED_INVENTORY_SQL_SCHEMA,
  }
}

async function getLightspeedStaleInventoryCashSql(
  userId: string,
  args: {
    query?: string
    no_sale_days?: number
    old_stock_days?: number
    min_stock_value?: number
    limit?: number
    history_start_date?: string
  },
  emit?: Emit,
) {
  const query = String(args.query ?? '').trim()
  const today = getStoreToday()
  const noSaleDays = Math.min(Math.max(Math.round(args.no_sale_days ?? 180), 1), 3650)
  const oldStockDays = Math.min(Math.max(Math.round(args.old_stock_days ?? 180), 1), 3650)
  const minStockValue = Math.max(0, Number(args.min_stock_value ?? 0))
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
  const recentStartDate = isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(today), -noSaleDays))
  const oldStockCutoffDate = isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(today), -oldStockDays))
  const historyStartDate = assertIsoDate(args.history_start_date ?? '2010-01-01', 'history_start_date')
  const queryTerms = query ? inventorySqlSearchTerms(query) : []
  const queryPredicate = queryTerms.length > 0
    ? `AND (${queryTerms.map(term => {
        const like = sqlLiteral(`%${term}%`)
        return `lower(concat_ws(' ', i.item_id, i.system_sku, i.custom_sku, i.manufacturer_sku, i.upc, i.ean, i.description, i.brand_name, i.supplier_name, i.category_path, i.category_name)) LIKE ${like}`
      }).join(' OR ')})`
    : ''

  emitProgress(emit, 'lightspeed_inventory', `Querying stale inventory cash from the SQL mirror...`)

  const sql = `
WITH recent_movement AS (
  SELECT
    item_id,
    MAX(complete_time) AS last_recent_sale_at,
    SUM(quantity) AS recent_units_sold
  FROM ${GENIE_LIGHTSPEED_SQL_VIEW}
  WHERE item_id IS NOT NULL
    AND item_id <> ''
    AND quantity > 0
    AND complete_time >= ${sqlLiteral(recentStartDate)}::date
    AND complete_time < (${sqlLiteral(today)}::date + interval '1 day')
  GROUP BY item_id
),
lifetime_movement AS (
  SELECT
    item_id,
    MAX(complete_time) AS last_sold_at,
    SUM(quantity) AS lifetime_units_sold,
    SUM(total) AS lifetime_revenue
  FROM ${GENIE_LIGHTSPEED_SQL_VIEW}
  WHERE item_id IS NOT NULL
    AND item_id <> ''
    AND quantity > 0
    AND complete_time >= ${sqlLiteral(historyStartDate)}::date
    AND complete_time < (${sqlLiteral(today)}::date + interval '1 day')
  GROUP BY item_id
),
inventory AS (
  SELECT
    i.*,
    COALESCE(NULLIF(i.avg_cost, 0), NULLIF(i.default_cost, 0), 0) AS unit_cost,
    COALESCE(NULLIF(i.avg_cost, 0), NULLIF(i.default_cost, 0), 0) * i.total_qoh AS stock_value,
    i.default_price * i.total_qoh AS retail_value
  FROM ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW} i
  WHERE i.archived = false
    AND i.is_in_stock = true
    AND i.total_qoh > 0
    AND (i.lightspeed_created_at IS NULL OR i.lightspeed_created_at < ${sqlLiteral(oldStockCutoffDate)}::date)
    ${queryPredicate}
)
SELECT
  i.item_id,
  i.description AS product,
  i.system_sku,
  i.custom_sku,
  i.manufacturer_sku,
  i.upc,
  i.brand_name AS brand,
  i.supplier_name AS supplier,
  i.category_path AS category,
  i.total_qoh AS qoh,
  i.total_sellable AS sellable,
  i.default_price AS retail_price,
  i.unit_cost,
  i.stock_value,
  i.retail_value,
  i.lightspeed_created_at,
  CASE
    WHEN i.lightspeed_created_at IS NULL THEN NULL
    ELSE (${sqlLiteral(today)}::date - i.lightspeed_created_at::date)
  END AS item_age_days,
  lm.last_sold_at,
  CASE
    WHEN lm.last_sold_at IS NULL THEN NULL
    ELSE (${sqlLiteral(today)}::date - lm.last_sold_at::date)
  END AS days_since_last_sale,
  COALESCE(lm.lifetime_units_sold, 0) AS lifetime_units_sold,
  COALESCE(lm.lifetime_revenue, 0) AS lifetime_revenue
FROM inventory i
LEFT JOIN recent_movement rm ON rm.item_id = i.item_id
LEFT JOIN lifetime_movement lm ON lm.item_id = i.item_id
WHERE rm.item_id IS NULL
  AND i.stock_value >= ${minStockValue}
ORDER BY i.stock_value DESC, i.total_qoh DESC, i.description ASC
LIMIT ${limit}`

  const result = await executeGeneratedLightspeedSql(userId, sql, limit)
  const rows = result.rows.map((row, index) => ({
    rank: index + 1,
    item_id: row.item_id,
    product: row.product,
    system_sku: row.system_sku,
    custom_sku: row.custom_sku,
    manufacturer_sku: row.manufacturer_sku,
    upc: row.upc,
    brand: row.brand,
    supplier: row.supplier,
    category: row.category,
    qoh: numericSqlCell(row, 'qoh') ?? 0,
    sellable: numericSqlCell(row, 'sellable') ?? 0,
    retail_price: numericSqlCell(row, 'retail_price') ?? 0,
    unit_cost: numericSqlCell(row, 'unit_cost') ?? 0,
    stock_value: roundMoney(numericSqlCell(row, 'stock_value') ?? 0),
    retail_value: roundMoney(numericSqlCell(row, 'retail_value') ?? 0),
    lightspeed_created_at: row.lightspeed_created_at,
    item_age_days: numericSqlCell(row, 'item_age_days'),
    last_sold_at: row.last_sold_at,
    days_since_last_sale: numericSqlCell(row, 'days_since_last_sale'),
    lifetime_units_sold: numericSqlCell(row, 'lifetime_units_sold') ?? 0,
    lifetime_revenue: roundMoney(numericSqlCell(row, 'lifetime_revenue') ?? 0),
  }))

  const totalStaleStockValue = rows.reduce((sum, row) => sum + row.stock_value, 0)
  const totalStaleQoh = rows.reduce((sum, row) => sum + row.qoh, 0)

  return {
    source: 'lightspeed_inventory_sql',
    query: query || null,
    date_context: {
      timezone: STORE_TIME_ZONE,
      today,
      no_sale_days: noSaleDays,
      no_sale_since: recentStartDate,
      old_stock_days: oldStockDays,
      old_stock_created_before: oldStockCutoffDate,
      history_start_date: historyStartDate,
      min_stock_value: minStockValue,
    },
    rows,
    returned_count: rows.length,
    row_limit: limit,
    limited: result.limit_applied,
    stale_item_count: rows.length,
    total_stale_stock_value: roundMoney(totalStaleStockValue),
    total_stale_qoh: roundMoney(totalStaleQoh),
    complete: !result.limit_applied,
    page_cap_reached: result.limit_applied,
    recheck_required: rows.length === 0 || result.limit_applied,
    recheck_suggestions: rows.length === 0
      ? ['Lower min_stock_value, reduce old_stock_days, reduce no_sale_days, or broaden the brand/category/product query.']
      : result.limit_applied
        ? ['Increase specificity by brand, supplier, category, or a higher min_stock_value.']
        : [],
  }
}

function salesReportProductScore(query: string, row: SalesReportLineRow): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  const normalizedQuery = normalizeText(query)
  const sku = normalizeText(row.sku)
  const itemId = normalizeText(row.item_id)

  if (normalizedQuery && sku && normalizedQuery === sku) {
    score += 140
    reasons.push('matched SKU')
  }
  if (normalizedQuery && itemId && normalizedQuery === itemId) {
    score += 130
    reasons.push('matched item ID')
  }

  const descriptionScore = fuzzyTextScore(query, row.description)
  if (descriptionScore > 0) {
    score += descriptionScore
    reasons.push('matched item description')
  }

  const categoryScore = fuzzyTextScore(query, row.category)
  if (categoryScore > 0) {
    score += Math.round(categoryScore * 0.8)
    reasons.push('matched category')
  }

  const skuScore = fuzzyTextScore(query, row.sku)
  if (skuScore > 0) {
    score += skuScore
    reasons.push('matched SKU')
  }

  const searchText = normalizeText([row.description, row.sku, row.category, row.item_id].filter(Boolean).join(' '))
  const meaningfulTokens = meaningfulQueryTokens(query)
  const matchedTokens = meaningfulTokens.filter(token => hasToken(searchText, token))
  if (meaningfulTokens.length > 0 && matchedTokens.length === meaningfulTokens.length) {
    score += 35
    reasons.push('matched all product terms')
  } else if (matchedTokens.length > 0) {
    score += matchedTokens.length * 8
    reasons.push('matched product terms')
  }

  if (queryHasBikeIntent(query) && searchText && !textHasBikeIntent(searchText)) {
    score -= 25
  }

  return { score: Math.max(0, score), reasons: Array.from(new Set(reasons)) }
}

function filterSalesReportProductRows(query: string, rows: SalesReportLineRow[]) {
  const scored = rows
    .map(row => ({ row, ...salesReportProductScore(query, row) }))
    .filter(result => result.score > 0 && sqlPositiveQuantity(result.row) > 0)
    .sort((a, b) => b.score - a.score || salesReportLineLabel(a.row).localeCompare(salesReportLineLabel(b.row)))
  const topScore = scored[0]?.score ?? 0
  const threshold = topScore >= 100
    ? Math.max(65, topScore - 30)
    : topScore >= 60
      ? Math.max(40, topScore - 20)
      : topScore >= 25
        ? topScore
        : 0
  const matched = threshold > 0 ? scored.filter(result => result.score >= threshold).map(result => result.row) : []

  return {
    matchedRows: matched,
    scored,
    topScore,
    threshold,
  }
}

function salesReportProductLookupPayload(query: string, candidateRows: SalesReportLineRow[], matchedRows: SalesReportLineRow[]) {
  const byItem = new Map<string, {
    item_id: string
    name: string
    sku: string | null
    category: string | null
    score: number
    match_reasons: string[]
  }>()

  for (const row of matchedRows) {
    const key = String(row.item_id || row.sku || row.description || 'unknown')
    const match = salesReportProductScore(query, row)
    const prev = byItem.get(key)
    if (!prev || match.score > prev.score) {
      byItem.set(key, {
        item_id: String(row.item_id || key),
        name: salesReportLineLabel(row),
        sku: row.sku ?? null,
        category: row.category ?? null,
        score: match.score,
        match_reasons: match.reasons,
      })
    }
  }

  return {
    source: SALES_REPORT_SQL_SOURCE,
    search_terms: salesReportSearchTerms(query),
    candidates_found: candidateRows.length,
    matched_items: Array.from(byItem.values()).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    top_score: Math.max(0, ...Array.from(byItem.values()).map(row => row.score)),
    note: 'Matched against stored sale-line description, SKU, item ID, and category fields in lightspeed_sales_report_lines.',
  }
}

function salesReportProductOrFilter(query: string): string | null {
  return sqlTextOrFilter(salesReportSearchTerms(query), ['description', 'sku', 'category', 'item_id'])
}

async function getLightspeedSalesSummarySql(
  userId: string,
  args: { start_date: string; end_date: string; cost_method?: CostMethod; max_pages?: number },
  emit?: Emit,
) {
  const startDate = assertIsoDate(args.start_date, 'start_date')
  const endDate = assertIsoDate(args.end_date, 'end_date')
  emitProgress(emit, 'lightspeed_sales', `Querying sales report SQL from ${startDate} to ${endDate}...`)
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    emit,
    progressLabel: 'Reading completed sale lines',
  })
  const sales = groupSalesReportRows(result.rows)
  emitProgress(emit, 'lightspeed_sales', `Aggregating ${plural(sales.length, 'sale')} from SQL rows...`)

  const grossSales = sales.reduce((sum, sale) => sum + sale.total, 0)
  const subtotal = sales.reduce((sum, sale) => sum + sale.subtotal, 0)
  const tax = sales.reduce((sum, sale) => sum + sale.tax, 0)
  const discounts = sales.reduce((sum, sale) => sum + sale.discounts, 0)
  const totalCost = sales.reduce((sum, sale) => sum + sale.total_cost, 0)
  const profit = profitMetrics(subtotal, totalCost)

  return {
    source: SALES_REPORT_SQL_SOURCE,
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: args.cost_method ?? 'avg',
    cost_source: SALES_REPORT_COST_SOURCE,
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
    ...sqlCompletionFields(result),
  }
}

async function getLightspeedSalesListSql(
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
  const includeLines = args.include_line_items ?? true
  const includeProfit = args.include_profit ?? false
  const limit = Math.min(Math.max(args.limit ?? 300, 1), 500)
  emitProgress(emit, 'lightspeed_sales', `Querying sale transactions from the sales report table for ${startDate} to ${endDate}...`)
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    order: 'desc',
    emit,
    progressLabel: 'Reading transaction rows',
  })
  const sales = groupSalesReportRows(result.rows)
  const rows = sales.slice(0, limit).map(sale => ({
    sale_id: sale.sale_id,
    completed_at: sale.completed_at,
    completed_at_utc: sale.completed_at_utc,
    ticket_number: sale.ticket_number,
    reference_number: sale.reference_number,
    customer_id: sale.customer_id,
    customer_name: sale.customer_name,
    items: includeLines ? salesReportItemsSummary(sale.lines) : null,
    units: includeLines ? roundMoney(sale.units) : null,
    line_count: includeLines ? sale.line_count : null,
    subtotal: roundMoney(sale.subtotal),
    tax: roundMoney(sale.tax),
    discounts: roundMoney(sale.discounts),
    total: roundMoney(sale.total),
    total_cost: includeProfit ? roundMoney(sale.total_cost) : null,
    gross_profit: includeProfit ? roundMoney(sale.gross_profit) : null,
    gross_margin_percent: includeProfit && sale.subtotal > 0 ? roundPercent((sale.gross_profit / sale.subtotal) * 100) : null,
    shop_id: null,
    register_id: null,
    employee_id: sale.employee_id,
  }))
  const netSales = sales.reduce((sum, sale) => sum + sale.subtotal, 0)
  const totalCost = sales.reduce((sum, sale) => sum + sale.total_cost, 0)

  return {
    source: SALES_REPORT_SQL_SOURCE,
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    total_sales: sales.length,
    returned_count: rows.length,
    row_limit: limit,
    limited: sales.length > rows.length,
    include_line_items: includeLines,
    include_profit: includeProfit,
    cost_method: args.cost_method ?? 'avg',
    cost_source: SALES_REPORT_COST_SOURCE,
    sales: rows,
    gross_sales: roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0)),
    net_sales: roundMoney(netSales),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(netSales - totalCost),
    gross_margin_percent: netSales > 0 ? roundPercent(((netSales - totalCost) / netSales) * 100) : null,
    ...sqlCompletionFields(result),
  }
}

async function getLightspeedSalesTimeseriesSql(
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
  const rangeStart = isoDateToUtcDate(startDate)
  const rangeEnd = isoDateToUtcDate(endDate)
  emitProgress(emit, 'lightspeed_sales', `Querying SQL sales rows for ${salesMetricLabel(metric).toLowerCase()} by ${bucket}...`)
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    order: 'asc',
    emit,
    progressLabel: 'Reading sales chart rows',
  })
  const sales = groupSalesReportRows(result.rows)

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
    bucketRows.set(isoDateFromUtcDate(cursor), {
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
    if (!sale.completed_at_utc) continue
    const saleDateText = storeDateFromDate(new Date(sale.completed_at_utc))
    const saleDate = isoDateToUtcDate(saleDateText)
    const key = isoDateFromUtcDate(startOfSalesBucket(saleDate, bucket))
    const row = bucketRows.get(key)
    if (!row) continue

    row.sale_count += 1
    row.gross_sales += sale.total
    row.net_sales += sale.subtotal
    row.total_cost += sale.total_cost
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
  const netSales = sales.reduce((sum, sale) => sum + sale.subtotal, 0)
  const totalCost = sales.reduce((sum, sale) => sum + sale.total_cost, 0)

  return {
    source: SALES_REPORT_SQL_SOURCE,
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: args.cost_method ?? 'avg',
    cost_source: SALES_REPORT_COST_SOURCE,
    bucket,
    metric,
    metric_label: salesMetricLabel(metric),
    bucket_label: salesBucketLabelTitle(bucket),
    buckets,
    sale_count: sales.length,
    gross_sales: roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0)),
    net_sales: roundMoney(netSales),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(netSales - totalCost),
    gross_margin_percent: netSales > 0 ? roundPercent(((netSales - totalCost) / netSales) * 100) : null,
    ...sqlCompletionFields(result),
  }
}

async function getLightspeedTopSoldProductsSql(
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
  const query = String(args.query ?? '').trim()
  const rankBy = args.rank_by ?? 'quantity'
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20)
  emitProgress(
    emit,
    'lightspeed_sales',
    query
      ? `Querying matching sale lines for "${query}" from SQL...`
      : `Querying sold product lines from SQL for ${startDate} to ${endDate}...`,
  )
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    orFilter: query ? salesReportProductOrFilter(query) : null,
    emit,
    progressLabel: query ? 'Reading candidate product lines' : 'Reading product sale lines',
  })
  const filtered = query ? filterSalesReportProductRows(query, result.rows) : null
  const rowsToAggregate = (query ? filtered?.matchedRows ?? [] : result.rows)
    .filter(row => sqlPositiveQuantity(row) > 0)
  const itemLookup = query ? salesReportProductLookupPayload(query, result.rows, rowsToAggregate) : null

  const byItem = new Map<string, {
    item_id: string
    name: string
    sku: string | null
    category: string | null
    units_sold: number
    revenue: number
    total_cost: number
    gross_profit: number
    sale_line_count: number
    current_default_cost: number | null
    current_average_cost: number | null
  }>()
  let excludedManualLines = 0

  for (const row of rowsToAggregate) {
    const itemId = String(row.item_id || row.sku || row.description || 'unknown')
    if (!args.include_manual_lines && (!row.item_id || row.item_id === '0')) {
      excludedManualLines++
      continue
    }

    const quantity = sqlPositiveQuantity(row)
    const revenue = sqlLineRevenue(row)
    const totalCost = sqlLineCost(row)
    const prev = byItem.get(itemId) ?? {
      item_id: itemId,
      name: salesReportLineLabel(row),
      sku: row.sku ?? null,
      category: row.category ?? null,
      units_sold: 0,
      revenue: 0,
      total_cost: 0,
      gross_profit: 0,
      sale_line_count: 0,
      current_default_cost: null,
      current_average_cost: null,
    }

    prev.units_sold += quantity
    prev.revenue += revenue
    prev.total_cost += totalCost
    prev.gross_profit += revenue - totalCost
    prev.sale_line_count += 1
    byItem.set(itemId, prev)
  }

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
    .slice(0, limit)
  const netSales = Array.from(byItem.values()).reduce((sum, row) => sum + row.revenue, 0)
  const totalCost = Array.from(byItem.values()).reduce((sum, row) => sum + row.total_cost, 0)

  return {
    source: SALES_REPORT_SQL_SOURCE,
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: args.cost_method ?? 'avg',
    cost_source: SALES_REPORT_COST_SOURCE,
    rank_by: rankBy,
    query: query || null,
    sql_strategy: query ? 'date_range_plus_sale_line_text_filter' : 'date_range_sale_line_aggregate',
    sales_scanned: new Set(rowsToAggregate.map(row => row.sale_id)).size,
    matched_sale_lines: rowsToAggregate.length - excludedManualLines,
    excluded_manual_lines: excludedManualLines,
    net_sales: roundMoney(netSales),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(netSales - totalCost),
    gross_margin_percent: netSales > 0 ? roundPercent(((netSales - totalCost) / netSales) * 100) : null,
    top_products: top,
    item_lookup: itemLookup,
    recheck_required: Boolean(query && top.length === 0) || result.row_limit_reached || !result.coverage.complete,
    recheck_suggestions: query && top.length === 0
      ? [
          'Retry with a shorter product, category, SKU, model, brand, or service term found in sale-line descriptions.',
          'If the brand is not stored in sale-line descriptions, wait for the inventory table to add manufacturer/brand fields.',
        ]
      : result.row_limit_reached || !result.coverage.complete
        ? ['The SQL sales report is still backfilling or reached the row limit; wait for backfill completion or narrow the date range.']
        : [],
    ...sqlCompletionFields(result),
  }
}

async function getLightspeedSoldProductTimeseriesSql(
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
  const rangeStart = isoDateToUtcDate(startDate)
  const rangeEnd = isoDateToUtcDate(endDate)
  emitProgress(emit, 'lightspeed_sales', `Querying SQL sale lines for "${query}" by ${bucket}...`)
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    order: 'asc',
    orFilter: salesReportProductOrFilter(query),
    emit,
    progressLabel: 'Reading matching trend lines',
  })
  const filtered = filterSalesReportProductRows(query, result.rows)
  const rowsToAggregate = filtered.matchedRows.filter(row => sqlPositiveQuantity(row) > 0)

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
    bucketRows.set(isoDateFromUtcDate(cursor), {
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

  for (const row of rowsToAggregate) {
    if (!row.complete_time) continue
    const itemId = String(row.item_id || row.sku || row.description || 'unknown')
    if (!args.include_manual_lines && (!row.item_id || row.item_id === '0')) {
      excludedManualLines++
      continue
    }

    const saleDate = isoDateToUtcDate(storeDateFromDate(new Date(row.complete_time)))
    const bucketRow = bucketRows.get(isoDateFromUtcDate(startOfSalesBucket(saleDate, bucket)))
    if (!bucketRow) continue

    const quantity = sqlPositiveQuantity(row)
    const revenue = sqlLineRevenue(row)
    const totalCost = sqlLineCost(row)
    bucketRow.units_sold += quantity
    bucketRow.revenue += revenue
    bucketRow.total_cost += totalCost
    bucketRow.gross_profit += revenue - totalCost
    bucketRow.sale_line_count += 1

    const product = matchedProducts.get(itemId) ?? {
      item_id: itemId,
      name: salesReportLineLabel(row),
      units_sold: 0,
      revenue: 0,
      total_cost: 0,
      gross_profit: 0,
      sale_line_count: 0,
      current_default_cost: null,
      current_average_cost: null,
    }
    product.units_sold += quantity
    product.revenue += revenue
    product.total_cost += totalCost
    product.gross_profit += revenue - totalCost
    product.sale_line_count += 1
    matchedProducts.set(itemId, product)
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
  const totals = buckets.reduce((sum, row) => ({
    units_sold: sum.units_sold + row.units_sold,
    revenue: sum.revenue + row.revenue,
    total_cost: sum.total_cost + row.total_cost,
    gross_profit: sum.gross_profit + row.gross_profit,
    sale_line_count: sum.sale_line_count + row.sale_line_count,
  }), { units_sold: 0, revenue: 0, total_cost: 0, gross_profit: 0, sale_line_count: 0 })

  return {
    source: SALES_REPORT_SQL_SOURCE,
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    cost_method: args.cost_method ?? 'avg',
    cost_source: SALES_REPORT_COST_SOURCE,
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
    matched_item_candidates: salesReportProductLookupPayload(query, result.rows, rowsToAggregate).matched_items,
    item_lookup: salesReportProductLookupPayload(query, result.rows, rowsToAggregate),
    sales_scanned: new Set(rowsToAggregate.map(row => row.sale_id)).size,
    matched_sale_lines: rowsToAggregate.length - excludedManualLines,
    excluded_manual_lines: excludedManualLines,
    recheck_required: rowsToAggregate.length === 0 || result.row_limit_reached || !result.coverage.complete,
    recheck_suggestions: rowsToAggregate.length === 0
      ? [
          'Retry with a shorter product, category, SKU, model, brand, or service term stored in sale-line descriptions.',
          'If this is a current inventory/brand field not present in sale lines, wait for the inventory table.',
        ]
      : result.row_limit_reached || !result.coverage.complete
        ? ['The SQL sales report is still backfilling or reached the row limit; wait for backfill completion or narrow the date range.']
        : [],
    ...sqlCompletionFields(result),
  }
}

function salesReportCustomerBase(customerId: string | null, name: string | null, extra?: Record<string, string | number | boolean | null>) {
  return {
    customer_id: customerId || '0',
    name: name || (customerId && customerId !== '0' ? `Customer ${customerId}` : 'Walk-in / no customer'),
    company: null,
    phones: [] as Array<{ number: string; use_type: string | null }>,
    emails: [] as Array<{ address: string; use_type: string | null }>,
    addresses: [] as Array<{
      address1: string
      address2: string | null
      city: string | null
      state: string | null
      zip: string | null
      country: string | null
    }>,
    no_email: false,
    no_phone: false,
    no_mail: false,
    created_at: null,
    updated_at: null,
    archived: false,
    ...extra,
  }
}

async function fetchSalesReportCustomerRows(args: {
  userId: string
  query?: string
  customerId?: string
  maxRows?: number
  emit?: Emit
}): Promise<{ rows: SalesReportLineRow[]; coverage: SalesReportCoverage; row_limit_reached: boolean; sql_pages_fetched: number }> {
  const admin = createServiceRoleClient()
  const maxRows = Math.min(Math.max(args.maxRows ?? 20_000, 1), SALES_REPORT_SQL_HARD_MAX_ROWS)
  const terms = args.query ? Array.from(new Set([normalizeText(args.query), ...queryTokens(args.query)].filter(term => term.length >= 2))) : []
  const orFilter = args.query ? sqlTextOrFilter(terms, ['customer_full_name', 'customer_id']) : null
  const rows: SalesReportLineRow[] = []
  let sqlPagesFetched = 0
  let rowLimitReached = false

  for (let from = 0; from < maxRows; from += SALES_REPORT_SQL_PAGE_SIZE) {
    const to = Math.min(from + SALES_REPORT_SQL_PAGE_SIZE - 1, maxRows - 1)
    let query = admin
      .from('lightspeed_sales_report_lines')
      .select(SALES_REPORT_SQL_COLUMNS)
      .eq('user_id', args.userId)
      .not('customer_id', 'is', null)
      .order('complete_time', { ascending: false })
      .range(from, to)

    if (args.customerId) query = query.eq('customer_id', args.customerId)
    if (orFilter) query = query.or(orFilter)

    const { data, error } = await query
    if (error) throw new Error(`Failed to query Lightspeed customer rows from sales report table: ${error.message}`)
    const pageRows = (data ?? []) as unknown as SalesReportLineRow[]
    rows.push(...pageRows)
    sqlPagesFetched++
    emitProgress(args.emit, 'lightspeed_customers', `Reading customer rows from SQL: ${plural(rows.length, 'row')}...`)
    if (pageRows.length < SALES_REPORT_SQL_PAGE_SIZE) break
    if (rows.length >= maxRows) rowLimitReached = true
  }

  return {
    rows,
    coverage: await getSalesReportCoverage(args.userId),
    row_limit_reached: rowLimitReached,
    sql_pages_fetched: sqlPagesFetched,
  }
}

function customerScoreFromSalesReport(query: string, row: { customer_id: string | null; customer_full_name: string | null }) {
  if (!query.trim()) return { score: 1, reasons: ['listed from sales report'] }
  let score = 0
  const reasons: string[] = []
  if (row.customer_id && normalizeText(query) === normalizeText(row.customer_id)) {
    score += 120
    reasons.push('matched customer ID')
  }
  const nameScore = fuzzyTextScore(query, row.customer_full_name)
  if (nameScore > 0) {
    score += nameScore
    reasons.push('matched customer name')
  }
  return { score, reasons }
}

async function searchLightspeedCustomersSql(
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
  emitProgress(emit, 'lightspeed_customers', query ? `Searching SQL sales customers for "${query}"...` : 'Listing customers from SQL sales report...')
  const result = await fetchSalesReportCustomerRows({ userId, query, emit })
  const byCustomer = new Map<string, {
    customer_id: string
    customer_full_name: string | null
    sale_ids: Set<string>
    gross_sales: number
    first_purchase_at: string | null
    last_purchase_at: string | null
  }>()

  for (const row of result.rows) {
    const customerId = String(row.customer_id || '').trim()
    if (!customerId || customerId === '0') continue
    const prev = byCustomer.get(customerId) ?? {
      customer_id: customerId,
      customer_full_name: row.customer_full_name ?? null,
      sale_ids: new Set<string>(),
      gross_sales: 0,
      first_purchase_at: null,
      last_purchase_at: null,
    }
    prev.customer_full_name = prev.customer_full_name ?? row.customer_full_name ?? null
    prev.sale_ids.add(String(row.sale_id))
    prev.gross_sales += sqlLineTotal(row)
    if (!prev.first_purchase_at || (row.complete_time && row.complete_time < prev.first_purchase_at)) prev.first_purchase_at = row.complete_time
    if (!prev.last_purchase_at || (row.complete_time && row.complete_time > prev.last_purchase_at)) prev.last_purchase_at = row.complete_time
    byCustomer.set(customerId, prev)
  }

  const scored = Array.from(byCustomer.values())
    .map(customer => {
      const match = customerScoreFromSalesReport(query, {
        customer_id: customer.customer_id,
        customer_full_name: customer.customer_full_name,
      })
      return { customer, ...match }
    })
    .filter(row => !query || row.score > 0)
    .sort((a, b) => b.score - a.score || (a.customer.customer_full_name ?? '').localeCompare(b.customer.customer_full_name ?? ''))

  const matches = scored.slice(0, limit).map(row => ({
    ...salesReportCustomerBase(row.customer.customer_id, row.customer.customer_full_name, {
      score: row.score,
      confidence: row.score >= Math.max(40, (scored[0]?.score ?? 0) - 20) ? 'strong' : 'possible',
      gross_sales: roundMoney(row.customer.gross_sales),
      sale_count: row.customer.sale_ids.size,
    }),
    match_reasons: row.reasons,
    first_purchase_at: row.customer.first_purchase_at ? formatStoreDateTime(row.customer.first_purchase_at) : null,
    last_purchase_at: row.customer.last_purchase_at ? formatStoreDateTime(row.customer.last_purchase_at) : null,
  }))

  return {
    source: SALES_REPORT_SQL_SOURCE,
    query: query || null,
    include_archived: false,
    created_range: args.created_start_date || args.created_end_date
      ? {
          start_date: args.created_start_date ?? null,
          end_date: args.created_end_date ?? null,
          timezone: STORE_TIME_ZONE,
          supported: false,
          note: 'Customer create dates are not stored in lightspeed_sales_report_lines.',
        }
      : null,
    returned_count: matches.length,
    candidate_count: scored.length,
    matches,
    sql_pages_fetched: result.sql_pages_fetched,
    complete: result.coverage.complete && !result.row_limit_reached,
    page_cap_reached: result.row_limit_reached,
    row_limit_reached: result.row_limit_reached,
    sales_report_coverage: result.coverage,
    contact_details_available: false,
    message: 'Customer phone/email/address fields are not available until a customer/contact table is added.',
    recheck_required: matches.length === 0 || result.row_limit_reached || !result.coverage.complete,
    recheck_suggestions: matches.length === 0
      ? customerRecheckSuggestions(query)
      : result.row_limit_reached || !result.coverage.complete
        ? ['The SQL sales report is still backfilling or reached the row limit; wait for backfill completion or narrow the request.']
        : [],
  }
}

async function getLightspeedCustomerProfileSql(
  userId: string,
  args: { customer_id: string },
  emit?: Emit,
) {
  const customerId = String(args.customer_id || '').trim()
  if (!customerId) return { error: 'customer_id is required.' }
  emitProgress(emit, 'lightspeed_customers', `Looking up customer ${customerId} in the SQL sales report...`)
  const result = await fetchSalesReportCustomerRows({ userId, customerId, maxRows: 5000, emit })
  const first = result.rows.find(row => String(row.customer_id) === customerId)

  return {
    source: SALES_REPORT_SQL_SOURCE,
    customer: salesReportCustomerBase(customerId, first?.customer_full_name ?? null),
    contact_details_available: false,
    message: first
      ? 'This profile is derived from sales report rows. Phone/email/address fields are not available until a customer/contact table is added.'
      : 'No customer sales rows were found for this customer ID in the SQL sales report table.',
    complete: result.coverage.complete && !result.row_limit_reached,
    page_cap_reached: result.row_limit_reached,
    sales_report_coverage: result.coverage,
  }
}

async function resolveSalesReportCustomer(
  userId: string,
  args: { customer_id?: string; query?: string },
  emit?: Emit,
) {
  if (args.customer_id) {
    const profile = await getLightspeedCustomerProfileSql(userId, { customer_id: args.customer_id }, emit)
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

  const search = await searchLightspeedCustomersSql(userId, { query: args.query, limit: 5 }, emit)
  const candidates = (Array.isArray(search.matches) ? search.matches : []) as Array<ReturnType<typeof salesReportCustomerBase> & { score?: number }>
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

async function getLightspeedCustomerSalesSql(
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
  const resolved = await resolveSalesReportCustomer(userId, { customer_id: args.customer_id, query: args.query }, emit)
  if (resolved.status !== 'resolved') {
    return {
      source: SALES_REPORT_SQL_SOURCE,
      status: resolved.status,
      date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
      candidates: resolved.candidates,
      recheck_required: resolved.status === 'not_found',
      recheck_suggestions: resolved.status === 'ambiguous'
        ? ['Ask the user to choose from the candidate customers before fetching sales.']
        : customerRecheckSuggestions(args.query),
      message: resolved.status === 'ambiguous'
        ? 'Multiple sales-report customers matched. Ask the user to choose a customer.'
        : 'No matching customer was found in the SQL sales report table.',
    }
  }

  const includeLines = args.include_line_items ?? true
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
  emitProgress(emit, 'lightspeed_customers', `Querying SQL sales for ${resolved.customer.name} from ${startDate} to ${endDate}...`)
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    customerId: resolved.customer_id,
    order: 'desc',
    emit,
    phase: 'lightspeed_customers',
    progressLabel: 'Reading customer sale rows',
  })
  const sales = groupSalesReportRows(result.rows)
  const rows = sales.slice(0, limit).map(sale => ({
    sale_id: sale.sale_id,
    completed_at: sale.completed_at,
    ticket_number: sale.ticket_number,
    reference_number: sale.reference_number,
    items: includeLines ? salesReportItemsSummary(sale.lines) : null,
    units: includeLines ? roundMoney(sale.units) : null,
    line_count: includeLines ? sale.line_count : null,
    subtotal: roundMoney(sale.subtotal),
    tax: roundMoney(sale.tax),
    discounts: roundMoney(sale.discounts),
    total: roundMoney(sale.total),
  }))
  const grossSales = sales.reduce((sum, sale) => sum + sale.total, 0)
  const firstPurchase = sales[sales.length - 1]
  const lastPurchase = sales[0]

  return {
    source: SALES_REPORT_SQL_SOURCE,
    status: 'resolved',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    customer: resolved.customer,
    total_sales: sales.length,
    returned_count: rows.length,
    row_limit: limit,
    limited: sales.length > rows.length,
    include_line_items: includeLines,
    gross_sales: roundMoney(grossSales),
    average_sale_value: sales.length > 0 ? roundMoney(grossSales / sales.length) : 0,
    first_purchase_at: firstPurchase?.completed_at ?? null,
    last_purchase_at: lastPurchase?.completed_at ?? null,
    sales: rows,
    ...sqlCompletionFields(result),
  }
}

async function getLightspeedTopCustomersSql(
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
  emitProgress(emit, 'lightspeed_customers', `Aggregating top customers from SQL sales report for ${startDate} to ${endDate}...`)
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    emit,
    phase: 'lightspeed_customers',
    progressLabel: 'Reading customer aggregate rows',
  })
  const sales = groupSalesReportRows(result.rows)
  const byCustomer = new Map<string, {
    customer_id: string
    name: string
    gross_sales: number
    sale_ids: Set<string>
    first_purchase_at: string | null
    last_purchase_at: string | null
  }>()
  let walkInSales = 0

  for (const sale of sales) {
    const customerId = String(sale.customer_id || '').trim()
    if (!customerId || customerId === '0') {
      walkInSales++
      if (!args.include_walk_in) continue
    }
    const id = customerId || '0'
    const prev = byCustomer.get(id) ?? {
      customer_id: id,
      name: sale.customer_name || (id === '0' ? 'Walk-in / no customer' : `Customer ${id}`),
      gross_sales: 0,
      sale_ids: new Set<string>(),
      first_purchase_at: null,
      last_purchase_at: null,
    }
    prev.gross_sales += sale.total
    prev.sale_ids.add(sale.sale_id)
    if (sale.completed_at_utc) {
      if (!prev.first_purchase_at || sale.completed_at_utc < prev.first_purchase_at) prev.first_purchase_at = sale.completed_at_utc
      if (!prev.last_purchase_at || sale.completed_at_utc > prev.last_purchase_at) prev.last_purchase_at = sale.completed_at_utc
    }
    byCustomer.set(id, prev)
  }

  const ranked = Array.from(byCustomer.values())
    .map(row => ({
      ...row,
      sale_count: row.sale_ids.size,
      gross_sales: roundMoney(row.gross_sales),
      average_sale_value: row.sale_ids.size > 0 ? roundMoney(row.gross_sales / row.sale_ids.size) : 0,
    }))
    .sort((a, b) => (
      rankBy === 'sale_count'
        ? b.sale_count - a.sale_count || b.gross_sales - a.gross_sales
        : rankBy === 'average_sale_value'
          ? b.average_sale_value - a.average_sale_value || b.gross_sales - a.gross_sales
          : b.gross_sales - a.gross_sales || b.sale_count - a.sale_count
    ))
    .slice(0, limit)

  return {
    source: SALES_REPORT_SQL_SOURCE,
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    rank_by: rankBy,
    total_sales_scanned: sales.length,
    customer_count: byCustomer.size,
    walk_in_or_unassigned_sales: walkInSales,
    include_walk_in: Boolean(args.include_walk_in),
    include_contact_details: Boolean(args.include_contact_details),
    contact_details_available: false,
    top_customers: ranked.map((row, index) => ({
      rank: index + 1,
      customer_id: row.customer_id,
      name: row.name,
      company: null,
      phones: [] as Array<{ number: string; use_type: string | null }>,
      emails: [] as Array<{ address: string; use_type: string | null }>,
      gross_sales: row.gross_sales,
      sale_count: row.sale_count,
      average_sale_value: row.average_sale_value,
      first_purchase_at: row.first_purchase_at ? formatStoreDateTime(row.first_purchase_at) : null,
      last_purchase_at: row.last_purchase_at ? formatStoreDateTime(row.last_purchase_at) : null,
    })),
    gross_sales: roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0)),
    ...sqlCompletionFields(result),
  }
}

async function getLightspeedProductPurchasersSql(
  userId: string,
  args: {
    query: string
    start_date?: string
    end_date?: string
    limit?: number
    include_contact_details?: boolean
    include_walk_in?: boolean
    rank_by?: 'matching_revenue' | 'sale_count' | 'units_sold' | 'last_purchase'
    max_item_matches?: number
    max_pages?: number
  },
  emit?: Emit,
) {
  const query = String(args.query || '').trim()
  if (!query) return { error: 'query is required.' }
  const startDate = assertIsoDate(args.start_date ?? '2010-01-01', 'start_date')
  const endDate = assertIsoDate(args.end_date ?? getStoreToday(), 'end_date')
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100)
  const rankBy = args.rank_by ?? 'last_purchase'
  emitProgress(emit, 'lightspeed_customers', `Finding purchasers of "${query}" from SQL sale lines...`)
  const result = await fetchSalesReportRows({
    userId,
    startDate,
    endDate,
    orFilter: salesReportProductOrFilter(query),
    emit,
    phase: 'lightspeed_customers',
    progressLabel: 'Reading purchaser candidate rows',
  })
  const filtered = filterSalesReportProductRows(query, result.rows)
  const matchingRows = filtered.matchedRows.filter(row => sqlPositiveQuantity(row) > 0)
  const itemLookup = salesReportProductLookupPayload(query, result.rows, matchingRows)

  if (matchingRows.length === 0) {
    return {
      source: SALES_REPORT_SQL_SOURCE,
      query,
      status: 'no_product_match',
      date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
      matched_products: [],
      customers: [],
      customer_count: 0,
      sales_scanned: 0,
      matched_sale_lines: 0,
      item_lookup: itemLookup,
      recheck_required: true,
      recheck_suggestions: [
        'Retry with a shorter product, category, SKU, model, brand, or service term stored in sale-line descriptions.',
        'If the request relies on manufacturer/brand fields not stored in sale lines, wait for the inventory table.',
      ],
      message: `No matching sales report sale lines found for "${query}".`,
      ...sqlCompletionFields(result),
    }
  }

  const byCustomer = new Map<string, {
    customer_id: string
    name: string
    company: string | null
    matching_revenue: number
    units_sold: number
    sale_ids: Set<string>
    matched_sale_line_count: number
    first_purchase_at: string | null
    last_purchase_at: string | null
    products: Map<string, { item_id: string; name: string; units_sold: number; revenue: number }>
  }>()
  let walkInSales = 0

  for (const row of matchingRows) {
    const customerId = String(row.customer_id || '').trim()
    if (!customerId || customerId === '0') {
      walkInSales++
      if (!args.include_walk_in) continue
    }
    const id = customerId || '0'
    const itemId = String(row.item_id || row.sku || row.description || 'unknown')
    const prev = byCustomer.get(id) ?? {
      customer_id: id,
      name: row.customer_full_name || (id === '0' ? 'Walk-in / no customer' : `Customer ${id}`),
      company: null,
      matching_revenue: 0,
      units_sold: 0,
      sale_ids: new Set<string>(),
      matched_sale_line_count: 0,
      first_purchase_at: null,
      last_purchase_at: null,
      products: new Map<string, { item_id: string; name: string; units_sold: number; revenue: number }>(),
    }
    prev.sale_ids.add(String(row.sale_id))
    if (row.complete_time) {
      if (!prev.first_purchase_at || row.complete_time < prev.first_purchase_at) prev.first_purchase_at = row.complete_time
      if (!prev.last_purchase_at || row.complete_time > prev.last_purchase_at) prev.last_purchase_at = row.complete_time
    }

    const quantity = sqlPositiveQuantity(row)
    const revenue = sqlLineRevenue(row)
    const product = prev.products.get(itemId) ?? {
      item_id: itemId,
      name: salesReportLineLabel(row),
      units_sold: 0,
      revenue: 0,
    }
    product.units_sold += quantity
    product.revenue += revenue
    prev.products.set(itemId, product)
    prev.units_sold += quantity
    prev.matching_revenue += revenue
    prev.matched_sale_line_count += 1
    byCustomer.set(id, prev)
  }

  const ranked = Array.from(byCustomer.values())
    .map(row => ({
      customer_id: row.customer_id,
      name: row.name,
      company: row.company,
      matching_revenue: roundMoney(row.matching_revenue),
      units_sold: roundMoney(row.units_sold),
      sale_count: row.sale_ids.size,
      matched_sale_line_count: row.matched_sale_line_count,
      first_purchase_at: row.first_purchase_at,
      last_purchase_at: row.last_purchase_at,
      matched_products: Array.from(row.products.values())
        .map(product => ({
          ...product,
          units_sold: roundMoney(product.units_sold),
          revenue: roundMoney(product.revenue),
        }))
        .sort((a, b) => b.units_sold - a.units_sold || b.revenue - a.revenue),
    }))
    .sort((a, b) => {
      if (rankBy === 'matching_revenue') return b.matching_revenue - a.matching_revenue || b.units_sold - a.units_sold
      if (rankBy === 'sale_count') return b.sale_count - a.sale_count || b.matching_revenue - a.matching_revenue
      if (rankBy === 'units_sold') return b.units_sold - a.units_sold || b.matching_revenue - a.matching_revenue
      return (b.last_purchase_at ?? '').localeCompare(a.last_purchase_at ?? '') || b.matching_revenue - a.matching_revenue
    })

  const returned = ranked.slice(0, limit)
  const customers = returned.map((row, index) => ({
    rank: index + 1,
    customer_id: row.customer_id,
    name: row.name,
    company: row.company,
    phones: [] as Array<{ number: string; use_type: string | null }>,
    emails: [] as Array<{ address: string; use_type: string | null }>,
    matching_revenue: row.matching_revenue,
    units_sold: row.units_sold,
    sale_count: row.sale_count,
    matched_sale_line_count: row.matched_sale_line_count,
    first_purchase_at: row.first_purchase_at ? formatStoreDateTime(row.first_purchase_at) : null,
    last_purchase_at: row.last_purchase_at ? formatStoreDateTime(row.last_purchase_at) : null,
    matched_products: row.matched_products,
    matched_products_summary: row.matched_products
      .slice(0, 4)
      .map(product => `${compactQuantity(product.units_sold)} x ${product.name}`)
      .join(', '),
  }))
  const matchingRevenue = ranked.reduce((sum, row) => sum + row.matching_revenue, 0)
  const unitsSold = ranked.reduce((sum, row) => sum + row.units_sold, 0)

  return {
    source: SALES_REPORT_SQL_SOURCE,
    query,
    status: 'resolved',
    date_range: { start_date: startDate, end_date: endDate, timezone: STORE_TIME_ZONE },
    rank_by: rankBy,
    include_contact_details: Boolean(args.include_contact_details),
    include_walk_in: Boolean(args.include_walk_in),
    contact_details_available: false,
    matched_products: itemLookup.matched_items,
    matched_product_count: itemLookup.matched_items.length,
    customer_count: ranked.length,
    returned_count: customers.length,
    row_limit: limit,
    limited: ranked.length > customers.length,
    customers,
    matching_revenue: roundMoney(matchingRevenue),
    units_sold: roundMoney(unitsSold),
    matching_sales: new Set(matchingRows.map(row => row.sale_id)).size,
    matched_sale_lines: matchingRows.length,
    walk_in_or_unassigned_matching_sales: walkInSales,
    item_lookup: itemLookup,
    recheck_required: ranked.length === 0 || result.row_limit_reached || !result.coverage.complete,
    recheck_suggestions: ranked.length === 0
      ? [
          'Matched sale lines were found, but no customer-linked rows matched. Ask whether walk-in sales should be included.',
          'Retry with a broader product/category term if needed.',
        ]
      : result.row_limit_reached || !result.coverage.complete
        ? ['The SQL sales report is still backfilling or reached the row limit; wait for backfill completion or narrow the date range.']
        : [],
    ...sqlCompletionFields(result),
  }
}

type LightspeedSalesListResult = Awaited<ReturnType<typeof getLightspeedSalesListSql>>
type LightspeedSalesTimeseriesResult = Awaited<ReturnType<typeof getLightspeedSalesTimeseriesSql>>
type LightspeedTopSoldProductsResult = Awaited<ReturnType<typeof getLightspeedTopSoldProductsSql>>
type LightspeedSoldProductTimeseriesResult = Awaited<ReturnType<typeof getLightspeedSoldProductTimeseriesSql>>
type LightspeedInventorySearchResult = Awaited<ReturnType<typeof searchLightspeedInventorySql>>
type LightspeedStaleInventoryCashResult = Awaited<ReturnType<typeof getLightspeedStaleInventoryCashSql>>
type LightspeedCustomerSearchResult = Awaited<ReturnType<typeof searchLightspeedCustomersSql>>
type LightspeedCustomerSalesResult = Awaited<ReturnType<typeof getLightspeedCustomerSalesSql>>
type LightspeedTopCustomersResult = Awaited<ReturnType<typeof getLightspeedTopCustomersSql>>
type LightspeedProductPurchasersResult = Awaited<ReturnType<typeof getLightspeedProductPurchasersSql>>

function emitVisuals(
  emit: Emit,
  prefs: VisualPrefs,
  visuals: { chart?: GenieChartPayload; table?: GenieTablePayload; pivot_table?: GeniePivotTablePayload },
) {
  if (prefs.chart && visuals.chart) emit({ event: 'chart', chart: visuals.chart })
  if (visuals.pivot_table) emit({ event: 'pivot_table', pivot_table: visuals.pivot_table })
  else if (prefs.table && visuals.table) emit({ event: 'table', table: visuals.table })
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
  const subtitle = `Lightspeed inventory mirror matches for "${result.query}"`

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
        { key: 'supplier', label: 'Supplier' },
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
        product: safeDisplayText(row.name, `Item ${row.item_id}`),
        brand: safeDisplayText(row.brand ?? row.manufacturer),
        supplier: safeDisplayText(row.supplier),
        category: safeDisplayText(row.category),
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

function buildStaleInventoryCashVisuals(result: LightspeedStaleInventoryCashResult): {
  chart?: GenieChartPayload
  table?: GenieTablePayload
} {
  if ('error' in result || !('rows' in result) || !Array.isArray(result.rows) || result.rows.length === 0) return {}

  const rows = result.rows.slice(0, 25)
  const subtitleParts = [
    `No sales since ${result.date_context.no_sale_since}`,
    `created before ${result.date_context.old_stock_created_before}`,
    `${result.returned_count} of ${result.stale_item_count} products`,
  ]
  if (result.limited) subtitleParts.push(`limited to ${result.row_limit} rows`)
  if (result.page_cap_reached) subtitleParts.push('page cap reached')
  const subtitle = subtitleParts.join(' · ')

  return {
    chart: {
      kind: 'bar',
      title: 'Cash Tied Up In Stale Stock',
      subtitle,
      xKey: 'label',
      valueFormatter: 'currency',
      series: [{ key: 'stock_value', label: 'Stock Value' }],
      data: rows.slice(0, 12).map(row => ({
        label: safeDisplayText(row.product),
        stock_value: row.stock_value,
      })),
    },
    table: {
      title: 'Stale Inventory Cash',
      subtitle,
      columns: [
        { key: 'rank', label: 'Rank', align: 'right', format: 'number' },
        { key: 'product', label: 'Product' },
        { key: 'brand', label: 'Brand' },
        { key: 'category', label: 'Category' },
        { key: 'qoh', label: 'QOH', align: 'right', format: 'number' },
        { key: 'unit_cost', label: 'Unit Cost', align: 'right', format: 'currency' },
        { key: 'stock_value', label: 'Stock Value', align: 'right', format: 'currency' },
        { key: 'item_age_days', label: 'Age Days', align: 'right', format: 'number' },
        { key: 'last_sold_at', label: 'Last Sold' },
        { key: 'days_since_last_sale', label: 'Days Since Sale', align: 'right', format: 'number' },
      ],
      rows: rows.map(row => ({
        rank: row.rank,
        product: safeDisplayText(row.product, ''),
        brand: safeDisplayText(row.brand, ''),
        category: safeDisplayText(row.category, ''),
        qoh: row.qoh,
        unit_cost: row.unit_cost,
        stock_value: row.stock_value,
        item_age_days: row.item_age_days,
        last_sold_at: safeDisplayText(row.last_sold_at, 'No sale found'),
        days_since_last_sale: row.days_since_last_sale,
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
        const match = customer as unknown as LightspeedCustomerMatch
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

function buildProductPurchasersVisuals(result: LightspeedProductPurchasersResult): {
  table?: GenieTablePayload
} {
  if (
    'error' in result ||
    !('customers' in result) ||
    !('returned_count' in result) ||
    !Array.isArray(result.customers) ||
    result.customers.length === 0
  ) {
    return {}
  }

  const subtitleParts = [
    `"${result.query}"`,
    `${result.date_range.start_date} to ${result.date_range.end_date}`,
    `${result.returned_count} of ${result.customer_count} customers`,
  ]
  if (result.limited) subtitleParts.push(`limited to ${result.row_limit} rows`)
  if (result.page_cap_reached) subtitleParts.push('page cap reached')

  return {
    table: {
      title: 'Customers Who Purchased Matching Products',
      subtitle: subtitleParts.join(' · '),
      columns: [
        { key: 'rank', label: 'Rank', align: 'right', format: 'number' },
        { key: 'name', label: 'Customer' },
        { key: 'company', label: 'Company' },
        ...(result.include_contact_details
          ? [
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
            ]
          : []),
        { key: 'products', label: 'Matched Products' },
        { key: 'units_sold', label: 'Units', align: 'right', format: 'number' },
        { key: 'matching_revenue', label: 'Matched Revenue', align: 'right', format: 'currency' },
        { key: 'sale_count', label: 'Sales', align: 'right', format: 'number' },
        { key: 'last_purchase_at', label: 'Last Purchase' },
      ],
      rows: result.customers.map(customer => ({
        rank: customer.rank,
        name: customer.name,
        company: customer.company ?? '',
        phone: contactList(customer.phones, 'number'),
        email: contactList(customer.emails, 'address'),
        products: customer.matched_products_summary,
        units_sold: customer.units_sold,
        matching_revenue: customer.matching_revenue,
        sale_count: customer.sale_count,
        last_purchase_at: customer.last_purchase_at,
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

interface InventoryTargetRow {
  lightspeed_item_id: string
  description: string | null
  system_sku: string | null
  custom_sku: string | null
  brand_id: string | null
  brand_name: string | null
  category_id: string | null
  category_name: string | null
  category_path: string | null
  primary_image_url: string | null
}

async function resolveInventoryTargets(
  supabase: Supa,
  userId: string,
  match: string | undefined,
  lightspeedItemIds: string[] | undefined,
): Promise<InventoryTargetRow[]> {
  let q = supabase
    .from('lightspeed_inventory')
    .select('lightspeed_item_id, description, system_sku, custom_sku, brand_id, brand_name, category_id, category_name, category_path, primary_image_url')
    .eq('user_id', userId)

  if (lightspeedItemIds && lightspeedItemIds.length > 0) {
    q = q.in('lightspeed_item_id', lightspeedItemIds)
  } else if (match && sanitizeMatch(match)) {
    const like = `%${sanitizeMatch(match)}%`
    q = q.or(
      [
        `description.ilike.${like}`,
        `system_sku.ilike.${like}`,
        `custom_sku.ilike.${like}`,
        `manufacturer_sku.ilike.${like}`,
        `lightspeed_item_id.ilike.${like}`,
        `brand_name.ilike.${like}`,
        `category_name.ilike.${like}`,
        `category_path.ilike.${like}`,
      ].join(','),
    )
  } else {
    return []
  }

  const { data } = await q.limit(100)
  return (data ?? []) as InventoryTargetRow[]
}

type ResolvedBrandTarget = {
  id: string | null
  name: string
  create: boolean
}

function normaliseLookupName(value: string): string {
  return value.trim().toLowerCase()
}

async function resolveBrandTarget(
  client: ReturnType<typeof createLightspeedClient>,
  brandIdInput: string,
  brandNameInput: string,
): Promise<{ target?: ResolvedBrandTarget; error?: string }> {
  let brandId = brandIdInput
  let brandName = brandNameInput

  if (brandId && !/^\d+$/.test(brandId)) {
    if (!brandName) brandName = brandId
    brandId = ''
  }

  if (!brandId && !brandName) {
    return { error: 'Provide brand_id or brand_name.' }
  }

  const manufacturers = await client.getAllManufacturers().catch(() => [])

  if (brandId) {
    const manufacturer = manufacturers.find(m => String(m.manufacturerID) === brandId)
    if (manufacturer) {
      return { target: { id: brandId, name: manufacturer.name, create: false } }
    }
    if (brandName) {
      brandId = ''
    } else {
      return { error: `Brand id ${brandId} was not found.` }
    }
  }

  const lookup = normaliseLookupName(brandName)
  const existing = manufacturers.find(m => normaliseLookupName(m.name) === lookup)
  if (existing) {
    return { target: { id: String(existing.manufacturerID), name: existing.name, create: false } }
  }

  return { target: { id: null, name: brandName.trim(), create: true } }
}

async function buildProductBrandCategoryProposal(
  supabase: Supa,
  userId: string,
  args: {
    summary?: string
    match?: string
    lightspeed_item_ids?: string[]
    brand_id?: string | null
    brand_name?: string | null
    category_id?: string | null
    category_name?: string | null
    category_path?: string | null
    parent_category_id?: string | null
    parent_category_name?: string | null
    clear_category?: boolean
  },
): Promise<{ proposal?: ProductBrandCategoryUpdateProposal; output: object }> {
  const brandIdInput = args.brand_id != null ? String(args.brand_id).trim() : ''
  const brandNameInput = args.brand_name != null ? String(args.brand_name).trim() : ''
  const categoryIdInput = args.category_id != null ? String(args.category_id).trim() : ''
  const categoryNameInput = args.category_name != null ? String(args.category_name).trim() : ''
  const categoryPathInput = args.category_path != null ? String(args.category_path).trim() : ''
  const clearCategory = args.clear_category === true

  if (
    !brandIdInput &&
    !brandNameInput &&
    !categoryIdInput &&
    !categoryNameInput &&
    !categoryPathInput &&
    !clearCategory
  ) {
    return {
      output: {
        error: 'Provide at least one of brand_id, brand_name, category_id, category_name, category_path, or clear_category.',
      },
    }
  }

  const targets = await resolveInventoryTargets(
    supabase,
    userId,
    args.match,
    args.lightspeed_item_ids,
  )
  if (targets.length === 0) {
    return {
      output: {
        error: args.match || args.lightspeed_item_ids?.length
          ? `No Lightspeed inventory items found${args.match ? ` matching "${args.match}"` : ''}.`
          : 'Tell me which product to update (a keyword like "Shimano", or specific Lightspeed item IDs).',
      },
    }
  }

  const client = createLightspeedClient(userId)
  let brandTarget: ResolvedBrandTarget | null = null
  let categoryTarget: Awaited<ReturnType<typeof resolveCategoryCreationTarget>>['target'] | null = null

  if (brandIdInput || brandNameInput) {
    const resolved = await resolveBrandTarget(client, brandIdInput, brandNameInput)
    if (resolved.error) {
      return { output: { error: resolved.error } }
    }
    brandTarget = resolved.target ?? null
  }

  if (clearCategory) {
    categoryTarget = {
      id: null,
      name: '',
      path: '',
      parentId: '0',
      create: false,
    }
  } else if (categoryIdInput || categoryNameInput || categoryPathInput) {
    const categories = await client.getAllCategories({ archived: 'false' }).catch(() => [])
    const resolved = resolveCategoryCreationTarget({
      categories,
      categoryId: categoryIdInput || null,
      categoryName: categoryNameInput || null,
      categoryPath: categoryPathInput || null,
      parentCategoryId: args.parent_category_id ?? null,
      parentCategoryName: args.parent_category_name ?? null,
    })
    if (resolved.error) {
      return { output: { error: resolved.error } }
    }
    categoryTarget = resolved.target ?? null
  }

  const imageByItem = await resolveInventoryItemImageUrls(
    createServiceRoleClient(),
    userId,
    targets.map(row => String(row.lightspeed_item_id)),
  )

  const changes: ProductBrandCategoryUpdateProposal['changes'] = []

  for (const row of targets) {
    const brandChanging = brandTarget != null && (
      brandTarget.create
        ? normaliseLookupName(row.brand_name || '') !== normaliseLookupName(brandTarget.name)
        : String(row.brand_id ?? '') !== brandTarget.id
    )
    const categoryChanging = clearCategory
      ? Boolean(row.category_id || row.category_name || row.category_path)
      : categoryTarget != null && (
        categoryTarget.create
          ? normaliseLookupName(row.category_path || row.category_name || '') !== normaliseLookupName(categoryTarget.path)
          : String(row.category_id ?? '') !== categoryTarget.id
      )
    if (!brandChanging && !categoryChanging) continue

    changes.push({
      lightspeed_item_id: row.lightspeed_item_id,
      product_name: row.description || 'Unnamed product',
      sku: row.custom_sku || row.system_sku || null,
      image_url: imageByItem.get(String(row.lightspeed_item_id)) ?? null,
      prev_brand_id: row.brand_id,
      prev_brand_name: row.brand_name,
      next_brand_id: brandChanging ? brandTarget!.id : null,
      next_brand_name: brandChanging ? brandTarget!.name : null,
      create_brand: brandChanging && brandTarget!.create ? true : undefined,
      prev_category_id: row.category_id,
      prev_category_name: row.category_name,
      prev_category_path: row.category_path,
      next_category_id: categoryChanging && !clearCategory ? categoryTarget!.id : null,
      next_category_name: categoryChanging && !clearCategory ? categoryTarget!.name : null,
      next_category_path: categoryChanging && !clearCategory ? categoryTarget!.path : null,
      next_category_parent_id: categoryChanging && !clearCategory ? categoryTarget!.parentId : null,
      create_category: categoryChanging && !clearCategory && categoryTarget!.create ? true : undefined,
      clear_category: clearCategory ? true : undefined,
    })
  }

  if (changes.length === 0) {
    return { output: { status: 'no_change', message: 'The matched products already have the requested brand and category.' } }
  }

  const match_label = args.lightspeed_item_ids?.length
    ? `${changes.length} selected item${changes.length === 1 ? '' : 's'}`
    : `${changes.length} item${changes.length === 1 ? '' : 's'}${args.match ? ` matching "${args.match}"` : ''}`

  const parts: string[] = []
  if (brandTarget) {
    parts.push(`brand → ${brandTarget.name}${brandTarget.create ? ' (new)' : ''}`)
  }
  if (clearCategory) {
    parts.push('category → cleared')
  } else if (categoryTarget) {
    parts.push(`category → ${categoryTarget.path}${categoryTarget.create ? ' (new)' : ''}`)
  }

  const proposal: ProductBrandCategoryUpdateProposal = {
    kind: 'product_brand_category_update',
    summary: args.summary?.trim() || `Update ${parts.join(', ')}`,
    match_label,
    changes,
  }

  return {
    proposal,
    output: {
      status: 'proposed',
      kind: 'product_brand_category_update',
      item_count: changes.length,
      brand_id: brandTarget?.id ?? null,
      brand_name: brandTarget?.name ?? null,
      create_brand: brandTarget?.create ?? false,
      category_id: categoryTarget?.id ?? null,
      category_name: categoryTarget?.name ?? null,
      create_category: categoryTarget?.create ?? false,
      category_path: categoryTarget?.path ?? null,
      clear_category: clearCategory,
    },
  }
}

async function buildLightspeedCategoryCreateProposal(
  userId: string,
  args: {
    summary?: string
    category_name?: string | null
    category_path?: string | null
    parent_category_id?: string | null
    parent_category_name?: string | null
  },
): Promise<{ proposal?: LightspeedCategoryCreateProposal; output: object }> {
  const client = createLightspeedClient(userId)
  const categories = await client.getAllCategories({ archived: 'false' }).catch(() => [])
  const resolved = resolveCategoryCreationTarget({
    categories,
    categoryName: args.category_name ?? null,
    categoryPath: args.category_path ?? null,
    parentCategoryId: args.parent_category_id ?? null,
    parentCategoryName: args.parent_category_name ?? null,
  })

  if (resolved.error) {
    return { output: { error: resolved.error } }
  }

  const target = resolved.target
  if (!target) {
    return { output: { error: 'Could not resolve the category to create.' } }
  }

  if (!target.create) {
    return {
      output: {
        status: 'no_change',
        message: `Category "${target.path}" already exists in Lightspeed.`,
        category_id: target.id,
      },
    }
  }

  const parent = target.parentId !== '0'
    ? categories.find((row) => String(row.categoryID) === target.parentId)
    : null

  const proposal: LightspeedCategoryCreateProposal = {
    kind: 'lightspeed_category_create',
    summary: args.summary?.trim() || `Create Lightspeed category "${target.path}"`,
    name: target.name,
    path: target.path,
    parent_category_id: target.parentId !== '0' ? target.parentId : null,
    parent_category_name: parent?.name ?? (args.parent_category_name?.trim() || null),
  }

  return {
    proposal,
    output: {
      status: 'proposed',
      kind: 'lightspeed_category_create',
      name: target.name,
      path: target.path,
      parent_category_id: proposal.parent_category_id,
    },
  }
}

// ── Lightspeed SQL executor ──────────────────────────────────────────────────

type SqlResultRow = Record<string, string | number | boolean | null>

interface LightspeedSqlVisualArgs {
  table_title?: string
  table_subtitle?: string
  pivot_table?: GeniePivotTableConfig
  chart_kind?: 'bar' | 'line'
  chart_title?: string
  chart_subtitle?: string
  chart_x_key?: string
  chart_y_keys?: string[]
  value_format?: VisualValueFormat
}

function buildPivotSqlTable(
  rows: SqlResultRow[],
  visual: LightspeedSqlVisualArgs | undefined,
  limitApplied: boolean,
): GeniePivotTablePayload | undefined {
  if (!visual?.pivot_table) return undefined
  return buildPivotTableFromRows(rows, visual.pivot_table, { limitApplied })
}

function clampSqlLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return GENIE_LIGHTSPEED_SQL_DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(value ?? GENIE_LIGHTSPEED_SQL_DEFAULT_LIMIT), 1), GENIE_LIGHTSPEED_SQL_MAX_LIMIT)
}

function normalizeLightspeedReportSql(sql: string): string {
  return sql
    .trim()
    .replace(/;\s*$/, '')
    .replace(/\bpublic\.lightspeed_sales_report_lines\b/gi, `public.${GENIE_LIGHTSPEED_SQL_VIEW}`)
    .replace(/(^|[^.\w])lightspeed_sales_report_lines\b/gi, `$1${GENIE_LIGHTSPEED_SQL_VIEW}`)
    .replace(/\bpublic\.lightspeed_inventory\b/gi, `public.${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}`)
    .replace(/(^|[^.\w])lightspeed_inventory\b/gi, `$1${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}`)
}

function scrubSqlStringLiterals(sql: string): string {
  return sql.replace(/'([^']|'')*'/g, "''")
}

function validateLightspeedReportSql(sql: string): string | null {
  const scrubbed = scrubSqlStringLiterals(sql)

  if (!sql.trim()) return 'SQL query is required.'
  if (/;/.test(sql)) return 'Only one SQL statement is allowed.'
  if (/(\/\*|--)/.test(sql)) return 'SQL comments are not allowed.'
  if (!/^\s*(select|with)\s/i.test(sql)) return 'Only SELECT/WITH read queries are allowed.'
  if (/\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|copy|call|do|execute|merge|vacuum|analyze|refresh|listen|notify|set|reset|show|lock|begin|commit|rollback)\b/i.test(scrubbed)) {
    return 'Mutating or administrative SQL is not allowed.'
  }
  if (/\b(public\.)?lightspeed_sales_report_lines\b/i.test(scrubbed)) {
    return `Use ${GENIE_LIGHTSPEED_SQL_VIEW}, not the raw Lightspeed sales table.`
  }
  if (/\b(public\.)?lightspeed_inventory\b/i.test(scrubbed)) {
    return `Use ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}, not the raw Lightspeed inventory table.`
  }
  if (!new RegExp(`\\b(public\\.)?(${GENIE_LIGHTSPEED_SQL_VIEW}|${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW})\\b`, 'i').test(scrubbed)) {
    return `Query must read from ${GENIE_LIGHTSPEED_SQL_VIEW} or ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}.`
  }
  if (/\b(raw_sale|raw_line|raw_item|raw_item_shops|raw_vendor|source_hash|user_id|access_token|refresh_token|encrypted|password|secret)\b/i.test(scrubbed)) {
    return 'Query references restricted columns or secrets.'
  }

  return null
}

function safeSqlCellValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value)
}

function safeSqlTableCellValue(value: unknown): string | number | null {
  const safeValue = safeSqlCellValue(value)
  if (typeof safeValue === 'boolean') return safeValue ? 'Yes' : 'No'
  return safeValue
}

function safeDisplayText(value: unknown, fallback = '—'): string {
  const text = String(value ?? '').trim()
  return text || fallback
}

function coerceSqlRows(value: unknown): SqlResultRow[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map(row => Object.fromEntries(
      Object.entries(row).map(([key, cell]) => [key, safeSqlCellValue(cell)]),
    ))
}

function sqlColumnLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function inferSqlValueFormat(key: string): VisualValueFormat | undefined {
  if (/(margin|percent|pct|rate)/i.test(key)) return 'percent'
  if (/(sales|sale|revenue|subtotal|total|cost|profit|discount|retail|value|amount|price|avg|average)/i.test(key)) return 'currency'
  if (/(count|qty|quantity|units|rank|number)/i.test(key)) return 'number'
  return undefined
}

function buildGenericSqlTable(
  rows: SqlResultRow[],
  visual: LightspeedSqlVisualArgs | undefined,
  limitApplied: boolean,
): GenieTablePayload | undefined {
  if (rows.length === 0) return undefined
  const keys = Object.keys(rows[0] ?? {}).slice(0, 24)
  if (keys.length === 0) return undefined

  const subtitleParts = [visual?.table_subtitle]
  if (limitApplied) subtitleParts.push('row limit reached')

  return {
    title: visual?.table_title?.trim() || 'Lightspeed SQL Results',
    subtitle: subtitleParts.filter(Boolean).join(' · ') || undefined,
    columns: keys.map(key => ({
      key,
      label: sqlColumnLabel(key),
      align: typeof rows[0]?.[key] === 'number' ? 'right' : 'left',
      format: inferSqlValueFormat(key),
    })),
    rows: rows.slice(0, 250).map(row => Object.fromEntries(keys.map(key => [key, safeSqlTableCellValue(row[key])]))),
  }
}

function buildGenericSqlChart(rows: SqlResultRow[], visual: LightspeedSqlVisualArgs | undefined): GenieChartPayload | undefined {
  if (!visual?.chart_kind || !visual.chart_x_key || !visual.chart_y_keys?.length || rows.length === 0) return undefined
  const xKey = visual.chart_x_key
  const yKeys = visual.chart_y_keys.filter(key => rows.some(row => typeof row[key] === 'number')).slice(0, 5)
  if (yKeys.length === 0) return undefined

  return {
    kind: visual.chart_kind,
    title: visual.chart_title?.trim() || 'Lightspeed Chart',
    subtitle: visual.chart_subtitle?.trim() || undefined,
    xKey: 'label',
    series: yKeys.map(key => ({ key, label: sqlColumnLabel(key) })),
    data: rows.slice(0, 120).map(row => ({
      label: String(row[xKey] ?? ''),
      ...Object.fromEntries(yKeys.map(key => [key, typeof row[key] === 'number' ? row[key] : Number(row[key]) || 0])),
    })),
    valueFormatter: visual.value_format ?? inferSqlValueFormat(yKeys[0]),
  }
}

function isMissingSqlRpcError(message: string): boolean {
  return /could not find the function|schema cache|function .* does not exist/i.test(message)
}

function extractSqlDateLiteral(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function extractSalesDateRangeFromSql(sql: string): { startDate: string; endExclusiveDate: string } | null {
  const betweenMatch = sql.match(/\bcomplete_time\s+between\s+'(\d{4}-\d{2}-\d{2})'(?:\s*::\w+)?\s+and\s+'(\d{4}-\d{2}-\d{2})'(?:\s*::\w+)?/i)
  if (betweenMatch) {
    const startDate = extractSqlDateLiteral(betweenMatch[1])
    const endDate = extractSqlDateLiteral(betweenMatch[2])
    if (startDate && endDate) {
      return { startDate, endExclusiveDate: isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(endDate), 1)) }
    }
  }

  const startMatch = sql.match(/\bcomplete_time\s*>=\s*\(?\s*'(\d{4}-\d{2}-\d{2})'(?:\s*::\w+)?\s*\)?/i)
  const endPlusOneMatch = sql.match(/\bcomplete_time\s*<\s*\(?\s*'(\d{4}-\d{2}-\d{2})'(?:\s*::\w+)?\s*\+\s*interval\s+'1 day'\s*\)?/i)
  const endExclusiveMatch = sql.match(/\bcomplete_time\s*<\s*\(?\s*'(\d{4}-\d{2}-\d{2})'(?:\s*::\w+)?\s*\)?/i)

  const startDate = extractSqlDateLiteral(startMatch?.[1])
  const endExclusiveDate = endPlusOneMatch?.[1]
    ? isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(endPlusOneMatch[1]), 1))
    : extractSqlDateLiteral(endExclusiveMatch?.[1])

  if (!startDate || !endExclusiveDate) return null
  return { startDate, endExclusiveDate }
}

async function runLightspeedSqlMissingRpcFallback(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  args: {
    purpose: string
    sql: string
    visual?: LightspeedSqlVisualArgs
  },
  emit: Emit,
  visualPrefs: VisualPrefs,
) {
  const scrubbed = scrubSqlStringLiterals(args.sql)
  if (!new RegExp(`\\b(public\\.)?${GENIE_LIGHTSPEED_SQL_VIEW}\\b`, 'i').test(scrubbed)) {
    return null
  }
  if (new RegExp(`\\b(public\\.)?${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}\\b`, 'i').test(scrubbed)) {
    return null
  }

  const dateRange = extractSalesDateRangeFromSql(args.sql)
  if (!dateRange) {
    return {
      source: 'lightspeed_sql_executor_fallback',
      status: 'error',
      purpose: args.purpose,
      error: 'The SQL executor RPC is missing, and the API fallback only supports date-bounded sales summary queries.',
      allowed_views: [GENIE_LIGHTSPEED_SQL_VIEW, GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW],
      available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
      recheck_required: true,
    }
  }

  const { data, error, count } = await admin
    .from('lightspeed_sales_report_lines')
    .select('sale_id,total,subtotal,cost,profit,discount,quantity', { count: 'exact' })
    .eq('user_id', userId)
    .gte('complete_time', dateRange.startDate)
    .lt('complete_time', dateRange.endExclusiveDate)
    .range(0, GENIE_LIGHTSPEED_SQL_FALLBACK_MAX_LINES - 1)

  if (error) {
    return {
      source: 'lightspeed_sql_executor_fallback',
      status: 'error',
      purpose: args.purpose,
      error: error.message,
      allowed_views: [GENIE_LIGHTSPEED_SQL_VIEW, GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW],
      available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
      recheck_required: true,
    }
  }

  const lines = Array.isArray(data) ? data : []
  const saleIds = new Set(lines.map(line => String(line.sale_id ?? '')).filter(Boolean))
  const grossSales = lines.reduce((sum, line) => sum + toNum(line.total), 0)
  const netSales = lines.reduce((sum, line) => sum + toNum(line.subtotal), 0)
  const totalCost = lines.reduce((sum, line) => sum + toNum(line.cost), 0)
  const grossProfit = lines.reduce((sum, line) => sum + toNum(line.profit), 0)
  const discounts = lines.reduce((sum, line) => sum + toNum(line.discount), 0)
  const units = lines.reduce((sum, line) => sum + toNum(line.quantity), 0)
  const lineCount = count ?? lines.length
  const limitApplied = lineCount > lines.length
  const rows: SqlResultRow[] = [{
    period_start: dateRange.startDate,
    period_end: isoDateFromUtcDate(addUtcDays(isoDateToUtcDate(dateRange.endExclusiveDate), -1)),
    sale_count: saleIds.size,
    line_count: lineCount,
    gross_sales: roundMoney(grossSales),
    net_sales: roundMoney(netSales),
    discounts: roundMoney(discounts),
    units: roundMoney(units),
    total_cost: roundMoney(totalCost),
    gross_profit: roundMoney(grossProfit),
    gross_margin_pct: netSales > 0 ? roundPercent((grossProfit / netSales) * 100) : null,
  }]

  const pivotTable = buildPivotSqlTable(rows, args.visual, limitApplied)
  const table = pivotTable ? undefined : buildGenericSqlTable(rows, args.visual, limitApplied)
  const chart = buildGenericSqlChart(rows, args.visual)
  emitVisuals(emit, visualPrefs, { table, chart, pivot_table: pivotTable })

  return {
    source: 'lightspeed_sql_executor_fallback',
    status: 'ok',
    purpose: args.purpose,
    warning: `Database RPC ${GENIE_LIGHTSPEED_SQL_RPC} is missing; used API sales-summary fallback.`,
    row_count: rows.length,
    returned_count: rows.length,
    row_limit: GENIE_LIGHTSPEED_SQL_FALLBACK_MAX_LINES,
    limit_applied: limitApplied,
    rows,
    available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
    table_emitted: Boolean(table),
    pivot_table_emitted: Boolean(pivotTable),
    chart_emitted: Boolean(chart),
    recheck_required: limitApplied,
  }
}

function toAnalysisPlanPayload(plan: GenieExecutionPlan): GenieAnalysisPlanPayload {
  const strategy = plan.sql_strategy
  const strategyParts = strategy
    ? [
        strategy.grain ? `Grain: ${strategy.grain}` : null,
        strategy.aggregation ? `Aggregation: ${strategy.aggregation}` : null,
        strategy.filters.length ? `Filters: ${strategy.filters.join('; ')}` : null,
        strategy.group_by.length ? `Group by: ${strategy.group_by.join(', ')}` : null,
        strategy.order_by ? `Order by: ${strategy.order_by}` : null,
      ].filter(Boolean)
    : []

  const dateRange = plan.date_range
  const dateRangeLabel = dateRange?.start_date && dateRange?.end_date
    ? `${dateRange.start_date} → ${dateRange.end_date}`
    : dateRange?.basis ?? null

  return {
    source: 'planner',
    user_intent: plan.user_intent,
    execution_steps: plan.execution_steps,
    primary_tools: plan.primary_tools,
    sql_strategy_summary: strategyParts.length ? strategyParts.join(' · ') : null,
    date_range_label: dateRangeLabel,
    recheck_strategy: plan.recheck_strategy || null,
    answer_success_criteria: plan.answer_success_criteria,
  }
}

function emitAnalysisPlan(emit: Emit, plan: GenieAnalysisPlanPayload) {
  if (!plan.execution_steps.length) return
  emit({ event: 'analysis_plan', plan })
}

function emitAnalysisQuery(
  emit: Emit,
  query: Omit<GenieAnalysisQueryPayload, 'id' | 'at'> & Partial<Pick<GenieAnalysisQueryPayload, 'id' | 'at'>>,
) {
  emit({
    event: 'analysis_query',
    query: {
      id: query.id ?? randomUUID(),
      at: query.at ?? new Date().toISOString(),
      tool_name: query.tool_name,
      purpose: query.purpose,
      sql: query.sql ?? null,
      status: query.status,
      row_count: query.row_count ?? null,
      error: query.error ?? null,
    },
  })
}

async function runLightspeedSqlQuery(
  userId: string,
  args: {
    purpose: string
    sql: string
    limit?: number
    visual?: LightspeedSqlVisualArgs
  },
  emit: Emit,
  visualPrefs: VisualPrefs,
  latestUserMessage: string,
) {
  const sql = normalizeLightspeedReportSql(args.sql)
  const queryId = randomUUID()
  emitAnalysisQuery(emit, {
    id: queryId,
    tool_name: 'run_lightspeed_sql_query',
    purpose: args.purpose,
    sql,
    status: 'running',
  })

  const validationError = validateLightspeedReportSql(sql)
  if (validationError) {
    emitAnalysisQuery(emit, {
      id: queryId,
      tool_name: 'run_lightspeed_sql_query',
      purpose: args.purpose,
      sql,
      status: 'rejected',
      error: validationError,
    })
    return {
      source: 'lightspeed_sql_executor',
      status: 'rejected',
      purpose: args.purpose,
      error: validationError,
      allowed_views: [GENIE_LIGHTSPEED_SQL_VIEW, GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW],
      available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
      recheck_required: true,
    }
  }

  const limit = clampSqlLimit(args.limit)
  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc(GENIE_LIGHTSPEED_SQL_RPC, {
    p_sql: sql,
    p_user_id: userId,
    p_limit: limit,
  })

  if (error) {
    if (isMissingSqlRpcError(error.message)) {
      const fallbackResult = await runLightspeedSqlMissingRpcFallback(
        admin,
        userId,
        { purpose: args.purpose, sql, visual: args.visual },
        emit,
        visualPrefs,
      )
      if (fallbackResult) {
        emitAnalysisQuery(emit, {
          id: queryId,
          tool_name: 'run_lightspeed_sql_query',
          purpose: args.purpose,
          sql,
          status: fallbackResult.status === 'ok' ? 'ok' : 'error',
          row_count: typeof fallbackResult.row_count === 'number' ? fallbackResult.row_count : null,
          error: typeof fallbackResult.error === 'string' ? fallbackResult.error : null,
        })
        return fallbackResult
      }
    }

    emitAnalysisQuery(emit, {
      id: queryId,
      tool_name: 'run_lightspeed_sql_query',
      purpose: args.purpose,
      sql,
      status: 'error',
      error: error.message,
    })
    return {
      source: 'lightspeed_sql_executor',
      status: 'error',
      purpose: args.purpose,
      error: error.message,
      allowed_views: [GENIE_LIGHTSPEED_SQL_VIEW, GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW],
      available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
      recheck_required: true,
    }
  }

  const result = isRecord(data) ? data : {}
  const rows = coerceSqlRows(result.rows)
  const rowCount = typeof result.row_count === 'number' ? result.row_count : rows.length
  const limitApplied = Boolean(result.limit_applied)

  const pivotTable = buildPivotSqlTable(rows, args.visual, limitApplied)
  const table = pivotTable ? undefined : buildGenericSqlTable(rows, args.visual, limitApplied)
  const chart = buildGenericSqlChart(rows, args.visual)
  emitVisuals(emit, visualPrefs, { table, chart, pivot_table: pivotTable })

  const inventoryCardMatches = /\bgenie_lightspeed_inventory\b/i.test(sql)
    ? inventoryPreviewMatchesFromSqlRows(rows)
    : []
  const inventoryProductPreviews = inventoryCardMatches.length > 0
    ? await maybeEmitInventoryProductCards({
        supabase: admin,
        userId,
        latestUserMessage,
        query: args.purpose,
        matches: inventoryCardMatches,
        emit,
      })
    : []

  emitAnalysisQuery(emit, {
    id: queryId,
    tool_name: 'run_lightspeed_sql_query',
    purpose: args.purpose,
    sql,
    status: 'ok',
    row_count: rowCount,
    visual: args.visual ?? null,
    limit,
  })

  return {
    source: 'lightspeed_sql_executor',
    status: 'ok',
    purpose: args.purpose,
    row_count: rowCount,
    returned_count: rows.length,
    row_limit: limit,
    limit_applied: limitApplied,
    rows,
    product_links: productLinksFromPreviews(inventoryProductPreviews),
    product_cards_emitted: inventoryProductPreviews.length > 0,
    available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
    table_emitted: Boolean(table),
    pivot_table_emitted: Boolean(pivotTable),
    chart_emitted: Boolean(chart),
    recheck_required: rows.length === 0 || limitApplied,
  }
}

async function findDiscountCandidatesSql(
  userId: string,
  args: {
    limit?: number
    no_sale_days?: number
    min_stock_value?: number
  },
  emit: Emit,
  visualPrefs: VisualPrefs,
) {
  const today = getStoreToday()
  const limit = Math.max(1, Math.min(Number(args.limit) || 10, 30))
  const noSaleDays = Math.max(30, Math.min(Number(args.no_sale_days) || 120, 3650))
  const minStockValue = Math.max(0, Number(args.min_stock_value) || 0)
  const salesStartDate = storeDateFromDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))
  const recentStartDate = storeDateFromDate(new Date(Date.now() - noSaleDays * 24 * 60 * 60 * 1000))

  const sql = `
WITH inventory AS (
  SELECT
    item_id,
    COALESCE(NULLIF(description, ''), NULLIF(name, ''), item_id) AS product_name,
    COALESCE(NULLIF(custom_sku, ''), NULLIF(system_sku, ''), NULLIF(manufacturer_sku, ''), NULLIF(upc, '')) AS sku,
    brand_name,
    COALESCE(NULLIF(category_path, ''), NULLIF(category_name, '')) AS category,
    supplier_name,
    COALESCE(NULLIF(online_price, 0), NULLIF(default_price, 0), NULLIF(msrp, 0), 0) AS current_price,
    COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0), 0) AS unit_cost,
    total_qoh,
    total_sellable,
    COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0), 0) * total_qoh AS stock_value_at_cost,
    COALESCE(NULLIF(online_price, 0), NULLIF(default_price, 0), NULLIF(msrp, 0), 0) * total_qoh AS retail_stock_value,
    CASE
      WHEN COALESCE(NULLIF(online_price, 0), NULLIF(default_price, 0), NULLIF(msrp, 0), 0) > 0
      THEN ROUND(((COALESCE(NULLIF(online_price, 0), NULLIF(default_price, 0), NULLIF(msrp, 0), 0) - COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0), 0)) / COALESCE(NULLIF(online_price, 0), NULLIF(default_price, 0), NULLIF(msrp, 0), 0) * 100)::numeric, 1)
      ELSE NULL
    END AS margin_percent,
    lightspeed_created_at,
    primary_image_url
  FROM ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}
  WHERE is_in_stock = true
    AND total_qoh > 0
    AND archived = false
    AND COALESCE(discountable, true) = true
    AND COALESCE(NULLIF(online_price, 0), NULLIF(default_price, 0), NULLIF(msrp, 0), 0) > 0
    AND COALESCE(NULLIF(avg_cost, 0), NULLIF(default_cost, 0), 0) >= 0
    AND lower(COALESCE(item_type, '')) NOT IN ('labor', 'labour', 'service', 'gift_card', 'gift card')
),
sales AS (
  SELECT
    item_id,
    SUM(CASE WHEN complete_time >= ${sqlLiteral(salesStartDate)}::date THEN quantity ELSE 0 END) AS units_sold_365,
    SUM(CASE WHEN complete_time >= ${sqlLiteral(recentStartDate)}::date THEN quantity ELSE 0 END) AS units_sold_recent,
    SUM(CASE WHEN complete_time >= ${sqlLiteral(salesStartDate)}::date THEN total ELSE 0 END) AS revenue_365,
    MAX(complete_time) AS last_sold_at
  FROM ${GENIE_LIGHTSPEED_SQL_VIEW}
  WHERE item_id IS NOT NULL
    AND complete_time >= ${sqlLiteral(salesStartDate)}::date
    AND complete_time < (${sqlLiteral(today)}::date + interval '1 day')
  GROUP BY item_id
),
scored AS (
  SELECT
    i.*,
    COALESCE(s.units_sold_365, 0) AS units_sold_365,
    COALESCE(s.units_sold_recent, 0) AS units_sold_recent,
    COALESCE(s.revenue_365, 0) AS revenue_365,
    s.last_sold_at,
    CASE
      WHEN s.last_sold_at IS NULL THEN 9999
      ELSE (${sqlLiteral(today)}::date - s.last_sold_at::date)
    END AS days_since_last_sale,
    CASE
      WHEN i.lightspeed_created_at IS NULL THEN NULL
      ELSE (${sqlLiteral(today)}::date - i.lightspeed_created_at::date)
    END AS item_age_days,
    (
      CASE WHEN COALESCE(s.units_sold_recent, 0) = 0 THEN 35 ELSE 0 END +
      LEAST(CASE WHEN s.last_sold_at IS NULL THEN 60 ELSE GREATEST(0, (${sqlLiteral(today)}::date - s.last_sold_at::date) / 4.0) END, 60) +
      LEAST(i.stock_value_at_cost / 25.0, 45) +
      LEAST(i.total_qoh * 2.0, 30) +
      CASE WHEN i.margin_percent >= 45 THEN 20 WHEN i.margin_percent >= 35 THEN 12 WHEN i.margin_percent >= 25 THEN 6 ELSE -12 END +
      CASE WHEN i.lightspeed_created_at IS NOT NULL AND (${sqlLiteral(today)}::date - i.lightspeed_created_at::date) >= ${noSaleDays} THEN 10 ELSE 0 END
    ) AS discount_priority_score
  FROM inventory i
  LEFT JOIN sales s ON s.item_id = i.item_id
  WHERE i.stock_value_at_cost >= ${minStockValue}
)
SELECT
  item_id,
  product_name,
  sku,
  brand_name,
  category,
  supplier_name,
  ROUND(current_price::numeric, 2) AS current_price,
  ROUND(unit_cost::numeric, 2) AS unit_cost,
  margin_percent,
  ROUND(total_qoh::numeric, 2) AS total_qoh,
  ROUND(total_sellable::numeric, 2) AS total_sellable,
  ROUND(stock_value_at_cost::numeric, 2) AS stock_value_at_cost,
  ROUND(retail_stock_value::numeric, 2) AS retail_stock_value,
  ROUND(units_sold_365::numeric, 2) AS units_sold_365,
  ROUND(units_sold_recent::numeric, 2) AS units_sold_recent,
  ROUND(revenue_365::numeric, 2) AS revenue_365,
  last_sold_at,
  days_since_last_sale,
  item_age_days,
  ROUND(discount_priority_score::numeric, 1) AS discount_priority_score,
  CASE
    WHEN margin_percent >= 50 AND (units_sold_recent = 0 OR days_since_last_sale >= ${noSaleDays}) THEN 25
    WHEN margin_percent >= 40 THEN 20
    WHEN margin_percent >= 30 THEN 15
    ELSE 10
  END AS suggested_discount_percent,
  CONCAT_WS(', ',
    CASE WHEN units_sold_recent = 0 THEN 'no recent sales' ELSE NULL END,
    CASE WHEN days_since_last_sale >= ${noSaleDays} THEN 'stale movement' ELSE NULL END,
    CASE WHEN stock_value_at_cost >= 500 THEN 'meaningful cash tied up' ELSE NULL END,
    CASE WHEN total_qoh >= 3 THEN 'multiple units on hand' ELSE NULL END,
    CASE WHEN margin_percent >= 35 THEN 'margin room for markdown' ELSE NULL END
  ) AS candidate_reason
FROM scored
ORDER BY discount_priority_score DESC, stock_value_at_cost DESC, total_qoh DESC, product_name ASC
LIMIT ${limit}
`

  const result = await runLightspeedSqlQuery(
    userId,
    {
      purpose: `Find ${limit} current products that are strongest discount candidates`,
      sql,
      limit,
      visual: {
        table_title: `Top ${limit} Discount Candidates`,
        table_subtitle: `Ranked by stock value, slow movement, quantity on hand, and margin room`,
        chart_kind: 'bar',
        chart_title: 'Discount Candidate Priority',
        chart_x_key: 'product_name',
        chart_y_keys: ['discount_priority_score'],
        value_format: 'number',
      },
    },
    emit,
    visualPrefs,
    'discount candidate analysis',
  )

  if (result.status !== 'ok') return result

  return {
    ...result,
    analysis_basis: {
      sales_start_date: salesStartDate,
      sales_end_date: today,
      no_sale_days: noSaleDays,
      min_stock_value: minStockValue,
      ranking_factors: [
        'no/recent sales weakness',
        'days since last sale',
        'stock value at cost',
        'quantity on hand',
        'margin room',
        'item age',
      ],
    },
  }
}

const BIKE_BRAND_NAMES = [
  'avanti',
  'bianchi',
  'bmc',
  'cannondale',
  'canyon',
  'cervelo',
  'colnago',
  'cube',
  'factor',
  'focus',
  'giant',
  'kona',
  'lapierre',
  'liv',
  'malvern star',
  'marin',
  'merida',
  'norco',
  'orbea',
  'pinarello',
  'pivot',
  'polygon',
  'rocky mountain',
  'salsa',
  'santa cruz',
  'scott',
  'specialized',
  'surly',
  'trek',
  'wilier',
  'yeti',
]

const BIKE_CONTEXT_STOP_WORDS = new Set([
  'and',
  'bike',
  'bikes',
  'bicycle',
  'bicycles',
  'bottom',
  'bracket',
  'does',
  'for',
  'need',
  'needs',
  'the',
  'their',
  'this',
  'what',
  'which',
  'with',
  'workorder',
  'workorders',
])

function compactBikeEvidenceText(value: unknown, maxLength = 220): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

async function runInternalGenieSqlRows(args: {
  userId: string
  purpose: string
  sql: string
  limit: number
  emit: Emit
  toolName?: string
}): Promise<{ status: 'ok'; rows: SqlResultRow[]; row_count: number; limit_applied: boolean } | { status: 'error'; rows: []; error: string }> {
  const toolName = args.toolName ?? 'resolve_customer_bike_context'
  const sql = normalizeLightspeedReportSql(args.sql)
  const queryId = randomUUID()
  emitAnalysisQuery(args.emit, {
    id: queryId,
    tool_name: toolName,
    purpose: args.purpose,
    sql,
    status: 'running',
  })

  const validationError = validateLightspeedReportSql(sql)
  if (validationError) {
    emitAnalysisQuery(args.emit, {
      id: queryId,
      tool_name: toolName,
      purpose: args.purpose,
      sql,
      status: 'rejected',
      error: validationError,
    })
    return { status: 'error', rows: [], error: validationError }
  }

  try {
    const result = await executeGeneratedLightspeedSql(args.userId, sql, clampSqlLimit(args.limit))
    emitAnalysisQuery(args.emit, {
      id: queryId,
      tool_name: toolName,
      purpose: args.purpose,
      sql,
      status: 'ok',
      row_count: result.row_count,
    })
    return {
      status: 'ok',
      rows: result.rows,
      row_count: result.row_count,
      limit_applied: result.limit_applied,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitAnalysisQuery(args.emit, {
      id: queryId,
      tool_name: toolName,
      purpose: args.purpose,
      sql,
      status: 'error',
      error: message,
    })
    return { status: 'error', rows: [], error: message }
  }
}

function customerSearchTokens(customerQuery: string): string[] {
  return queryTokens(customerQuery)
    .filter(token => token.length > 1 && !BIKE_CONTEXT_STOP_WORDS.has(token))
    .slice(0, 6)
}

function buildCustomerCandidateSql(customerQuery: string): string {
  const tokens = customerSearchTokens(customerQuery)
  const normalized = normalizeText(customerQuery)
  const tokenFilters = tokens.length
    ? tokens.map(token => `LOWER(customer_full_name) LIKE ${sqlLiteral(`%${token}%`)}`).join(' AND ')
    : `LOWER(customer_full_name) LIKE ${sqlLiteral(`%${normalized}%`)}`

  return `
SELECT
  customer_id,
  NULLIF(customer_full_name, '') AS customer_full_name,
  COUNT(DISTINCT sale_id) AS sale_count,
  ROUND(COALESCE(SUM(total), 0)::numeric, 2) AS gross_sales,
  MAX(complete_time) AS last_sale_at
FROM ${GENIE_LIGHTSPEED_SQL_VIEW}
WHERE customer_id IS NOT NULL
  AND customer_id <> ''
  AND customer_full_name IS NOT NULL
  AND ${tokenFilters}
GROUP BY customer_id, customer_full_name
ORDER BY
  CASE WHEN LOWER(customer_full_name) = ${sqlLiteral(normalized)} THEN 0 ELSE 1 END,
  last_sale_at DESC NULLS LAST,
  sale_count DESC
LIMIT 8`
}

function buildCustomerSalesHistorySql(customerId: string): string {
  return `
SELECT
  complete_time::date AS sale_date,
  complete_time,
  sale_id,
  ticket_number,
  item_id,
  sku,
  description,
  category,
  quantity,
  total
FROM ${GENIE_LIGHTSPEED_SQL_VIEW}
WHERE customer_id = ${sqlLiteral(customerId)}
ORDER BY complete_time DESC NULLS LAST, sale_id DESC
LIMIT 300`
}

type CustomerBikeLookupCandidate = {
  customer_id: string
  customer_full_name: string | null
  company: string | null
  source: 'lightspeed_customer_api' | 'sales_sql'
  sale_count: number | null
  gross_sales: number | null
  last_sale_at: string | null
}

type SerializedBikeEvidence = LightspeedCustomerBike & {
  source: 'customer_serialized' | 'workorder_serialized'
  linkedWorkorderIds: string[]
}

type BikeContextCandidate = {
  source: 'customer_serialized' | 'workorder_serialized' | 'sales_history' | 'workorder'
  label: string
  brand: string | null
  score: number
  evidence: string
  serialized_id?: string | null
  serial?: string | null
  item_id?: string | null
  updated_at?: string | null
  linked_workorder_ids?: string[]
  sale_date?: string | null
  sale_id?: string | null
  category?: string | null
  sku?: string | null
  workorder_id?: string | null
  status_name?: string | null
}

function customerNameFromLightspeedCustomer(customer: LightspeedCustomer): string {
  const name = [customer.firstName, customer.lastName]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
  return name || String(customer.company ?? '').trim() || `Customer ${String(customer.customerID ?? '').trim()}`
}

function customerCandidateFromLightspeedCustomer(customer: LightspeedCustomer): CustomerBikeLookupCandidate | null {
  const customerId = String(customer.customerID ?? '').trim()
  if (!customerId) return null
  return {
    customer_id: customerId,
    customer_full_name: customerNameFromLightspeedCustomer(customer),
    company: String(customer.company ?? '').trim() || null,
    source: 'lightspeed_customer_api',
    sale_count: null,
    gross_sales: null,
    last_sale_at: null,
  }
}

function customerCandidateFromSalesRow(row: SqlResultRow): CustomerBikeLookupCandidate | null {
  const customerId = String(row.customer_id ?? '').trim()
  if (!customerId) return null
  return {
    customer_id: customerId,
    customer_full_name: String(row.customer_full_name ?? '').trim() || null,
    company: null,
    source: 'sales_sql',
    sale_count: Number(row.sale_count) || 0,
    gross_sales: Number(row.gross_sales) || 0,
    last_sale_at: String(row.last_sale_at ?? '').trim() || null,
  }
}

function splitCustomerNameForLightspeed(customerQuery: string): { firstName: string | null; lastName: string | null } {
  const tokens = customerQuery
    .replace(/[^A-Za-z0-9'\-\s]+/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !/\d/.test(token) && !BIKE_CONTEXT_STOP_WORDS.has(normalizeText(token)))
    .slice(0, 4)
  if (tokens.length === 0) return { firstName: null, lastName: null }
  if (tokens.length === 1) return { firstName: tokens[0], lastName: tokens[0] }
  return {
    firstName: tokens[0],
    lastName: tokens[tokens.length - 1],
  }
}

function scoreCustomerLookupCandidate(candidate: CustomerBikeLookupCandidate, customerQuery: string, index: number): number {
  const query = normalizeText(customerQuery)
  const name = normalizeText(`${candidate.customer_full_name ?? ''} ${candidate.company ?? ''}`)
  const tokens = customerSearchTokens(customerQuery)
  let score = candidate.source === 'lightspeed_customer_api' ? 30 : 10
  if (name && name === query) score += 100
  if (tokens.length > 0 && tokens.every(token => name.includes(token))) score += 50
  if (candidate.sale_count) score += Math.min(candidate.sale_count, 12)
  return score - index * 0.01
}

function mergeCustomerLookupCandidates(args: {
  apiCandidates: CustomerBikeLookupCandidate[]
  salesCandidates: CustomerBikeLookupCandidate[]
  customerQuery: string
}) {
  const byId = new Map<string, CustomerBikeLookupCandidate>()
  for (const candidate of [...args.apiCandidates, ...args.salesCandidates]) {
    const previous = byId.get(candidate.customer_id)
    if (!previous) {
      byId.set(candidate.customer_id, candidate)
      continue
    }
    byId.set(candidate.customer_id, {
      ...previous,
      customer_full_name: previous.customer_full_name ?? candidate.customer_full_name,
      company: previous.company ?? candidate.company,
      source: previous.source === 'lightspeed_customer_api' ? previous.source : candidate.source,
      sale_count: previous.sale_count ?? candidate.sale_count,
      gross_sales: previous.gross_sales ?? candidate.gross_sales,
      last_sale_at: previous.last_sale_at ?? candidate.last_sale_at,
    })
  }

  return Array.from(byId.values())
    .map((candidate, index) => ({
      candidate,
      score: scoreCustomerLookupCandidate(candidate, args.customerQuery, index),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate)
}

async function fetchLightspeedCustomerCandidates(userId: string, customerQuery: string): Promise<CustomerBikeLookupCandidate[]> {
  const cleaned = customerQuery.trim()
  if (!cleaned) return []

  const client = createLightspeedClient(userId)
  const candidates: CustomerBikeLookupCandidate[] = []
  const seen = new Set<string>()

  async function addCustomers(customersPromise: Promise<LightspeedCustomer[]>) {
    const customers = await customersPromise.catch(() => [])
    for (const customer of customers) {
      const candidate = customerCandidateFromLightspeedCustomer(customer)
      if (!candidate || seen.has(candidate.customer_id)) continue
      seen.add(candidate.customer_id)
      candidates.push(candidate)
    }
  }

  if (/^\d+$/.test(cleaned)) {
    const customer = await client.getCustomer(cleaned, { load_relations: '["Contact"]' }).catch(() => null)
    const candidate = customer ? customerCandidateFromLightspeedCustomer(customer) : null
    return candidate ? [candidate] : []
  }

  const { firstName, lastName } = splitCustomerNameForLightspeed(cleaned)
  if (firstName && lastName && firstName !== lastName) {
    await addCustomers(client.getCustomers({ firstName, lastName, limit: 25 }))
  }
  if (lastName) {
    const fallback = await client.getCustomers({ lastName, limit: 25 }).catch(() => [])
    const firstToken = firstName ? normalizeText(firstName) : ''
    for (const customer of fallback) {
      const name = normalizeText(customerNameFromLightspeedCustomer(customer))
      if (firstToken && !name.includes(firstToken)) continue
      const candidate = customerCandidateFromLightspeedCustomer(customer)
      if (!candidate || seen.has(candidate.customer_id)) continue
      seen.add(candidate.customer_id)
      candidates.push(candidate)
    }
  }
  if (candidates.length === 0 && firstName) {
    await addCustomers(client.getCustomers({ firstName, limit: 25 }))
  }

  return candidates
}

async function fetchCustomerSerializedBikeEvidence(userId: string, customerId: string): Promise<{
  status: 'ok' | 'error'
  bikes: SerializedBikeEvidence[]
  error?: string
}> {
  if (!customerId) return { status: 'ok', bikes: [] }
  try {
    const client = createLightspeedClient(userId)
    const bikes = await client.getCustomerBikes(customerId)
    return {
      status: 'ok',
      bikes: bikes.map(bike => ({
        ...bike,
        source: 'customer_serialized' as const,
        linkedWorkorderIds: [],
      })),
    }
  } catch (error) {
    return {
      status: 'error',
      bikes: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function fetchWorkorderSerializedBikeEvidence(args: {
  userId: string
  workorders: Awaited<ReturnType<typeof listGenieWorkorders>>['workorders']
}): Promise<SerializedBikeEvidence[]> {
  const serializedIds = Array.from(new Set(
    args.workorders
      .map(workorder => String(workorder.serialized_id ?? '').trim())
      .filter(id => id && id !== '0')
  )).slice(0, 8)
  if (serializedIds.length === 0) return []

  const workorderIdsBySerializedId = new Map<string, string[]>()
  for (const workorder of args.workorders) {
    const serializedId = String(workorder.serialized_id ?? '').trim()
    if (!serializedId || serializedId === '0') continue
    const ids = workorderIdsBySerializedId.get(serializedId) ?? []
    ids.push(workorder.workorder_id)
    workorderIdsBySerializedId.set(serializedId, ids)
  }

  const client = createLightspeedClient(args.userId)
  const results = await Promise.all(
    serializedIds.map(async serializedId => ({
      serializedId,
      bike: await client.getSerializedBike(serializedId).catch(() => null),
    })),
  )

  return results.flatMap(({ serializedId, bike }) => {
    if (!bike) {
      return [
        {
          serializedId,
          label: null,
          serial: null,
          itemId: null,
          saleLineId: null,
          customerId: null,
          colorName: null,
          sizeName: null,
          updatedAt: null,
          source: 'workorder_serialized' as const,
          linkedWorkorderIds: workorderIdsBySerializedId.get(serializedId) ?? [],
        } satisfies SerializedBikeEvidence,
      ]
    }
    return [
      {
        ...bike,
        source: 'workorder_serialized' as const,
        linkedWorkorderIds: workorderIdsBySerializedId.get(serializedId) ?? [],
      } satisfies SerializedBikeEvidence,
    ]
  })
}

function mergeSerializedBikeEvidence(bikes: SerializedBikeEvidence[]): SerializedBikeEvidence[] {
  const byId = new Map<string, SerializedBikeEvidence>()
  for (const bike of bikes) {
    const previous = byId.get(bike.serializedId)
    if (!previous) {
      byId.set(bike.serializedId, bike)
      continue
    }
    byId.set(bike.serializedId, {
      ...previous,
      source: previous.source === 'customer_serialized' ? previous.source : bike.source,
      label: previous.label ?? bike.label,
      serial: previous.serial ?? bike.serial,
      itemId: previous.itemId ?? bike.itemId,
      saleLineId: previous.saleLineId ?? bike.saleLineId,
      customerId: previous.customerId ?? bike.customerId,
      colorName: previous.colorName ?? bike.colorName,
      sizeName: previous.sizeName ?? bike.sizeName,
      updatedAt: previous.updatedAt ?? bike.updatedAt,
      linkedWorkorderIds: Array.from(new Set([
        ...previous.linkedWorkorderIds,
        ...bike.linkedWorkorderIds,
      ])),
    })
  }
  return Array.from(byId.values())
}

function detectBikeBrand(text: string): string | null {
  const normalized = normalizeText(text)
  for (const brand of BIKE_BRAND_NAMES) {
    if (normalized.includes(brand)) return brand.replace(/\b\w/g, char => char.toUpperCase())
  }
  return null
}

function bikeEvidenceScore(text: string): number {
  const normalized = normalizeText(text)
  let score = 0
  if (/\b(bike|bicycle|frame|frameset|e bike|ebike|road|gravel|mountain|mtb|triathlon|time trial|dual suspension|hardtail|commuter|hybrid)\b/.test(normalized)) score += 5
  if (detectBikeBrand(text)) score += 4
  if (/\b(20[0-3][0-9]|madone|domane|emonda|fuel|slash|rail|tarmac|roubaix|stumpjumper|epic|defy|tcr|revolt|trance|anthem|orca|terra|oiz|scultura|reacto|spark|scale|addict|foil|synapse|supersix|topstone|silex|big nine|big seven)\b/.test(normalized)) score += 3
  if (/\b(bottom bracket|brake pad|disc pad|chain|cassette|tyre|tire|tube|helmet|glove|jersey|shoe|service|labou?r|fit|wash|tune|bleed)\b/.test(normalized)) score -= 3
  return score
}

function compatibilityPartTokens(question: string): string[] {
  const text = normalizeText(question)
  if (/\b(bottom bracket|bb)\b/.test(text)) return ['bottom bracket', 'bb', 'crank', 'crankset', 'bearing']
  if (/\b(brake|pad|disc pad)\b/.test(text)) return ['brake', 'pad', 'disc']
  if (/\b(tyre|tire)\b/.test(text)) return ['tyre', 'tire', 'wheel', 'clearance']
  if (/\b(freehub|cassette)\b/.test(text)) return ['freehub', 'cassette', 'hub', 'driver']
  if (/\b(headset)\b/.test(text)) return ['headset', 'bearing', 'steerer']
  if (/\b(seatpost|seat post)\b/.test(text)) return ['seatpost', 'seat post', 'diameter']
  if (/\b(axle|thru axle|through axle)\b/.test(text)) return ['axle', 'thru', 'through']
  if (/\b(rotor)\b/.test(text)) return ['rotor', 'disc', 'brake']
  if (/\b(shock)\b/.test(text)) return ['shock', 'mount', 'hardware']
  if (/\b(hanger|derailleur hanger)\b/.test(text)) return ['hanger', 'derailleur']
  return meaningfulQueryTokens(question).slice(0, 6)
}

function rowTextForBikeContext(row: SqlResultRow): string {
  return [
    row.description,
    row.category,
    row.sku,
    row.ticket_number,
  ].map(value => String(value ?? '')).join(' ')
}

function bikeCandidatesFromSerializedBikes(bikes: SerializedBikeEvidence[]): BikeContextCandidate[] {
  return bikes.flatMap(bike => {
    const label = compactBikeEvidenceText(bike.label ?? bike.serial ?? '', 180)
    if (!label) return []
    const sourceText = bike.source === 'customer_serialized'
      ? `Lightspeed Serialized customer bike ${bike.serializedId}`
      : `Workorder-linked Serialized bike ${bike.serializedId}`
    const details = [
      sourceText,
      label,
      bike.serial ? `serial ${bike.serial}` : '',
      bike.itemId ? `item ${bike.itemId}` : 'free-text bike record',
      bike.colorName ? `colour ${bike.colorName}` : '',
      bike.sizeName ? `size ${bike.sizeName}` : '',
    ].filter(Boolean).join('; ')
    return [
      {
        source: bike.source,
        label,
        brand: detectBikeBrand(label),
        serialized_id: bike.serializedId,
        serial: bike.serial,
        item_id: bike.itemId,
        updated_at: bike.updatedAt,
        linked_workorder_ids: bike.linkedWorkorderIds,
        score: 28 + Math.max(0, bikeEvidenceScore(label)),
        evidence: compactBikeEvidenceText(details, 300),
      } satisfies BikeContextCandidate,
    ]
  })
}

function bikeCandidatesFromSalesRows(rows: SqlResultRow[]): BikeContextCandidate[] {
  return rows.flatMap(row => {
    const text = rowTextForBikeContext(row)
    const score = bikeEvidenceScore(text)
    if (score < 4) return []
    return [
      {
        source: 'sales_history' as const,
        label: compactBikeEvidenceText(row.description, 180),
        brand: detectBikeBrand(text),
        sale_date: String(row.sale_date ?? '').trim() || null,
        sale_id: String(row.sale_id ?? '').trim() || null,
        category: compactBikeEvidenceText(row.category, 120) || null,
        sku: compactBikeEvidenceText(row.sku, 80) || null,
        score,
        evidence: compactBikeEvidenceText(text, 260),
      } satisfies BikeContextCandidate,
    ]
  })
}

function bikeCandidatesFromWorkorders(workorders: Awaited<ReturnType<typeof listGenieWorkorders>>['workorders']): BikeContextCandidate[] {
  return workorders.flatMap(workorder => {
    const evidenceChunks = [
      workorder.note,
      workorder.internal_note,
      ...workorder.lines.map(line => line.note),
      ...workorder.items.map(item => [item.description, item.sku, item.note].filter(Boolean).join(' ')),
    ].map(value => String(value ?? '').trim()).filter(Boolean)

    return evidenceChunks.flatMap(text => {
      const score = bikeEvidenceScore(text) + 1
      if (score < 4) return []
      return [
        {
          source: 'workorder' as const,
          label: compactBikeEvidenceText(text, 180),
          brand: detectBikeBrand(text),
          workorder_id: workorder.workorder_id,
          status_name: workorder.status_name,
          updated_at: workorder.updated_at || workorder.time_in || null,
          score,
          evidence: compactBikeEvidenceText(text, 260),
        } satisfies BikeContextCandidate,
      ]
    })
  })
}

function rankBikeCandidates(candidates: BikeContextCandidate[]) {
  const byKey = new Map<string, {
    label: string
    brand: string | null
    confidence_score: number
    evidence_sources: string[]
    evidence: string[]
  }>()

  for (const candidate of candidates) {
    const key = normalizeText(`${candidate.brand ?? ''} ${candidate.label}`).slice(0, 120)
    const previous = byKey.get(key)
    const sourceLabel = candidate.source === 'customer_serialized'
      ? `serialized ${candidate.serialized_id}`
      : candidate.source === 'workorder_serialized'
        ? `workorder serialized ${candidate.serialized_id}`
        : candidate.source === 'workorder'
          ? `workorder ${candidate.workorder_id}`
          : `sale ${candidate.sale_id ?? candidate.sale_date ?? ''}`.trim()
    if (!previous) {
      byKey.set(key, {
        label: candidate.label,
        brand: candidate.brand,
        confidence_score: candidate.score,
        evidence_sources: [sourceLabel],
        evidence: [candidate.evidence],
      })
      continue
    }
    previous.confidence_score += candidate.score
    if (!previous.evidence_sources.includes(sourceLabel)) previous.evidence_sources.push(sourceLabel)
    if (!previous.evidence.includes(candidate.evidence)) previous.evidence.push(candidate.evidence)
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .slice(0, 8)
    .map(candidate => ({
      ...candidate,
      evidence_sources: candidate.evidence_sources.slice(0, 6),
      evidence: candidate.evidence.slice(0, 5),
    }))
}

function profileCandidateFromRow(row: {
  customer_id?: unknown
  name?: unknown
  company?: unknown
}): GenieCustomerProfileCandidate | null {
  const customerId = String(row.customer_id ?? '').trim()
  if (!customerId) return null
  return {
    customer_id: customerId,
    name: String(row.name ?? '').trim() || `Customer ${customerId}`,
    company: String(row.company ?? '').trim() || null,
  }
}

function dedupeProfileCandidates(candidates: Array<GenieCustomerProfileCandidate | null | undefined>): GenieCustomerProfileCandidate[] {
  const byId = new Map<string, GenieCustomerProfileCandidate>()
  for (const candidate of candidates) {
    if (!candidate?.customer_id) continue
    const previous = byId.get(candidate.customer_id)
    byId.set(candidate.customer_id, {
      customer_id: candidate.customer_id,
      name: previous?.name || candidate.name,
      company: previous?.company ?? candidate.company,
    })
  }
  return Array.from(byId.values())
}

function customerProfileFromRow(row: LightspeedCustomerRow | ReturnType<typeof salesReportCustomerBase>): GenieCustomerProfileCustomer {
  return {
    customer_id: String(row.customer_id ?? '').trim(),
    name: String(row.name ?? '').trim() || `Customer ${String(row.customer_id ?? '').trim()}`,
    company: String(row.company ?? '').trim() || null,
    phones: Array.isArray(row.phones)
      ? row.phones.map(phone => ({
          number: String(phone.number ?? '').trim(),
          use_type: phone.use_type ? String(phone.use_type).trim() : null,
        })).filter(phone => phone.number)
      : [],
    emails: Array.isArray(row.emails)
      ? row.emails.map(email => ({
          address: String(email.address ?? '').trim(),
          use_type: email.use_type ? String(email.use_type).trim() : null,
        })).filter(email => email.address)
      : [],
    addresses: Array.isArray(row.addresses)
      ? row.addresses.map(address => ({
          address1: String(address.address1 ?? '').trim(),
          city: address.city ? String(address.city).trim() : null,
          state: address.state ? String(address.state).trim() : null,
          zip: address.zip ? String(address.zip).trim() : null,
          country: address.country ? String(address.country).trim() : null,
        })).filter(address => address.address1 || address.city || address.zip)
      : [],
    no_email: Boolean(row.no_email),
    no_phone: Boolean(row.no_phone),
    no_mail: Boolean(row.no_mail),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    archived: Boolean(row.archived),
  }
}

async function resolveCustomerForProfile(
  userId: string,
  args: { customer_id?: string; query?: string },
  emit?: Emit,
): Promise<
  | {
      status: 'resolved'
      customer_id: string
      customer: GenieCustomerProfileCustomer
      candidates: GenieCustomerProfileCandidate[]
    }
  | {
      status: 'ambiguous' | 'not_found'
      customer: null
      candidates: GenieCustomerProfileCandidate[]
    }
> {
  const query = String(args.query ?? '').trim()
  const shouldPreferSql = !args.customer_id && query && !query.includes('@') && phoneDigits(query).length < 3

  if (shouldPreferSql) {
    const sqlResolved = await resolveSalesReportCustomer(userId, args, emit).catch(() => null)
    if (sqlResolved?.status === 'resolved') {
      const liveProfile = await getLightspeedCustomerProfile(userId, { customer_id: sqlResolved.customer_id }, emit).catch(() => null)
      const customer = customerProfileFromRow(
        liveProfile && 'customer' in liveProfile && liveProfile.customer
          ? liveProfile.customer
          : sqlResolved.customer,
      )
      return {
        status: 'resolved',
        customer_id: sqlResolved.customer_id,
        customer,
        candidates: dedupeProfileCandidates([
          profileCandidateFromRow(customer),
          ...sqlResolved.candidates.map(profileCandidateFromRow),
        ]),
      }
    }

    if (sqlResolved?.status === 'ambiguous') {
      const liveResolved = await resolveLightspeedCustomer(userId, args, emit).catch(() => null)
      if (liveResolved?.status === 'resolved') {
        const customer = customerProfileFromRow(liveResolved.customer)
        return {
          status: 'resolved',
          customer_id: liveResolved.customer_id,
          customer,
          candidates: dedupeProfileCandidates(liveResolved.candidates.map(profileCandidateFromRow)),
        }
      }
      return {
        status: 'ambiguous',
        customer: null,
        candidates: dedupeProfileCandidates([
          ...sqlResolved.candidates.map(profileCandidateFromRow),
          ...(liveResolved?.candidates ?? []).map(profileCandidateFromRow),
        ]),
      }
    }
  }

  const liveResolved = await resolveLightspeedCustomer(userId, args, emit).catch(() => null)
  if (liveResolved?.status === 'resolved') {
    const customer = customerProfileFromRow(liveResolved.customer)
    return {
      status: 'resolved',
      customer_id: liveResolved.customer_id,
      customer,
      candidates: dedupeProfileCandidates(liveResolved.candidates.map(profileCandidateFromRow)),
    }
  }

  const sqlResolved = await resolveSalesReportCustomer(userId, args, emit).catch(() => null)
  if (liveResolved?.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      customer: null,
      candidates: dedupeProfileCandidates([
        ...liveResolved.candidates.map(profileCandidateFromRow),
        ...(sqlResolved?.candidates ?? []).map(profileCandidateFromRow),
      ]),
    }
  }

  if (sqlResolved?.status === 'resolved') {
    const liveProfile = await getLightspeedCustomerProfile(userId, { customer_id: sqlResolved.customer_id }, emit).catch(() => null)
    const customer = customerProfileFromRow(
      liveProfile && 'customer' in liveProfile && liveProfile.customer
        ? liveProfile.customer
        : sqlResolved.customer,
    )
    return {
      status: 'resolved',
      customer_id: sqlResolved.customer_id,
      customer,
      candidates: dedupeProfileCandidates([
        profileCandidateFromRow(customer),
        ...sqlResolved.candidates.map(profileCandidateFromRow),
      ]),
    }
  }

  if (sqlResolved?.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      customer: null,
      candidates: dedupeProfileCandidates(sqlResolved.candidates.map(profileCandidateFromRow)),
    }
  }

  return {
    status: 'not_found',
    customer: null,
    candidates: dedupeProfileCandidates([
      ...(liveResolved?.candidates ?? []).map(profileCandidateFromRow),
      ...(sqlResolved?.candidates ?? []).map(profileCandidateFromRow),
    ]),
  }
}

function serializedBikeProfile(bike: SerializedBikeEvidence): GenieCustomerBikeProfile {
  return {
    serialized_id: bike.serializedId,
    label: bike.label,
    serial: bike.serial,
    item_id: bike.itemId,
    updated_at: bike.updatedAt,
    source: bike.source,
    linked_workorder_ids: bike.linkedWorkorderIds,
  }
}

function saleLineProfile(row: SalesReportLineRow): GenieCustomerSaleLineProfile {
  return {
    item_id: row.item_id ?? null,
    description: row.description ?? null,
    sku: row.sku ?? null,
    category: row.category ?? null,
    quantity: roundMoney(sqlLineQuantity(row)),
    total: roundMoney(sqlLineTotal(row)),
  }
}

function saleProfile(sale: GroupedSqlSale): GenieCustomerSaleProfile {
  return {
    sale_id: sale.sale_id,
    completed_at: sale.completed_at,
    completed_at_utc: sale.completed_at_utc,
    ticket_number: sale.ticket_number,
    items: salesReportItemsSummary(sale.lines),
    units: roundMoney(sale.units),
    subtotal: roundMoney(sale.subtotal),
    discounts: roundMoney(sale.discounts),
    total: roundMoney(sale.total),
    gross_profit: roundMoney(sale.gross_profit),
    lines: sale.lines.slice(0, 12).map(saleLineProfile),
  }
}

function topCustomerItems(rows: SalesReportLineRow[]): GenieCustomerTopItemProfile[] {
  const byItem = new Map<string, GenieCustomerTopItemProfile>()
  for (const row of rows) {
    const description = String(row.description ?? '').trim()
    if (!description) continue
    const quantity = sqlPositiveQuantity(row)
    if (quantity <= 0) continue

    const key = String(row.item_id || row.sku || description).trim().toLowerCase()
    const existing = byItem.get(key)
    const completeTime = row.complete_time ?? row.line_time ?? null
    if (!existing) {
      byItem.set(key, {
        item_id: row.item_id ?? null,
        description,
        sku: row.sku ?? null,
        category: row.category ?? null,
        quantity: roundMoney(quantity),
        gross_sales: roundMoney(Math.max(0, sqlLineRevenue(row))),
        last_purchase_at: formatStoreDateTime(completeTime) ?? completeTime,
      })
      continue
    }

    existing.quantity = roundMoney(existing.quantity + quantity)
    existing.gross_sales = roundMoney(existing.gross_sales + Math.max(0, sqlLineRevenue(row)))
    if (completeTime && (!existing.last_purchase_at || completeTime > existing.last_purchase_at)) {
      existing.last_purchase_at = formatStoreDateTime(completeTime) ?? completeTime
    }
  }

  return Array.from(byItem.values())
    .sort((a, b) => b.gross_sales - a.gross_sales || b.quantity - a.quantity)
    .slice(0, 12)
}

function inferredBikeProfilesFromHistory(args: {
  rows: SalesReportLineRow[]
  workorders: Awaited<ReturnType<typeof listGenieWorkorders>>['workorders']
  existingBikes: GenieCustomerBikeProfile[]
}): GenieCustomerBikeProfile[] {
  const existingLabels = new Set(
    args.existingBikes
      .map(bike => normalizeText(`${bike.label ?? ''} ${bike.serial ?? ''}`))
      .filter(Boolean),
  )
  const candidates = new Map<string, { label: string; score: number; updated_at: string | null; linked_workorder_ids: string[] }>()

  function addCandidate(label: string, score: number, updatedAt: string | null, workorderId?: string | null) {
    const cleanLabel = compactBikeEvidenceText(label, 180)
    if (!cleanLabel || score < 5) return
    const key = normalizeText(cleanLabel).slice(0, 140)
    if (!key || existingLabels.has(key)) return
    const previous = candidates.get(key)
    if (!previous) {
      candidates.set(key, {
        label: cleanLabel,
        score,
        updated_at: updatedAt,
        linked_workorder_ids: workorderId ? [workorderId] : [],
      })
      return
    }
    previous.score += score
    if (updatedAt && (!previous.updated_at || updatedAt > previous.updated_at)) previous.updated_at = updatedAt
    if (workorderId && !previous.linked_workorder_ids.includes(workorderId)) previous.linked_workorder_ids.push(workorderId)
  }

  for (const row of args.rows.slice(0, 400)) {
    const text = [row.description, row.category, row.sku].map(value => String(value ?? '').trim()).filter(Boolean).join(' ')
    addCandidate(text, bikeEvidenceScore(text), row.complete_time ?? row.line_time ?? null)
  }

  for (const workorder of args.workorders.slice(0, 80)) {
    const chunks = [
      workorder.note,
      workorder.internal_note,
      ...workorder.lines.map(line => line.note),
      ...workorder.items.map(item => [item.description, item.sku, item.note].filter(Boolean).join(' ')),
    ].map(value => String(value ?? '').trim()).filter(Boolean)

    for (const chunk of chunks) {
      addCandidate(chunk, bikeEvidenceScore(chunk) + 1, workorder.updated_at || workorder.time_in || null, workorder.workorder_id)
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((candidate, index) => ({
      serialized_id: `inferred-${index + 1}`,
      label: candidate.label,
      serial: null,
      item_id: null,
      updated_at: candidate.updated_at ? formatStoreDateTime(candidate.updated_at) ?? candidate.updated_at : null,
      source: 'sales_or_workorder_inference' as const,
      linked_workorder_ids: candidate.linked_workorder_ids.slice(0, 6),
    }))
}

function emptyCustomerProfile(args: {
  title: string
  query: string | null
  status: 'ambiguous' | 'not_found'
  candidates: GenieCustomerProfileCandidate[]
}): GenieCustomerProfilePayload {
  return {
    title: args.title,
    query: args.query,
    status: args.status,
    customer: null,
    candidates: args.candidates,
    sales_summary: null,
    bikes: [],
    workorders: [],
    recent_sales: [],
    top_items: [],
    data_quality: {
      sales_rows_checked: 0,
      sales_row_limit_reached: false,
      workorders_truncated: false,
      serialized_status: 'ok',
      serialized_error: null,
    },
  }
}

async function buildLightspeedCustomerProfile(
  userId: string,
  args: {
    customer_id?: string
    query?: string
    include_workorders?: boolean
    sales_row_limit?: number
  },
  emit?: Emit,
): Promise<GenieCustomerProfilePayload> {
  const query = String(args.query ?? args.customer_id ?? '').trim() || null
  emitProgress(emit, 'lightspeed_customers', query ? `Resolving customer profile for "${query}"...` : 'Resolving customer profile...')

  const resolved = await resolveCustomerForProfile(userId, args, emit)
  if (resolved.status !== 'resolved') {
    return emptyCustomerProfile({
      title: resolved.status === 'ambiguous' ? 'Customer Profile - Choose a Customer' : 'Customer Profile - No Match',
      query,
      status: resolved.status,
      candidates: resolved.candidates,
    })
  }

  const customerId = resolved.customer_id
  const includeWorkorders = args.include_workorders !== false
  const salesRowLimit = Math.min(Math.max(args.sales_row_limit ?? 100_000, 1_000), SALES_REPORT_SQL_HARD_MAX_ROWS)

  emitProgress(emit, 'lightspeed_customers', `Reading sales, bikes, and workshop history for ${resolved.customer.name}...`)
  const [salesResult, customerSerializedResult, workorderList] = await Promise.all([
    fetchSalesReportCustomerRows({ userId, customerId, maxRows: salesRowLimit, emit }),
    fetchCustomerSerializedBikeEvidence(userId, customerId),
    includeWorkorders
      ? listGenieWorkorders(userId, {
          scope: 'all',
          customer_id: customerId,
          limit: 100,
          include_details: true,
          include_archived: true,
          max_pages_per_status: 8,
        })
      : Promise.resolve(null),
  ])

  const rawWorkorders = workorderList?.workorders ?? []
  emitProgress(emit, 'lightspeed_customers', `Profiling ${plural(salesResult.rows.length, 'sale row')} and ${plural(rawWorkorders.length, 'work order')}...`)

  let serializedStatus: GenieCustomerProfilePayload['data_quality']['serialized_status'] = customerSerializedResult.status
  let serializedError = customerSerializedResult.status === 'error' ? customerSerializedResult.error ?? 'Serialized bike lookup failed' : null
  let workorderSerializedBikes: SerializedBikeEvidence[] = []
  if (includeWorkorders && rawWorkorders.length > 0) {
    try {
      workorderSerializedBikes = await fetchWorkorderSerializedBikeEvidence({ userId, workorders: rawWorkorders })
    } catch (error) {
      serializedStatus = 'error'
      serializedError = error instanceof Error ? error.message : String(error)
    }
  }

  const directBikes = mergeSerializedBikeEvidence([
    ...customerSerializedResult.bikes,
    ...workorderSerializedBikes,
  ]).map(serializedBikeProfile)
  const inferredBikes = inferredBikeProfilesFromHistory({
    rows: salesResult.rows,
    workorders: rawWorkorders,
    existingBikes: directBikes,
  })
  const bikes = [...directBikes, ...inferredBikes].slice(0, 14)
  const sales = groupSalesReportRows(salesResult.rows)
  const salesSummary = sales.length > 0
    ? {
        sale_count: sales.length,
        total_spend: roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0)),
        subtotal: roundMoney(sales.reduce((sum, sale) => sum + sale.subtotal, 0)),
        discounts: roundMoney(sales.reduce((sum, sale) => sum + sale.discounts, 0)),
        gross_profit: roundMoney(sales.reduce((sum, sale) => sum + sale.gross_profit, 0)),
        units: roundMoney(sales.reduce((sum, sale) => sum + sale.units, 0)),
        average_sale: roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0) / sales.length),
        first_purchase_at: sales.at(-1)?.completed_at ?? sales.at(-1)?.completed_at_utc ?? null,
        last_purchase_at: sales[0]?.completed_at ?? sales[0]?.completed_at_utc ?? null,
      }
    : {
        sale_count: 0,
        total_spend: 0,
        subtotal: 0,
        discounts: 0,
        gross_profit: 0,
        units: 0,
        average_sale: 0,
        first_purchase_at: null,
        last_purchase_at: null,
      }

  return {
    title: `Customer Profile - ${resolved.customer.name}`,
    query,
    status: 'resolved',
    customer: resolved.customer,
    candidates: resolved.candidates,
    sales_summary: salesSummary,
    bikes,
    workorders: rawWorkorders.map(fullWorkorderForAgent) as GenieWorkorderCard[],
    recent_sales: sales.slice(0, 12).map(saleProfile),
    top_items: topCustomerItems(salesResult.rows),
    data_quality: {
      sales_rows_checked: salesResult.rows.length,
      sales_row_limit_reached: salesResult.row_limit_reached,
      workorders_truncated: Boolean(workorderList?.truncated),
      serialized_status: serializedStatus,
      serialized_error: serializedError,
    },
  }
}

const WORKORDER_CUSTOMER_INTENT_RE = /\b(work ?orders?|jobs?|service|repair|repairs?|history|open|finished|complete|completed|done|due|today|tomorrow|pickup|ready|eta|note|notes?|internal|warranty|customer|client)\b/
const WORKORDER_NON_CUSTOMER_TOPIC_RE =
  /\b(bike|serial|serialized|pads?|brake|rotors?|chain|cassette|tyre|tire|bottom bracket|bb|labou?r|part|parts|frame|fork|crack(?:ed|s|ing)?|broken|damage(?:d)?|warranty|defect|creak(?:ing|s)?|noise|dent(?:ed)?|snap(?:ped|ping)?|fail(?:ure|ed|ing)?|recall|handlebar|derailleur|shifter|hub|wheel|rim|suspension|shock|carbon|dropout|headset|stem|crank|pedal|mention(?:ed|ing)?|containing)\b/

function looksLikeWorkorderNoteSearch(query: string): boolean {
  const normalized = normalizeText(query)
  if (!normalized) return false
  if (WORKORDER_NON_CUSTOMER_TOPIC_RE.test(normalized)) return true
  return /\b(note|notes|internal note|mentioning|containing|search(?:ing)? for|with (?:a )?(?:note|issue|problem))\b/.test(normalized)
}

function workorderCustomerLookupQuery(query: string): string | null {
  const clean = query.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  if (looksLikeWorkorderNoteSearch(clean)) return null
  if (clean.includes('@') || phoneDigits(clean).length >= 7) return clean
  if (/^#?\d+$/.test(clean)) return null

  const normalized = normalizeText(clean)
  const stripped = clean
    .replace(/['’]s\b/gi, '')
    .replace(/\b(show|find|list|pull|load|lookup|look|up|it|what|which|did|does|has|had|have|he|she|they|their|his|her|customer|client|person|for|of|about|with|all|any|the|a|an|work\s*orders?|workorders?|jobs?|service|repair|repairs?|history|open|finished|complete|completed|done|due|today|tomorrow|pickup|ready|eta|notes?|internal|warranty)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const lookupText = stripped || clean

  if (!WORKORDER_CUSTOMER_INTENT_RE.test(normalized) && !WORKORDER_NON_CUSTOMER_TOPIC_RE.test(normalized)) {
    const tokens = queryTokens(lookupText).filter(token => token.length >= 2)
    return tokens.length >= 2 && tokens.length <= 5 ? lookupText : null
  }
  if (!stripped) return null

  const strippedNormalized = normalizeText(stripped)
  if (WORKORDER_NON_CUSTOMER_TOPIC_RE.test(strippedNormalized)) return null
  const tokens = queryTokens(stripped).filter(token => token.length >= 2)
  return tokens.length >= 2 && tokens.length <= 5 ? stripped : null
}

function shouldResolveWorkorderCustomerQuery(query: string): boolean {
  return Boolean(workorderCustomerLookupQuery(query))
}

function matchingPartEvidence(args: {
  question: string
  salesRows: SqlResultRow[]
  workorders: Awaited<ReturnType<typeof listGenieWorkorders>>['workorders']
}) {
  const tokens = compatibilityPartTokens(args.question).map(normalizeText).filter(Boolean)
  if (tokens.length === 0) return []

  const salesEvidence = args.salesRows
    .filter(row => {
      const text = normalizeText(rowTextForBikeContext(row))
      return tokens.some(token => text.includes(token))
    })
    .slice(0, 12)
    .map(row => ({
      source: 'sales_history',
      sale_date: String(row.sale_date ?? '').trim() || null,
      sale_id: String(row.sale_id ?? '').trim() || null,
      description: compactBikeEvidenceText(row.description, 180),
      category: compactBikeEvidenceText(row.category, 120) || null,
      sku: compactBikeEvidenceText(row.sku, 80) || null,
    }))

  const workorderEvidence = args.workorders.flatMap(workorder => {
    const chunks = [
      workorder.note,
      workorder.internal_note,
      ...workorder.lines.map(line => line.note),
      ...workorder.items.map(item => [item.description, item.sku, item.note].filter(Boolean).join(' ')),
    ].map(value => compactBikeEvidenceText(value, 180)).filter(Boolean)

    return chunks
      .filter(chunk => {
        const text = normalizeText(chunk)
        return tokens.some(token => text.includes(token))
      })
      .slice(0, 8)
      .map(chunk => ({
        source: 'workorder',
        workorder_id: workorder.workorder_id,
        status_name: workorder.status_name,
        evidence: chunk,
      }))
  }).slice(0, 12)

  return [...salesEvidence, ...workorderEvidence].slice(0, 16)
}

async function fetchCustomerProfileSummary(userId: string, customerId: string) {
  if (!customerId) return null
  const client = createLightspeedClient(userId)
  const customer = await client.getCustomer(customerId, { load_relations: '["Contact"]' }).catch(() => null)
  if (!customer) return null
  const name = [customer.firstName, customer.lastName].map(part => String(part ?? '').trim()).filter(Boolean).join(' ')
  const phones = Array.isArray(customer.Contact?.Phones?.ContactPhone)
    ? customer.Contact?.Phones?.ContactPhone
    : customer.Contact?.Phones?.ContactPhone
      ? [customer.Contact.Phones.ContactPhone]
      : []
  const emails = Array.isArray(customer.Contact?.Emails?.ContactEmail)
    ? customer.Contact?.Emails?.ContactEmail
    : customer.Contact?.Emails?.ContactEmail
      ? [customer.Contact.Emails.ContactEmail]
      : []
  return {
    customer_id: String(customer.customerID ?? customerId),
    name: name || String(customer.company ?? '').trim() || null,
    company: String(customer.company ?? '').trim() || null,
    has_phone: phones.some(phone => String(phone.number ?? '').trim()),
    has_email: emails.some(email => String(email.address ?? '').trim()),
  }
}

function officialCompatibilityResearchQueries(args: {
  compatibilityQuestion: string
  bikeCandidates: ReturnType<typeof rankBikeCandidates>
}) {
  const part = compatibilityPartTokens(args.compatibilityQuestion).slice(0, 3).join(' ')
  const top = args.bikeCandidates.slice(0, 3)
  const queries = top.flatMap(candidate => {
    const base = candidate.label
    const brand = candidate.brand ?? ''
    return [
      `${base} ${part} official`,
      `${brand} ${base} service manual ${part}`.trim(),
      `${brand} ${base} technical manual ${part}`.trim(),
    ]
  })
  return Array.from(new Set(
    queries
      .map(query => query.replace(/\s+/g, ' ').trim())
      .filter(query => query.length > 8),
  )).slice(0, 8)
}

async function resolveCustomerBikeContext(args: {
  userId: string
  emit: Emit
  customer_query: string
  compatibility_question: string
  workorder_id?: string
  include_finished_workorders?: boolean
}) {
  const customerQuery = args.customer_query.trim()
  const compatibilityQuestion = args.compatibility_question.trim()
  emitStatus(args.emit, 'customer_context', `Finding customer context for "${customerQuery}"`)

  const [apiCustomerCandidates, candidateResult, workorderById, workorderList] = await Promise.all([
    fetchLightspeedCustomerCandidates(args.userId, customerQuery).catch(() => []),
    runInternalGenieSqlRows({
      userId: args.userId,
      emit: args.emit,
      purpose: `Find Lightspeed customer candidates for ${customerQuery}`,
      sql: buildCustomerCandidateSql(customerQuery),
      limit: 8,
    }),
    args.workorder_id
      ? getGenieWorkorder(args.userId, args.workorder_id).catch(() => null)
      : Promise.resolve(null),
    listGenieWorkorders(args.userId, {
      scope: args.include_finished_workorders === false ? 'open' : 'all',
      query: customerQuery,
      limit: 12,
      include_details: true,
      max_pages_per_status: 5,
    }).catch(() => ({
      scope: 'all' as const,
      statuses: [],
      workorders: [],
      total: 0,
      truncated: false,
    })),
  ])

  const sqlCustomerCandidates = candidateResult.status === 'ok'
    ? candidateResult.rows.map(customerCandidateFromSalesRow).filter((candidate): candidate is CustomerBikeLookupCandidate => Boolean(candidate))
    : []
  const customerCandidates = mergeCustomerLookupCandidates({
    apiCandidates: apiCustomerCandidates,
    salesCandidates: sqlCustomerCandidates,
    customerQuery,
  })
  const selectedCustomer = customerCandidates[0] ?? null
  const selectedCustomerId = selectedCustomer ? selectedCustomer.customer_id : ''
  const selectedCustomerName = selectedCustomer?.customer_full_name?.trim() || ''

  const initialWorkorders = [
    ...(workorderById ? [workorderById] : []),
    ...workorderList.workorders.filter(workorder => workorder.workorder_id !== workorderById?.workorder_id),
  ].slice(0, 12)
  const workorderCustomer = initialWorkorders.find(workorder => workorder.customer_id && workorder.customer_id !== '0')
  const effectiveCustomerId = selectedCustomerId || workorderCustomer?.customer_id || ''
  const effectiveCustomerName = selectedCustomerName || workorderCustomer?.customer_name || customerQuery

  emitStatus(args.emit, 'customer_context', effectiveCustomerId ? 'Reading customer bike records' : 'Customer match weak, checking work orders')
  const [salesResult, customerSerializedResult, customerWorkorderList, profile] = await Promise.all([
    effectiveCustomerId
      ? runInternalGenieSqlRows({
        userId: args.userId,
        emit: args.emit,
        purpose: `Read previous sales history for customer ${effectiveCustomerName}`,
        sql: buildCustomerSalesHistorySql(effectiveCustomerId),
        limit: 300,
      })
      : Promise.resolve({ status: 'ok' as const, rows: [], row_count: 0, limit_applied: false }),
    effectiveCustomerId
      ? fetchCustomerSerializedBikeEvidence(args.userId, effectiveCustomerId)
      : Promise.resolve({ status: 'ok' as const, bikes: [] }),
    effectiveCustomerId
      ? listGenieWorkorders(args.userId, {
        scope: args.include_finished_workorders === false ? 'open' : 'all',
        customer_id: effectiveCustomerId,
        limit: 12,
        include_details: true,
        max_pages_per_status: 3,
      }).catch(() => ({
        scope: 'all' as const,
        statuses: [],
        workorders: [],
        total: 0,
        truncated: false,
      }))
      : Promise.resolve({
        scope: 'all' as const,
        statuses: [],
        workorders: [],
        total: 0,
        truncated: false,
      }),
    effectiveCustomerId ? fetchCustomerProfileSummary(args.userId, effectiveCustomerId) : Promise.resolve(null),
  ])
  const workorderByDetailId = new Map<string, typeof initialWorkorders[number]>()
  for (const workorder of [...initialWorkorders, ...customerWorkorderList.workorders]) {
    workorderByDetailId.set(workorder.workorder_id, workorder)
  }
  const workorders = Array.from(workorderByDetailId.values()).slice(0, 12)

  emitStatus(args.emit, 'customer_context', 'Reading workorder bike records')
  const workorderSerializedBikes = await fetchWorkorderSerializedBikeEvidence({
    userId: args.userId,
    workorders,
  })
  const salesRows = salesResult.status === 'ok' ? salesResult.rows : []
  const serializedBikes = mergeSerializedBikeEvidence([
    ...customerSerializedResult.bikes,
    ...workorderSerializedBikes,
  ])

  const rankedBikeCandidates = rankBikeCandidates([
    ...bikeCandidatesFromSerializedBikes(serializedBikes),
    ...bikeCandidatesFromWorkorders(workorders),
    ...bikeCandidatesFromSalesRows(salesRows),
  ])
  const partEvidence = matchingPartEvidence({
    question: compatibilityQuestion,
    salesRows,
    workorders,
  })
  const confidence =
    rankedBikeCandidates.length === 0
      ? 'low'
      : rankedBikeCandidates[0].confidence_score >= 18
        ? 'high'
        : rankedBikeCandidates[0].confidence_score >= 10
          ? 'medium'
          : 'low'
  const ambiguity =
    rankedBikeCandidates.length > 1 &&
    rankedBikeCandidates[1].confidence_score >= rankedBikeCandidates[0].confidence_score * 0.75

  return {
    status: rankedBikeCandidates.length > 0 ? 'bike_context_found' : 'bike_context_not_found',
    customer_query: customerQuery,
    compatibility_question: compatibilityQuestion,
    selected_customer: effectiveCustomerId
      ? {
        customer_id: effectiveCustomerId,
        name: selectedCustomer?.customer_full_name ?? workorderCustomer?.customer_name ?? effectiveCustomerName,
        source: selectedCustomer?.source ?? (workorderCustomer ? 'workorder' : null),
        sale_count: selectedCustomer?.sale_count ?? null,
        gross_sales: selectedCustomer?.gross_sales ?? null,
        last_sale_at: selectedCustomer?.last_sale_at ?? null,
      }
      : null,
    customer_candidates: customerCandidates.slice(0, 5),
    customer_profile: profile,
    customer_bikes: {
      source: 'lightspeed_serialized_api',
      rows_checked: serializedBikes.length,
      api_status: customerSerializedResult.status,
      api_error: customerSerializedResult.status === 'error' ? customerSerializedResult.error : null,
      note: 'Lightspeed Serialized rows linked by customerID are usually the strongest bike-ownership indication, but Genie still checks workorders, sales history, and official compatibility sources before giving a fitment answer.',
      matches: serializedBikes.map(bike => ({
        serialized_id: bike.serializedId,
        label: bike.label,
        serial: bike.serial,
        item_id: bike.itemId,
        customer_id: bike.customerId,
        updated_at: bike.updatedAt,
        source: bike.source,
        linked_workorder_ids: bike.linkedWorkorderIds,
      })),
    },
    sales_history: {
      rows_checked: salesRows.length,
      limit_applied: salesResult.status === 'ok' ? salesResult.limit_applied : false,
      recent_items: salesRows.slice(0, 24).map(row => ({
        sale_date: row.sale_date ?? null,
        description: compactBikeEvidenceText(row.description, 180),
        category: compactBikeEvidenceText(row.category, 120) || null,
        sku: compactBikeEvidenceText(row.sku, 80) || null,
      })),
    },
    workorders: {
      rows_checked: workorders.length,
      truncated: workorderList.truncated || customerWorkorderList.truncated,
      matches: workorders.map(workorder => ({
        workorder_id: workorder.workorder_id,
        status_name: workorder.status_name,
        customer_name: workorder.customer_name,
        serialized_id: workorder.serialized_id,
        time_in: workorder.time_in,
        eta_out: workorder.eta_out,
        note: compactBikeEvidenceText(workorder.note, 260),
        internal_note: compactBikeEvidenceText(workorder.internal_note, 200),
        lines: workorder.lines.slice(0, 6).map(line => compactBikeEvidenceText(line.note, 160)).filter(Boolean),
        items: workorder.items.slice(0, 8).map(item => ({
          description: compactBikeEvidenceText(item.description, 140),
          sku: item.sku,
          note: compactBikeEvidenceText(item.note, 120),
        })),
      })),
    },
    bike_context: {
      likely_bikes: rankedBikeCandidates,
      confidence,
      ambiguity,
      part_or_standard_evidence: partEvidence,
    },
    official_research_required: true,
    official_research_queries: officialCompatibilityResearchQueries({
      compatibilityQuestion,
      bikeCandidates: rankedBikeCandidates,
    }),
    required_next_steps: rankedBikeCandidates.length === 0
      ? [
        'Ask for the exact bike model/year or inspect the bike before naming a compatibility part.',
        'If the customer has another work order ID, run this tool again with that workorder_id.',
      ]
      : [
        'Use hosted web_search next and prefer official manufacturer manuals, tech docs, or standards pages.',
        'For every plausible bike with official/public evidence, provide a conditional compatibility answer with confidence and the crank/frame check needed.',
        ambiguity ? 'If official research cannot disambiguate the top bikes, answer each plausible bike separately and ask one final clarification to choose between them.' : '',
      ].filter(Boolean),
  }
}

// ── Agent SDK tools ──────────────────────────────────────────────────────────

function emitWorkorderCards(emit: Emit, payload: GenieWorkorderCardsPayload | null) {
  if (!payload?.workorders.length) return
  emit({ event: 'workorders', workorders: payload })
}

function emitCustomerProfile(emit: Emit, payload: GenieCustomerProfilePayload | null) {
  if (!payload) return
  emit({ event: 'customer_profile', customer_profile: payload })
}

function emitGmailConnect(
  emit: Emit,
  connectUrl: string | null | undefined,
  reason: GmailConnectPayload['reason'],
  extras?: Pick<GmailConnectPayload, 'accounts' | 'can_add_more'>,
) {
  const url = connectUrl?.trim()
  emit({
    event: 'gmail_connect',
    gmail_connect: {
      url: url ?? '',
      reason,
      ...extras,
    } satisfies GmailConnectPayload,
  })
}

function emitComposioSession(emit: Emit, notice: ComposioSessionNotice) {
  emit({
    event: 'composio_session',
    toolkit: notice.toolkit,
    session_id: notice.session_id,
    reused: notice.reused,
  })
}

async function buildGmailEmailActionProposal(
  userId: string,
  emit: Emit,
  args: {
    action: 'send' | 'draft'
    summary: string
    recipient_email: string
    subject: string
    body: string
    cc?: string[]
    bcc?: string[]
    is_html?: boolean
    connected_account_id?: string
    composio_session_id?: string
    thread_id?: string
    reply_to_message_id?: string
  },
): Promise<{ proposal?: GmailEmailActionProposal; output: object }> {
  const recipient = args.recipient_email.trim()
  const subject = args.subject.trim()
  const body = args.body.trim()
  const threadId = args.thread_id?.trim() || null
  const replyToMessageId = args.reply_to_message_id?.trim() || null

  if (!recipient) {
    return { output: { error: 'recipient_email is required.' } }
  }
  if (!subject && !body) {
    return { output: { error: 'At least a subject or body is required.' } }
  }

  const connection = await getGmailConnection(userId, args.connected_account_id?.trim() || undefined).catch((error) => {
    const message = error instanceof Error ? error.message : 'Gmail connection check failed.'
    emitGmailConnect(emit, null, 'send')
    return { error: message } as const
  })
  if (connection && 'error' in connection) {
    return { output: { connected: false, error: connection.error } }
  }
  if (!connection || connection.status !== 'ACTIVE') {
    let connectUrl: string | null = null
    if (isComposioConfigured()) {
      try {
        const link = await mintGmailConnectLink(userId)
        connectUrl = link.url
      } catch {
        connectUrl = null
      }
    }
    emitGmailConnect(emit, connectUrl, 'send')
    return {
      output: {
        connected: false,
        connect_url: connectUrl,
        message: 'Gmail is not connected yet. Ask the store to connect Gmail before sending or drafting.',
      },
    }
  }

  const bodyPreview = body.slice(0, 120) || '(Empty body)'
  const description =
    args.action === 'draft'
      ? `This will create a Gmail draft addressed to ${recipient} with subject '${subject || '(No subject)'}' and body '${bodyPreview}'. No sensitive data is being shared yet.`
      : `This will send a Gmail email addressed to ${recipient} with subject '${subject || '(No subject)'}' and body '${bodyPreview}'. No sensitive data is being shared yet.`

  const proposal: GmailEmailActionProposal = {
    kind: 'gmail_email_action',
    action: args.action,
    summary: args.summary,
    recipient_email: recipient,
    subject,
    body,
    cc: args.cc,
    bcc: args.bcc,
    is_html: args.is_html,
    connected_account_id: connection.id,
    composio_session_id: args.composio_session_id?.trim() || null,
    thread_id: threadId,
    reply_to_message_id: replyToMessageId,
    description,
    sharing_data: [
      { label: 'Recipient', value: recipient },
      ...(threadId ? [{ label: 'Thread', value: threadId }] : []),
      ...(replyToMessageId ? [{ label: 'Source message', value: replyToMessageId }] : []),
    ],
  }

  return { proposal, output: { staged: true, action: args.action, recipient_email: recipient } }
}

function executorModelForRoute(
  route: GenieOrchestrationDecision['route'],
  planned: boolean,
  models: GenieModelConfig = DEFAULT_GENIE_MODELS,
): string {
  if (route === 'business_analysis') return models.strategicExecutor
  if (route === 'mixed' && planned) return models.strategicExecutor
  return models.fastExecutor
}

function buildSpecialistAgentTools(
  route: GenieOrchestrationDecision['route'],
  models: GenieModelConfig = DEFAULT_GENIE_MODELS,
) {
  const tools = []

  if (route === 'web_research' || route === 'mixed') {
    const cyclingCompatibilityAgent = new Agent({
      name: 'Yellow Jersey Cycling Compatibility Specialist',
      model: models.fastExecutor,
      instructions: [
        'You are a senior bicycle mechanic and product standards specialist.',
        'Review the supplied private bike evidence and public source notes. Identify the likely exact bike/frame, the standard or part needed, confidence, and any shop-floor verification still required.',
        'If more than one customer bike is plausible, evaluate each plausible bike separately. Give conditional answers for each option instead of stopping at ambiguity.',
        'Prefer manufacturer manuals, official tech docs, standards bodies, or supplier technical pages. Flag unsupported forum or retailer claims.',
        'Be concise. Do not invent compatibility standards. If evidence is insufficient, say exactly what model/year/build detail is missing.',
      ].join('\n'),
      tools: [],
      modelSettings: {
        parallelToolCalls: false,
        store: false,
        reasoning: { effort: 'low', summary: 'auto' },
        text: { verbosity: 'low' },
      },
    })

    tools.push(cyclingCompatibilityAgent.asTool({
      toolName: 'consult_cycling_compatibility_specialist',
      toolDescription: 'Ask a senior bike-mechanic specialist to critique a compatibility answer after private bike evidence and official/public source notes have been gathered. Use for bottom brackets, brake pads, hangers, bearings, axles, headsets, tyre clearance, drivetrains, and other fitment-risk answers.',
      parameters: z.object({
        compatibility_question: z.string().min(3),
        private_bike_evidence: z.string().min(3).describe('Customer sales/workorder evidence, exact bike candidates, and unresolved ambiguity.'),
        official_source_notes: z.string().min(3).describe('Notes from official manufacturer/manual/technical pages or a clear statement that no official source was found.'),
        draft_answer: z.string().optional().describe('Optional draft answer to critique before final response.'),
      }),
      runOptions: { maxTurns: 2, reasoningItemIdPolicy: 'omit' },
      runConfig: {
        tracingDisabled: !isGenieTracingEnabled(),
        traceIncludeSensitiveData: false,
        workflowName: 'Yellow Jersey Cycling Compatibility Specialist',
      },
    }))
  }

  if (route === 'business_analysis') {
    const bikeStoreAnalystAgent = new Agent({
      name: 'Yellow Jersey Bike Store Analyst',
      model: models.strategicExecutor,
      instructions: [
        'You are a bike-store commercial analyst. Translate Lightspeed evidence into ranked profit, cash, inventory, customer, and workshop opportunities.',
        'Challenge generic advice. Every recommendation must connect to supplied numbers or explicitly state the missing data.',
        'Rank by likely commercial impact, speed to execute, and operational risk for a bicycle retailer.',
      ].join('\n'),
      tools: [],
      modelSettings: {
        parallelToolCalls: false,
        store: false,
        reasoning: { effort: 'medium', summary: 'concise' },
        text: { verbosity: 'medium' },
      },
    })

    tools.push(bikeStoreAnalystAgent.asTool({
      toolName: 'consult_bike_store_analyst',
      toolDescription: 'Ask a specialist bike-store analyst to critique and rank a broad business-performance answer after the required Lightspeed SQL evidence has been gathered.',
      parameters: z.object({
        business_question: z.string().min(3),
        data_evidence: z.string().min(3).describe('Condensed metrics from SQL/tool results.'),
        draft_recommendations: z.string().min(3).describe('Draft ranked opportunities or findings to critique.'),
      }),
      runOptions: { maxTurns: 2, reasoningItemIdPolicy: 'omit' },
      runConfig: {
        tracingDisabled: !isGenieTracingEnabled(),
        traceIncludeSensitiveData: false,
        workflowName: 'Yellow Jersey Bike Store Analyst',
      },
    }))
  }

  return tools
}

function buildAgentTools(
  supabase: Supa,
  userId: string,
  emit: Emit,
  visualPrefs: VisualPrefs,
  latestUserMessage: string,
  route: GenieOrchestrationDecision['route'],
  executionPlan: GenieExecutionPlan | null,
  composioSessionIds: ComposioSessionIds = {},
  models: GenieModelConfig = DEFAULT_GENIE_MODELS,
  modelProfile: GenieModelProfile = 'default',
) {
  const allowedToolNames = toolNameSetForRoute(route, executionPlan?.primary_tools ?? [])
  const runtime = getGenieRuntimePolicy(modelProfile)
  // Hard cap on answer-verification passes. The model otherwise treats
  // verify_question_answered as a "keep working" checkpoint and loops it
  // 5-11x per run (each pass on high-stakes routes also fires the LLM judge),
  // which is the single biggest latency sink on business_analysis runs.
  const MAX_VERIFY_CALLS = runtime.maxVerifyCalls
  let verifyCallCount = 0
  let gmailComposioSessionId = composioSessionIds.gmail?.trim() || undefined
  const onGmailComposioSession = (notice: ComposioSessionNotice) => {
    gmailComposioSessionId = notice.session_id
    emitComposioSession(emit, notice)
  }
  const proposalToolOutput = (result: { proposal?: GenieProposal; output: object }) => {
    if (result.proposal) emit({ event: 'proposal', proposal: result.proposal })
    return result.output
  }

  const tools = [
    ...(shouldExposeHostedWebSearch(route)
      ? [
        webSearchTool({
          searchContextSize: 'low',
          externalWebAccess: true,
        }),
      ]
      : []),
    ...buildXeroTools(userId, emit),
    ...buildDeputyTools(userId, emit),
    ...buildPurchaseOrderTools(supabase, userId, emit),
    tool({
      name: 'search_web_images',
      description: 'Search the web for reference product or cycling photos when the user wants to see what something looks like. Use for specific bikes, parts, gear, colours, setup examples, or "what does X look like" — not for analytics, rankings, or abstract non-visual questions. Prefer show_product_images on store inventory tools when the user wants to see their own stock.',
      parameters: z.object({
        query: z.string().describe('Specific visual search, e.g. "2024 Trek Fuel EX 8", "Shimano XT rear derailleur", "gravel bike setup".'),
        limit: z.number().int().min(1).max(6).optional().describe('Number of images to show. Defaults to 4.'),
      }),
      async execute({ query, limit }) {
        emitStatus(emit, 'image_search', `Finding images for "${query.trim()}"...`)
        const result = await searchWebImages(query, { limit })
        if (result.images.length > 0) {
          emit({ event: 'web_images', images: result.images, query: result.query })
        }
        emitStatus(emit, 'image_search_done', 'Images ready')
        return {
          query: result.query,
          found: result.images.length,
          images: result.images.map(image => ({
            title: image.title,
            domain: image.domain,
          })),
          message: result.message,
        }
      },
    }),
    tool({
      name: 'resolve_customer_bike_context',
      description: 'Ground customer-specific bike compatibility questions before web research. Extensively checks the named customer, live Lightspeed Serialized bike records linked by customerID, workorder serializedID links, customer profile availability, previous sales, active and finished work orders, work-order notes, parts, and likely bike model evidence. Serialized.description is usually the strongest owned-bike indication, but it is not the only proof. Always use this before hosted web_search when the user asks what part/standard a customer needs and the exact bike is not already proven. If several bikes remain plausible, use the returned candidates to answer conditionally for each plausible bike.',
      parameters: z.object({
        customer_query: z.string().min(2).describe('Customer name, customer ID, or work-order customer phrase from the user question.'),
        compatibility_question: z.string().min(3).describe('The exact compatibility/fitment question, e.g. "what bottom bracket do they need?".'),
        workorder_id: z.string().optional().describe('Known workorder ID if the user referenced one.'),
        include_finished_workorders: z.boolean().optional().describe('Defaults true. Set false only when the user explicitly asks for active/open jobs only.'),
      }),
      async execute(args) {
        return resolveCustomerBikeContext({
          userId,
          emit,
          customer_query: args.customer_query,
          compatibility_question: args.compatibility_question,
          workorder_id: args.workorder_id,
          include_finished_workorders: args.include_finished_workorders,
        })
      },
    }),
    tool({
      name: 'record_lightspeed_plan',
      description: 'Record a detailed analysis plan only before broad, complex, multi-pass Lightspeed sales, inventory, product, customer, or business-performance analysis. Do not call this for narrow direct lookups or one-query reports.',
      parameters: z.object({
        steps: z.array(z.string()).min(1).max(40),
      }),
      async execute({ steps }) {
        const cleanSteps = steps.map(step => step.trim()).filter(Boolean)
        const summary =
          cleanSteps.length <= 6
            ? cleanSteps.join(' → ')
            : `${cleanSteps.slice(0, 6).join(' → ')} → ${cleanSteps.length - 6} more`
        emitStatus(emit, 'planning', summary ? `Planning ${plural(cleanSteps.length, 'step')}: ${summary}` : 'Planning Lightspeed lookup...')
        emitAnalysisPlan(emit, {
          source: 'agent',
          user_intent: summary || null,
          execution_steps: cleanSteps,
        })
        emit({ event: 'reasoning_done', text: cleanSteps.map(step => `- ${step}`).join('\n') })
        return { status: 'planned', steps: cleanSteps }
      },
    }),
    tool({
      name: 'record_answer_recheck',
      description: 'Record the next lookup strategy when tool results, answer_readiness gaps, or recheck_required show the user question is not answered yet. Call before the follow-up tool (Gmail search, SQL, web, etc.).',
      parameters: z.object({
        reason: z.string().min(3).describe('Why the current evidence does not answer the user question.'),
        next_strategy: z.string().min(3).describe('The materially different next tool/query strategy.'),
        previous_tool: z.string().optional(),
        changed_inputs: z.array(z.string()).max(8).optional(),
      }),
      async execute(args) {
        const reason = args.reason.trim()
        const nextStrategy = args.next_strategy.trim()
        const changedInputs = (args.changed_inputs ?? []).map((input) => input.trim()).filter(Boolean)
        emitStatus(emit, 'rechecking', `Rechecking: ${nextStrategy}`)
        emit({
          event: 'reasoning_done',
          text: [
            'Answer recheck:',
            `- Reason: ${reason}`,
            `- Next: ${nextStrategy}`,
            args.previous_tool ? `- Previous tool: ${args.previous_tool}` : null,
            changedInputs.length ? `- Changed inputs: ${changedInputs.join('; ')}` : null,
          ].filter(Boolean).join('\n'),
        })
        return {
          status: 'recheck_recorded',
          reason,
          next_strategy: nextStrategy,
          previous_tool: args.previous_tool ?? null,
          changed_inputs: changedInputs,
        }
      },
    }),
    tool({
      name: 'verify_question_answered',
      description: 'Use at most once as a final gate for broad or high-stakes tool answers. Pass remaining_gaps=[] only when the draft answers the user question with evidence. If gaps remain, answer now with a concise caveat instead of looping through more verification passes.',
      parameters: z.object({
        user_question: z.string().min(3).describe('The user question you are answering, in their words.'),
        draft_answer: z.string().min(3).describe('Your draft final answer — not yet shown to the user.'),
        remaining_gaps: z.array(z.string()).max(10).describe('Empty only when every part of the question is answered with evidence.'),
        success_criteria: z.array(z.string()).max(10).optional().describe('From the execution plan answer_success_criteria — pass through so each check is validated.'),
      }),
      async execute(args) {
        verifyCallCount += 1
        // After the cap, stop looping: accept the draft and force the model to
        // answer now with what it has. A slightly-imperfect answer beats another
        // 90s of verify+judge churn (or a context-overflow failure).
        if (verifyCallCount > MAX_VERIFY_CALLS) {
          emitStatus(emit, 'responding', 'Wrapping up the answer')
          return {
            ready: true,
            status: 'ready' as const,
            gaps: [],
            instruction:
              'Verification budget reached. Write the best final answer now from the evidence already gathered, and state any remaining caveat in one line. Do not call more tools.',
          }
        }
        // High-stakes routes get an extra nano-model judge pass once the
        // deterministic checks pass; everything else stays zero-LLM-cost.
        const useJudge = runtime.useVerifyJudge
          && (route === 'business_analysis' || (route === 'mixed' && executionPlan != null))
        const result = await verifyQuestionAnsweredWithJudge({
          user_question: args.user_question.trim(),
          draft_answer: args.draft_answer.trim(),
          remaining_gaps: args.remaining_gaps ?? [],
          success_criteria: args.success_criteria,
        }, { useJudge })
        if (!result.ready && verifyCallCount >= MAX_VERIFY_CALLS) {
          emitStatus(emit, 'responding', 'Answering with available evidence')
          return {
            ready: true,
            status: 'ready' as const,
            gaps: result.gaps,
            instruction:
              'One-pass verification found caveats. Write the final answer now from the evidence already gathered, mention the key caveat in one line, and do not call more tools.',
          }
        }
        if (!result.ready) {
          emitStatus(emit, 'rechecking', 'Answer incomplete — continuing lookup')
        } else {
          emitStatus(emit, 'responding', 'Verified — writing the final answer')
        }
        return result
      },
    }),
    tool({
      name: 'record_lightspeed_recheck',
      description: 'Record the required second Lightspeed lookup strategy after a first tool result is empty, weak, ambiguous, partial, row-limited, still backfilling, or does not answer the user request. Call this before the recheck tool call.',
      parameters: z.object({
        reason: z.string().min(3).describe('Why the first Lightspeed result was not enough.'),
        next_strategy: z.string().min(3).describe('The materially different SQL Lightspeed strategy to try next.'),
        previous_tool: z.string().optional().describe('The previous Lightspeed tool that returned weak, empty, ambiguous, partial, or non-answering results.'),
        changed_inputs: z.array(z.string()).max(8).optional().describe('Specific changed query terms, date ranges, thresholds, page strategy, or tool inputs for the recheck.'),
      }),
      async execute(args) {
        const reason = args.reason.trim()
        const nextStrategy = args.next_strategy.trim()
        const changedInputs = (args.changed_inputs ?? []).map(input => input.trim()).filter(Boolean)
        emitStatus(emit, 'rechecking', `Rechecking: ${nextStrategy}`)
        emit({
          event: 'reasoning_done',
          text: [
            'Recheck:',
            `- Reason: ${reason}`,
            `- Next: ${nextStrategy}`,
            args.previous_tool ? `- Previous tool: ${args.previous_tool}` : null,
            changedInputs.length ? `- Changed inputs: ${changedInputs.join('; ')}` : null,
          ].filter(Boolean).join('\n'),
        })
        return {
          status: 'recheck_recorded',
          reason,
          next_strategy: nextStrategy,
          previous_tool: args.previous_tool ?? null,
          changed_inputs: changedInputs,
        }
      },
    }),
    tool({
      name: 'run_lightspeed_sql_query',
      description: `Run one validated read-only SQL query for Lightspeed reporting. Use this for Lightspeed sales analytics, customer rankings, customer purchase history, sold-product analysis, current inventory, stock-on-hand, brand/supplier/category inventory, inventory value, cost/profit/margin reporting, transaction lists, and chart/table requests. Available tenant-scoped relations: ${GENIE_LIGHTSPEED_SQL_VIEW} (${GENIE_LIGHTSPEED_SQL_SCHEMA.join(', ')}), and ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW} (${GENIE_LIGHTSPEED_INVENTORY_SQL_SCHEMA.join(', ')}). Write a single SELECT/WITH query whenever possible. For customer rankings, aggregate sale lines to sale_id first, then aggregate by customer. For current inventory, use brand_name and supplier_name as first-class columns. Do not query raw tables, raw JSON, secrets, or user_id.`,
      parameters: z.object({
        purpose: z.string().min(3).describe('Brief business purpose for the query, e.g. "Top customers by gross sales over the last 3 years".'),
        sql: z.string().min(10).describe(`A single SELECT/WITH query against ${GENIE_LIGHTSPEED_SQL_VIEW} and/or ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}. Do not include semicolons or comments.`),
        limit: z.number().int().min(1).max(GENIE_LIGHTSPEED_SQL_MAX_LIMIT).optional().describe('Maximum rows to return. Defaults to 500, hard max 1000.'),
        visual: z.object({
          table_title: z.string().optional(),
          table_subtitle: z.string().optional(),
          pivot_table: z.object({
            title: z.string().optional(),
            subtitle: z.string().optional(),
            row_fields: z.array(z.string()).min(1).max(3).describe('Dimension columns for pivot rows, e.g. ["category_name"].'),
            column_fields: z.array(z.string()).max(2).optional().describe('Dimension columns for pivot columns, e.g. ["sale_month"].'),
            value_field: z.string().optional().describe('Numeric field to aggregate, e.g. "gross_sales". Optional when aggregation is count.'),
            aggregation: z.enum(['sum', 'count', 'avg', 'min', 'max', 'count_distinct']).optional().describe('How to aggregate value_field within each row/column cell. Defaults to sum.'),
            value_format: z.enum(['currency', 'number', 'percent']).optional(),
            show_totals: z.boolean().optional().describe('Show row/column totals. Defaults to true.'),
          }).optional().describe('Build a pivot/crosstab from the SQL rows instead of a flat table.'),
          chart_kind: z.enum(['bar', 'line']).optional(),
          chart_title: z.string().optional(),
          chart_subtitle: z.string().optional(),
          chart_x_key: z.string().optional().describe('Column name to use for chart labels.'),
          chart_y_keys: z.array(z.string()).max(5).optional().describe('Numeric column names to chart.'),
          value_format: z.enum(['currency', 'number', 'percent']).optional(),
        }).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Running SQL report: ${args.purpose}`)
        return runLightspeedSqlQuery(userId, args, emit, visualPrefs, latestUserMessage)
      },
    }),
    ...(runtime.includeSpecialists ? buildSpecialistAgentTools(route, models) : []),
    tool({
      name: 'get_lightspeed_sales_summary',
      description: 'Aggregate completed Lightspeed sales totals, net sales, total cost, gross profit, and gross margin for an ISO date range from the lightspeed_sales_report_lines SQL table.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        cost_method: z.enum(['avg', 'fifo']).optional().describe('Cost method for margin/profit calculations. Defaults to avg.'),
        max_pages: z.number().int().min(1).max(220).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Querying SQL sales totals for ${args.start_date} to ${args.end_date}...`)
        return getLightspeedSalesSummarySql(userId, args, emit)
      },
    }),
    tool({
      name: 'get_lightspeed_sales_list',
      description: 'Fetch individual completed Lightspeed sale transactions for an ISO date range from the lightspeed_sales_report_lines SQL table. Use for every-sale, transaction, receipt, order, detailed sale-list, and sale-level profit/margin requests.',
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
        emitStatus(emit, 'lightspeed_sales', `Querying SQL sale transaction list for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedSalesListSql(userId, args, emit)
        const table = buildSalesListTable(result)
        if (table) emit({ event: 'table', table })
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_sales_timeseries',
      description: 'Query completed Lightspeed sales from the SQL sales report table and bucket them by day, week, month, or year for sales, cost, gross profit, gross margin, graphs, bar charts, line charts, breakdowns, and tables.',
      parameters: z.object({
        start_date: z.string().describe('YYYY-MM-DD'),
        end_date: z.string().describe('YYYY-MM-DD'),
        bucket: z.enum(['day', 'week', 'month', 'year']).optional(),
        metric: z.enum(['gross_sales', 'net_sales', 'sale_count', 'average_sale_value', 'total_cost', 'gross_profit', 'gross_margin_percent']).optional(),
        cost_method: z.enum(['avg', 'fifo']).optional().describe('Cost method for margin/profit calculations. Defaults to avg.'),
        max_pages: z.number().int().min(1).max(220).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_sales', `Querying SQL ${args.bucket ?? 'auto-bucketed'} sales chart for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedSalesTimeseriesSql(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildSalesTimeseriesVisuals(result, visualPrefs))
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_top_sold_products',
      description: 'Aggregate top sold products by quantity, revenue, gross profit, or margin over an ISO date range from the lightspeed_sales_report_lines SQL table. When query is provided, filter and fuzzy-rank stored sale-line description, SKU, item ID, and category fields.',
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
        emitStatus(emit, 'lightspeed_sales', `Querying SQL top-sold product lookup for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedTopSoldProductsSql(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildTopSoldVisuals(result))
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_sold_product_timeseries',
      description: 'Query SQL sale lines, fuzzy-match a product/service/category/SKU query, and bucket matched sold lines by day, week, month, or year. Use for monthly charts/tables of units, revenue, item cost, gross profit, margin, or average unit cost for a specific product/service over time.',
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
        emitStatus(emit, 'lightspeed_sales', `Querying SQL ${args.bucket ?? 'auto-bucketed'} trend for "${args.query}"...`)
        const result = await getLightspeedSoldProductTimeseriesSql(userId, args, emit)
        emitStatus(emit, 'lightspeed_sales', `Rendering ${result.metric_label.toLowerCase()} visuals for "${result.query}"...`)
        emitVisuals(emit, visualPrefs, buildSoldProductTimeseriesVisuals(result, visualPrefs))
        return result
      },
    }),
    tool({
      name: 'search_lightspeed_inventory',
      description: 'Search the SQL Lightspeed inventory mirror by product, SKU, barcode, brand, supplier, or category. Use for current stock, availability, item detail, brand inventory, supplier inventory, price/cost, QOH, sellable quantity, and reorder questions. The mirror syncs every 10 minutes; do not call the live Lightspeed API from Genie. For small product availability lookups, this tool may stream product cards and return product_links/product_url values; use those URLs as Markdown links in the answer when present. Pass show_product_images:true when the user explicitly wants to see what specific products look like.',
      parameters: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).optional(),
        in_stock_only: z.boolean().optional().describe('Restrict to items currently in stock with total_qoh > 0. Defaults to false.'),
        include_archived: z.boolean().optional().describe('Include archived Lightspeed items. Defaults to false.'),
        show_product_images: z.boolean().optional().describe('Set true when the user asks to see/show/look at specific products. Never use for rankings, totals, or analytics.'),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_inventory', `Searching inventory mirror for "${args.query}"...`)
        const result = await searchLightspeedInventorySql(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildInventoryVisuals(result))

        if (!('error' in result) && Array.isArray(result.matches)) {
          const previewMatches = inventoryMatchesForPreview(result.matches.map(match => ({
            item_id: String(match.item_id ?? ''),
            name: String(match.name ?? match.item_id ?? ''),
            price: Number(match.price) || undefined,
            category: match.category != null ? String(match.category) : null,
            brand: match.brand != null ? String(match.brand) : null,
            primary_image_url: match.primary_image_url != null ? String(match.primary_image_url) : null,
            total_qoh: Number(match.total_qoh) || undefined,
            is_in_stock: typeof match.is_in_stock === 'boolean' ? match.is_in_stock : null,
            confidence: match.confidence,
            system_sku: match.system_sku != null ? String(match.system_sku) : null,
            custom_sku: match.custom_sku != null ? String(match.custom_sku) : null,
          })))
          const previews = await maybeEmitInventoryProductCards({
            supabase,
            userId,
            latestUserMessage,
            query: args.query,
            matches: previewMatches,
            emit,
            force: args.show_product_images,
          })
          if (previews.length > 0) {
            const previewByItemId = new Map(previews.map(preview => [String(preview.lightspeed_item_id ?? ''), preview]))
            return {
              ...result,
              matches: result.matches.map(match => {
                const preview = previewByItemId.get(String(match.item_id ?? ''))
                return {
                  ...match,
                  product_url: preview?.product_url ?? null,
                  product_page_available: Boolean(preview?.product_url),
                }
              }),
              product_links: productLinksFromPreviews(previews),
              product_cards_emitted: true,
            }
          }
        }

        return result
      },
    }),
    tool({
      name: 'get_lightspeed_stale_inventory_cash',
      description: 'Analyze stale/dead/slow-moving inventory cash using the SQL inventory mirror joined to SQL sales-report movement. Use for cash tied up, old stock, no recent sales, slow movers, dead stock, and stale stock by brand/supplier/category.',
      parameters: z.object({
        query: z.string().optional().describe('Optional brand, category, product, SKU, or inventory segment to restrict the stale-stock analysis.'),
        no_sale_days: z.number().int().min(1).max(3650).optional().describe('Treat products with no sales in this many days as stale. Defaults to 180.'),
        old_stock_days: z.number().int().min(1).max(3650).optional().describe('Treat items created before this age in days as old stock. Defaults to 180.'),
        min_stock_value: z.number().min(0).optional().describe('Minimum stock value at cost to include. Defaults to 0.'),
        limit: z.number().int().min(1).max(100).optional(),
        history_start_date: z.string().optional().describe('YYYY-MM-DD lower bound for older last-sale lookup. Defaults to 2010-01-01.'),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_inventory', 'Querying stale inventory cash from SQL...')
        const result = await getLightspeedStaleInventoryCashSql(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildStaleInventoryCashVisuals(result))
        return result
      },
    }),
    tool({
      name: 'search_lightspeed_customers',
      description: 'Search customers that appear in the SQL sales report table by customer name or customer ID. Use first for named-customer fitment/compatibility questions before checking sales/work orders. Phone, email, address, archived status, and customer-created date are not available until a customer/contact table exists.',
      parameters: z.object({
        query: z.string().optional().describe('Customer name, company, customer ID, phone, email, or address. Omit only for broad customer lists/counts.'),
        limit: z.number().int().min(1).max(50).optional(),
        include_archived: z.boolean().optional(),
        created_start_date: z.string().optional().describe('YYYY-MM-DD customer create date start.'),
        created_end_date: z.string().optional().describe('YYYY-MM-DD customer create date end.'),
        max_pages: z.number().int().min(1).max(120).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_customers', args.query ? `Querying SQL customer search for "${args.query}"...` : 'Querying SQL customer list lookup...')
        const result = await searchLightspeedCustomersSql(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildCustomerSearchVisuals(result))
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_product_purchasers',
      description: 'Find customers who purchased a matching product, brand, model, category, SKU, or service by querying and fuzzy-ranking SQL sale-line rows. Use for "which customers bought/purchased X", product-specific customer lists, and customer purchase targeting.',
      parameters: z.object({
        query: z.string().describe('Product, brand, model, category, SKU, or service phrase, e.g. "Orbea time trial bikes".'),
        start_date: z.string().optional().describe('YYYY-MM-DD. Defaults to broad all-time practical range when omitted.'),
        end_date: z.string().optional().describe('YYYY-MM-DD. Defaults to today when omitted.'),
        limit: z.number().int().min(1).max(100).optional(),
        include_contact_details: z.boolean().optional().describe('Set true only when the user asks for phone numbers, emails, or contact details.'),
        include_walk_in: z.boolean().optional().describe('Include unassigned/walk-in matching sales as a pseudo customer. Defaults false.'),
        rank_by: z.enum(['matching_revenue', 'sale_count', 'units_sold', 'last_purchase']).optional(),
        max_item_matches: z.number().int().min(1).max(80).optional(),
        max_pages: z.number().int().min(1).max(180).optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_customers', `Querying SQL customer purchaser lookup for "${args.query}"...`)
        const result = await getLightspeedProductPurchasersSql(userId, args, emit)
        emitVisuals(emit, visualPrefs, buildProductPurchasersVisuals(result))
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_customer_profile',
      description: 'Build and stream a full customer profile card for a store customer: live contact details, opt-out flags, lifetime spend, recent sales, top items, customer-owned Serialized bikes, work-order serializedID bike links, inferred bikes from history, and active/finished/archived work-order history including public notes, internal notes, labour lines, parts, serialized_id, sale_id, status, and dates. Use this first for "tell me about customer X", "customer X", "what bikes does X have", "X\'s bikes", "pull up customer", "what do we know about", customer history, lifetime spend, service history, bikes owned, and broad customer-profile requests.',
      parameters: z.object({
        customer_id: z.string().optional().describe('Exact Lightspeed customer ID when known.'),
        query: z.string().optional().describe('Customer name, company, phone, email, or address when customer_id is unknown.'),
        include_workorders: z.boolean().optional().describe('Defaults true. Set false only when the user explicitly asks for sales/contact only.'),
        sales_row_limit: z.number().int().min(1000).max(SALES_REPORT_SQL_HARD_MAX_ROWS).optional().describe('Maximum customer sales report line rows to inspect. Defaults 100000.'),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_customers', `Building customer profile for ${args.customer_id ?? args.query ?? 'selected customer'}...`)
        const result = await buildLightspeedCustomerProfile(userId, args, emit)
        emitCustomerProfile(emit, result)
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_customer_sales',
      description: 'Fetch completed Lightspeed sales for one customer over a date range from the SQL sales report table. Use for customer purchase history, what a customer bought, customer lifetime/recent spend, last purchase, and customer sales detail questions. For customer-specific bike fitment questions, use this to infer owned bikes, prior components, and relevant model identifiers before web compatibility research.',
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
        emitStatus(emit, 'lightspeed_customers', `Querying SQL customer sales lookup for ${args.customer_id ?? args.query ?? 'selected customer'}...`)
        const result = await getLightspeedCustomerSalesSql(userId, args, emit)
        const table = buildCustomerSalesTable(result)
        if (table) emit({ event: 'table', table })
        return result
      },
    }),
    tool({
      name: 'get_lightspeed_top_customers',
      description: 'Aggregate completed Lightspeed sales by customer over a date range from the SQL sales report table. Use for top customers, best customers, highest spenders, most frequent customers, average-sale customer rankings, and customer leaderboard questions.',
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
        emitStatus(emit, 'lightspeed_customers', `Querying SQL top customer analysis for ${args.start_date} to ${args.end_date}...`)
        const result = await getLightspeedTopCustomersSql(userId, args, emit)
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
      description: 'Search this store own Yellow Jersey products by keyword. Use for storefront discounts/carousels only, not Lightspeed stock or sales reporting. Pass show_product_images:true only when the user wants to see what specific products look like.',
      parameters: z.object({
        query: z.string(),
        show_product_images: z.boolean().optional().describe('Set true when the user asks to see/show/look at specific products. Never use for rankings or analytics.'),
      }),
      async execute({ query, show_product_images }) {
        emitStatus(emit, 'tool', 'Finding products...')
        const products = await searchStoreProducts(supabase, userId, query)
        const previewCandidates = products.slice(0, 6)
        if (
          shouldEmitStoreProductPreviews(
            query,
            previewCandidates.length,
            previewCandidates.length,
            show_product_images,
          )
        ) {
          const previews = await buildStorefrontProductPreviews(
            supabase,
            userId,
            previewCandidates.map(product => product.id),
          )
          if (previews.length > 0) emit({ event: 'products', products: previews })
        }
        return { products }
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
      name: 'find_discount_candidates',
      description: 'Rank current in-stock Lightspeed inventory products that are good discount candidates right now. Uses stock on hand, stock value, stale/slow movement, recent sales, and margin room. Use before answering "which products should we discount" or "if you had to discount N products". This is analysis only and does not stage a discount.',
      parameters: z.object({
        limit: z.number().int().min(1).max(30).optional().describe('Number of candidates to return. Defaults to 10.'),
        no_sale_days: z.number().int().min(30).max(3650).optional().describe('Treat no sales in this many days as stale. Defaults to 120.'),
        min_stock_value: z.number().min(0).optional().describe('Minimum stock value at cost to include. Defaults to 0.'),
      }),
      async execute(args) {
        emitStatus(emit, 'lightspeed_inventory', 'Finding discount candidates...')
        return findDiscountCandidatesSql(userId, args, emit, visualPrefs)
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
    tool({
      name: 'list_lightspeed_brands',
      description: 'List Lightspeed manufacturer brands for this store. Optional query narrows by name. Use before proposing brand changes.',
      parameters: z.object({
        query: z.string().optional(),
      }),
      async execute({ query }) {
        emitStatus(emit, 'lightspeed_inventory', 'Loading Lightspeed brands...')
        const client = createLightspeedClient(userId)
        const manufacturers = await client.getAllManufacturers().catch(() => [])
        const needle = query ? normalizeText(query) : ''
        const brands = manufacturers
          .filter(m => !needle || normalizeText(m.name).includes(needle))
          .slice(0, 80)
          .map(m => ({ brand_id: String(m.manufacturerID), name: m.name }))
        return { brands, total: brands.length }
      },
    }),
    tool({
      name: 'list_lightspeed_categories',
      description: 'List Lightspeed categories for this store. Optional query narrows by name or path. Use before proposing category changes.',
      parameters: z.object({
        query: z.string().optional(),
      }),
      async execute({ query }) {
        emitStatus(emit, 'lightspeed_inventory', 'Loading Lightspeed categories...')
        const client = createLightspeedClient(userId)
        const categories = await client.getAllCategories({ archived: 'false' }).catch(() => [])
        const needle = query ? normalizeText(query) : ''
        const rows = categories
          .filter(c => {
            if (!needle) return true
            const text = normalizeText([c.name, c.fullPathName].filter(Boolean).join(' '))
            return text.includes(needle)
          })
          .slice(0, 80)
          .map(c => ({
            category_id: String(c.categoryID),
            name: c.name,
            path: c.fullPathName || c.name,
          }))
        return { categories: rows, total: rows.length }
      },
    }),
    tool({
      name: 'search_lightspeed_products',
      description: 'Search synced Lightspeed inventory items by product name, SKU, brand, or category. Use before proposing brand/category write-back. Pass show_product_images:true only when the user wants to see what specific products look like.',
      parameters: z.object({
        query: z.string(),
        show_product_images: z.boolean().optional().describe('Set true when the user asks to see/show/look at specific products.'),
      }),
      async execute({ query, show_product_images }) {
        emitStatus(emit, 'lightspeed_inventory', `Searching inventory for "${query}"...`)
        const rows = await resolveInventoryTargets(supabase, userId, query, undefined)
        const previewRows = rows
          .filter(row => Boolean(row.description))
          .slice(0, 6)
          .map(row => ({
            item_id: row.lightspeed_item_id,
            name: row.description || 'Unnamed product',
            category: row.category_path || row.category_name,
            brand: row.brand_name,
            custom_sku: row.custom_sku,
            system_sku: row.system_sku,
            primary_image_url: null as string | null,
          }))

        if (previewRows.length > 0) {
          const imageByItem = await resolveInventoryItemImageUrls(
            createServiceRoleClient(),
            userId,
            previewRows.map(row => String(row.item_id)),
          )
          for (const row of previewRows) {
            row.primary_image_url = imageByItem.get(String(row.item_id)) ?? null
          }
        }

        const withImages = previewRows.filter(row => Boolean(row.primary_image_url))
        if (
          shouldEmitStoreProductPreviews(query, previewRows.length, withImages.length, show_product_images)
        ) {
          const previews = await buildInventoryProductPreviews(supabase, userId, previewRows, {
            requireApprovedImage: true,
          })
          if (previews.length > 0) emit({ event: 'products', products: previews })
        }

        return {
          products: rows.slice(0, 25).map(row => ({
            lightspeed_item_id: row.lightspeed_item_id,
            name: row.description,
            sku: row.custom_sku || row.system_sku,
            brand_id: row.brand_id,
            brand: row.brand_name,
            category_id: row.category_id,
            category: row.category_path || row.category_name,
          })),
          total: rows.length,
        }
      },
    }),
    tool({
      name: 'list_lightspeed_workorders',
      description: 'List live Lightspeed repair/service work orders with full details. Reuse recent private structured workorder context for follow-ups when it already answers the question. Use scope "open" for active/in-progress jobs, "finished" for completed, done, paid, or pickup-ready questions such as "what did X get done", or "all" only when the user truly needs active plus completed history. For note/keyword/issue searches such as "cracked frame" or "work orders mentioning warranty", pass query with the phrase and scope "all"; the tool searches public note, internal_note, labour line notes, and part descriptions without treating the phrase as a customer name. For every workorder question, inspect both note and internal_note plus warranty, labour line notes, item descriptions, item notes, serialized_id, sale_id, customer details, status, and dates before answering. For named-customer bike fitment questions, query the customer name with include_details:true and use work-order notes/parts to identify the bike before web compatibility research. For due-date questions ("due today", ETA on a date), pass due_on as YYYY-MM-DD in the store timezone. Use small limits for named-customer lookups. Answer-only — never create proposals.',
      parameters: z.object({
        scope: z.enum(['open', 'finished', 'all']).optional().describe('Defaults to open for active work orders.'),
        due_on: z.string().optional().describe('Filter by ETA out date (YYYY-MM-DD, store timezone). Use for "due today" and similar questions.'),
        customer_id: z.string().optional().describe('Exact Lightspeed customer ID. Prefer this over name filtering when known.'),
        query: z.string().optional().describe('Optional filter on customer name, phone, work order ID, public note, internal note, labour line note, item note, or part descriptions.'),
        limit: z.number().int().min(1).max(100).optional(),
        include_details: z.boolean().optional().describe('Include lines, parts, and customer contact. Defaults to true.'),
        include_archived: z.boolean().optional().describe('Include archived historical work orders. Defaults true for resolved customer history when scope is all or finished.'),
        max_pages_per_status: z.number().int().min(1).max(8).optional(),
      }),
      async execute(args) {
        const dueOn = args.due_on?.trim() || ''
        const originalQuery = args.query?.trim() || ''
        const noteSearch = originalQuery ? looksLikeWorkorderNoteSearch(originalQuery) : false
        const customerLookupQuery =
          originalQuery && !noteSearch ? workorderCustomerLookupQuery(originalQuery) : null
        const likelyCustomerQuery =
          originalQuery && !noteSearch ? shouldResolveWorkorderCustomerQuery(originalQuery) : false
        const scope = args.scope ?? (noteSearch || likelyCustomerQuery ? 'all' : 'open')
        let customerId = args.customer_id?.trim() || ''
        let query = originalQuery || undefined
        let resolvedCustomerName: string | null = null

        if (!customerId && customerLookupQuery) {
          emitStatus(emit, 'lightspeed_customers', `Resolving customer profile for "${customerLookupQuery}"`)
          const resolved = await resolveCustomerForProfile(userId, { query: customerLookupQuery }, emit)
          if (resolved.status === 'resolved') {
            customerId = resolved.customer_id
            resolvedCustomerName = resolved.customer.name
            query = undefined
          } else if (customerLookupQuery !== originalQuery) {
            query = customerLookupQuery
          }
        }

        const includeArchived = args.include_archived ?? (Boolean(customerId) && scope !== 'open')
        const limit = args.limit ?? (customerId ? 30 : noteSearch ? 24 : undefined)
        emitStatus(
          emit,
          'lightspeed_workorders',
          noteSearch
            ? `Searching work order notes for "${originalQuery}"`
            : customerId
            ? `Loading work orders for ${resolvedCustomerName ?? `customer ${customerId}`}`
            : dueOn
            ? `Loading work orders due ${dueOn}`
            : scope === 'open'
              ? 'Loading open work orders'
              : 'Loading work orders',
        )
        const result = await listGenieWorkorders(userId, {
          scope,
          due_on: dueOn || undefined,
          customer_id: customerId || undefined,
          query,
          limit,
          include_details: args.include_details,
          include_archived: includeArchived,
          note_search: noteSearch,
          max_pages_per_status: args.max_pages_per_status ?? (noteSearch ? 6 : query ? 1 : undefined),
        })
        emitWorkorderCards(
          emit,
          buildWorkorderCardsPayload({
            scope,
            workorders: result.workorders,
            truncated: result.truncated,
            title: dueOn ? `Work orders due ${dueOn}` : undefined,
          }),
        )
        return {
          scope: result.scope,
          customer_id: customerId || null,
          customer_resolved_from_query: resolvedCustomerName,
          include_archived: includeArchived,
          total: result.total,
          truncated: result.truncated,
          workorders: result.workorders.map(fullWorkorderForAgent),
        }
      },
    }),
    tool({
      name: 'get_lightspeed_workorder',
      description: 'Fetch one Lightspeed work order by ID with full details: customer, status, dates, public note, internal_note, warranty, labour line notes, item/part descriptions, item notes, serialized_id, sale_id, and totals. For every workorder answer, inspect all of these fields before responding.',
      parameters: z.object({
        workorder_id: z.string().min(1),
      }),
      async execute({ workorder_id }) {
        emitStatus(emit, 'lightspeed_workorders', `Loading work order ${workorder_id}`)
        const workorder = await getGenieWorkorder(userId, workorder_id)
        if (!workorder) {
          return { found: false, workorder_id, message: 'No work order found with that ID.' }
        }
        emitWorkorderCards(
          emit,
          buildWorkorderCardsPayload({
            scope: 'single',
            workorders: [workorder],
            title: `Work order #${workorder.workorder_id}`,
          }),
        )
        return {
          found: true,
          workorder: fullWorkorderForAgent(workorder),
        }
      },
    }),
    tool({
      name: 'propose_product_brand_category_update',
      description: 'Stage Lightspeed brand and/or category changes on products for human approval. Writes to Lightspeed only after Approve. Pass brand_name and/or category_name, category_path (e.g. "Bikes/Road"), or ids. New brands/categories are created on approval. Use clear_category:true to remove a product category.',
      parameters: z.object({
        summary: z.string(),
        match: z.string().optional(),
        lightspeed_item_ids: z.array(z.string()).optional(),
        brand_id: z.string().nullable().optional(),
        brand_name: z.string().nullable().optional(),
        category_id: z.string().nullable().optional(),
        category_name: z.string().nullable().optional(),
        category_path: z.string().nullable().optional(),
        parent_category_id: z.string().nullable().optional(),
        parent_category_name: z.string().nullable().optional(),
        clear_category: z.boolean().optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing Lightspeed edits...')
        return proposalToolOutput(await buildProductBrandCategoryProposal(supabase, userId, args))
      },
    }),
    tool({
      name: 'propose_lightspeed_category_create',
      description: 'Stage creation of a new Lightspeed category (no product assignment). Use category_path for nested paths like "Accessories/Winter Clearance", or category_name with parent_category_name. Writes to Lightspeed only after Approve.',
      parameters: z.object({
        summary: z.string(),
        category_name: z.string().nullable().optional(),
        category_path: z.string().nullable().optional(),
        parent_category_id: z.string().nullable().optional(),
        parent_category_name: z.string().nullable().optional(),
      }),
      async execute(args) {
        emitStatus(emit, 'tool', 'Preparing Lightspeed category...')
        return proposalToolOutput(await buildLightspeedCategoryCreateProposal(userId, args))
      },
    }),
    tool({
      name: 'get_gmail_connection_status',
      description: 'Check which Gmail accounts the store has connected via Composio. Always use when the user asks to connect, link, set up, or add another Gmail mailbox — never refuse. Emits the in-chat Gmail card for connect/add-another flows.',
      parameters: z.object({
        show_connect_card: z.boolean().optional().describe('When true, show the Gmail connect card in chat (connect or add another mailbox). Auto-set for connect/add intents.'),
      }),
      async execute(args) {
        if (!isComposioConfigured()) {
          return { configured: false, connected: false, message: 'Gmail integration is not configured on this environment.' }
        }
        const connections = await listGmailConnections(userId)
        await getOrCreateGmailComposioSession({
          userId,
          sessionId: gmailComposioSessionId,
          connectedAccountIds: connections.map((connection) => connection.id),
          onSession: onGmailComposioSession,
        }).catch((error) => {
          console.warn('[gmail] composio session unavailable during status check:', error)
        })
        const accounts = connections.map((connection) => ({
          id: connection.id,
          label: connection.label,
          email_address: connection.email_address ?? null,
          status: connection.status,
        }))
        const showCard = args.show_connect_card ?? connections.length === 0
        const shouldMintConnectLink = showCard && (connections.length === 0 || args.show_connect_card === true)
        const link = shouldMintConnectLink
          ? await mintGmailConnectLink(userId).catch((error) => {
            console.error('[gmail] mint connect link failed:', error)
            return null
          })
          : null
        if (showCard) {
          emitGmailConnect(emit, link?.url ?? null, connections.length > 0 ? 'add_account' : 'status', {
            accounts,
            can_add_more: true,
          })
        }
        if (connections.length > 0) {
          return {
            configured: true,
            connected: true,
            accounts,
            gmail: connections[0],
            connect_url: link?.url ?? null,
            can_add_more: true,
            connect_card_shown: showCard,
            message:
              connections.length === 1
                ? 'One Gmail account is connected. The Gmail card in chat can add another mailbox.'
                : `${connections.length} Gmail accounts are connected. The Gmail card in chat can add another mailbox.`,
          }
        }
        return {
          configured: true,
          connected: false,
          accounts: [],
          connect_url: link?.url ?? null,
          can_add_more: true,
          connect_card_shown: showCard,
          message: 'Gmail is not connected. Use the Gmail card in chat to authorise Gmail.',
        }
      },
    }),
    tool({
      name: 'search_gmail',
      description: 'Search connected Gmail with Gmail query syntax for inbox/search/history/thread/reply context. Searches all connected mailboxes by default. Auto-merges in:sent context for reply/respond questions. Do not use for a new outbound email whose body comes from store/Lightspeed data; gather that data first, then call propose_gmail_email. scan_depth "full" paginates entire matching history. Returns emails, scan_stats, sender_summary, contact_analysis, message_bodies, correspondent_hint, suggested_reply_passes, includes_sent_context.',
      parameters: z.object({
        query: z.string().optional().describe('Gmail search query (from:, to:, in:sent, in:anywhere, subject:, after:, etc.). Omit to infer from user_question (e.g. respond to Tom → from/to that person). Defaults to in:inbox only when no inference applies.'),
        scan_depth: z.enum(['quick', 'full']).optional().describe('full = paginate all matching mail for history/counts/earliest; quick = one page for recent previews.'),
        max_results: z.number().int().min(1).max(50).optional().describe('Emails shown in the UI card only — does not limit full scans.'),
        sort_order: z.enum(['newest', 'oldest']).optional().describe('Sort scanned results by date. Use oldest for earliest/first questions after scan_depth full.'),
        connected_account_id: z.string().optional().describe('Optional Composio connected account id to search one mailbox only. Omit to search all connected Gmail accounts.'),
        user_question: z.string().min(3).describe('The user question this search must help answer — required for answer_readiness gaps.'),
      }),
      async execute(args) {
        if (!isComposioConfigured()) {
          return { error: 'Gmail integration is not configured.' }
        }
        const connections = await listGmailConnections(userId)
        if (connections.length === 0) {
          const link = await mintGmailConnectLink(userId).catch((error) => {
            console.error('[gmail] mint connect link failed:', error)
            return null
          })
          emitGmailConnect(emit, link?.url ?? null, 'search')
          return {
            connected: false,
            connect_url: link?.url ?? null,
            message: 'Connect Gmail before searching emails.',
          }
        }
        emitStatus(emit, 'gmail', `Searching Gmail${args.query ? ` for "${args.query.trim()}"` : ''}...`)
        const payload = await searchGmailEmails(userId, {
          query: args.query,
          max_results: args.max_results,
          sort_order: args.sort_order,
          scan_depth: args.scan_depth,
          user_question: args.user_question,
          connected_account_id: args.connected_account_id,
          composio_session_id: gmailComposioSessionId,
          on_composio_session: onGmailComposioSession,
        })
        const uiPayload = buildVisibleGmailPayload(payload)
        if (uiPayload) {
          const agentContext = buildGmailAgentContextFromPayload(payload)
          emit({
            event: 'gmail_emails',
            gmail_emails: {
              ...uiPayload,
              agent_context: agentContext.message_bodies?.length ? agentContext : undefined,
            },
          })
        }
        emitStatus(emit, 'gmail_done', 'Gmail search done')
        return {
          query: payload.query,
          scan_depth: args.scan_depth ?? payload.scan_stats?.scan_mode ?? 'quick',
          sort_order: args.sort_order ?? 'newest',
          total: payload.scan_stats?.total_matched ?? payload.emails.length,
          truncated: payload.truncated ?? false,
          scan_stats: payload.scan_stats ?? null,
          connected_mailboxes: payload.connected_mailboxes ?? [],
          sender_summary: payload.sender_summary ?? [],
          contact_analysis: payload.contact_analysis ?? null,
          answer_readiness: payload.answer_readiness ?? null,
          message_bodies: payload.message_bodies ?? [],
          correspondent_hint: payload.correspondent_hint ?? null,
          suggested_reply_passes: payload.suggested_reply_passes ?? [],
          includes_sent_context: payload.includes_sent_context ?? false,
          emails: payload.emails,
        }
      },
    }),
    tool({
      name: 'read_gmail_messages',
      description: 'Fetch full email body text for specific message_ids from a prior search_gmail result. Pass connected_account_id from emails[].connected_account_id when multiple mailboxes are connected. REQUIRED before answering issue/warranty/what-happened/summary questions when message_bodies is empty.',
      parameters: z.object({
        message_ids: z.array(z.string()).min(1).max(5).describe('Gmail messageId values from search_gmail emails[].message_id'),
        connected_account_id: z.string().optional().describe('Composio connected account id from search_gmail emails[].connected_account_id — required when the same message_id could exist across mailboxes.'),
        user_question: z.string().min(3).describe('The user question these bodies must help answer.'),
      }),
      async execute(args) {
        if (!isComposioConfigured()) {
          return { error: 'Gmail integration is not configured.' }
        }
        const connections = await listGmailConnections(userId)
        if (connections.length === 0) {
          return { connected: false, message: 'Connect Gmail before reading messages.' }
        }
        emitStatus(emit, 'gmail', `Reading ${args.message_ids.length} email${args.message_ids.length === 1 ? '' : 's'}...`)
        const messages = await readGmailMessages(userId, {
          message_ids: args.message_ids,
          connected_account_id: args.connected_account_id ?? (connections.length === 1 ? connections[0].id : undefined),
          composio_session_id: gmailComposioSessionId,
          on_composio_session: onGmailComposioSession,
        })
        const agentContext = buildGmailAgentContextFromMessages(messages)
        if (agentContext.message_bodies?.length) {
          emit({ event: 'gmail_agent_context', gmail_agent_context: agentContext })
        }
        emitStatus(emit, 'gmail_done', 'Email content ready')
        return {
          user_question: args.user_question.trim(),
          messages,
          hydrated: messages.filter((message) => message.body_text.trim().length > 80).length,
          instruction:
            messages.length === 0
              ? 'No bodies returned — check message_ids from search_gmail.'
              : 'Use body_text to answer the user question with specific fault/details/quotes.',
        }
      },
    }),
    tool({
      name: 'propose_gmail_email',
      description: 'Stage a Gmail send or draft for human approval. Never sends immediately — the store must Allow on the Gmail card. For new outbound emails from store/Lightspeed analysis, call after the required data tools and include the complete grounded email body. For replies, call after Gmail search/read/sent context. Use action "send" or "draft" (prefer draft unless user asked to send now).',
      parameters: z.object({
        action: z.enum(['send', 'draft']),
        summary: z.string(),
        recipient_email: z.string(),
        subject: z.string(),
        body: z.string(),
        connected_account_id: z.string().optional().describe('Composio connected account id from prior gmail context (emails[].connected_account_id).'),
        thread_id: z.string().optional().describe('Gmail thread_id from the message being replied to, when available.'),
        reply_to_message_id: z.string().optional().describe('Gmail message_id being replied to, for traceability.'),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        is_html: z.boolean().optional(),
      }),
      async execute(args) {
        if (!isComposioConfigured()) {
          return { configured: false, connected: false, message: 'Gmail integration is not configured on this environment.' }
        }
        emitStatus(emit, 'gmail', args.action === 'draft' ? 'Preparing Gmail draft...' : 'Preparing Gmail send...')
        return proposalToolOutput(await buildGmailEmailActionProposal(userId, emit, {
          ...args,
          composio_session_id: gmailComposioSessionId,
        }))
      },
    }),
  ]

  return tools.filter(candidate => {
    const name = 'name' in candidate ? String(candidate.name) : ''
    if (DEPRECATED_LIGHTSPEED_ANALYTICAL_TOOL_NAMES.has(name)) return false
    if (!name) return true
    if (isToolExcludedForProfile(name, modelProfile)) return false
    return allowedToolNames.has(name)
  })
}

export {
  buildAgentTools,
  buildSpecialistAgentTools,
  executorModelForRoute,
  buildLightspeedCustomerProfile,
  emitCustomerProfile,
  emitWorkorderCards,
  emitStatus,
  emitAnalysisPlan,
  emitAnalysisQuery,
  toAnalysisPlanPayload,
  visualPrefsForMessages,
  fetchSalesReportRows,
  groupSalesReportRows,
  sqlCompletionFields,
  emitVisuals,
  buildGenericSqlTable,
  formatAud,
  roundMoney,
  roundPercent,
  workorderCustomerLookupQuery,
  shouldResolveWorkorderCustomerQuery,
  looksLikeWorkorderNoteSearch,
  addUtcDays,
  isoDateFromUtcDate,
  isoDateToUtcDate,
  normalizeText,
  queryTokens,
  sqlLiteral,
  storeLocalTimeToUtcTimestamp,
  toNum,
  toOptionalNum,
}
export type { Supa, Emit, VisualPrefs, SalesReportLineRow, GroupedSqlSale, SalesReportFetchResult }
