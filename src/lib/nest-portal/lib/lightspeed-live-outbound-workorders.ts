import type { SupabaseClient } from '@supabase/supabase-js'
import { getLightspeedAccess, lightspeedGetJson } from './lightspeed-portal-access'
import { isLightspeedRateLimitError, lightspeedThrottled } from './lightspeed-api-throttle'

/** Lightspeed workshop status: finished, awaiting collection. */
export const OUTBOUND_FINISHED_STATUS_ID = 4

/** Outbound calls: workshop Finished only (not Paid / other statuses). */
export const OUTBOUND_FINISHED_STATUS_IDS = [OUTBOUND_FINISHED_STATUS_ID] as const

const LOAD_RELATIONS = '["Customer","WorkorderLines","WorkorderItems"]'
/** Only load finished jobs from the last N days so the list stays complete and recent. */
export const OUTBOUND_LIST_LOOKBACK_DAYS = 120
const MAX_PAGES_PER_STATUS = 1
/** Cap live Customer lookups so the portal list stays within serverless time limits. */
const MAX_PENDING_PHONE_LOOKUPS = 8
const LIST_CACHE_TTL_MS = 45_000

type PendingPhoneRow = { wo: Record<string, unknown> }

function isoLowerBoundDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

const listCache = new Map<string, { expiresAt: number; workorders: LiveOutboundWorkorder[] }>()

export function invalidateOutboundWorkorderListCache(brandKey?: string): void {
  if (brandKey) listCache.delete(brandKey)
  else listCache.clear()
}

export type OutboundWorkorderListSource = 'live' | 'cache'

export type LoadFinishedOutboundResult = {
  workorders: LiveOutboundWorkorder[]
  connected: boolean
  source: OutboundWorkorderListSource
  stale?: boolean
  warning?: string
}

export type LiveOutboundWorkorder = {
  workorderId: number
  statusId: number | null
  statusLabel: string
  statusGroup: 'finished'
  boardBucket: 'finished'
  boardLabel: string
  boardSortRank: number
  customerName: string | null
  customerPhone: string | null
  customerPhoneE164: string | null
  notes: string | null
  itemSummary: string | null
  hookSummary: string | null
  timeInMelbourne: string | null
  etaOutMelbourne: string | null
  dateIn: string | null
  dueOn: string | null
  daysOverdue: number | null
  taskCount: number
  hoursDisplay: string
  totalDisplay: number | null
  timeStampMelbourne: string | null
  updatedAtMelbourne: string | null
  saleId: number | null
  saleTotal: number | null
  saleBalance: number | null
  warranty: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
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

function parseLooseBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1' || value === 1) return true
  if (value === 'false' || value === '0' || value === 0) return false
  return false
}

function normaliseToE164(input: string): string | null {
  const s0 = input.trim().replace(/[\s().-]/g, '')
  if (!s0 || s0.includes('@')) return null
  let digits = s0.startsWith('+') ? s0.slice(1).replace(/\D/g, '') : s0.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  if (digits.startsWith('0')) digits = `61${digits.slice(1)}`
  if (digits.startsWith('61') && digits.length >= 11 && digits.length <= 15) return `+${digits}`
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null
}

function getAttributes(root: Record<string, unknown>): Record<string, string> {
  const raw = root['@attributes']
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v != null) out[k] = String(v)
  }
  return out
}

