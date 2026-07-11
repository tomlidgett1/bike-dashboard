import type { GenieWorkorderCard, GenieWorkorderCardsPayload } from '@/lib/types/genie-agent'
import { createLightspeedClient } from './lightspeed-client'
import { normalizeLightspeedId } from './normalize-lightspeed-id'
import type {
  LightspeedCustomer,
  LightspeedWorkorderItem,
  LightspeedWorkorderLine,
  LightspeedWorkorderStatus,
  LightspeedWorkorderWithRelations,
} from './types'

const FINISHED_SYSTEM_VALUES = new Set(['finished', 'paid', 'complete', 'done'])
const STORE_TIME_ZONE = 'Australia/Brisbane'
const ENRICH_CONCURRENCY = 6
const WORKORDER_QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'did',
  'do',
  'does',
  'done',
  'for',
  'get',
  'got',
  'he',
  'her',
  'hers',
  'him',
  'his',
  'in',
  'is',
  'it',
  'need',
  'needs',
  'of',
  'on',
  'order',
  'repair',
  'service',
  'she',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'was',
  'what',
  'work',
  'workorder',
])

function storeDateFromIso(value: string): string | null {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(parsed))
}

function customerHasContact(customer: LightspeedCustomer | undefined): boolean {
  if (!customer?.Contact) return false
  const phones = ensureArray(customer.Contact?.Phones?.ContactPhone)
  const emails = ensureArray(customer.Contact?.Emails?.ContactEmail)
  return phones.some(phone => phone.number?.trim()) || emails.some(email => email.address?.trim())
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, () => worker()),
  )
  return results
}

export type GenieWorkorderScope = 'open' | 'finished' | 'all'

export type GenieWorkorderLine = {
  line_id: string
  note: string
  done: boolean
}

export type GenieWorkorderItem = {
  item_id: string
  description: string | null
  sku: string | null
  note: string
  quantity: number | null
  unit_price: number | null
  line_total: number | null
}

export type GenieWorkorderDetail = {
  workorder_id: string
  status_id: string
  status_name: string
  status_system_value: string | null
  is_finished: boolean
  archived: boolean
  time_in: string
  eta_out: string
  updated_at: string
  note: string
  internal_note: string
  warranty: string
  customer_id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  employee_id: string
  shop_id: string
  sale_id: string | null
  sale_line_id: string | null
  serialized_id: string | null
  lines: GenieWorkorderLine[]
  items: GenieWorkorderItem[]
  items_subtotal: number | null
}

export type ListGenieWorkordersOptions = {
  scope?: GenieWorkorderScope
  query?: string
  customer_id?: string
  /** ISO date (YYYY-MM-DD) in the store timezone — matches work order ETA out date. */
  due_on?: string
  limit?: number
  include_details?: boolean
  include_archived?: boolean
  /** Scan notes/parts across recent work orders instead of per-status buckets. */
  note_search?: boolean
  max_pages_per_status?: number
}

