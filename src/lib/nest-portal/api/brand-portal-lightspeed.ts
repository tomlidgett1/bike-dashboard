import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getLightspeedAccess, lightspeedGetJson } from '../lib/lightspeed-portal-access'
import { lightspeedThrottled } from '../lib/lightspeed-api-throttle'
import {
  reportDbRowToApiRow,
  type ReportSaleLineDbRow,
} from '../lib/lightspeed-report-sale-line'

function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
}

function internalEdgeJsonHeaders(): Record<string, string> {
  const secret =
    pickEnv(['INTERNAL_EDGE_SHARED_SECRET', 'NEST_INTERNAL_EDGE_SHARED_SECRET']) ?? ''
  if (!secret) {
    throw new Error('INTERNAL_EDGE_SHARED_SECRET is not configured')
  }
  return {
    'Content-Type': 'application/json',
    'x-internal-secret': secret,
  }
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const key = pickEnv([
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
  ])
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function supabaseConfigErrorMessage(): string {
  const hasUrl = Boolean(
    pickEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL']),
  )
  const hasKey = Boolean(pickEnv([
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
  ]))
  if (!hasUrl && !hasKey) {
    return 'Server missing Supabase URL and server secret key. In Vercel -> Settings -> Environment Variables, add SUPABASE_URL and SUPABASE_SECRET_KEY from Supabase -> Project Settings -> API Keys.'
  }
  if (!hasUrl) {
    return 'Server missing Supabase URL. Add SUPABASE_URL to Vercel (same value as VITE_SUPABASE_URL), or enable VITE_SUPABASE_URL for Production and redeploy.'
  }
  return 'Server missing SUPABASE_SECRET_KEY. Add it in Vercel -> Settings -> Environment Variables (Production). Use the secret key from Supabase -> Project Settings -> API Keys. Do not use a VITE_ prefix for this secret.'
}

const FINISHED_WORKORDER_STATUS_IDS = [4, 5]
/** Status IDs on the workshop board (excludes Done & Paid — too many for a live board). */
const PORTAL_WORKORDER_STATUS_IDS = [1, 4, 8, 10]

export type WorkorderBoardBucket = 'van' | 'today' | 'open' | 'finished'

function workorderBoardBucket(statusId: number | null | undefined): WorkorderBoardBucket {
  if (statusId === 10) return 'van'
  if (statusId === 8) return 'today'
  if (statusId === 1) return 'open'
  if (statusId === 4 || statusId === 5) return 'finished'
  return 'open'
}

function workorderBoardLabel(
  statusId: number | null | undefined,
  statusNameFromPayload?: string | null,
): string {
  const name = statusNameFromPayload?.trim()
  if (name) {
    if (name.toUpperCase() === 'TODAY') return 'TODAY'
    if (name.toUpperCase() === 'VAN') return 'VAN'
    if (name.toLowerCase() === 'open') return 'Open'
    if (statusId === 4 || statusId === 5) return 'FINISHED'
    return name
  }
  const bucket = workorderBoardBucket(statusId)
  if (bucket === 'van') return 'VAN'
  if (bucket === 'today') return 'TODAY'
  if (bucket === 'open') return 'Open'
  return 'FINISHED'
}

function workorderBoardSortRank(statusId: number | null | undefined): number {
  if (statusId === 10) return 0
  if (statusId === 8) return 1
  if (statusId === 1) return 2
  if (statusId === 4) return 3
  if (statusId === 5) return 4
  return 5
}

function melbourneYmdFromIso(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    const d = new Date(iso.trim())
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return null
  }
}

function formatMelbourneShortDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    const d = new Date(iso.trim())
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)
  } catch {
    return null
  }
}

function formatMelbourneDateTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    const d = new Date(iso.trim())
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return null
  }
}

function saleLinesFromPayload(sale: Record<string, unknown>): Record<string, unknown>[] {
  return extractLightspeedRelationRows(sale.SaleLines ?? sale.SaleLine, ['SaleLine', 'saleLine'])
}

function saleEmployeeId(sale: Record<string, unknown>): number | null {
  const id = parseLooseNumber(sale.employeeID)
  return id != null && id > 0 ? Math.trunc(id) : null
}

function lineEmployeeId(
  line: Record<string, unknown>,
  saleEmployee: number | null,
): number | null {
  const lineId = parseLooseNumber(line.employeeID)
  if (lineId != null && lineId > 0) return Math.trunc(lineId)
  return saleEmployee
}

function itemCategoryId(item: Record<string, unknown> | null): number | null {
  if (!item) return null
  const id = parseLooseNumber(item.categoryID)
  return id != null && id > 0 ? Math.trunc(id) : null
}

function saleCustomerDisplayName(sale: Record<string, unknown>): string | null {
  const raw = sale.Customer
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  if (!row) return null
  const company = typeof row.company === 'string' ? row.company.trim() : ''
  const firstName = typeof row.firstName === 'string' ? row.firstName.trim() : ''
  const lastName = typeof row.lastName === 'string' ? row.lastName.trim() : ''
  const personal = [firstName, lastName].filter(Boolean).join(' ')
  if (company && personal) return `${personal} (${company})`
  if (personal) return personal
  return company.length > 0 ? company : null
}

function lineDescription(line: Record<string, unknown>): string {
  const item = line.Item
  const itemObj = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null
  const fromItem =
    (itemObj && typeof itemObj.description === 'string' && itemObj.description.trim()) ||
    (itemObj && typeof itemObj.shortDescription === 'string' && itemObj.shortDescription.trim()) ||
    ''
  if (fromItem) return fromItem
  if (itemObj) {
    for (const k of ['customSku', 'systemSku', 'manufacturerSku'] as const) {
      const s = typeof itemObj[k] === 'string' ? itemObj[k].trim() : ''
      if (s) return s
    }
  }
  const lt = typeof line.lineType === 'string' ? line.lineType.trim() : ''
  if (lt) return lt
  const d = typeof line.description === 'string' ? line.description.trim() : ''
  if (d) return d
  const note = typeof line.note === 'string' ? line.note.trim() : ''
  if (note) return note
  return '(No description)'
}

export type RecentSaleLineApiRow = {
  saleId: number
  date: string
  description: string
  quantity: number
  retail: number
  subtotal: number
  discount: number
  total: number
  customerFullName: string | null
  employeeName: string | null
  category: string | null
  cost: number
  profit: number
  marginPct: number | null
}

type RecentSaleLineAccumulator = Omit<RecentSaleLineApiRow, 'employeeName' | 'category'> & {
  /** Line `timeStamp` when present, else sale completion time — used only for sorting */
  lineTimeIso: string | null
  saleTimeIso: string | null
  employeeId: number | null
  categoryId: number | null
}

type FetchRecentSaleLinesResult =
  | { ok: true; lines: RecentSaleLineApiRow[] }
  | { ok: false; oauth: true; message: string }
  | { ok: false; oauth: false; message: string }

function lineDiscountTotal(line: Record<string, unknown>): number {
  const a = parseLooseNumber(line.calcLineDiscount) ?? 0
  const b = parseLooseNumber(line.calcTransactionDiscount) ?? 0
  let sum = Math.abs(a) + Math.abs(b)
  if (sum < 1e-9) {
    const c = parseLooseNumber(line.discountAmount)
    if (c != null) sum = Math.abs(c)
  }
  return sum
}

function nextLightspeedListPath(nextUrl: unknown, accountId: string): string | null {
  if (typeof nextUrl !== 'string' || !nextUrl.trim()) return null
  try {
    const url = new URL(nextUrl)
    const marker = `/API/V3/Account/${accountId}/`
    const index = url.pathname.indexOf(marker)
    if (index === -1) return null
    return `${url.pathname.slice(index + marker.length)}${url.search}`
  } catch {
    return null
  }
}