function normaliseWorkorderList(node: unknown): Record<string, unknown>[] {
  if (node == null) return []
  if (Array.isArray(node)) {
    return node
      .map((x) => asRecord(x))
      .filter((x): x is Record<string, unknown> => x != null)
  }
  const single = asRecord(node)
  return single ? [single] : []
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

function formatNameFromCustomerLikeRecord(o: Record<string, unknown>): string | null {
  const first = parseLooseString(o.firstName ?? o.FirstName)
  const last = parseLooseString(o.lastName ?? o.LastName)
  const company = parseLooseString(o.company ?? o.Company)
  const person = [first, last].filter(Boolean).join(' ').trim()
  if (company && person) return `${person} (${company})`
  if (person) return person
  if (company) return company
  return parseLooseString(o.title ?? o.Title)
}

function formatCustomerName(customer: unknown): string | null {
  if (customer == null) return null
  if (typeof customer === 'string') {
    const t = customer.trim()
    if (!t) return null
    try {
      return formatCustomerName(JSON.parse(t) as unknown)
    } catch {
      return t
    }
  }
  const o = asRecord(customer)
  if (!o) return null
  const direct = formatNameFromCustomerLikeRecord(o)
  if (direct) return direct
  const contact = o.Contact ?? o.contact
  if (contact && typeof contact === 'object') {
    return formatNameFromCustomerLikeRecord(contact as Record<string, unknown>)
  }
  return null
}

function extractCustomerPhoneFromContactFields(contact: Record<string, unknown>): string | null {
  const mobile = parseLooseString(contact.mobile ?? contact.Mobile)
  if (mobile) return mobile
  const home = parseLooseString(contact.phoneHome ?? contact.PhoneHome)
  if (home) return home
  const work = parseLooseString(contact.phoneWork ?? contact.PhoneWork)
  if (work) return work
  return null
}

function extractCustomerPhone(customer: unknown): string | null {
  const o = asRecord(customer)
  if (!o) return null
  const contactNode = o.Contact ?? o.contact
  const contact = asRecord(contactNode)
  if (!contact) return null
  const fromFields = extractCustomerPhoneFromContactFields(contact)
  if (fromFields) return fromFields
  const phonesNode = contact.Phones ?? contact.phones
  const phones = asRecord(phonesNode)
  if (!phones) return null
  const list = extractLightspeedRelationRows(phones, ['ContactPhone', 'contactPhone'])
  if (list.length === 0) return null
  const useType = (entry: Record<string, unknown>) =>
    String(entry.useType ?? entry.UseType ?? '').toLowerCase()
  const number = (entry: Record<string, unknown>) => {
    const raw = entry.number ?? entry.Number ?? entry.phone ?? entry.value
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
    return null
  }
  const mobile = list.find((p) => useType(p) === 'mobile')
  if (mobile) {
    const n = number(mobile)
    if (n) return n
  }
  for (const entry of list) {
    const n = number(entry)
    if (n) return n
  }
  return null
}

type CustomerPhoneCache = Map<number, { raw: string | null; e164: string | null }>

async function fetchCustomerPhonesFromLightspeed(
  accessToken: string,
  accountId: string,
  customerId: number,
): Promise<{ raw: string | null; e164: string | null }> {
  const empty = { raw: null, e164: null }
  try {
    const data = await lightspeedThrottled(() =>
      lightspeedGetJson(
        accessToken,
        accountId,
        `Customer.json?customerID=${encodeURIComponent(String(customerId))}&load_relations=${encodeURIComponent('["Contact"]')}`,
      ),
    )
    const node = data.Customer
    const fullCustomer = Array.isArray(node) ? asRecord(node[0]) : asRecord(node)
    if (!fullCustomer) return empty
    const raw = extractCustomerPhone(fullCustomer)
    if (!raw) return empty
    return { raw, e164: normaliseToE164(raw) }
  } catch {
    return empty
  }
}

async function resolveWorkorderCustomerPhones(
  accessToken: string,
  accountId: string,
  wo: Record<string, unknown>,
  customerPhoneCache?: CustomerPhoneCache,
): Promise<{ raw: string | null; e164: string | null }> {
  let phones = getWorkorderCustomerPhones(wo)
  if (phones.e164) return phones

  const customer = asRecord(getWorkorderCustomerNode(wo))
  const customerId = parseLooseNumber(customer?.customerID ?? customer?.CustomerID)
  if (customerId == null) return phones

  const cached = customerPhoneCache?.get(Math.trunc(customerId))
  if (cached) return cached

  const fetched = await fetchCustomerPhonesFromLightspeed(accessToken, accountId, Math.trunc(customerId))
  customerPhoneCache?.set(Math.trunc(customerId), fetched)
  return fetched
}

function getWorkorderCustomerNode(wo: Record<string, unknown>): unknown {
  return wo.Customer ?? wo.customer ?? null
}

function getWorkorderCustomerPhones(wo: Record<string, unknown>): { raw: string | null; e164: string | null } {
  const raw = extractCustomerPhone(getWorkorderCustomerNode(wo))
  if (!raw) return { raw: null, e164: null }
  return { raw, e164: normaliseToE164(raw) }
}

function formatMelbourneShortDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    const d = new Date(iso.trim())
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)
  } catch {
    return null
  }
}

