import { createServiceRoleClient } from '@/lib/supabase/server'
import { createLightspeedClient } from './lightspeed-client'
import type {
  LightspeedCategory,
  LightspeedEmployee,
  LightspeedItem,
  LightspeedSale,
  LightspeedSaleLine,
} from './types'

type SupabaseAdminClient = ReturnType<typeof createServiceRoleClient>

export type SalesReportBackfillStatusValue = 'idle' | 'running' | 'complete' | 'error'

export interface SalesReportBackfillState {
  user_id: string
  status: SalesReportBackfillStatusValue
  oldest_sale_at: string | null
  next_before: string | null
  last_synced_at: string | null
  last_complete_time: string | null
  sales_processed: number
  lines_upserted: number
  pages_fetched: number
  last_error: string | null
  started_at: string | null
  finished_at: string | null
  lease_owner?: string | null
  lease_expires_at?: string | null
  last_heartbeat_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface SalesReportBackfillStatus {
  state: SalesReportBackfillState | null
  row_count: number
  oldest_complete_time: string | null
  latest_complete_time: string | null
}

export interface SalesReportChunkResult extends SalesReportBackfillStatus {
  chunk: {
    sales_fetched: number
    lines_upserted: number
    pages_fetched: number
    hit_page_limit: boolean
    complete: boolean
  }
}

export interface SalesReportBackfillRunResult extends SalesReportChunkResult {
  chunks_run: number
  locked: boolean
  timed_out: boolean
  retry_after_ms: number | null
}

const SALES_REPORT_LOAD_RELATIONS = JSON.stringify([
  'SaleLines',
  'SaleLines.Item',
  'SalePayments',
  'SalePayments.PaymentType',
  'Customer',
])

const SALE_PAGE_LIMIT = 100
const DEFAULT_BACKFILL_MAX_PAGES = 5
const DEFAULT_RECENT_SYNC_MAX_PAGES = 5
const RECENT_SYNC_OVERLAP_MS = 60 * 60 * 1000
const REPORT_LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000
const BACKFILL_LEASE_TTL_MS = 6 * 60 * 1000
const BACKFILL_RUN_MIN_TIME_BUDGET_MS = 10_000
const BACKFILL_RUN_MAX_TIME_BUDGET_MS = 270_000

interface SalesReportLookups {
  categoryById: Map<string, string>
  employeeById: Map<string, string>
}

const reportLookupCache = new Map<string, {
  expiresAt: number
  promise: Promise<SalesReportLookups>
}>()

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const parsed = Number(value.replace(/[$,]/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function toOptionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = toNum(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function dateMs(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const latest = values
    .map(dateMs)
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0]

  return latest === undefined ? null : new Date(latest).toISOString()
}

function earliestIso(values: Array<string | null | undefined>): string | null {
  const earliest = values
    .map(dateMs)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[0]

  return earliest === undefined ? null : new Date(earliest).toISOString()
}

function subtractMs(value: string, ms: number): string {
  return new Date(new Date(value).getTime() - ms).toISOString()
}

function saleCompletedAt(sale: LightspeedSale): string | null {
  return validIso(sale.completeTime || sale.createTime || sale.timeStamp || null)
}

function saleLines(sale: LightspeedSale): LightspeedSaleLine[] {
  return ensureArray(sale.SaleLines?.SaleLine)
}

function customerName(sale: LightspeedSale): string | null {
  const customer = sale.Customer
  if (!customer) return null

  const fullName = [cleanText(customer.firstName), cleanText(customer.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim()

  return fullName || cleanText(customer.company) || null
}

function itemSku(item: LightspeedItem | undefined): string | null {
  return cleanText(item?.systemSku) || cleanText(item?.customSku) || cleanText(item?.manufacturerSku)
}

function itemDescription(item: LightspeedItem | undefined, line: LightspeedSaleLine): string {
  return cleanText(item?.description) || (line.itemID ? `Item ${line.itemID}` : 'Unknown item')
}

function lineUnitCost(line: LightspeedSaleLine): number {
  const item = line.Item
  return (
    toOptionalNum(line.avgCost) ??
    toOptionalNum(line.fifoCost) ??
    toOptionalNum(item?.avgCost) ??
    toOptionalNum(item?.defaultCost) ??
    0
  )
}

function saleWithoutLines(sale: LightspeedSale): Record<string, unknown> {
  const saleRecord = sale as unknown as Record<string, unknown>
  const { SaleLines: _saleLines, ...withoutLines } = saleRecord
  return withoutLines
}

function employeeName(employee: LightspeedEmployee): string {
  return [cleanText(employee.firstName), cleanText(employee.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim() || `Employee ${employee.employeeID}`
}

async function loadReportLookups(userId: string): Promise<SalesReportLookups> {
  const client = createLightspeedClient(userId)

  const [categories, employeesResponse] = await Promise.all([
    client.getAllCategories().catch((error) => {
      console.warn('[Lightspeed Sales Report] Category lookup failed:', error)
      return [] as LightspeedCategory[]
    }),
    client.getEmployees({ limit: 100 }).catch((error) => {
      console.warn('[Lightspeed Sales Report] Employee lookup failed:', error)
      return { Employee: [] as LightspeedEmployee[] }
    }),
  ])

  const categoryById = new Map<string, string>()
  for (const category of categories) {
    categoryById.set(String(category.categoryID), category.fullPathName || category.name || `Category ${category.categoryID}`)
  }

  const employeeById = new Map<string, string>()
  for (const employee of ensureArray(employeesResponse.Employee)) {
    employeeById.set(String(employee.employeeID), employeeName(employee))
  }

  return { categoryById, employeeById }
}

async function fetchReportLookups(userId: string): Promise<SalesReportLookups> {
  const cached = reportLookupCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = loadReportLookups(userId).catch(error => {
    reportLookupCache.delete(userId)
    throw error
  })
  reportLookupCache.set(userId, {
    expiresAt: Date.now() + REPORT_LOOKUP_CACHE_TTL_MS,
    promise,
  })

  return promise
}

function saleLineToReportRow(args: {
  userId: string
  sale: LightspeedSale
  line: LightspeedSaleLine
  categoryById: Map<string, string>
  employeeById: Map<string, string>
  syncedAt: string
}): Record<string, unknown> {
  const { userId, sale, line, categoryById, employeeById, syncedAt } = args
  const item = line.Item
  const completeTime = saleCompletedAt(sale)
  const lineTime = validIso(line.createTime || line.timeStamp || completeTime)
  const quantity = toNum(line.unitQuantity)
  const retail = toNum(line.unitPrice || line.normalUnitPrice)
  const subtotal = toNum(line.calcSubtotal || line.displayableSubtotal || quantity * retail)
  const discount = toNum(line.calcLineDiscount || line.discountAmount)
  const total = toNum(line.calcTotal || subtotal)
  const cost = roundMoney(lineUnitCost(line) * Math.abs(quantity))
  const profit = roundMoney(subtotal - cost)
  const marginPct = subtotal !== 0 ? roundPercent((profit / subtotal) * 100) : null
  const categoryId = cleanText(item?.categoryID) || null
  const employeeId = cleanText(line.employeeID) || cleanText(sale.employeeID) || null

  return {
    user_id: userId,
    sale_id: String(sale.saleID),
    sale_line_id: String(line.saleLineID || `${sale.saleID}:${line.itemID || 'line'}`),
    ticket_number: cleanText(sale.ticketNumber) || cleanText(sale.referenceNumber),
    complete_time: completeTime,
    line_time: lineTime,
    employee_id: employeeId,
    employee_name: employeeId ? employeeById.get(employeeId) ?? null : null,
    category_id: categoryId,
    category: categoryId ? categoryById.get(categoryId) ?? `Category ${categoryId}` : null,
    item_id: cleanText(line.itemID) || cleanText(item?.itemID),
    sku: itemSku(item),
    description: itemDescription(item, line),
    quantity,
    retail: roundMoney(retail),
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    total: roundMoney(total),
    customer_id: cleanText(sale.customerID),
    customer_full_name: customerName(sale),
    cost,
    profit,
    margin_pct: marginPct,
    raw_sale: saleWithoutLines(sale),
    raw_line: line as unknown as Record<string, unknown>,
    synced_at: syncedAt,
  }
}

function saleSummaryToReportRow(args: {
  userId: string
  sale: LightspeedSale
  employeeById: Map<string, string>
  syncedAt: string
}): Record<string, unknown> {
  const { userId, sale, employeeById, syncedAt } = args
  const completeTime = saleCompletedAt(sale)
  const subtotal = toNum(sale.calcSubtotal || sale.displayableSubtotal)
  const total = toNum(sale.calcTotal || sale.total || sale.displayableTotal)
  const cost = roundMoney(toNum(sale.calcAvgCost || sale.calcFIFOCost))
  const profit = roundMoney(subtotal - cost)
  const marginPct = subtotal !== 0 ? roundPercent((profit / subtotal) * 100) : null
  const employeeId = cleanText(sale.employeeID)

  return {
    user_id: userId,
    sale_id: String(sale.saleID),
    sale_line_id: `${sale.saleID}:summary`,
    ticket_number: cleanText(sale.ticketNumber) || cleanText(sale.referenceNumber),
    complete_time: completeTime,
    line_time: completeTime,
    employee_id: employeeId,
    employee_name: employeeId ? employeeById.get(employeeId) ?? null : null,
    category_id: null,
    category: null,
    item_id: null,
    sku: null,
    description: cleanText(sale.ticketNumber) ? `Sale ${sale.ticketNumber}` : `Sale ${sale.saleID}`,
    quantity: 1,
    retail: roundMoney(subtotal),
    subtotal: roundMoney(subtotal),
    discount: roundMoney(toNum(sale.calcDiscount)),
    total: roundMoney(total),
    customer_id: cleanText(sale.customerID),
    customer_full_name: customerName(sale),
    cost,
    profit,
    margin_pct: marginPct,
    raw_sale: saleWithoutLines(sale),
    raw_line: null,
    synced_at: syncedAt,
  }
}

async function mapSalesToReportRows(userId: string, sales: LightspeedSale[]): Promise<Array<Record<string, unknown>>> {
  const lookups = await fetchReportLookups(userId)
  const syncedAt = new Date().toISOString()
  const rows: Array<Record<string, unknown>> = []

  for (const sale of sales) {
    const lines = saleLines(sale)
    if (lines.length === 0) {
      rows.push(saleSummaryToReportRow({
        userId,
        sale,
        employeeById: lookups.employeeById,
        syncedAt,
      }))
      continue
    }

    for (const line of lines) {
      rows.push(saleLineToReportRow({
        userId,
        sale,
        line,
        categoryById: lookups.categoryById,
        employeeById: lookups.employeeById,
        syncedAt,
      }))
    }
  }

  return rows
}

async function upsertReportRows(admin: SupabaseAdminClient, rows: Array<Record<string, unknown>>): Promise<number> {
  const batchSize = 500
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const { error } = await admin
      .from('lightspeed_sales_report_lines')
      .upsert(batch, { onConflict: 'user_id,sale_id,sale_line_id' })

    if (error) throw new Error(`Failed to upsert Lightspeed sales report rows: ${error.message}`)
  }

  return rows.length
}

async function getState(admin: SupabaseAdminClient, userId: string): Promise<SalesReportBackfillState | null> {
  const { data, error } = await admin
    .from('lightspeed_sales_report_backfill_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load sales backfill state: ${error.message}`)
  return data as SalesReportBackfillState | null
}

async function upsertState(
  admin: SupabaseAdminClient,
  userId: string,
  patch: Partial<SalesReportBackfillState>,
): Promise<SalesReportBackfillState> {
  const { data, error } = await admin
    .from('lightspeed_sales_report_backfill_state')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to update sales backfill state: ${error.message}`)
  return data as SalesReportBackfillState
}

function backfillLeaseOwner(prefix = 'sales-report-backfill'): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
}

function leaseExpiry(ttlMs = BACKFILL_LEASE_TTL_MS): string {
  return new Date(Date.now() + ttlMs).toISOString()
}

function emptyChunk(complete: boolean): SalesReportChunkResult['chunk'] {
  return {
    sales_fetched: 0,
    lines_upserted: 0,
    pages_fetched: 0,
    hit_page_limit: false,
    complete,
  }
}

async function tryAcquireBackfillLease(args: {
  admin: SupabaseAdminClient
  userId: string
  owner: string
  ttlMs?: number
}): Promise<boolean> {
  const { admin, userId, owner, ttlMs = BACKFILL_LEASE_TTL_MS } = args
  const now = new Date().toISOString()
  const expiresAt = leaseExpiry(ttlMs)

  const { data, error } = await admin
    .from('lightspeed_sales_report_backfill_state')
    .update({
      lease_owner: owner,
      lease_expires_at: expiresAt,
      last_heartbeat_at: now,
    })
    .eq('user_id', userId)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now},lease_owner.eq.${owner}`)
    .select('user_id')
    .maybeSingle()

  if (error) throw new Error(`Failed to acquire sales backfill lease: ${error.message}`)
  return Boolean(data)
}

async function refreshBackfillLease(args: {
  admin: SupabaseAdminClient
  userId: string
  owner: string
  ttlMs?: number
}): Promise<void> {
  const { admin, userId, owner, ttlMs = BACKFILL_LEASE_TTL_MS } = args
  const { error } = await admin
    .from('lightspeed_sales_report_backfill_state')
    .update({
      lease_expires_at: leaseExpiry(ttlMs),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('lease_owner', owner)

  if (error) throw new Error(`Failed to refresh sales backfill lease: ${error.message}`)
}

async function releaseBackfillLease(args: {
  admin: SupabaseAdminClient
  userId: string
  owner: string
}): Promise<void> {
  const { admin, userId, owner } = args
  const { error } = await admin
    .from('lightspeed_sales_report_backfill_state')
    .update({
      lease_owner: null,
      lease_expires_at: null,
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('lease_owner', owner)

  if (error) throw new Error(`Failed to release sales backfill lease: ${error.message}`)
}

async function findOldestCompletedSaleAt(userId: string): Promise<string | null> {
  const client = createLightspeedClient(userId)
  const sales = await client.getSales({
    completed: 'true',
    archived: 'false',
    voided: 'false',
    sort: 'completeTime',
    limit: 1,
  })

  return saleCompletedAt(sales[0])
}

async function initialiseBackfillState(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<SalesReportBackfillState> {
  const oldestSaleAt = await findOldestCompletedSaleAt(userId)
  const now = new Date().toISOString()

  return upsertState(admin, userId, {
    status: oldestSaleAt ? 'running' : 'complete',
    oldest_sale_at: oldestSaleAt,
    next_before: oldestSaleAt ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null,
    last_synced_at: null,
    last_complete_time: null,
    sales_processed: 0,
    lines_upserted: 0,
    pages_fetched: 0,
    last_error: null,
    started_at: now,
    finished_at: oldestSaleAt ? null : now,
    lease_owner: null,
    lease_expires_at: null,
    last_heartbeat_at: null,
  })
}

async function backfillCheckpointNeedsRestart(
  admin: SupabaseAdminClient,
  userId: string,
  state: SalesReportBackfillState,
): Promise<boolean> {
  const checkpointMs = dateMs(state.last_complete_time)
  if (!checkpointMs || (state.sales_processed ?? 0) === 0) return false

  const latestStored = await latestStoredCompleteTime(admin, userId)
  const latestStoredMs = dateMs(latestStored)

  return !latestStoredMs || latestStoredMs < checkpointMs - RECENT_SYNC_OVERLAP_MS
}

export async function getSalesReportBackfillStatus(
  userId: string,
  admin: SupabaseAdminClient = createServiceRoleClient(),
): Promise<SalesReportBackfillStatus> {
  const [state, countResult, newestResult, oldestResult] = await Promise.all([
    getState(admin, userId),
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

  if (countResult.error) throw new Error(`Failed to count sales report rows: ${countResult.error.message}`)
  if (newestResult.error) throw new Error(`Failed to load latest sales report row: ${newestResult.error.message}`)
  if (oldestResult.error) throw new Error(`Failed to load oldest sales report row: ${oldestResult.error.message}`)

  return {
    state,
    row_count: countResult.count ?? 0,
    latest_complete_time: newestResult.data?.complete_time ?? null,
    oldest_complete_time: oldestResult.data?.complete_time ?? null,
  }
}

export async function runSalesReportBackfillChunk(args: {
  userId: string
  restart?: boolean
  maxPages?: number
  admin?: SupabaseAdminClient
}): Promise<SalesReportChunkResult> {
  const { userId, restart = false, maxPages = DEFAULT_BACKFILL_MAX_PAGES } = args
  const admin = args.admin ?? createServiceRoleClient()

  let state = restart ? null : await getState(admin, userId)
  if (!state || state.status === 'idle' || restart) {
    state = await initialiseBackfillState(admin, userId)
  } else if (state.status !== 'complete' && await backfillCheckpointNeedsRestart(admin, userId, state)) {
    state = await initialiseBackfillState(admin, userId)
  }

  if (state.status === 'complete') {
    const status = await getSalesReportBackfillStatus(userId, admin)
    return {
      ...status,
      chunk: {
        sales_fetched: 0,
        lines_upserted: 0,
        pages_fetched: 0,
        hit_page_limit: false,
        complete: true,
      },
    }
  }

  const oldestSaleAt = state.oldest_sale_at
  if (!oldestSaleAt) {
    const completedState = await upsertState(admin, userId, {
      ...state,
      status: 'complete',
      next_before: null,
      last_error: null,
      finished_at: new Date().toISOString(),
    })
    const status = await getSalesReportBackfillStatus(userId, admin)
    return {
      ...status,
      state: completedState,
      chunk: {
        sales_fetched: 0,
        lines_upserted: 0,
        pages_fetched: 0,
        hit_page_limit: false,
        complete: true,
      },
    }
  }

  const before = state.next_before || new Date(Date.now() + 2 * 60 * 1000).toISOString()
  const client = createLightspeedClient(userId)

  try {
    await upsertState(admin, userId, {
      ...state,
      status: 'running',
      last_error: null,
      finished_at: null,
      started_at: state.started_at || new Date().toISOString(),
    })

    const { sales, pagesFetched, hitPageLimit } = await client.getAllSalesCursor({
      completed: 'true',
      archived: 'false',
      voided: 'false',
      sort: '-completeTime',
      completeTime: `><,${oldestSaleAt},${before}`,
      load_relations: SALES_REPORT_LOAD_RELATIONS,
    }, {
      maxPages,
      limit: SALE_PAGE_LIMIT,
    })

    const rows = await mapSalesToReportRows(userId, sales)
    const linesUpserted = await upsertReportRows(admin, rows)
    const minFetchedAt = earliestIso(sales.map(saleCompletedAt))
    const maxFetchedAt = latestIso(sales.map(saleCompletedAt))
    const reachedOldestSale = Boolean(
      minFetchedAt &&
      dateMs(minFetchedAt)! <= (dateMs(oldestSaleAt) ?? 0) + 1000
    )
    const complete = sales.length === 0 || !hitPageLimit || reachedOldestSale
    const now = new Date().toISOString()
    const nextBefore = complete ? null : minFetchedAt

    const updatedState = await upsertState(admin, userId, {
      ...state,
      status: complete ? 'complete' : 'running',
      next_before: nextBefore,
      last_synced_at: now,
      last_complete_time: latestIso([state.last_complete_time, maxFetchedAt]),
      sales_processed: (state.sales_processed ?? 0) + sales.length,
      lines_upserted: (state.lines_upserted ?? 0) + linesUpserted,
      pages_fetched: (state.pages_fetched ?? 0) + pagesFetched,
      last_error: null,
      finished_at: complete ? now : null,
    })

    const status = await getSalesReportBackfillStatus(userId, admin)
    return {
      ...status,
      state: updatedState,
      chunk: {
        sales_fetched: sales.length,
        lines_upserted: linesUpserted,
        pages_fetched: pagesFetched,
        hit_page_limit: hitPageLimit,
        complete,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sales report backfill failed'
    const erroredState = await upsertState(admin, userId, {
      ...state,
      status: 'error',
      last_error: message,
      finished_at: new Date().toISOString(),
    })
    const status = await getSalesReportBackfillStatus(userId, admin)
    return {
      ...status,
      state: erroredState,
      chunk: {
        sales_fetched: 0,
        lines_upserted: 0,
        pages_fetched: 0,
        hit_page_limit: false,
        complete: false,
      },
    }
  }
}

function hasActiveForeignLease(state: SalesReportBackfillState | null, owner: string): boolean {
  if (!state?.lease_owner || !state.lease_expires_at || state.lease_owner === owner) return false
  const expiresAt = dateMs(state.lease_expires_at)
  return expiresAt !== null && expiresAt > Date.now()
}

function clampRunTimeBudget(value: number | undefined): number {
  return Math.min(
    Math.max(value ?? 45_000, BACKFILL_RUN_MIN_TIME_BUDGET_MS),
    BACKFILL_RUN_MAX_TIME_BUDGET_MS,
  )
}

export async function runSalesReportBackfillUntilDeadline(args: {
  userId: string
  restart?: boolean
  admin?: SupabaseAdminClient
  maxPagesPerChunk?: number
  maxChunks?: number
  timeBudgetMs?: number
  leaseOwner?: string
}): Promise<SalesReportBackfillRunResult> {
  const admin = args.admin ?? createServiceRoleClient()
  const owner = args.leaseOwner ?? backfillLeaseOwner()
  const maxPagesPerChunk = Math.min(Math.max(args.maxPagesPerChunk ?? DEFAULT_BACKFILL_MAX_PAGES, 1), 25)
  const maxChunks = Math.min(Math.max(args.maxChunks ?? 25, 1), 250)
  const deadline = Date.now() + clampRunTimeBudget(args.timeBudgetMs)

  let state = await getState(admin, args.userId)
  if (state && hasActiveForeignLease(state, owner)) {
    const status = await getSalesReportBackfillStatus(args.userId, admin)
    return {
      ...status,
      chunk: emptyChunk(status.state?.status === 'complete'),
      chunks_run: 0,
      locked: true,
      timed_out: false,
      retry_after_ms: 5_000,
    }
  }

  if (!state || state.status === 'idle' || args.restart) {
    state = await initialiseBackfillState(admin, args.userId)
  }

  if (state.status === 'complete') {
    const status = await getSalesReportBackfillStatus(args.userId, admin)
    return {
      ...status,
      chunk: emptyChunk(true),
      chunks_run: 0,
      locked: false,
      timed_out: false,
      retry_after_ms: null,
    }
  }

  const acquired = await tryAcquireBackfillLease({
    admin,
    userId: args.userId,
    owner,
  })

  if (!acquired) {
    const status = await getSalesReportBackfillStatus(args.userId, admin)
    return {
      ...status,
      chunk: emptyChunk(status.state?.status === 'complete'),
      chunks_run: 0,
      locked: true,
      timed_out: false,
      retry_after_ms: 5_000,
    }
  }

  let chunksRun = 0
  let salesFetched = 0
  let linesUpserted = 0
  let pagesFetched = 0
  let hitPageLimit = false
  let complete = false
  let latestResult: SalesReportChunkResult | null = null

  try {
    while (chunksRun < maxChunks && Date.now() < deadline) {
      const result = await runSalesReportBackfillChunk({
        userId: args.userId,
        admin,
        maxPages: maxPagesPerChunk,
      })

      chunksRun += 1
      salesFetched += result.chunk.sales_fetched
      linesUpserted += result.chunk.lines_upserted
      pagesFetched += result.chunk.pages_fetched
      hitPageLimit = hitPageLimit || result.chunk.hit_page_limit
      complete = result.chunk.complete || result.state?.status === 'complete'
      latestResult = result

      await refreshBackfillLease({
        admin,
        userId: args.userId,
        owner,
      })

      if (complete || result.state?.status === 'error') break
    }

    const status = latestResult ?? await getSalesReportBackfillStatus(args.userId, admin)
    const timedOut = !complete && status.state?.status !== 'error' && Date.now() >= deadline

    return {
      ...status,
      chunk: {
        sales_fetched: salesFetched,
        lines_upserted: linesUpserted,
        pages_fetched: pagesFetched,
        hit_page_limit: hitPageLimit,
        complete,
      },
      chunks_run: chunksRun,
      locked: false,
      timed_out: timedOut,
      retry_after_ms: complete || status.state?.status === 'error' ? null : 500,
    }
  } finally {
    await releaseBackfillLease({
      admin,
      userId: args.userId,
      owner,
    }).catch(error => {
      console.warn('[Lightspeed Sales Report] Failed to release backfill lease:', error)
    })
  }
}

async function latestStoredCompleteTime(admin: SupabaseAdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('lightspeed_sales_report_lines')
    .select('complete_time')
    .eq('user_id', userId)
    .not('complete_time', 'is', null)
    .order('complete_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load latest stored Lightspeed sale: ${error.message}`)
  return data?.complete_time ?? null
}

export async function syncRecentSalesReportLinesForUser(args: {
  userId: string
  admin?: SupabaseAdminClient
  maxPages?: number
  sinceIso?: string
}): Promise<{
  user_id: string
  sales_fetched: number
  lines_upserted: number
  pages_fetched: number
  hit_page_limit: boolean
  since: string
}> {
  const { userId, maxPages = DEFAULT_RECENT_SYNC_MAX_PAGES } = args
  const admin = args.admin ?? createServiceRoleClient()
  const state = await getState(admin, userId)
  const latestStored = await latestStoredCompleteTime(admin, userId)
  const baseline = args.sinceIso || state?.last_complete_time || latestStored
  const since = baseline
    ? subtractMs(validIso(baseline) ?? baseline, RECENT_SYNC_OVERLAP_MS)
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const until = new Date(Date.now() + 2 * 60 * 1000).toISOString()
  const client = createLightspeedClient(userId)

  const { sales, pagesFetched, hitPageLimit } = await client.getAllSalesCursor({
    completed: 'true',
    archived: 'false',
    voided: 'false',
    sort: '-completeTime',
    completeTime: `><,${since},${until}`,
    load_relations: SALES_REPORT_LOAD_RELATIONS,
  }, {
    maxPages,
    limit: SALE_PAGE_LIMIT,
  })

  const rows = await mapSalesToReportRows(userId, sales)
  const linesUpserted = await upsertReportRows(admin, rows)
  const maxFetchedAt = latestIso(sales.map(saleCompletedAt))
  const now = new Date().toISOString()

  await upsertState(admin, userId, {
    status: state?.status ?? 'idle',
    oldest_sale_at: state?.oldest_sale_at ?? null,
    next_before: state?.next_before ?? null,
    last_synced_at: now,
    last_complete_time: latestIso([state?.last_complete_time, latestStored, maxFetchedAt]),
    sales_processed: state?.sales_processed ?? 0,
    lines_upserted: (state?.lines_upserted ?? 0) + linesUpserted,
    pages_fetched: (state?.pages_fetched ?? 0) + pagesFetched,
    last_error: state?.last_error ?? null,
    started_at: state?.started_at ?? null,
    finished_at: state?.finished_at ?? null,
  })

  return {
    user_id: userId,
    sales_fetched: sales.length,
    lines_upserted: linesUpserted,
    pages_fetched: pagesFetched,
    hit_page_limit: hitPageLimit,
    since,
  }
}

export async function syncRecentSalesReportLinesForConnectedUsers(args?: {
  admin?: SupabaseAdminClient
  maxUsers?: number
  maxPagesPerUser?: number
}) {
  const admin = args?.admin ?? createServiceRoleClient()
  const maxUsers = Math.min(Math.max(args?.maxUsers ?? 50, 1), 200)

  const { data: connections, error } = await admin
    .from('lightspeed_connections')
    .select('user_id, account_name')
    .eq('status', 'connected')
    .not('access_token_encrypted', 'is', null)
    .limit(maxUsers)

  if (error) throw new Error(`Failed to load connected Lightspeed stores: ${error.message}`)

  const results: Array<{
    user_id: string
    account_name: string | null
    success: boolean
    sales_fetched?: number
    lines_upserted?: number
    pages_fetched?: number
    error?: string
  }> = []

  for (const connection of connections ?? []) {
    try {
      const result = await syncRecentSalesReportLinesForUser({
        userId: connection.user_id,
        admin,
        maxPages: args?.maxPagesPerUser ?? DEFAULT_RECENT_SYNC_MAX_PAGES,
      })

      results.push({
        user_id: connection.user_id,
        account_name: connection.account_name,
        success: true,
        sales_fetched: result.sales_fetched,
        lines_upserted: result.lines_upserted,
        pages_fetched: result.pages_fetched,
      })
    } catch (error) {
      results.push({
        user_id: connection.user_id,
        account_name: connection.account_name,
        success: false,
        error: error instanceof Error ? error.message : 'Recent sales sync failed',
      })
    }
  }

  return {
    stores_checked: connections?.length ?? 0,
    succeeded: results.filter(result => result.success).length,
    failed: results.filter(result => !result.success).length,
    results,
  }
}

export async function continueHistoricalSalesReportBackfills(args?: {
  admin?: SupabaseAdminClient
  maxUsers?: number
  maxChunksPerUser?: number
  maxPagesPerChunk?: number
  timeBudgetMs?: number
}) {
  const admin = args?.admin ?? createServiceRoleClient()
  const maxUsers = Math.min(Math.max(args?.maxUsers ?? 10, 1), 50)
  const maxChunksPerUser = Math.min(Math.max(args?.maxChunksPerUser ?? 2, 1), 20)
  const maxPagesPerChunk = Math.min(Math.max(args?.maxPagesPerChunk ?? 5, 1), 25)
  const deadline = Date.now() + Math.min(Math.max(args?.timeBudgetMs ?? 240_000, 30_000), 270_000)

  const { data: states, error: statesError } = await admin
    .from('lightspeed_sales_report_backfill_state')
    .select('user_id, status, updated_at')
    .in('status', ['running', 'error'])
    .order('updated_at', { ascending: true })
    .limit(maxUsers)

  if (statesError) throw new Error(`Failed to load running sales backfills: ${statesError.message}`)

  const userIds = Array.from(new Set((states ?? []).map(state => state.user_id).filter(Boolean)))
  if (userIds.length === 0) {
    return {
      stores_checked: 0,
      stores_attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      timed_out: false,
      results: [],
    }
  }

  const { data: connections, error: connectionsError } = await admin
    .from('lightspeed_connections')
    .select('user_id, account_name')
    .eq('status', 'connected')
    .not('access_token_encrypted', 'is', null)
    .in('user_id', userIds)

  if (connectionsError) throw new Error(`Failed to load connected stores for sales backfill: ${connectionsError.message}`)

  const connectionByUserId = new Map((connections ?? []).map(connection => [connection.user_id, connection]))
  const results: Array<{
    user_id: string
    account_name: string | null
    success: boolean
    skipped?: boolean
    status?: SalesReportBackfillStatusValue
    chunks_run?: number
    locked?: boolean
    timed_out?: boolean
    row_count?: number
    sales_fetched?: number
    lines_upserted?: number
    pages_fetched?: number
    error?: string
  }> = []

  for (const state of states ?? []) {
    if (Date.now() >= deadline) break

    const connection = connectionByUserId.get(state.user_id)
    if (!connection) {
      results.push({
        user_id: state.user_id,
        account_name: null,
        success: true,
        skipped: true,
        status: state.status as SalesReportBackfillStatusValue,
        error: 'Lightspeed account is not currently connected.',
      })
      continue
    }

    try {
      const remainingBudget = Math.max(deadline - Date.now(), BACKFILL_RUN_MIN_TIME_BUDGET_MS)
      const result = await runSalesReportBackfillUntilDeadline({
        userId: state.user_id,
        admin,
        maxPagesPerChunk,
        maxChunks: maxChunksPerUser,
        timeBudgetMs: remainingBudget,
        leaseOwner: backfillLeaseOwner('sales-report-cron'),
      })

      results.push({
        user_id: state.user_id,
        account_name: connection.account_name,
        success: result.state?.status !== 'error',
        status: result.state?.status,
        chunks_run: result.chunks_run,
        locked: result.locked,
        timed_out: result.timed_out,
        row_count: result.row_count,
        sales_fetched: result.chunk.sales_fetched,
        lines_upserted: result.chunk.lines_upserted,
        pages_fetched: result.chunk.pages_fetched,
      })
    } catch (error) {
      results.push({
        user_id: state.user_id,
        account_name: connection.account_name,
        success: false,
        error: error instanceof Error ? error.message : 'Historical sales backfill failed',
      })
    }
  }

  return {
    stores_checked: states?.length ?? 0,
    stores_attempted: results.filter(result => !result.skipped).length,
    succeeded: results.filter(result => result.success && !result.skipped).length,
    failed: results.filter(result => !result.success && !result.skipped).length,
    skipped: results.filter(result => result.skipped).length,
    timed_out: Date.now() >= deadline,
    results,
  }
}