function ensureArray<T>(data: T | T[] | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

function parseTimestamp(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function parseNumber(value: string | undefined): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function queryTokens(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !WORKORDER_QUERY_STOP_WORDS.has(token))
}

export function isFinishedWorkorderStatus(status: LightspeedWorkorderStatus | undefined): boolean {
  if (!status) return false
  const systemValue = String(status.systemValue ?? '').trim().toLowerCase()
  if (systemValue && FINISHED_SYSTEM_VALUES.has(systemValue)) return true
  const name = String(status.name ?? '').trim().toLowerCase()
  return /(finish|finished|done|complete|ready|pickup|paid)/.test(name)
}

function customerDisplayName(customer: LightspeedCustomer | undefined, customerId: string): string {
  if (!customer) return `Customer ${customerId}`
  const name = [customer.firstName, customer.lastName]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
  return name || String(customer.company ?? '').trim() || `Customer ${customerId}`
}

function pickCustomerPhone(customer: LightspeedCustomer): string | null {
  const phones = ensureArray(customer.Contact?.Phones?.ContactPhone)
  const mobile = phones.find(phone => String(phone.useType ?? '').toLowerCase().includes('mobile'))
  if (mobile?.number?.trim()) return mobile.number.trim()
  const first = phones.find(phone => phone.number?.trim())
  return first?.number?.trim() ?? null
}

function pickCustomerEmail(customer: LightspeedCustomer): string | null {
  const emails = ensureArray(customer.Contact?.Emails?.ContactEmail)
  const primary = emails.find(email => String(email.useType ?? '').toLowerCase().includes('primary'))
  if (primary?.address?.trim()) return primary.address.trim()
  const first = emails.find(email => email.address?.trim())
  return first?.address?.trim() ?? null
}

function workorderLines(workorder: LightspeedWorkorderWithRelations): LightspeedWorkorderLine[] {
  return ensureArray(workorder.WorkorderLines?.WorkorderLine)
}

function workorderItemsFromRelation(workorder: LightspeedWorkorderWithRelations): LightspeedWorkorderItem[] {
  return ensureArray(workorder.WorkorderItems?.WorkorderItem)
}

function mapWorkorderLines(workorder: LightspeedWorkorderWithRelations): GenieWorkorderLine[] {
  return workorderLines(workorder).map(line => ({
    line_id: String(line.workorderLineID),
    note: String(line.note ?? '').trim(),
    done: String(line.done ?? '') === 'true',
  }))
}

function mapWorkorderItems(items: LightspeedWorkorderItem[]): GenieWorkorderItem[] {
  return items.map(item => {
    const quantity = parseNumber(item.unitQuantity)
    const unitPrice = parseNumber(item.unitPrice)
    const lineTotal = quantity != null && unitPrice != null ? quantity * unitPrice : null
    return {
      item_id: String(item.itemID ?? ''),
      description: String(item.Item?.description ?? '').trim() || null,
      sku: String(item.Item?.customSku ?? item.Item?.systemSku ?? '').trim() || null,
      note: String(item.note ?? '').trim(),
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    }
  })
}

function itemsSubtotal(items: GenieWorkorderItem[]): number | null {
  const totals = items.map(item => item.line_total).filter((value): value is number => value != null)
  if (totals.length === 0) return null
  return totals.reduce((sum, value) => sum + value, 0)
}

function statusForWorkorder(
  workorder: LightspeedWorkorderWithRelations,
  statusById: Map<string, LightspeedWorkorderStatus>,
): LightspeedWorkorderStatus | undefined {
  return (
    workorder.WorkorderStatus
    ?? statusById.get(String(workorder.workorderStatusID ?? ''))
  )
}

function matchesQuery(detail: GenieWorkorderDetail, needle: string): boolean {
  const haystack = [
    detail.workorder_id,
    detail.customer_name,
    detail.customer_phone ?? '',
    detail.customer_email ?? '',
    detail.note,
    detail.internal_note,
    detail.status_name,
    ...detail.lines.map(line => line.note),
    ...detail.items.map(item => [item.description, item.sku, item.note].filter(Boolean).join(' ')),
  ]
    .map(part => normalizeText(String(part)))
    .join(' ')
  if (haystack.includes(needle)) return true
  const tokens = queryTokens(needle)
  return tokens.length > 0 && tokens.every(token => haystack.includes(token))
}

async function enrichWorkorder(
  userId: string,
  workorder: LightspeedWorkorderWithRelations,
  statusById: Map<string, LightspeedWorkorderStatus>,
  includeDetails: boolean,
): Promise<GenieWorkorderDetail> {
  const client = createLightspeedClient(userId)
  const workorderId = String(workorder.workorderID)
  const customerId = String(workorder.customerID ?? '')
  const status = statusForWorkorder(workorder, statusById)
  const statusName = String(status?.name ?? 'Unknown').trim()
  const isFinished = isFinishedWorkorderStatus(status)

  let customer = workorder.Customer
  let items = workorderItemsFromRelation(workorder)

  if (includeDetails) {
    const needsCustomerFetch = Boolean(customerId && customerId !== '0' && !customerHasContact(customer))
    const [profileResult, itemsResult] = await Promise.allSettled([
      needsCustomerFetch
        ? client.getCustomer(customerId, { load_relations: '["Contact"]' })
        : Promise.resolve(customer),
      items.length === 0 ? client.getWorkorderItems(workorderId) : Promise.resolve(items),
    ])

    if (profileResult.status === 'fulfilled' && profileResult.value) {
      customer = profileResult.value
    }
    if (itemsResult.status === 'fulfilled') {
      items = itemsResult.value
    }
  }

  const mappedItems = includeDetails ? mapWorkorderItems(items) : []
  const customerName = customerDisplayName(customer, customerId)
  const customerPhone = customer ? pickCustomerPhone(customer) : null
  const customerEmail = customer ? pickCustomerEmail(customer) : null

  return {
    workorder_id: workorderId,
    status_id: String(workorder.workorderStatusID ?? ''),
    status_name: statusName,
    status_system_value: String(status?.systemValue ?? '').trim() || null,
    is_finished: isFinished,
    archived: String(workorder.archived ?? '') === 'true',
    time_in: String(workorder.timeIn ?? ''),
    eta_out: String(workorder.etaOut ?? ''),
    updated_at: String(workorder.timeStamp ?? workorder.etaOut ?? workorder.timeIn ?? ''),
    note: String(workorder.note ?? '').trim(),
    internal_note: String(workorder.internalNote ?? '').trim(),
    warranty: String(workorder.warranty ?? '').trim(),
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    employee_id: String(workorder.employeeID ?? ''),
    shop_id: String(workorder.shopID ?? ''),
    sale_id: normalizeLightspeedId(workorder.saleID),
    sale_line_id: normalizeLightspeedId(workorder.saleLineID),
    serialized_id: String(workorder.serializedID ?? '').trim() && String(workorder.serializedID ?? '').trim() !== '0'
      ? String(workorder.serializedID).trim()
      : null,
    lines: includeDetails ? mapWorkorderLines(workorder) : [],
    items: mappedItems,
    items_subtotal: includeDetails ? itemsSubtotal(mappedItems) : null,
  }
}

async function fetchWorkordersByStatusIds(
  userId: string,
  statusIds: string[],
  options?: { limitPerStatus?: number; maxPagesPerStatus?: number },
): Promise<LightspeedWorkorderWithRelations[]> {
  if (statusIds.length === 0) return []

  const client = createLightspeedClient(userId)
  const loadRelations = '["Customer","WorkorderLines","WorkorderStatus"]'
  const limitPerStatus = Math.max(options?.limitPerStatus ?? 24, 1)
  const maxPagesPerStatus = Math.max(options?.maxPagesPerStatus ?? 2, 1)

  const batches = await Promise.all(
    statusIds.map(statusId =>
      client.getRecentWorkorders(
        {
          archived: 'false',
          workorderStatusID: statusId,
          sort: '-timeStamp',
          load_relations: loadRelations,
        },
        {
          targetCount: limitPerStatus,
          limit: Math.min(limitPerStatus, 100),
          maxPages: maxPagesPerStatus,
        },
      ),
    ),
  )

  const byId = new Map<string, LightspeedWorkorderWithRelations>()
  for (const workorder of batches.flat()) {
    byId.set(String(workorder.workorderID), workorder)
  }

  return [...byId.values()].sort((a, b) => parseTimestamp(b.timeStamp) - parseTimestamp(a.timeStamp))
}

async function fetchRecentWorkordersUnscoped(
  userId: string,
  options?: { targetCount?: number; maxPages?: number },
): Promise<LightspeedWorkorderWithRelations[]> {
  const client = createLightspeedClient(userId)
  const loadRelations = '["Customer","WorkorderLines","WorkorderStatus"]'
  const targetCount = Math.max(options?.targetCount ?? 160, 1)
  const maxPages = Math.max(options?.maxPages ?? 4, 1)

  return client.getRecentWorkorders(
    {
      archived: 'false',
      sort: '-timeStamp',
      load_relations: loadRelations,
    },
    {
      targetCount,
      limit: 100,
      maxPages,
    },
  )
}

function lightspeedContainsFilter(term: string): string {
  return `~,%${term.replace(/%/g, '').trim()}%`
}

async function fetchWorkordersByServerNoteQuery(
  userId: string,
  query: string,
  options?: { targetCount?: number; maxPages?: number },
): Promise<LightspeedWorkorderWithRelations[] | null> {
  const cleanQuery = query.replace(/\s+/g, ' ').trim()
  if (!cleanQuery) return null

  const client = createLightspeedClient(userId)
  const loadRelations = '["Customer","WorkorderLines","WorkorderStatus"]'
  const targetCount = Math.max(options?.targetCount ?? 80, 1)
  const requestOptions = {
    targetCount,
    limit: 100,
    maxPages: Math.max(options?.maxPages ?? 4, 1),
  }
  const filter = lightspeedContainsFilter(cleanQuery)
  const baseParams = {
    archived: 'false',
    sort: '-timeStamp',
    load_relations: loadRelations,
  }

  const results = await Promise.allSettled([
    client.getRecentWorkorders({ ...baseParams, note: filter }, requestOptions),
    client.getRecentWorkorders({ ...baseParams, internalNote: filter }, requestOptions),
  ])
  const fulfilled = results
    .filter((result): result is PromiseFulfilledResult<LightspeedWorkorderWithRelations[]> => result.status === 'fulfilled')
    .flatMap(result => result.value)

  if (fulfilled.length === 0 && results.some(result => result.status === 'rejected')) {
    return null
  }

  const byId = new Map<string, LightspeedWorkorderWithRelations>()
  for (const workorder of fulfilled) {
    byId.set(String(workorder.workorderID), workorder)
  }
  return [...byId.values()].sort((a, b) => parseTimestamp(b.timeStamp) - parseTimestamp(a.timeStamp))
}

function workorderMatchesScope(
  workorder: LightspeedWorkorderWithRelations,
  scope: GenieWorkorderScope,
  statusById: Map<string, LightspeedWorkorderStatus>,
): boolean {
  const status = statusForWorkorder(workorder, statusById)
  const finished = isFinishedWorkorderStatus(status)
  if (scope === 'open') return !finished
  if (scope === 'finished') return finished
  return true
}

export async function listGenieWorkorders(
  userId: string,
  options: ListGenieWorkordersOptions = {},
): Promise<{
  scope: GenieWorkorderScope
  statuses: Array<{ status_id: string; name: string; system_value: string | null; is_finished: boolean }>
  workorders: GenieWorkorderDetail[]
  total: number
  truncated: boolean
}> {
  const scope = options.scope ?? 'open'
  const dueOn = options.due_on?.trim() || ''
  const limit = Math.min(Math.max(options.limit ?? (options.query ? 8 : dueOn ? 30 : 40), 1), 100)
  const includeDetails = options.include_details !== false
  const query = options.query ? normalizeText(options.query) : ''
  const customerId = String(options.customer_id ?? '').trim()

  const client = createLightspeedClient(userId)
  const statuses = await client.getWorkorderStatuses()
  const statusById = new Map(statuses.map(status => [String(status.workorderStatusID), status]))

  const statusRows = statuses.map(status => ({
    status_id: String(status.workorderStatusID),
    name: String(status.name ?? '').trim(),
    system_value: String(status.systemValue ?? '').trim() || null,
    is_finished: isFinishedWorkorderStatus(status),
  }))

  let rawWorkorders: LightspeedWorkorderWithRelations[]
  if (customerId) {
    const customerWorkorderParams = {
      customerID: customerId,
      sort: '-timeStamp',
      load_relations: '["Customer","WorkorderLines","WorkorderStatus"]',
    }
    const customerWorkorderOptions = {
      targetCount: Math.max(limit, 25),
      limit: Math.min(Math.max(limit, 25), 100),
      maxPages: options.max_pages_per_status ?? 3,
    }
    const batches = options.include_archived
      ? await Promise.all([
          client.getRecentWorkorders({ ...customerWorkorderParams, archived: 'false' }, customerWorkorderOptions),
          client.getRecentWorkorders({ ...customerWorkorderParams, archived: 'true' }, customerWorkorderOptions).catch(() => []),
        ])
      : [
          await client.getRecentWorkorders(
            { ...customerWorkorderParams, archived: 'false' },
            customerWorkorderOptions,
          ),
        ]
    const byId = new Map<string, LightspeedWorkorderWithRelations>()
    for (const workorder of batches.flat()) {
      byId.set(String(workorder.workorderID), workorder)
    }
    rawWorkorders = [...byId.values()].sort((a, b) => parseTimestamp(b.timeStamp) - parseTimestamp(a.timeStamp))
  } else if (dueOn) {
    rawWorkorders = await fetchRecentWorkordersUnscoped(userId, {
      targetCount: Math.max(limit * 8, 120),
      maxPages: options.max_pages_per_status ?? 4,
    })
  } else if (query && options.note_search) {
    const serverFiltered = await fetchWorkordersByServerNoteQuery(userId, query, {
      targetCount: Math.max(limit * 12, 240),
      maxPages: options.max_pages_per_status ?? 6,
    })
    rawWorkorders = serverFiltered && serverFiltered.length > 0
      ? serverFiltered
      : await fetchRecentWorkordersUnscoped(userId, {
          targetCount: Math.max(limit * 12, 240),
          maxPages: options.max_pages_per_status ?? 6,
        })
  } else {
    const targetStatusIds = statuses
      .filter(status => {
        const finished = isFinishedWorkorderStatus(status)
        if (scope === 'open') return !finished
        if (scope === 'finished') return finished
        return true
      })
      .map(status => String(status.workorderStatusID))

    const perStatusLimit = Math.max(Math.ceil(limit / Math.max(targetStatusIds.length, 1)) + 4, 8)
    rawWorkorders = await fetchWorkordersByStatusIds(userId, targetStatusIds, {
      limitPerStatus: perStatusLimit,
      maxPagesPerStatus: options.max_pages_per_status ?? 2,
    })
  }

  let scoped = rawWorkorders.filter(workorder => workorderMatchesScope(workorder, scope, statusById))

  if (dueOn) {
    scoped = scoped.filter(workorder => storeDateFromIso(String(workorder.etaOut ?? '')) === dueOn)
  }

  const enrichmentPool = scoped.slice(0, limit + (query ? limit : 0))
  const enriched = await mapWithConcurrency(
    enrichmentPool,
    ENRICH_CONCURRENCY,
    workorder => enrichWorkorder(userId, workorder, statusById, includeDetails),
  )

  const filtered = query
    ? enriched.filter(detail => matchesQuery(detail, query)).slice(0, limit)
    : enriched.slice(0, limit)

  return {
    scope,
    statuses: statusRows,
    workorders: filtered,
    total: filtered.length,
    truncated: scoped.length > filtered.length || rawWorkorders.length > scoped.length,
  }
}

/** A workorder counts as "paid" once its status says so — everything else is still waiting on payment. */
export function isPaidWorkorderStatus(status: LightspeedWorkorderStatus | undefined): boolean {
  if (!status) return false
  const systemValue = String(status.systemValue ?? '').trim().toLowerCase()
  if (systemValue === 'paid') return true
  return /paid/.test(String(status.name ?? '').trim().toLowerCase())
}

/**
 * Every workorder still waiting for payment: not archived and not in a
 * "paid" status. Includes finished-but-unpaid jobs awaiting collection.
 * Reads live from Lightspeed so the list always matches the POS.
 */
export async function listUnpaidWorkorders(
  userId: string,
  options: { limit?: number } = {},
): Promise<{ workorders: GenieWorkorderDetail[]; truncated: boolean }> {
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 100)

  const client = createLightspeedClient(userId)
  const statuses = await client.getWorkorderStatuses()
  const statusById = new Map(statuses.map(status => [String(status.workorderStatusID), status]))

  const unpaidStatusIds = statuses
    .filter(status => !isPaidWorkorderStatus(status))
    .map(status => String(status.workorderStatusID))

  const perStatusLimit = Math.max(Math.ceil(limit / Math.max(unpaidStatusIds.length, 1)) + 6, 12)
  const rawWorkorders = await fetchWorkordersByStatusIds(userId, unpaidStatusIds, {
    limitPerStatus: perStatusLimit,
    maxPagesPerStatus: 2,
  })

  const active = rawWorkorders.filter(workorder => String(workorder.archived ?? '') !== 'true')
  const pool = active.slice(0, limit)
  // includeDetails=false: name/status/note all come from the base fetch, and
  // skipping per-workorder item lookups keeps this light. Phones are hydrated
  // once per unique customer below so “Send message” deep-links work.
  const workorders = await mapWithConcurrency(
    pool,
    ENRICH_CONCURRENCY,
    workorder => enrichWorkorder(userId, workorder, statusById, false),
  )

  const hydrated = await hydrateMissingCustomerPhones(userId, workorders)

  // Most recently edited (Lightspeed timeStamp) first — staff interact with these first.
  hydrated.sort((a, b) => parseTimestamp(b.updated_at) - parseTimestamp(a.updated_at))

  return { workorders: hydrated, truncated: active.length > pool.length }
}