function extractWorkorderItemSummary(wo: Record<string, unknown>, notes: string | null): string | null {
  const lines = extractLightspeedRelationRows(wo.WorkorderLines ?? wo.workorderLines, [
    'WorkorderLine',
    'workorderLine',
  ])
  for (const raw of lines) {
    const note = parseLooseString(raw.note ?? raw.Note)
    if (note) return note.split('\n')[0].slice(0, 160)
  }
  const items = extractLightspeedRelationRows(wo.WorkorderItems ?? wo.workorderItems, [
    'WorkorderItem',
    'workorderItem',
  ])
  for (const raw of items) {
    const note = parseLooseString(raw.note ?? raw.Note)
    if (note) return note.split('\n')[0].slice(0, 160)
  }
  if (notes?.trim()) return notes.trim().split('\n')[0].slice(0, 160)
  return null
}

function extractHookSummary(wo: Record<string, unknown>): string | null {
  return parseLooseString(wo.hookIn ?? wo.HookIn)
}

function countWorkorderTasks(wo: Record<string, unknown>): number {
  const lines = extractLightspeedRelationRows(wo.WorkorderLines ?? wo.workorderLines, [
    'WorkorderLine',
    'workorderLine',
  ])
  const items = extractLightspeedRelationRows(wo.WorkorderItems ?? wo.workorderItems, [
    'WorkorderItem',
    'workorderItem',
  ])
  return lines.length + items.length
}

function buildLightspeedPath(query: Record<string, string>): string {
  const params = new URLSearchParams(query)
  return `Workorder.json?${params.toString()}`
}

function parseWorkorderListResponse(data: Record<string, unknown>): {
  items: Record<string, unknown>[]
  nextUrl: string | null
} {
  const attrs = getAttributes(data)
  const keys = Object.keys(data).filter((k) => k !== '@attributes')
  const entityKey = keys.find((k) => k !== 'message') ?? keys[0] ?? 'Workorder'
  const items = normaliseWorkorderList(data[entityKey])
  const next = attrs.next?.trim() || null
  return { items, nextUrl: next || null }
}

export function mapLiveWorkorder(
  wo: Record<string, unknown>,
  phonesOverride?: { raw: string | null; e164: string | null },
): LiveOutboundWorkorder | null {
  const workorderId = parseLooseNumber(wo.workorderID ?? wo.WorkorderID)
  if (workorderId == null || workorderId <= 0) return null

  const statusId = parseLooseNumber(wo.workorderStatusID ?? wo.WorkorderStatusID)
  const finishedStatus =
    statusId != null && (OUTBOUND_FINISHED_STATUS_IDS as readonly number[]).includes(statusId)
  if (!finishedStatus) return null
  if (parseLooseBool(wo.archived ?? wo.Archived)) return null

  const phones = phonesOverride ?? getWorkorderCustomerPhones(wo)
  if (!phones.e164) return null

  const note = parseLooseString(wo.note ?? wo.Note)
  const internalNote = parseLooseString(wo.internalNote ?? wo.InternalNote)
  const notes = [note, internalNote].filter(Boolean).join('\n') || null

  const timeIn = parseLooseString(wo.timeIn ?? wo.TimeIn)
  const etaOut = parseLooseString(wo.etaOut ?? wo.EtaOut)
  const timeStamp = parseLooseString(wo.timeStamp ?? wo.TimeStamp)

  const saleId = parseLooseNumber(wo.saleID ?? wo.SaleID)

  return {
    workorderId: Math.trunc(workorderId),
    statusId: Math.trunc(statusId),
    statusLabel: 'Finished',
    statusGroup: 'finished',
    boardBucket: 'finished',
    boardLabel: 'FINISHED',
    boardSortRank: 3,
    customerName: formatCustomerName(getWorkorderCustomerNode(wo)),
    customerPhone: phones.raw,
    customerPhoneE164: phones.e164,
    notes,
    itemSummary: extractWorkorderItemSummary(wo, notes),
    hookSummary: extractHookSummary(wo),
    timeInMelbourne: timeIn,
    etaOutMelbourne: etaOut,
    dateIn: formatMelbourneShortDate(timeIn),
    dueOn: formatMelbourneShortDate(etaOut),
    daysOverdue: null,
    taskCount: countWorkorderTasks(wo),
    hoursDisplay: '0:00',
    totalDisplay: null,
    timeStampMelbourne: timeStamp,
    updatedAtMelbourne: timeStamp,
    saleId: saleId != null ? Math.trunc(saleId) : null,
    saleTotal: null,
    saleBalance: null,
    warranty: parseLooseBool(wo.warranty ?? wo.Warranty),
  }
}