function lightspeedSingleEntityRow(
  data: Record<string, unknown>,
  entityKey: string,
): Record<string, unknown> | null {
  const raw = data[entityKey]
  if (Array.isArray(raw)) {
    const first = raw[0]
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  return null
}

async function buildLightspeedEmployeeNameMap(
  accessToken: string,
  accountId: string,
  employeeIds: number[],
): Promise<Map<number, string>> {
  const wanted = new Set(employeeIds.filter((id) => id > 0))
  const out = new Map<number, string>()
  if (wanted.size === 0) return out

  let path: string | null = 'Employee.json?limit=100&sort=employeeID'
  for (let pages = 0; path && pages < 15 && out.size < wanted.size; pages += 1) {
    const data = await lightspeedThrottled(() =>
      lightspeedGetJson(accessToken, accountId, path!),
    )
    const rows = extractLightspeedRelationRows(data.Employee, ['Employee'])
    for (const row of rows) {
      const id = parseLooseNumber(row.employeeID)
      if (id == null) continue
      const key = Math.trunc(id)
      if (!wanted.has(key)) continue
      const first = parseLooseString(row.firstName) ?? ''
      const last = parseLooseString(row.lastName) ?? ''
      const full = `${first} ${last}`.trim()
      if (full) out.set(key, full)
    }
    path = nextLightspeedListPath(
      (data['@attributes'] as Record<string, unknown> | undefined)?.next,
      accountId,
    )
  }

  for (const id of wanted) {
    if (out.has(id)) continue
    try {
      const data = await lightspeedThrottled(() =>
        lightspeedGetJson(accessToken, accountId, `Employee/${id}.json`),
      )
      const row = lightspeedSingleEntityRow(data, 'Employee')
      const first = row ? parseLooseString(row.firstName) ?? '' : ''
      const last = row ? parseLooseString(row.lastName) ?? '' : ''
      const full = `${first} ${last}`.trim()
      if (full) out.set(id, full)
    } catch {
      /* optional */
    }
  }

  return out
}

async function buildLightspeedCategoryNameMap(
  accessToken: string,
  accountId: string,
  categoryIds: number[],
): Promise<Map<number, string>> {
  const wanted = new Set(categoryIds.filter((id) => id > 0))
  const out = new Map<number, string>()
  if (wanted.size === 0) return out

  let path: string | null = 'Category.json?limit=100&sort=categoryID'
  for (let pages = 0; path && pages < 15 && out.size < wanted.size; pages += 1) {
    const data = await lightspeedThrottled(() =>
      lightspeedGetJson(accessToken, accountId, path!),
    )
    const rows = extractLightspeedRelationRows(data.Category, ['Category'])
    for (const row of rows) {
      const id = parseLooseNumber(row.categoryID)
      if (id == null) continue
      const key = Math.trunc(id)
      if (!wanted.has(key)) continue
      const name = parseLooseString(row.name) ?? parseLooseString(row.Name)
      if (name) out.set(key, name)
    }
    path = nextLightspeedListPath(
      (data['@attributes'] as Record<string, unknown> | undefined)?.next,
      accountId,
    )
  }

  for (const id of wanted) {
    if (out.has(id)) continue
    try {
      const data = await lightspeedThrottled(() =>
        lightspeedGetJson(accessToken, accountId, `Category/${id}.json`),
      )
      const row = lightspeedSingleEntityRow(data, 'Category')
      const name = row ? parseLooseString(row.name) ?? parseLooseString(row.Name) : null
      if (name) out.set(id, name)
    } catch {
      /* optional */
    }
  }

  return out
}

async function fetchRecentLightspeedSaleLines(
  supabase: SupabaseClient,
  brandKey: string,
  limitLines: number,
): Promise<FetchRecentSaleLinesResult> {
  const access = await getLightspeedAccess(supabase, brandKey).catch(() => null)
  if (!access) {
    return { ok: false, oauth: true, message: 'Lightspeed is not connected for this workspace.' }
  }

  const cappedLines = Math.min(Math.max(1, Math.trunc(limitLines)), 200)
  /** Fetch enough recent sales that we can usually fill `cappedLines` rows (API max 100). */
  const saleBatchLimit = Math.min(100, Math.max(32, cappedLines))

  const loadRelations = JSON.stringify(['SaleLines', 'SaleLines.Item', 'Customer'])
  const qs = new URLSearchParams({
    sort: '-completeTime',
    limit: String(saleBatchLimit),
    load_relations: loadRelations,
  })
  const path = `Sale.json?${qs.toString()}`

  let data: Record<string, unknown>
  try {
    data = await lightspeedThrottled(() =>
      lightspeedGetJson(access.accessToken, access.accountId, path),
    )
  } catch (e) {
    return {
      ok: false,
      oauth: false,
      message: e instanceof Error ? e.message : 'Lightspeed sale fetch failed.',
    }
  }

  const rawSales = data.Sale
  const sales: Record<string, unknown>[] = Array.isArray(rawSales)
    ? (rawSales as Record<string, unknown>[])
    : rawSales && typeof rawSales === 'object'
      ? [rawSales as Record<string, unknown>]
      : []

  const collected: RecentSaleLineAccumulator[] = []

  for (const sale of sales) {
    if (parseLooseBool(sale.voided) === true) continue
    if (parseLooseBool(sale.archived) === true) continue

    const completed = parseLooseBool(sale.completed)
    if (completed === false) continue

    const saleId = parseLooseNumber(sale.saleID)
    if (saleId == null || saleId <= 0) continue

    const saleTimeRaw =
      (typeof sale.completeTime === 'string' && sale.completeTime) ||
      (typeof sale.timeStamp === 'string' && sale.timeStamp) ||
      (typeof sale.createTime === 'string' && sale.createTime) ||
      null

    const dateHeadingIso =
      typeof sale.completeTime === 'string'
        ? sale.completeTime
        : typeof sale.timeStamp === 'string'
          ? sale.timeStamp
          : typeof sale.createTime === 'string'
            ? sale.createTime
            : null

    const customerFullName = saleCustomerDisplayName(sale)
    const saleEmployee = saleEmployeeId(sale)
    const lines = saleLinesFromPayload(sale)

    for (const line of lines) {
      if (parseLooseBool(line.isLayaway) === true) continue

      const lineDateIso =
        typeof line.timeStamp === 'string' && line.timeStamp.trim()
          ? line.timeStamp
          : dateHeadingIso
      const dateDisplay = formatMelbourneDateTime(lineDateIso) ?? '—'

      const qtyRaw = parseLooseNumber(line.unitQuantity) ?? 0
      const qty = qtyRaw

      const retail =
        parseLooseNumber(line.unitPrice) ?? parseLooseNumber(line.normalUnitPrice) ?? 0

      const explicitSubtotal = parseLooseNumber(line.calcSubtotal)
      const subtotal =
        explicitSubtotal !== null && Number.isFinite(explicitSubtotal)
          ? explicitSubtotal
          : Math.abs(qty) * retail

      const discount = lineDiscountTotal(line)

      const lineTotal =
        parseLooseNumber(line.calcLineTotal) ??
        parseLooseNumber(line.calcTotal) ??
        Math.abs(qty) * retail

      const avgUnit = parseLooseNumber(line.avgCost)
      const fifoUnit = parseLooseNumber(line.fifoCost)
      const itemObj =
        line.Item && typeof line.Item === 'object' && !Array.isArray(line.Item)
          ? (line.Item as Record<string, unknown>)
          : null
      const categoryId = itemCategoryId(itemObj)
      const itemAvg = itemObj ? parseLooseNumber(itemObj.avgCost) : null
      const unitCost =
        avgUnit != null && avgUnit > 0
          ? avgUnit
          : fifoUnit != null && fifoUnit > 0
            ? fifoUnit
            : itemAvg != null && itemAvg > 0
              ? itemAvg
              : 0
      const cost = unitCost * Math.abs(qty)

      const profit = subtotal - cost
      const marginPct = subtotal > 0.0001 ? (profit / subtotal) * 100 : null

      const lineTimeRaw = typeof line.timeStamp === 'string' ? line.timeStamp : null

      collected.push({
        saleId: Math.trunc(saleId),
        saleTimeIso: saleTimeRaw,
        lineTimeIso: lineTimeRaw,
        date: dateDisplay,
        description: lineDescription(line),
        quantity: qty,
        retail,
        subtotal,
        discount,
        total: lineTotal,
        customerFullName,
        employeeId: lineEmployeeId(line, saleEmployee),
        categoryId,
        cost,
        profit,
        marginPct,
      })
    }
  }

  collected.sort((a, b) => {
    const parse = (row: RecentSaleLineAccumulator) => {
      const iso = row.lineTimeIso ?? row.saleTimeIso
      const ms = iso ? Date.parse(iso) : NaN
      return Number.isFinite(ms) ? ms : 0
    }
    return parse(b) - parse(a)
  })

  const sliced = collected.slice(0, cappedLines)
  const employeeIds = sliced.map((row) => row.employeeId).filter((id): id is number => id != null)
  const categoryIds = sliced.map((row) => row.categoryId).filter((id): id is number => id != null)

  const employeeMap = await buildLightspeedEmployeeNameMap(
    access.accessToken,
    access.accountId,
    employeeIds,
  )
  const categoryMap = await buildLightspeedCategoryNameMap(
    access.accessToken,
    access.accountId,
    categoryIds,
  )

  const lines: RecentSaleLineApiRow[] = sliced.map((row) => ({
    saleId: row.saleId,
    date: row.date,
    description: row.description,
    quantity: row.quantity,
    retail: row.retail,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    customerFullName: row.customerFullName,
    employeeName: row.employeeId != null ? employeeMap.get(row.employeeId) ?? null : null,
    category: row.categoryId != null ? categoryMap.get(row.categoryId) ?? null : null,
    cost: row.cost,
    profit: row.profit,
    marginPct: row.marginPct,
  }))

  return { ok: true, lines }
}

function workorderDaysOverdue(etaIso: string | null | undefined): number | null {
  const etaYmd = melbourneYmdFromIso(etaIso)
  if (!etaYmd) return null
  const todayYmd = melbourneYmdFromIso(new Date().toISOString())
  if (!todayYmd) return null
  const etaMs = Date.parse(`${etaYmd}T12:00:00Z`)
  const todayMs = Date.parse(`${todayYmd}T12:00:00Z`)
  if (!Number.isFinite(etaMs) || !Number.isFinite(todayMs)) return null
  const diff = Math.floor((todayMs - etaMs) / 86_400_000)
  return diff > 0 ? diff : 0
}

function extractWorkorderItemSummary(
  lineItems: unknown,
  payload: Record<string, unknown>,
  notes: string | null,
): string | null {
  if (Array.isArray(lineItems)) {
    for (const raw of lineItems) {
      const row = asRecord(raw)
      if (!row) continue
      for (const key of ['display_label', 'description', 'note'] as const) {
        const value = parseLooseString(row[key])
        if (value) return value.split('\n')[0].slice(0, 160)
      }
    }
  }
  const lines = extractLightspeedRelationRows(payload.WorkorderLines ?? payload.workorderLines, [
    'WorkorderLine',
    'workorderLine',
  ])
  for (const line of lines) {
    const value =
      parseLooseString(line.description) ??
      parseLooseString(line.note) ??
      parseLooseString(line.displayName)
    if (value) return value.split('\n')[0].slice(0, 160)
  }
  const note = notes?.trim()
  if (note) return note.split('\n')[0].slice(0, 160)
  return null
}

function extractWorkorderHookSummary(payload: Record<string, unknown>): string | null {
  const hookIn = parseLooseString(payload.hookIn)
  const hookOut = parseLooseString(payload.hookOut)
  const parts = [hookIn, hookOut].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return null
  return parts.join(' · ').slice(0, 200)
}

function countWorkorderTasks(lineItems: unknown, payload: Record<string, unknown>): number {
  if (Array.isArray(lineItems) && lineItems.length > 0) return lineItems.length
  const items = extractLightspeedRelationRows(payload.WorkorderItems ?? payload.workorderItems, [
    'WorkorderItem',
    'workorderItem',
  ])
  if (items.length > 0) return items.length
  const lines = extractLightspeedRelationRows(payload.WorkorderLines ?? payload.workorderLines, [
    'WorkorderLine',
    'workorderLine',
  ])
  return lines.length
}

function workorderStatusLabel(id: number | null | undefined): string {
  if (id == null) return 'Unknown'
  if (id === 10) return 'VAN'
  if (id === 8) return 'TODAY'
  if (id === 1) return 'Open'
  if (id === 4) return 'Finished'
  if (id === 5) return 'Paid'
  return `Status ${id}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseLooseBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1' || value === 1) return true
  if (value === 'false' || value === '0' || value === 0) return false
  return null
}

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function parseLooseString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function extractLightspeedRelationRows(
  node: unknown,
  relationNames: string[],
): Record<string, unknown>[] {
  if (node == null) return []
  if (Array.isArray(node)) {
    const out: Record<string, unknown>[] = []
    for (const el of node) {
      const row = asRecord(el)
      if (!row) continue
      let unwrapped = false
      for (const name of relationNames) {
        const inner = row[name]
        if (inner == null) continue
        unwrapped = true
        if (Array.isArray(inner)) {
          for (const x of inner) {
            const nested = asRecord(x)
            if (nested) out.push(nested)
          }
        } else {
          const nested = asRecord(inner)
          if (nested) out.push(nested)
        }
        break
      }
      if (!unwrapped) out.push(row)
    }
    return out
  }
  const obj = asRecord(node)
  if (!obj) return []
  for (const name of relationNames) {
    const inner = obj[name]
    if (inner == null) continue
    if (Array.isArray(inner)) {
      return inner
        .map((x) => asRecord(x))
        .filter((x): x is Record<string, unknown> => x != null)
    }
    const single = asRecord(inner)
    return single ? [single] : []
  }
  return [obj]
}

function flattenRecordFields(
  record: Record<string, unknown> | null,
  prefix = '',
): Array<{ label: string; value: string }> {
  if (!record) return []
  const out: Array<{ label: string; value: string }> = []
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('@')) continue
    const label = prefix ? `${prefix}.${key}` : key
    if (value == null || value === '') continue
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        out.push({ label, value: JSON.stringify(value) })
      } else {
        out.push(...flattenRecordFields(asRecord(value), label))
      }
      continue
    }
    out.push({ label, value: String(value) })
  }
  return out
}

function employeeDisplayName(employee: Record<string, unknown> | null): string | null {
  if (!employee) return null
  const first = parseLooseString(employee.firstName) ?? ''
  const last = parseLooseString(employee.lastName) ?? ''
  const full = `${first} ${last}`.trim()
  return full || null
}

function formatLineHoursDisplay(hours: unknown, minutes: unknown): string {
  const h = parseLooseNumber(hours) ?? 0
  const m = parseLooseNumber(minutes) ?? 0
  return `${h}:${String(m).padStart(2, '0')}`
}

function extractBikeFields(
  serialized: Record<string, unknown> | null,
  note: string | null,
): {
  bikeDescription: string | null
  bikeColor: string | null
  bikeSize: string | null
  bikeSerial: string | null
  customerItemLabel: string | null
} {
  let bikeDescription =
    parseLooseString(serialized?.description) ?? parseLooseString(serialized?.Description)
  const bikeColor = parseLooseString(serialized?.color) ?? parseLooseString(serialized?.Color)
  const bikeSize = parseLooseString(serialized?.size) ?? parseLooseString(serialized?.Size)
  const bikeSerial = parseLooseString(serialized?.serial) ?? parseLooseString(serialized?.Serial)

  if (!bikeDescription && note) {
    const firstLine = note
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && line.length < 100)
    if (firstLine && !/service|bleed|notes:/i.test(firstLine)) {
      bikeDescription = firstLine
    }
  }

  let customerItemLabel =
    bikeDescription && bikeColor
      ? `${bikeDescription}: ${bikeColor}`
      : bikeDescription ?? null

  return { bikeDescription, bikeColor, bikeSize, bikeSerial, customerItemLabel }
}

function customerItemFallback(
  bikeFields: ReturnType<typeof extractBikeFields>,
  serializedId: number | null,
  itemSummary: string | null,
): string | null {
  if (bikeFields.customerItemLabel) return bikeFields.customerItemLabel
  if (bikeFields.bikeDescription) return bikeFields.bikeDescription
  if (itemSummary && !/service|bleed|labou?r/i.test(itemSummary)) return itemSummary
  if (serializedId != null) return `Customer bike #${serializedId}`
  return null
}

function buildDetailLineRows(
  lineItemsEnriched: unknown[],
  workorderLines: Record<string, unknown>[],
  defaultEmployeeName: string | null,
) {
  const lineById = new Map<number, Record<string, unknown>>()
  for (const raw of workorderLines) {
    const id = parseLooseNumber(raw.workorderLineID ?? raw.workorderLineId)
    if (id != null) lineById.set(Math.trunc(id), raw)
  }

  const pushRow = (
    lineId: number | null,
    source: string | null,
    description: string,
    qty: number,
    price: number | null,
    raw: Record<string, unknown> | null,
  ) => {
    const subtotal = price != null ? price * qty : null
    const lineType =
      source === 'WorkorderLine' || source === 'workorderLine' ? ('labor' as const) : ('part' as const)
    return {
      lineId,
      lineType,
      description,
      employeeName: defaultEmployeeName,
      done: parseLooseBool(raw?.done) === true,
      price,
      quantity: qty,
      subtotal,
      hoursDisplay: raw ? formatLineHoursDisplay(raw.hours, raw.minutes) : '0:00',
    }
  }

  const rows: ReturnType<typeof pushRow>[] = []
  const enriched = Array.isArray(lineItemsEnriched) ? lineItemsEnriched : []

  for (const item of enriched) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const lineId = parseLooseNumber(entry.workorder_line_id)
    const raw = lineId != null ? lineById.get(Math.trunc(lineId)) ?? null : null
    const description =
      parseLooseString(entry.display_label) ??
      parseLooseString(entry.description) ??
      parseLooseString(entry.note) ??
      'Line item'
    const qty = parseLooseNumber(entry.unit_quantity) ?? 1
    const price =
      parseLooseNumber(entry.unit_price_override) ?? parseLooseNumber(raw?.unitPriceOverride)
    rows.push(
      pushRow(
        lineId != null ? Math.trunc(lineId) : null,
        parseLooseString(entry.source),
        description,
        qty,
        price,
        raw,
      ),
    )
  }

  if (rows.length === 0) {
    for (const raw of workorderLines) {
      const lineId = parseLooseNumber(raw.workorderLineID ?? raw.workorderLineId)
      const description = parseLooseString(raw.note) ?? 'Labour line'
      const qty = parseLooseNumber(raw.unitQuantity) ?? 1
      const price = parseLooseNumber(raw.unitPriceOverride)
      rows.push(pushRow(lineId != null ? Math.trunc(lineId) : null, 'workorderLine', description, qty, price, raw))
    }
  }

  return rows
}