/** Fill customer_phone for rows where the nested Customer relation had no Contact. */
async function hydrateMissingCustomerPhones(
  userId: string,
  workorders: GenieWorkorderDetail[],
): Promise<GenieWorkorderDetail[]> {
  const missingIds = Array.from(
    new Set(
      workorders
        .filter(
          (workorder) =>
            !workorder.customer_phone?.trim() &&
            workorder.customer_id &&
            workorder.customer_id !== '0',
        )
        .map((workorder) => workorder.customer_id),
    ),
  )
  if (missingIds.length === 0) return workorders

  const client = createLightspeedClient(userId)
  const phoneByCustomerId = new Map<string, string>()

  await mapWithConcurrency(missingIds, ENRICH_CONCURRENCY, async (customerId) => {
    try {
      const customer = await client.getCustomer(customerId, {
        load_relations: '["Contact"]',
      })
      const phone = pickCustomerPhone(customer)
      if (phone) phoneByCustomerId.set(customerId, phone)
    } catch {
      // Leave phone null — compose can still surface a clear error.
    }
  })

  if (phoneByCustomerId.size === 0) return workorders

  return workorders.map((workorder) => {
    if (workorder.customer_phone?.trim()) return workorder
    const phone = phoneByCustomerId.get(workorder.customer_id)
    return phone ? { ...workorder, customer_phone: phone } : workorder
  })
}