async function mapLiveWorkorderWithPhones(
  accessToken: string,
  accountId: string,
  wo: Record<string, unknown>,
  customerPhoneCache?: CustomerPhoneCache,
): Promise<LiveOutboundWorkorder | null> {
  const phones = await resolveWorkorderCustomerPhones(
    accessToken,
    accountId,
    wo,
    customerPhoneCache,
  )
  return mapLiveWorkorder(wo, phones)
}

async function fetchSaleTotals(
  accessToken: string,
  accountId: string,
  saleIds: number[],
): Promise<Map<number, { total: number | null; balance: number | null }>> {
  const result = new Map<number, { total: number | null; balance: number | null }>()
  const ids = [...new Set(saleIds)].filter((id) => id > 0).slice(0, 3)
  for (const saleId of ids) {
    try {
      const data = await lightspeedThrottled(() =>
        lightspeedGetJson(
          accessToken,
          accountId,
          `Sale.json?saleID=${encodeURIComponent(String(saleId))}`,
        ),
      )
      const node = data.Sale
      const sale = Array.isArray(node) ? asRecord(node[0]) : asRecord(node)
      if (!sale) continue
      result.set(saleId, {
        total: parseLooseNumber(sale.total ?? sale.Total),
        balance: parseLooseNumber(sale.balance ?? sale.Balance),
      })
    } catch {
      /* optional enrichment */
    }
  }
  return result
}