function buildFinancialSummary(
  lines: Array<{ lineType: string; subtotal: number | null }>,
  saleTotal: number | null,
) {
  let labor = 0
  let parts = 0
  let fees = 0
  for (const line of lines) {
    const subtotal = line.subtotal ?? 0
    if (line.lineType === 'labor') labor += subtotal
    else if (line.lineType === 'fee') fees += subtotal
    else parts += subtotal
  }
  const computed = labor + parts + fees
  const total = saleTotal != null && saleTotal > 0 ? saleTotal : computed
  return { labor, parts, fees, total, taxGst: null as number | null }
}

function buildWorkorderDetail(row: Record<string, unknown>) {
  const payload = asRecord(row.payload) ?? {}
  const statusId =
    typeof row.workorder_status_id === 'number'
      ? Math.trunc(row.workorder_status_id)
      : parseLooseNumber(payload.workorderStatusID)
  const statusGroup =
    statusId != null && FINISHED_WORKORDER_STATUS_IDS.includes(statusId) ? 'finished' : 'open'

  const note = parseLooseString(payload.note)
  const internalNote = parseLooseString(payload.internalNote)

  const workorderItems = extractLightspeedRelationRows(
    payload.WorkorderItems ?? payload.workorderItems,
    ['WorkorderItem', 'workorderItem'],
  )
  const workorderLines = extractLightspeedRelationRows(
    payload.WorkorderLines ?? payload.workorderLines,
    ['WorkorderLine', 'workorderLine'],
  )
  const images = extractLightspeedRelationRows(payload.Images ?? payload.images, [
    'WorkorderImage',
    'workorderImage',
  ])

  const lineItemsEnriched = Array.isArray(row.workorder_line_items) ? row.workorder_line_items : []
  const employee = asRecord(payload.Employee)
  const serialized = asRecord(payload.Serialized)
  const workorderStatus = asRecord(payload.WorkorderStatus)
  const statusNameFromPayload = parseLooseString(workorderStatus?.name ?? workorderStatus?.Name)
  const employeeName = employeeDisplayName(employee)
  const bikeFields = extractBikeFields(serialized, note)
  const lines = buildDetailLineRows(lineItemsEnriched, workorderLines, employeeName)
  const serializedId =
    typeof row.serialized_id === 'number'
      ? row.serialized_id
      : parseLooseNumber(payload.serializedID)
  const firstLineSummary = lines[0]?.description ?? null
  const saleTotal = typeof row.sale_total === 'number' ? row.sale_total : null
  const financial = buildFinancialSummary(lines, saleTotal)

  return {
    workorderId: Number(row.workorder_id),
    statusId,
    statusLabel: workorderStatusLabel(statusId),
    statusGroup,
    boardBucket: workorderBoardBucket(statusId),
    boardLabel: workorderBoardLabel(statusId, statusNameFromPayload),
    statusDisplayName: statusNameFromPayload ?? workorderStatusLabel(statusId),
    systemSku: parseLooseString(row.system_sku ?? payload.systemSku),
    note,
    internalNote,
    combinedNotes: typeof row.notes === 'string' ? row.notes : null,
    hookIn: parseLooseString(payload.hookIn),
    hookOut: parseLooseString(payload.hookOut),
    tax: parseLooseBool(payload.tax),
    saveParts: parseLooseBool(payload.saveParts),
    assignEmployeeToAll: parseLooseBool(payload.assignEmployeeToAll),
    discountId: parseLooseNumber(payload.discountID),
    saleLineId: parseLooseNumber(payload.saleLineID),
    customerName: typeof row.customer_name === 'string' ? row.customer_name : null,
    customerPhone: typeof row.customer_phone === 'string' ? row.customer_phone : null,
    customerPhoneE164:
      typeof row.customer_phone_e164 === 'string' ? row.customer_phone_e164 : null,
    customerId:
      typeof row.customer_id === 'number'
        ? row.customer_id
        : parseLooseNumber(payload.customerID),
    employeeName,
    employeeId:
      typeof row.employee_id === 'number' ? row.employee_id : parseLooseNumber(payload.employeeID),
    shopId: typeof row.shop_id === 'number' ? row.shop_id : parseLooseNumber(payload.shopID),
    serializedId,
    customerItemLabel: customerItemFallback(bikeFields, serializedId, firstLineSummary),
    bikeDescription: bikeFields.bikeDescription,
    bikeColor: bikeFields.bikeColor,
    bikeSize: bikeFields.bikeSize,
    bikeSerial: bikeFields.bikeSerial,
    saleId: typeof row.sale_id === 'number' ? row.sale_id : parseLooseNumber(payload.saleID),
    saleTotal,
    saleBalance: typeof row.sale_balance === 'number' ? row.sale_balance : null,
    financial,
    lines,
    imageCount: images.length,
    warranty: row.warranty === true,
    archived: row.archived === true,
    timeIn: typeof row.time_in === 'string' ? row.time_in : parseLooseString(payload.timeIn),
    etaOut: typeof row.eta_out === 'string' ? row.eta_out : parseLooseString(payload.etaOut),
    timeStamp:
      typeof row.time_stamp === 'string' ? row.time_stamp : parseLooseString(payload.timeStamp),
    timeInMelbourne:
      typeof row.time_in_melbourne === 'string' ? row.time_in_melbourne : null,
    etaOutMelbourne:
      typeof row.eta_out_melbourne === 'string' ? row.eta_out_melbourne : null,
    timeStampMelbourne:
      typeof row.time_stamp_melbourne === 'string' ? row.time_stamp_melbourne : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    updatedAtMelbourne:
      typeof row.updated_at_melbourne === 'string' ? row.updated_at_melbourne : null,
    customer: asRecord(payload.Customer),
    employee,
    workorderStatus,
    serialized,
    discount: asRecord(payload.Discount),
    workorderItems,
    workorderLines,
    images,
    lineItemsEnriched,
    payload,
  }
}