export async function getGenieWorkorder(
  userId: string,
  workorderId: string,
): Promise<GenieWorkorderDetail | null> {
  const cleanId = String(workorderId).trim()
  if (!cleanId) return null

  const client = createLightspeedClient(userId)
  const statuses = await client.getWorkorderStatuses()
  const statusById = new Map(statuses.map(status => [String(status.workorderStatusID), status]))

  const workorder = await client.getWorkorder(cleanId, {
    load_relations: '["Customer","WorkorderLines","WorkorderStatus","WorkorderItems"]',
  })

  if (!workorder) return null
  return enrichWorkorder(userId, workorder, statusById, true)
}

const SCOPE_TITLES: Record<GenieWorkorderScope | 'single', string> = {
  open: 'Open work orders',
  finished: 'Finished work orders',
  all: 'Work orders',
  single: 'Work order',
}

export function buildWorkorderCardsPayload(args: {
  scope: GenieWorkorderScope | 'single'
  workorders: GenieWorkorderDetail[]
  truncated?: boolean
  title?: string
}): GenieWorkorderCardsPayload | null {
  if (args.workorders.length === 0) return null
  return {
    title: args.title ?? SCOPE_TITLES[args.scope],
    scope: args.scope,
    truncated: args.truncated,
    workorders: args.workorders as GenieWorkorderCard[],
  }
}