async function fetchWorkorderPage(
  accessToken: string,
  accountId: string,
  urlOrPath: string,
): Promise<{ items: Record<string, unknown>[]; nextUrl: string | null }> {
  const data = await lightspeedThrottled(async () => {
    if (urlOrPath.startsWith('http')) {
      const res = await fetch(urlOrPath, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
      const text = await res.text()
      if (!res.ok) {
        throw new Error(`Lightspeed API failed (${res.status}): ${text.slice(0, 200)}`)
      }
      return JSON.parse(text) as Record<string, unknown>
    }
    return lightspeedGetJson(accessToken, accountId, urlOrPath)
  })

  return parseWorkorderListResponse(data)
}

function sortOutboundWorkorders(rows: LiveOutboundWorkorder[]): LiveOutboundWorkorder[] {
  return [...rows].sort((a, b) => {
    const aTs = a.updatedAtMelbourne ?? a.timeStampMelbourne ?? ''
    const bTs = b.updatedAtMelbourne ?? b.timeStampMelbourne ?? ''
    if (aTs !== bTs) return bTs.localeCompare(aTs)
    return b.workorderId - a.workorderId
  })
}

async function enrichPendingWithCustomerPhones(
  accessToken: string,
  accountId: string,
  pending: PendingPhoneRow[],
  seenIds: Set<number>,
  collected: LiveOutboundWorkorder[],
  customerPhoneCache: CustomerPhoneCache,
): Promise<void> {
  const sorted = [...pending].sort((a, b) => {
    const aTs = parseLooseString(a.wo.timeStamp ?? a.wo.TimeStamp) ?? ''
    const bTs = parseLooseString(b.wo.timeStamp ?? b.wo.TimeStamp) ?? ''
    if (aTs !== bTs) return bTs.localeCompare(aTs)
    const aId = parseLooseNumber(a.wo.workorderID ?? a.wo.WorkorderID) ?? 0
    const bId = parseLooseNumber(b.wo.workorderID ?? b.wo.WorkorderID) ?? 0
    return bId - aId
  })

  let lookups = 0
  for (const { wo } of sorted) {
    if (lookups >= MAX_PENDING_PHONE_LOOKUPS) break

    const customer = asRecord(getWorkorderCustomerNode(wo))
    const customerId = parseLooseNumber(customer?.customerID ?? customer?.CustomerID)
    if (customerId == null) continue

    const cid = Math.trunc(customerId)
    let phones = customerPhoneCache.get(cid)
    if (!phones) {
      lookups += 1
      phones = await fetchCustomerPhonesFromLightspeed(accessToken, accountId, cid)
      customerPhoneCache.set(cid, phones)
    }
    if (!phones.e164) continue

    const mapped = mapLiveWorkorder(wo, phones)
    if (!mapped || seenIds.has(mapped.workorderId)) continue
    seenIds.add(mapped.workorderId)
    collected.push(mapped)
  }
}

async function fetchLiveFinishedOutboundForStatus(
  accessToken: string,
  accountId: string,
  statusId: number,
  seenIds: Set<number>,
  collected: LiveOutboundWorkorder[],
  customerPhoneCache: CustomerPhoneCache,
): Promise<void> {
  const timeStampLower = isoLowerBoundDaysAgo(OUTBOUND_LIST_LOOKBACK_DAYS)
  let next: string | null = buildLightspeedPath({
    limit: '100',
    sort: '-timeStamp',
    archived: 'false',
    workorderStatusID: String(statusId),
    timeStamp: `>=,${timeStampLower}`,
    load_relations: LOAD_RELATIONS,
  })

  const pendingPhones: PendingPhoneRow[] = []

  for (let page = 0; page < MAX_PAGES_PER_STATUS && next; page += 1) {
    const { items, nextUrl } = await fetchWorkorderPage(accessToken, accountId, next)
    for (const wo of items) {
      const mapped = mapLiveWorkorder(wo)
      if (mapped) {
        if (seenIds.has(mapped.workorderId)) continue
        seenIds.add(mapped.workorderId)
        collected.push(mapped)
        continue
      }
      const status = parseLooseNumber(wo.workorderStatusID ?? wo.WorkorderStatusID)
      if (status !== OUTBOUND_FINISHED_STATUS_ID || parseLooseBool(wo.archived ?? wo.Archived)) {
        continue
      }
      pendingPhones.push({ wo })
    }
    next = nextUrl
  }

  await enrichPendingWithCustomerPhones(
    accessToken,
    accountId,
    pendingPhones,
    seenIds,
    collected,
    customerPhoneCache,
  )
}

export async function fetchLiveFinishedOutboundWorkorders(
  accessToken: string,
  accountId: string,
): Promise<LiveOutboundWorkorder[]> {
  const collected: LiveOutboundWorkorder[] = []
  const seenIds = new Set<number>()
  const customerPhoneCache: CustomerPhoneCache = new Map()

  await fetchLiveFinishedOutboundForStatus(
    accessToken,
    accountId,
    OUTBOUND_FINISHED_STATUS_ID,
    seenIds,
    collected,
    customerPhoneCache,
  )

  return sortOutboundWorkorders(collected)
}

export async function fetchLiveOutboundWorkorderById(
  accessToken: string,
  accountId: string,
  workorderId: number,
): Promise<LiveOutboundWorkorder | null> {
  const path = buildLightspeedPath({
    workorderID: String(workorderId),
    load_relations: LOAD_RELATIONS,
  })
  const { items } = await fetchWorkorderPage(accessToken, accountId, path)
  const wo = items[0]
  if (!wo) return null
  const mapped = await mapLiveWorkorderWithPhones(accessToken, accountId, wo)
  if (!mapped) return null
  if (!mapped?.saleId) return mapped

  const saleTotals = await fetchSaleTotals(accessToken, accountId, [mapped.saleId])
  const sale = saleTotals.get(mapped.saleId)
  if (sale) {
    mapped.saleTotal = sale.total
    mapped.saleBalance = sale.balance
    mapped.totalDisplay = sale.total
  }
  return mapped
}

export async function loadLiveFinishedOutboundWorkordersForBrand(
  supabase: SupabaseClient,
  brandKey: string,
  options?: { refresh?: boolean },
): Promise<LoadFinishedOutboundResult> {
  if (options?.refresh) invalidateOutboundWorkorderListCache(brandKey)

  const cached = listCache.get(brandKey)
  if (!options?.refresh && cached && cached.expiresAt > Date.now() && cached.workorders.length > 0) {
    return { workorders: cached.workorders, connected: true, source: 'cache' }
  }

  const access = await getLightspeedAccess(supabase, brandKey)
  if (!access) {
    return {
      workorders: [],
      connected: false,
      source: 'live',
      warning: 'Lightspeed is not connected.',
    }
  }

  try {
    const live = await fetchLiveFinishedOutboundWorkorders(
      access.accessToken,
      access.accountId,
    )
    const workorders = live
    const source: OutboundWorkorderListSource = 'live'
    const warning =
      workorders.length === 0
        ? 'No Finished work orders with a customer mobile were returned by the live Lightspeed API.'
        : undefined

    if (workorders.length > 0) {
      listCache.set(brandKey, { expiresAt: Date.now() + LIST_CACHE_TTL_MS, workorders })
    }

    return { workorders, connected: true, source, stale: false, warning }
  } catch (err) {
    return {
      workorders: [],
      connected: true,
      source: 'live',
      stale: true,
      warning: isLightspeedRateLimitError(err)
        ? 'Lightspeed rate limit reached — retry the live Finished list shortly.'
        : 'Could not refresh the live Finished list from Lightspeed.',
    }
  }
}