async function resolvePortalSession(
  supabase: SupabaseClient,
  req: VercelRequest,
): Promise<{ brandKey: string } | null> {
  const auth = (req.headers.authorization || '') as string
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await supabase
    .from('nest_brand_portal_sessions')
    .select('brand_key, expires_at')
    .eq('id', token)
    .maybeSingle()

  if (error || !data?.brand_key || !data.expires_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  return { brandKey: data.brand_key }
}

const PROVIDER = 'lightspeed'
const STATE_TTL_MIN = 15
const AUTH_BASE = 'https://cloud.lightspeedapp.com/auth/oauth/authorize'
/**
 * Single scope only: Lightspeed rejects `invalid_scope` when `employee:all` is combined with
 * other scopes (all already implies the rest). See Retail access scopes docs.
 */
const OAUTH_SCOPES = 'employee:all'

function lightspeedOAuthConfig():
  | { clientId: string; clientSecret: string; redirectUri: string }
  | { error: string } {
  const clientId = pickEnv(['LIGHTSPEED_OAUTH_CLIENT_ID', 'NEST_LIGHTSPEED_OAUTH_CLIENT_ID'])
  const clientSecret = pickEnv(['LIGHTSPEED_OAUTH_CLIENT_SECRET', 'NEST_LIGHTSPEED_OAUTH_CLIENT_SECRET'])
  const redirectUri = pickEnv(['LIGHTSPEED_OAUTH_REDIRECT_URI', 'NEST_LIGHTSPEED_OAUTH_REDIRECT_URI'])
  if (!clientId || !clientSecret || !redirectUri) {
    return {
      error:
        'Lightspeed OAuth is not configured. Set LIGHTSPEED_OAUTH_CLIENT_ID, LIGHTSPEED_OAUTH_CLIENT_SECRET, and LIGHTSPEED_OAUTH_REDIRECT_URI (e.g. https://your-domain.com/api/brand-portal-lightspeed-callback).',
    }
  }
  return { clientId, clientSecret, redirectUri }
}

async function loadLightspeedDataCounts(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<{
  inventoryItems: number
  workorders: number
  sales: number
  inventorySyncedAt: string | null
  workordersSyncedAt: string | null
  salesSyncedAt: string | null
}> {
  const [items, workorders, sales, syncStates] = await Promise.allSettled([
    supabase
      .from('nest_brand_lightspeed_item')
      .select('*', { count: 'exact', head: true })
      .eq('brand_key', brandKey),
    supabase
      .from('nest_brand_lightspeed_workorder')
      .select('*', { count: 'exact', head: true })
      .eq('brand_key', brandKey),
    supabase
      .from('nest_brand_lightspeed_sale')
      .select('*', { count: 'exact', head: true })
      .eq('brand_key', brandKey),
    supabase
      .from('nest_brand_lightspeed_sync_state')
      .select('resource, updated_at')
      .eq('brand_key', brandKey),
  ])

  const num = (r: PromiseSettledResult<{ count: number | null }>) =>
    r.status === 'fulfilled' && typeof r.value.count === 'number' ? r.value.count : 0

  // Inventory snapshot uses `synced_at` per row, not the sync_state table.
  let inventorySyncedAt: string | null = null
  try {
    const { data } = await supabase
      .from('nest_brand_lightspeed_item')
      .select('synced_at')
      .eq('brand_key', brandKey)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.synced_at && typeof data.synced_at === 'string') {
      inventorySyncedAt = data.synced_at
    }
  } catch {
    /* counts are best-effort */
  }

  let workordersSyncedAt: string | null = null
  let salesSyncedAt: string | null = null
  if (syncStates.status === 'fulfilled' && Array.isArray(syncStates.value.data)) {
    for (const row of syncStates.value.data as { resource: string; updated_at: string }[]) {
      if (row.resource === 'workorder') workordersSyncedAt = row.updated_at
      if (row.resource === 'sale') salesSyncedAt = row.updated_at
    }
  }

  return {
    inventoryItems: num(items as PromiseSettledResult<{ count: number | null }>),
    workorders: num(workorders as PromiseSettledResult<{ count: number | null }>),
    sales: num(sales as PromiseSettledResult<{ count: number | null }>),
    inventorySyncedAt,
    workordersSyncedAt,
    salesSyncedAt,
  }
}

type LightspeedHistoricalBackfillState = {
  brandKey: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelling' | 'cancelled'
  phase: 'sales' | 'workorders' | 'finalising' | 'completed'
  requestedStartDate: string
  requestedEndDate: string
  currentWindowStart: string | null
  currentWindowEnd: string | null
  salesMonthsCompleted: number
  workordersMonthsCompleted: number
  totalMonths: number
  salesPagesCompleted: number
  workordersPagesCompleted: number
  salesUpserted: number
  saleLinesUpserted: number
  workordersUpserted: number
  progressPercent: number
  lastMessage: string | null
  lastError: string | null
  lastErrorAt: string | null
  lastHeartbeatAt: string | null
  startedAt: string | null
  completedAt: string | null
  cancelRequested: boolean
  safeToLeavePage: boolean
  latestEvents: Array<{ at: string; kind: string; message: string }>
}

async function loadHistoricalBackfillState(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<LightspeedHistoricalBackfillState | null> {
  const { data, error } = await supabase
    .from('nest_brand_lightspeed_backfill_state')
    .select('*')
    .eq('brand_key', brandKey)
    .maybeSingle()

  if (error || !data) return null

  const totalMonths = typeof data.total_months === 'number' ? data.total_months : 0
  const salesMonthsCompleted = typeof data.sales_months_completed === 'number' ? data.sales_months_completed : 0
  const workordersMonthsCompleted = typeof data.workorders_months_completed === 'number' ? data.workorders_months_completed : 0
  const progressPercent = data.status === 'completed'
    ? 100
    : totalMonths > 0
      ? Math.max(0, Math.min(99, Math.floor(((salesMonthsCompleted + workordersMonthsCompleted) / (totalMonths * 2)) * 100)))
      : 0

  const latestEvents = Array.isArray(data.latest_events)
    ? data.latest_events
        .filter((row: unknown): row is { at: string; kind: string; message: string } =>
          Boolean(row && typeof row === 'object' && typeof (row as { at?: unknown }).at === 'string' && typeof (row as { kind?: unknown }).kind === 'string' && typeof (row as { message?: unknown }).message === 'string'),
        )
        .slice(0, 25)
    : []

  return {
    brandKey,
    status: (data.status as LightspeedHistoricalBackfillState['status']) ?? 'idle',
    phase: (data.phase as LightspeedHistoricalBackfillState['phase']) ?? 'sales',
    requestedStartDate: typeof data.requested_start_date === 'string' ? data.requested_start_date : '2017-01-01',
    requestedEndDate: typeof data.requested_end_date === 'string' ? data.requested_end_date : new Date().toISOString().slice(0, 10),
    currentWindowStart: typeof data.current_window_start === 'string' ? data.current_window_start : null,
    currentWindowEnd: typeof data.current_window_end === 'string' ? data.current_window_end : null,
    salesMonthsCompleted,
    workordersMonthsCompleted,
    totalMonths,
    salesPagesCompleted: typeof data.sales_pages_completed === 'number' ? data.sales_pages_completed : 0,
    workordersPagesCompleted: typeof data.workorders_pages_completed === 'number' ? data.workorders_pages_completed : 0,
    salesUpserted: typeof data.sales_upserted === 'number' ? data.sales_upserted : 0,
    saleLinesUpserted: typeof data.sale_lines_upserted === 'number' ? data.sale_lines_upserted : 0,
    workordersUpserted: typeof data.workorders_upserted === 'number' ? data.workorders_upserted : 0,
    progressPercent,
    lastMessage: typeof data.last_message === 'string' ? data.last_message : null,
    lastError: typeof data.last_error === 'string' ? data.last_error : null,
    lastErrorAt: typeof data.last_error_at === 'string' ? data.last_error_at : null,
    lastHeartbeatAt: typeof data.last_heartbeat_at === 'string' ? data.last_heartbeat_at : null,
    startedAt: typeof data.started_at === 'string' ? data.started_at : null,
    completedAt: typeof data.completed_at === 'string' ? data.completed_at : null,
    cancelRequested: data.cancel_requested === true,
    safeToLeavePage: data.status === 'running' || data.status === 'cancelling',
    latestEvents,
  }
}

type LightspeedTransactionExportState = {
  brandKey: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelling' | 'cancelled'
  requestedStartDate: string
  requestedEndDate: string
  lastCompleteTime: string | null
  salesProcessed: number
  linesUpserted: number
  pagesCompleted: number
  progressPercent: number
  lastMessage: string | null
  lastError: string | null
  lastErrorAt: string | null
  lastHeartbeatAt: string | null
  startedAt: string | null
  completedAt: string | null
  cancelRequested: boolean
  safeToLeavePage: boolean
  latestEvents: Array<{ at: string; kind: string; message: string }>
  reportLastSyncedAt: string | null
  reportLastCompleteTime: string | null
  reportLinesUpserted: number
  reportOnly: boolean
}

async function loadTransactionExportState(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<LightspeedTransactionExportState | null> {
  const { data, error } = await supabase
    .from('nest_brand_lightspeed_transaction_export_state')
    .select('*')
    .eq('brand_key', brandKey)
    .maybeSingle()

  if (error || !data) return null

  const requestedStartDate = typeof data.requested_start_date === 'string' ? data.requested_start_date : '2016-01-01'
  const requestedEndDate = typeof data.requested_end_date === 'string' ? data.requested_end_date : new Date().toISOString().slice(0, 10)
  const lastCompleteTime = typeof data.last_complete_time === 'string' ? data.last_complete_time : null

  let progressPercent = 0
  if (data.status === 'completed') {
    progressPercent = 100
  } else if (lastCompleteTime) {
    const start = new Date(`${requestedStartDate}T00:00:00Z`).getTime()
    const end = new Date(`${requestedEndDate}T23:59:59Z`).getTime()
    const cur = new Date(lastCompleteTime).getTime()
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      progressPercent = Math.max(0, Math.min(99, Math.floor(((cur - start) / (end - start)) * 100)))
    }
  }

  const latestEvents = Array.isArray(data.latest_events)
    ? data.latest_events
        .filter((row: unknown): row is { at: string; kind: string; message: string } =>
          Boolean(row && typeof row === 'object' && typeof (row as { at?: unknown }).at === 'string' && typeof (row as { kind?: unknown }).kind === 'string' && typeof (row as { message?: unknown }).message === 'string'),
        )
        .slice(0, 25)
    : []

  return {
    brandKey,
    status: (data.status as LightspeedTransactionExportState['status']) ?? 'idle',
    requestedStartDate,
    requestedEndDate,
    lastCompleteTime,
    salesProcessed: typeof data.sales_processed === 'number' ? data.sales_processed : 0,
    linesUpserted: typeof data.lines_upserted === 'number' ? data.lines_upserted : 0,
    pagesCompleted: typeof data.pages_completed === 'number' ? data.pages_completed : 0,
    progressPercent,
    lastMessage: typeof data.last_message === 'string' ? data.last_message : null,
    lastError: typeof data.last_error === 'string' ? data.last_error : null,
    lastErrorAt: typeof data.last_error_at === 'string' ? data.last_error_at : null,
    lastHeartbeatAt: typeof data.last_heartbeat_at === 'string' ? data.last_heartbeat_at : null,
    startedAt: typeof data.started_at === 'string' ? data.started_at : null,
    completedAt: typeof data.completed_at === 'string' ? data.completed_at : null,
    cancelRequested: data.cancel_requested === true,
    safeToLeavePage: data.status === 'running' || data.status === 'cancelling',
    latestEvents,
    reportLastSyncedAt:
      typeof data.report_last_synced_at === 'string' ? data.report_last_synced_at : null,
    reportLastCompleteTime:
      typeof data.report_last_complete_time === 'string' ? data.report_last_complete_time : null,
    reportLinesUpserted:
      typeof data.report_lines_upserted === 'number' ? data.report_lines_upserted : 0,
    reportOnly: data.report_only === true,
  }
}

async function callLightspeedEdgeFunction(
  functionName: string,
  payload: Record<string, unknown>,
  options?: { timeoutMs?: number },
): Promise<Record<string, unknown>> {
  const fnBase = getFunctionsBaseUrl()
  if (!fnBase) {
    throw new Error('Lightspeed Edge Functions are not configured on the server.')
  }

  const timeoutMs = options?.timeoutMs
  const controller = timeoutMs ? new AbortController() : null
  const timer =
    controller && timeoutMs
      ? setTimeout(() => {
          controller.abort()
        }, timeoutMs)
      : null

  let fnResp: Response
  try {
    fnResp = await fetch(`${fnBase}/${functionName}`, {
      method: 'POST',
      headers: internalEdgeJsonHeaders(),
      body: JSON.stringify(payload),
      signal: controller?.signal,
    })
  } catch (e) {
    if (controller?.signal.aborted) {
      return { ok: true, dispatched: true, timedOut: true }
    }
    throw new Error(
      `Could not reach Supabase Edge Function (${functionName}): ${e instanceof Error ? e.message : String(e)}`,
    )
  } finally {
    if (timer) clearTimeout(timer)
  }

  const text = await fnResp.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    throw new Error(`Unexpected response from ${functionName}: ${text.slice(0, 200)}`)
  }

  if (!fnResp.ok) {
    const err = typeof parsed.error === 'string' ? parsed.error : `Edge function ${functionName} failed`
    throw new Error(err)
  }

  return parsed
}

function getFunctionsBaseUrl(): string | null {
  const explicit = pickEnv(['SUPABASE_FUNCTIONS_URL', 'NEST_SUPABASE_FUNCTIONS_URL'])
  if (explicit) return explicit.replace(/\/$/, '')
  const supabaseUrl = pickEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
  if (!supabaseUrl) return null
  try {
    const u = new URL(supabaseUrl)
    return `${u.origin}/functions/v1`
  } catch {
    return null
  }
}

function parseRecentSaleLineLimitQuery(
  query: { lineLimit?: string | string[] } | undefined,
): number {
  const raw = query?.lineLimit
  const s = Array.isArray(raw) ? raw[0] : raw
  if (typeof s !== 'string' || !s.trim()) return 10
  const n = Number.parseInt(s.trim(), 10)
  if (!Number.isFinite(n) || n < 1) return 10
  return Math.min(n, 200)
}

function parseReportSaleLineOffsetQuery(
  query: { offset?: string | string[] } | undefined,
): number {
  const raw = query?.offset
  const s = Array.isArray(raw) ? raw[0] : raw
  if (typeof s !== 'string' || !s.trim()) return 0
  const n = Number.parseInt(s.trim(), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function parseReportSaleLinePageLimitQuery(
  query: { lineLimit?: string | string[] } | undefined,
): number {
  const raw = query?.lineLimit
  const s = Array.isArray(raw) ? raw[0] : raw
  if (typeof s !== 'string' || !s.trim()) return 50
  const n = Number.parseInt(s.trim(), 10)
  if (!Number.isFinite(n) || n < 1) return 50
  return Math.min(n, 5000)
}

const REPORT_SALE_LINE_SELECT =
  'sale_id, sale_line_id, complete_time, line_time, description, quantity, retail, subtotal, discount, total, customer_full_name, employee_name, category, cost, profit, margin_pct, synced_at, brand_key'

const ASHYCYCLES_SELECT =
  'sale_id, sale_line_id, complete_time, line_time, description, quantity, retail, subtotal, discount, total, customer_full_name, employee_name, category, cost, profit, margin_pct, synced_at'

function mapReportRowToApi(row: Record<string, unknown>, brandKey: string): RecentSaleLineApiRow {
  return reportDbRowToApiRow({
    ...(row as ReportSaleLineDbRow),
    brand_key: typeof row.brand_key === 'string' ? row.brand_key : brandKey,
  })
}

async function loadReportSaleLinesFromDb(
  supabase: SupabaseClient,
  brandKey: string,
  options: { limit: number; offset: number },
): Promise<{
  lines: RecentSaleLineApiRow[]
  total: number
  reportLastSyncedAt: string | null
  reportLastCompleteTime: string | null
}> {
  const { limit, offset } = options
  const useAshycyclesView = brandKey === 'ash'

  const rowsQuery = useAshycyclesView
    ? supabase
        .from('ashycycles')
        .select(ASHYCYCLES_SELECT)
        .order('line_time', { ascending: false, nullsFirst: false })
        .order('complete_time', { ascending: false, nullsFirst: false })
        .order('sale_id', { ascending: false })
        .order('sale_line_id', { ascending: false })
        .range(offset, offset + limit - 1)
    : supabase
        .from('nest_brand_lightspeed_report_sale_line')
        .select(REPORT_SALE_LINE_SELECT)
        .eq('brand_key', brandKey)
        .order('line_time', { ascending: false, nullsFirst: false })
        .order('complete_time', { ascending: false, nullsFirst: false })
        .order('sale_id', { ascending: false })
        .order('sale_line_id', { ascending: false })
        .range(offset, offset + limit - 1)

  const countQuery = useAshycyclesView
    ? supabase.from('ashycycles').select('*', { count: 'exact', head: true })
    : supabase
        .from('nest_brand_lightspeed_report_sale_line')
        .select('*', { count: 'exact', head: true })
        .eq('brand_key', brandKey)

  const [rowsResult, countResult, stateResult] = await Promise.all([
    rowsQuery,
    countQuery,
    supabase
      .from('nest_brand_lightspeed_transaction_export_state')
      .select('report_last_synced_at, report_last_complete_time')
      .eq('brand_key', brandKey)
      .maybeSingle(),
  ])

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message)
  }

  const lines = (rowsResult.data ?? []).map((row) => mapReportRowToApi(row as Record<string, unknown>, brandKey))

  return {
    lines,
    total: countResult.count ?? lines.length,
    reportLastSyncedAt:
      typeof stateResult.data?.report_last_synced_at === 'string'
        ? stateResult.data.report_last_synced_at
        : null,
    reportLastCompleteTime:
      typeof stateResult.data?.report_last_complete_time === 'string'
        ? stateResult.data.report_last_complete_time
        : null,
  }
}

async function lightspeedPortalConnected(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('nest_brand_portal_connections')
    .select('access_token')
    .eq('provider', PROVIDER)
    .eq('brand_key', brandKey)
    .maybeSingle()
  return Boolean(typeof data?.access_token === 'string' && data.access_token.trim())
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await runBrandPortalLightspeed(req, res)
  } catch (err) {
    console.error('[brand-portal-lightspeed]', err)
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error',
      })
    }
  }
}

async function runBrandPortalLightspeed(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).json({ error: supabaseConfigErrorMessage() })
    return
  }

  const session = await resolvePortalSession(supabase, req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (req.method === 'GET') {
    const recentSaleLinesQ = req.query?.recentSaleLines
    const wantRecentSaleLines =
      recentSaleLinesQ === '1' ||
      (Array.isArray(recentSaleLinesQ) && recentSaleLinesQ[0] === '1')

    if (wantRecentSaleLines) {
      const lineLimit = parseRecentSaleLineLimitQuery(req.query)
      const result = await fetchRecentLightspeedSaleLines(supabase, session.brandKey, lineLimit)
      if (result.ok) {
        res.status(200).json({ connected: true, lines: result.lines })
        return
      }
      if (result.oauth) {
        res.status(200).json({ connected: false, lines: [], error: result.message })
      } else {
        res.status(502).json({ error: result.message })
      }
      return
    }

    const reportSaleLinesQ = req.query?.reportSaleLines
    const wantReportSaleLines =
      reportSaleLinesQ === '1' ||
      (Array.isArray(reportSaleLinesQ) && reportSaleLinesQ[0] === '1')

    if (wantReportSaleLines) {
      const lineLimit = parseReportSaleLinePageLimitQuery(req.query)
      const offset = parseReportSaleLineOffsetQuery(req.query)
      try {
        const [connected, payload] = await Promise.all([
          lightspeedPortalConnected(supabase, session.brandKey),
          loadReportSaleLinesFromDb(supabase, session.brandKey, { limit: lineLimit, offset }),
        ])
        res.status(200).json({
          connected,
          ...payload,
        })
      } catch (e) {
        res.status(500).json({
          error: e instanceof Error ? e.message : 'Could not load report sale lines',
        })
      }
      return
    }

    const listWorkorders =
      req.query?.workorders === '1' ||
      (Array.isArray(req.query?.workorders) && req.query.workorders[0] === '1')

    if (listWorkorders) {
      const { data: rows, error: woErr } = await supabase
        .from('nest_brand_lightspeed_workorder')
        .select(
          'workorder_id, workorder_status_id, customer_name, customer_phone, customer_phone_e164, notes, time_in_melbourne, eta_out_melbourne, time_stamp_melbourne, sale_id, sale_total, sale_balance, archived, warranty, workorder_line_items, payload',
        )
        .eq('brand_key', session.brandKey)
        .eq('archived', false)
        .in('workorder_status_id', PORTAL_WORKORDER_STATUS_IDS)
        .order('time_stamp', { ascending: false, nullsFirst: false })
        .limit(500)

      if (woErr) {
        console.error('[brand-portal-lightspeed] workorders list', woErr)
        res.status(500).json({ error: 'Could not load workorders', detail: woErr.message })
        return
      }

      const workorders = (rows ?? []).map((row) => {
        const statusId =
          typeof row.workorder_status_id === 'number' ? Math.trunc(row.workorder_status_id) : null
        const statusGroup =
          statusId != null && FINISHED_WORKORDER_STATUS_IDS.includes(statusId) ? 'finished' : 'open'
        const payload = asRecord(row.payload) ?? {}
        const statusObj = asRecord(payload.WorkorderStatus ?? payload.workorderStatus)
        const statusNameFromPayload = parseLooseString(statusObj?.name ?? statusObj?.Name)
        const lineItems = row.workorder_line_items
        const timeInMelbourne =
          typeof row.time_in_melbourne === 'string' ? row.time_in_melbourne : null
        const etaOutMelbourne =
          typeof row.eta_out_melbourne === 'string' ? row.eta_out_melbourne : null
        const boardBucket = workorderBoardBucket(statusId)
        const daysOverdue = workorderDaysOverdue(etaOutMelbourne)
        const saleTotal = typeof row.sale_total === 'number' ? row.sale_total : null

        return {
          workorderId: Number(row.workorder_id),
          statusId,
          statusLabel: workorderStatusLabel(statusId),
          statusGroup,
          boardBucket,
          boardLabel: workorderBoardLabel(statusId, statusNameFromPayload),
          boardSortRank: workorderBoardSortRank(statusId),
          customerName: typeof row.customer_name === 'string' ? row.customer_name : null,
          customerPhone: typeof row.customer_phone === 'string' ? row.customer_phone : null,
          customerPhoneE164:
            typeof row.customer_phone_e164 === 'string' ? row.customer_phone_e164 : null,
          notes: typeof row.notes === 'string' ? row.notes : null,
          itemSummary: extractWorkorderItemSummary(lineItems, payload, row.notes as string | null),
          hookSummary: extractWorkorderHookSummary(payload),
          timeInMelbourne,
          etaOutMelbourne,
          dateIn: formatMelbourneShortDate(timeInMelbourne),
          dueOn: formatMelbourneShortDate(etaOutMelbourne),
          daysOverdue,
          taskCount: countWorkorderTasks(lineItems, payload),
          hoursDisplay: '0:00',
          totalDisplay: saleTotal,
          timeStampMelbourne:
            typeof row.time_stamp_melbourne === 'string' ? row.time_stamp_melbourne : null,
          saleId: typeof row.sale_id === 'number' ? row.sale_id : null,
          saleTotal,
          saleBalance: typeof row.sale_balance === 'number' ? row.sale_balance : null,
          warranty: row.warranty === true,
        }
      })

      workorders.sort((a, b) => {
        const rank = a.boardSortRank - b.boardSortRank
        if (rank !== 0) return rank
        const customerCmp = (a.customerName ?? '').localeCompare(b.customerName ?? '', undefined, {
          sensitivity: 'base',
        })
        if (customerCmp !== 0) return customerCmp
        return b.workorderId - a.workorderId
      })

      res.status(200).json({ workorders })
      return
    }

    const workorderIdRaw = Array.isArray(req.query?.workorderId)
      ? req.query.workorderId[0]
      : req.query?.workorderId
    if (typeof workorderIdRaw === 'string' && workorderIdRaw.trim()) {
      const workorderId = Math.trunc(Number(workorderIdRaw))
      if (!Number.isFinite(workorderId) || workorderId <= 0) {
        res.status(400).json({ error: 'Invalid workorderId' })
        return
      }

      const { data: row, error: detailErr } = await supabase
        .from('nest_brand_lightspeed_workorder')
        .select(
          'workorder_id, workorder_status_id, customer_id, customer_name, customer_phone, customer_phone_e164, employee_id, shop_id, serialized_id, sale_id, system_sku, time_in, eta_out, time_in_melbourne, eta_out_melbourne, time_stamp, time_stamp_melbourne, updated_at, updated_at_melbourne, archived, warranty, notes, workorder_line_items, sale_total, sale_balance, payload',
        )
        .eq('brand_key', session.brandKey)
        .eq('workorder_id', workorderId)
        .maybeSingle()

      if (detailErr) {
        console.error('[brand-portal-lightspeed] workorder detail', detailErr)
        res.status(500).json({ error: 'Could not load workorder', detail: detailErr.message })
        return
      }
      if (!row) {
        res.status(404).json({ error: 'Workorder not found' })
        return
      }

      res.status(200).json({ workorder: buildWorkorderDetail(row as Record<string, unknown>) })
      return
    }

    const minimalQ = req.query?.minimal
    const wantMinimal =
      minimalQ === '1' || (Array.isArray(minimalQ) && minimalQ[0] === '1')

    if (wantMinimal) {
      const { data, error } = await supabase
        .from('nest_brand_portal_connections')
        .select('api_endpoint, access_expires_at, updated_at')
        .eq('brand_key', session.brandKey)
        .eq('provider', PROVIDER)
        .maybeSingle()

      if (error) {
        console.error('[brand-portal-lightspeed] connections select (minimal)', error)
        res.status(500).json({
          error: 'Could not load connection',
          detail: error.message,
          code: error.code,
        })
        return
      }

      const transactionExport = await loadTransactionExportState(supabase, session.brandKey)

      if (!data) {
        res.status(200).json({ connected: false, transactionExport })
        return
      }

      res.status(200).json({
        connected: true,
        apiEndpoint: data.api_endpoint,
        accessExpiresAt: data.access_expires_at,
        updatedAt: data.updated_at,
        transactionExport,
      })
      return
    }

    const { data, error } = await supabase
      .from('nest_brand_portal_connections')
      .select('api_endpoint, access_expires_at, updated_at')
      .eq('brand_key', session.brandKey)
      .eq('provider', PROVIDER)
      .maybeSingle()

    if (error) {
      console.error('[brand-portal-lightspeed] connections select', error)
      res.status(500).json({
        error: 'Could not load connection',
        detail: error.message,
        code: error.code,
      })
      return
    }

    const [counts, backfill, transactionExport] = await Promise.all([
      loadLightspeedDataCounts(supabase, session.brandKey),
      loadHistoricalBackfillState(supabase, session.brandKey),
      loadTransactionExportState(supabase, session.brandKey),
    ])

    if (!data) {
      res.status(200).json({ connected: false, counts, backfill, transactionExport })
      return
    }

    res.status(200).json({
      connected: true,
      apiEndpoint: data.api_endpoint,
      accessExpiresAt: data.access_expires_at,
      updatedAt: data.updated_at,
      counts,
      backfill,
      transactionExport,
    })
    return
  }

  if (req.method === 'DELETE') {
    const { error: connErr } = await supabase
      .from('nest_brand_portal_connections')
      .delete()
      .eq('brand_key', session.brandKey)
      .eq('provider', PROVIDER)

    if (connErr) {
      res.status(500).json({ error: 'Could not disconnect Lightspeed', detail: connErr.message })
      return
    }

    // Best-effort cleanup of mirrored data so the brand starts fresh on the next connect.
    await Promise.allSettled([
      supabase.from('nest_brand_lightspeed_workorder').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_sale').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_sale_line').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_item').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_sync_state').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_backfill_state').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_transaction_line').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_report_sale_line').delete().eq('brand_key', session.brandKey),
      supabase.from('nest_brand_lightspeed_transaction_export_state').delete().eq('brand_key', session.brandKey),
    ])

    res.status(200).json({ ok: true })
    return
  }

  if (req.method === 'POST') {
    let body: { action?: string; report_only?: boolean } = {}
    try {
      if (typeof req.body === 'string' && req.body.trim()) {
        body = JSON.parse(req.body) as { action?: string }
      } else if (req.body && typeof req.body === 'object') {
        body = req.body as { action?: string }
      }
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }

    if (body.action === 'sync_sales_workorders') {
      try {
        const payload = await callLightspeedEdgeFunction('lightspeed-sync-sales-workorders', {
          brand_key: session.brandKey,
        })
        res.status(200).json({ ok: true, result: payload })
      } catch (e) {
        res.status(502).json({ error: e instanceof Error ? e.message : 'Sync function failed' })
      }
      return
    }

    if (
      body.action === 'start_historical_backfill' ||
      body.action === 'resume_historical_backfill' ||
      body.action === 'cancel_historical_backfill' ||
      body.action === 'restart_historical_backfill'
    ) {
      const actionMap: Record<string, string> = {
        start_historical_backfill: 'start',
        resume_historical_backfill: 'resume',
        cancel_historical_backfill: 'cancel',
        restart_historical_backfill: 'restart',
      }
      try {
        const payload = await callLightspeedEdgeFunction('lightspeed-historical-backfill', {
          action: actionMap[body.action],
          brand_key: session.brandKey,
        })
        const backfill = await loadHistoricalBackfillState(supabase, session.brandKey)
        res.status(200).json({ ok: true, result: payload, backfill })
      } catch (e) {
        res.status(502).json({ error: e instanceof Error ? e.message : 'Historical backfill failed' })
      }
      return
    }

    if (
      body.action === 'start_ashycycles_backfill' ||
      body.action === 'resume_ashycycles_backfill' ||
      body.action === 'cancel_ashycycles_backfill' ||
      body.action === 'restart_ashycycles_backfill'
    ) {
      const actionMap: Record<string, string> = {
        start_ashycycles_backfill: 'start',
        resume_ashycycles_backfill: 'resume',
        cancel_ashycycles_backfill: 'cancel',
        restart_ashycycles_backfill: 'restart',
      }
      try {
        const payload = await callLightspeedEdgeFunction(
          'lightspeed-transaction-export-backfill',
          {
            action: actionMap[body.action],
            brand_key: session.brandKey,
            report_only: true,
          },
          { timeoutMs: 20_000 },
        )
        const transactionExport = await loadTransactionExportState(supabase, session.brandKey)
        const dispatched = payload.timedOut === true || payload.dispatched === true
        const running =
          transactionExport?.status === 'running' || transactionExport?.status === 'cancelling'
        if (dispatched && running) {
          res.status(200).json({
            ok: true,
            result: payload,
            transactionExport,
            dispatched: true,
          })
          return
        }
        if (payload.timedOut === true && !running) {
          res.status(504).json({
            error:
              'Backfill dispatch timed out before the job entered a running state. Wait a moment, then check status or Resume.',
            transactionExport,
          })
          return
        }
        res.status(200).json({ ok: true, result: payload, transactionExport })
      } catch (e) {
        res.status(502).json({ error: e instanceof Error ? e.message : 'Ashycycles backfill failed' })
      }
      return
    }

    if (
      body.action === 'start_transaction_export' ||
      body.action === 'resume_transaction_export' ||
      body.action === 'cancel_transaction_export' ||
      body.action === 'restart_transaction_export'
    ) {
      const actionMap: Record<string, string> = {
        start_transaction_export: 'start',
        resume_transaction_export: 'resume',
        cancel_transaction_export: 'cancel',
        restart_transaction_export: 'restart',
      }
      try {
        const payload = await callLightspeedEdgeFunction('lightspeed-transaction-export-backfill', {
          action: actionMap[body.action],
          brand_key: session.brandKey,
          report_only: false,
        })
        const transactionExport = await loadTransactionExportState(supabase, session.brandKey)
        res.status(200).json({ ok: true, result: payload, transactionExport })
      } catch (e) {
        res.status(502).json({ error: e instanceof Error ? e.message : 'Transaction export failed' })
      }
      return
    }

    if (body.action === 'sync_report_sale_lines') {
      try {
        const payload = await callLightspeedEdgeFunction('lightspeed-transaction-export-backfill', {
          action: 'sync_report_incremental',
          brand_key: session.brandKey,
        })
        const transactionExport = await loadTransactionExportState(supabase, session.brandKey)
        res.status(200).json({ ok: true, result: payload, transactionExport })
      } catch (e) {
        res.status(502).json({ error: e instanceof Error ? e.message : 'Report sync failed' })
      }
      return
    }

    const cfg = lightspeedOAuthConfig()
    if ('error' in cfg) {
      res.status(503).json({ error: cfg.error })
      return
    }

    const expiresAt = new Date(Date.now() + STATE_TTL_MIN * 60 * 1000).toISOString()
    const { data: stateRow, error: insErr } = await supabase
      .from('nest_brand_oauth_states')
      .insert({
        brand_key: session.brandKey,
        provider: PROVIDER,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (insErr || !stateRow?.id) {
      console.error('[brand-portal-lightspeed] nest_brand_oauth_states insert', insErr)
      res.status(500).json({
        error: 'Could not start OAuth',
        detail: insErr?.message ?? (stateRow?.id ? undefined : 'No state row returned'),
        code: insErr?.code ?? undefined,
      })
      return
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: OAUTH_SCOPES,
      state: stateRow.id as string,
    })

    const authUrl = `${AUTH_BASE}?${params.toString()}`
    res.status(200).json({ authUrl })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
