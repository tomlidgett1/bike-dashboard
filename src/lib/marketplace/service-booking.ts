/**
 * Public storefront service booking against Lightspeed workorders + Nest text.
 *
 * Uses the store's Yellow Jersey Lightspeed connection (lightspeed_connections),
 * the same live token path as the dashboard workorder tools.
 *
 * Capacity rule: at most SERVICE_BOOKING_DAILY_CAP open workorders may be due
 * (etaOut date) on a given Melbourne calendar day.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createLightspeedClient } from '@/lib/services/lightspeed/lightspeed-client'
import { getConnection, getValidAccessToken } from '@/lib/services/lightspeed/token-manager'
import { LIGHTSPEED_CONFIG } from '@/lib/services/lightspeed/config'
import { pickServerEnv } from '@/lib/nest-portal/lib/server-env'
import { getLinqFromNumber } from '@/lib/nest/linq-sender'
import { normaliseToE164 } from '@/lib/nest/phone-normalise'
import {
  getNestDefaultBrandKey,
  getNestSupabaseServiceKey,
  getNestSupabaseUrl,
} from '@/lib/nest/config'
import { resolveStoreNestBrandKey } from '@/lib/nest/resolve-store-brand-key'
import { upsertNestThreadToSupabase } from '@/lib/nest/inbox-supabase'
import type { NestConversationDetail, NestConversationMessage } from '@/lib/nest/types'
import type {
  LightspeedCustomer,
  LightspeedWorkorderStatus,
  LightspeedWorkorderWithRelations,
} from '@/lib/services/lightspeed/types'

export const SERVICE_BOOKING_DAILY_CAP = 10
export const SERVICE_BOOKING_TIMEZONE = 'Australia/Melbourne'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FINISHED_STATUS_TOKENS = new Set(['finished', 'paid', 'complete', 'done', 'completed'])

function getLinqBaseUrl(): string {
  return pickServerEnv(['LINQ_API_BASE_URL']) || 'https://api.linqapp.com/api/partner/v3'
}

function melbourneYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SERVICE_BOOKING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Service completion bookings are weekdays only (Melbourne calendar). */
export function isServiceBookingWeekend(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

function melbourneOffsetForDate(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`)
  const offsetPart =
    new Intl.DateTimeFormat('en-AU', {
      timeZone: SERVICE_BOOKING_TIMEZONE,
      timeZoneName: 'longOffset',
    })
      .formatToParts(probe)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+10:00'
  const match = offsetPart.match(/GMT([+-]\d{2}:\d{2})/)
  return match?.[1] ?? '+10:00'
}

function melbourneDropOffIso(date: string): string {
  return `${date}T09:00:00${melbourneOffsetForDate(date)}`
}

function melbourneEtaOutIso(date: string): string {
  return `${date}T17:00:00${melbourneOffsetForDate(date)}`
}

function storeDateFromIso(value: string): string | null {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SERVICE_BOOKING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(parsed))
}

function formatHumanDate(date: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SERVICE_BOOKING_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`))
}

function cleanLine(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function splitCustomerName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Customer', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function auDisplayPhone(e164: string): string {
  if (e164.startsWith('+61') && e164.length >= 12) {
    return `0${e164.slice(3)}`
  }
  return e164
}

function isFinishedStatus(status: LightspeedWorkorderStatus | undefined): boolean {
  if (!status) return false
  const system = String(status.systemValue ?? '')
    .trim()
    .toLowerCase()
  if (FINISHED_STATUS_TOKENS.has(system)) return true
  const name = String(status.name ?? '')
    .trim()
    .toLowerCase()
  return FINISHED_STATUS_TOKENS.has(name) || /paid|finished|complete|done/.test(name)
}

function phoneLookupVariants(e164: string): string[] {
  const variants = new Set<string>([e164])
  if (e164.startsWith('+61') && e164.length >= 11) {
    variants.add(`0${e164.slice(3)}`)
    variants.add(e164.slice(1))
  }
  return [...variants]
}

function collectPhoneE164s(customer: LightspeedCustomer): string[] {
  const phones = customer.Contact?.Phones?.ContactPhone
  const list = Array.isArray(phones) ? phones : phones ? [phones] : []
  const out: string[] = []
  for (const phone of list) {
    const e164 = normaliseToE164(String(phone.number ?? ''))
    if (e164) out.push(e164)
  }
  return out
}

async function storeHasLightspeed(storeUserId: string): Promise<boolean> {
  try {
    const connection = await getConnection(storeUserId)
    return Boolean(connection && connection.status === 'connected' && connection.account_id)
  } catch (error) {
    console.warn(
      '[service-booking] connection check failed:',
      error instanceof Error ? error.message : error,
    )
    return false
  }
}

function countOpenDueByDay(
  workorders: LightspeedWorkorderWithRelations[],
  statusById: Map<string, LightspeedWorkorderStatus>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const workorder of workorders) {
    const status = statusById.get(String(workorder.workorderStatusID))
    if (isFinishedStatus(status)) continue
    const day = storeDateFromIso(String(workorder.etaOut ?? ''))
    if (!day) continue
    counts[day] = (counts[day] ?? 0) + 1
  }
  return counts
}

/** Live Lightspeed lookup via the store's dashboard connection. */
export async function countOpenWorkordersDueByDay(
  storeUserId: string,
): Promise<{ connected: boolean; counts: Record<string, number>; capacity: number }> {
  const connected = await storeHasLightspeed(storeUserId)
  if (!connected) {
    return { connected: false, counts: {}, capacity: SERVICE_BOOKING_DAILY_CAP }
  }

  try {
    const client = createLightspeedClient(storeUserId)
    const [statuses, workorders] = await Promise.all([
      client.getWorkorderStatuses(),
      client.getRecentWorkorders(
        {
          archived: 'false',
          sort: '-etaOut',
          load_relations: '["WorkorderStatus"]',
        },
        { targetCount: 400, maxPages: 5, limit: 100 },
      ),
    ])
    const statusById = new Map(statuses.map((status) => [String(status.workorderStatusID), status]))
    return {
      connected: true,
      counts: countOpenDueByDay(workorders, statusById),
      capacity: SERVICE_BOOKING_DAILY_CAP,
    }
  } catch (error) {
    console.error(
      '[service-booking] live availability failed:',
      error instanceof Error ? error.message : error,
    )
    // Soft-fail: keep the calendar usable rather than blocking the form.
    return { connected: true, counts: {}, capacity: SERVICE_BOOKING_DAILY_CAP }
  }
}

export async function countOpenWorkordersDueOnDate(
  storeUserId: string,
  date: string,
): Promise<{ connected: boolean; count: number; capacity: number; available: boolean }> {
  if (!DATE_RE.test(date)) {
    throw new Error('date must be YYYY-MM-DD')
  }
  if (isServiceBookingWeekend(date)) {
    const connected = await storeHasLightspeed(storeUserId)
    return {
      connected,
      count: 0,
      capacity: SERVICE_BOOKING_DAILY_CAP,
      available: false,
    }
  }
  const { connected, counts, capacity } = await countOpenWorkordersDueByDay(storeUserId)
  const count = counts[date] ?? 0
  return {
    connected,
    count,
    capacity,
    available: connected && count < capacity,
  }
}

async function lightspeedPost(
  storeUserId: string,
  resourcePath: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const [accessToken, connection] = await Promise.all([
    getValidAccessToken(storeUserId),
    getConnection(storeUserId),
  ])
  if (!accessToken || !connection?.account_id) {
    throw new Error('Lightspeed is not connected for this store')
  }

  const url = `${LIGHTSPEED_CONFIG.API_BASE_URL}/Account/${encodeURIComponent(connection.account_id)}/${resourcePath.replace(/^\//, '')}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`Lightspeed API returned non-JSON (${res.status})`)
  }
  if (!res.ok) {
    throw new Error(
      `Lightspeed API failed (${res.status}): ${
        typeof data.message === 'string' ? data.message : text.slice(0, 160)
      }`,
    )
  }
  return data
}

async function findCustomerIdByPhone(
  client: ReturnType<typeof createLightspeedClient>,
  phoneE164: string,
): Promise<string | null> {
  const fields = ['Contact.mobile', 'Contact.phoneHome', 'Contact.phoneWork'] as const
  for (const phone of phoneLookupVariants(phoneE164)) {
    for (const field of fields) {
      try {
        const customers = await client.getCustomers({
          [field]: phone,
          load_relations: '["Contact"]',
          limit: 40,
        })
        for (const customer of customers) {
          if (collectPhoneE164s(customer).includes(phoneE164) && customer.customerID) {
            return String(customer.customerID)
          }
        }
        if (customers.length === 1 && customers[0]?.customerID) {
          return String(customers[0].customerID)
        }
      } catch (error) {
        console.warn(
          '[service-booking] customer phone lookup failed:',
          error instanceof Error ? error.message : error,
        )
      }
    }
  }
  return null
}

async function createCustomer(
  storeUserId: string,
  fullName: string,
  phoneE164: string,
): Promise<string> {
  const { firstName, lastName } = splitCustomerName(fullName)
  const created = await lightspeedPost(storeUserId, 'Customer.json', {
    firstName: cleanLine(firstName, 40) || 'Customer',
    lastName: cleanLine(lastName, 40),
    Contact: {
      Phones: {
        ContactPhone: [
          {
            number: auDisplayPhone(phoneE164),
            useType: 'Mobile',
          },
        ],
      },
    },
  })

  const node = created.Customer
  const row = (Array.isArray(node) ? node[0] : node) as LightspeedCustomer | undefined
  const id = row?.customerID
  if (!id) throw new Error('Lightspeed created no identifiable customer')
  return String(id)
}

async function findOrCreateCustomer(
  client: ReturnType<typeof createLightspeedClient>,
  storeUserId: string,
  fullName: string,
  phoneE164: string,
): Promise<string> {
  const existing = await findCustomerIdByPhone(client, phoneE164)
  if (existing) return existing
  return createCustomer(storeUserId, fullName, phoneE164)
}

async function resolveShopId(
  client: ReturnType<typeof createLightspeedClient>,
): Promise<string | null> {
  const shops = await client.getShops({ archived: 'false' })
  const first = shops.find((shop) => shop.shopID)
  return first?.shopID ? String(first.shopID) : null
}

async function createWorkorder(
  storeUserId: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const created = await lightspeedPost(storeUserId, 'Workorder.json', payload)
  const node = created.Workorder
  const row = (Array.isArray(node) ? node[0] : node) as { workorderID?: string | number } | undefined
  const id = Number(row?.workorderID ?? created.workorder_id)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Lightspeed created no identifiable workorder')
  }
  return Math.trunc(id)
}

function useInternalNestPortal(): boolean {
  return process.env.NEST_PORTAL_INTERNAL === '1' || process.env.NEST_PORTAL_INTERNAL === 'true'
}

/** Nest conversation DB (YJ when cutover is on, Nest project otherwise). */
function getNestConversationClient(): SupabaseClient | null {
  const url = useInternalNestPortal()
    ? pickServerEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
    : getNestSupabaseUrl()
  const key = useInternalNestPortal()
    ? pickServerEnv(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'])
    : getNestSupabaseServiceKey()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseLinqJson(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}

function extractLinqChatResult(payload: Record<string, unknown>): {
  chatId: string | null
  providerMessageId: string | null
} {
  const chat =
    payload.chat && typeof payload.chat === 'object'
      ? (payload.chat as Record<string, unknown>)
      : null
  const topMessage =
    payload.message && typeof payload.message === 'object'
      ? (payload.message as Record<string, unknown>)
      : null
  const chatMessage =
    chat?.message && typeof chat.message === 'object'
      ? (chat.message as Record<string, unknown>)
      : null
  const chatId = typeof chat?.id === 'string' && chat.id.trim() ? chat.id.trim() : null
  const id = chatMessage?.id ?? topMessage?.id
  const providerMessageId = typeof id === 'string' && id.trim() ? id.trim() : null
  return { chatId, providerMessageId }
}

function syntheticNestMessageId(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return (hash % 2_000_000_000) + 1
}

/**
 * Persist the website booking confirmation into Nest's conversation store and
 * point this recipient at the store brand so replies load that history.
 */
async function persistNestBookingContext(input: {
  nest: SupabaseClient
  yj: SupabaseClient
  chatId: string
  providerMessageId: string | null
  botNumber: string
  text: string
  brandKey: string
  storeUserId: string
  storeName: string
  customerName: string
  customerPhoneE164: string
  bike: string
  dropOffDate: string
  serviceName: string | null
  workorderId: number
}): Promise<void> {
  const brandKey = input.brandKey.trim().toLowerCase() || getNestDefaultBrandKey()
  const metadata = {
    is_group_chat: false,
    service: 'website_service_booking',
    source: 'website_service_booking',
    sender_kind: 'assistant',
    linq_provider_message_id: input.providerMessageId,
    recipient_phone_e164: input.customerPhoneE164,
    customer_name: input.customerName,
    store_user_id: input.storeUserId,
    store_name: input.storeName,
    bike: input.bike,
    drop_off_date: input.dropOffDate,
    service_name: input.serviceName,
    workorder_id: input.workorderId,
  }

  const { error: appendError } = await input.nest.rpc('append_conversation_message', {
    p_chat_id: input.chatId,
    p_role: 'assistant',
    p_content: input.text,
    p_handle: `brand@${brandKey}`,
    p_metadata: metadata,
    p_is_group_chat: false,
    p_chat_name: null,
    p_participant_names: [],
    p_service: 'website_service_booking',
    p_engagement_scope: 'brand',
    p_engagement_brand_key: brandKey,
    p_provider_message_id: input.providerMessageId,
  })

  if (appendError) {
    // Fallback for environments where the RPC is missing but the table exists.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error: insertError } = await input.nest.from('conversation_messages').insert({
      chat_id: input.chatId,
      role: 'assistant',
      content: input.text,
      handle: `brand@${brandKey}`,
      engagement_scope: 'brand',
      engagement_brand_key: brandKey,
      metadata,
      expires_at: expiresAt,
      provider_message_id: input.providerMessageId,
    })
    if (insertError) {
      throw new Error(
        `Could not save Nest booking context: ${appendError.message}; insert: ${insertError.message}`,
      )
    }
  }

  // Keep a confirmed booking row so Nest can answer due-date / change follow-ups.
  const { error: bookingStateError } = await input.nest
    .from('nest_brand_lightspeed_booking_state')
    .upsert(
      {
        brand_key: brandKey,
        chat_id: input.chatId,
        status: 'confirmed',
        sender_handle: input.customerPhoneE164,
        sender_phone_e164: input.customerPhoneE164,
        customer_name: input.customerName,
        bike: input.bike,
        comments: input.serviceName || 'Website service booking',
        drop_off_date: input.dropOffDate,
        workorder_id: input.workorderId,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: 'brand_key,chat_id' },
    )
  if (bookingStateError) {
    console.warn('[service-booking] booking state upsert:', bookingStateError.message)
  }

  // Ensure profile exists, then route replies to this store's Nest brand bot.
  const { error: ensureError } = await input.nest.rpc('ensure_nest_user', {
    p_handle: input.customerPhoneE164,
    p_bot_number: input.botNumber,
  })
  if (ensureError) {
    console.warn('[service-booking] ensure_nest_user:', ensureError.message)
  }

  const { data: existingProfile } = await input.nest
    .from('user_profiles')
    .select('route, route_brand_key')
    .eq('handle', input.customerPhoneE164)
    .maybeSingle()

  const existingRoute = typeof existingProfile?.route === 'string' ? existingProfile.route.trim().toLowerCase() : ''
  const existingBrand =
    typeof existingProfile?.route_brand_key === 'string'
      ? existingProfile.route_brand_key.trim().toLowerCase()
      : ''
  const canSetBrandRoute =
    !existingRoute ||
    existingRoute === 'nest' ||
    existingRoute === 'brand' ||
    existingRoute === brandKey ||
    existingRoute === 'ash' ||
    existingRoute === 'ash-brand' ||
    existingBrand === brandKey

  if (canSetBrandRoute) {
    const { error: routeError } = await input.nest
      .from('user_profiles')
      .update({ route: 'brand', route_brand_key: brandKey })
      .eq('handle', input.customerPhoneE164)
    if (routeError) {
      console.warn('[service-booking] brand route update:', routeError.message)
    }
  } else {
    console.warn('[service-booking] skipped brand route override', {
      handle: input.customerPhoneE164,
      existingRoute,
      existingBrand,
      brandKey,
    })
  }

  // Surface the confirmation in the store's Customer inquiries inbox.
  const now = new Date().toISOString()
  const assistantMsg: NestConversationMessage = {
    id: syntheticNestMessageId(`${input.chatId}:booking:${input.workorderId}:${now}`),
    role: 'assistant',
    content: input.text,
    handle: `brand@${brandKey}`,
    createdAt: now,
    metadata: {
      source: 'website_service_booking',
      service: 'website_service_booking',
      workorder_id: input.workorderId,
    },
  }
  const conversation: NestConversationDetail = {
    chatId: input.chatId,
    title: input.customerName,
    displayName: input.customerName,
    participantHandle: input.customerPhoneE164,
    source: 'customer',
    lastSeen: null,
    messages: [assistantMsg],
  }

  try {
    await upsertNestThreadToSupabase(input.yj, input.storeUserId, brandKey, conversation, {
      chatId: input.chatId,
      title: input.customerName,
      displayName: input.customerName,
      participantHandle: input.customerPhoneE164,
      preview: input.text.replace(/\s+/g, ' ').trim().slice(0, 180),
      previewRole: 'assistant',
      lastMessageAt: now,
      lastCustomerMessageAt: null,
      source: 'customer',
      triggeredByTwilio: false,
      channel: 'store_outreach',
    })
  } catch (err) {
    console.warn(
      '[service-booking] store inbox sync failed:',
      err instanceof Error ? err.message : err,
    )
  }
}

async function sendNestBookingConfirmation(input: {
  yj: SupabaseClient
  storeUserId: string
  storeName: string
  brandKey: string
  customerName: string
  customerPhoneE164: string
  bike: string
  dropOffDate: string
  serviceName: string | null
  workorderId: number
}): Promise<{ sent: boolean; error?: string }> {
  const token = pickServerEnv(['LINQ_API_TOKEN'])
  const from = getLinqFromNumber()
  if (!token || !from) {
    return { sent: false, error: 'Nest messaging is not configured' }
  }

  const firstName = splitCustomerName(input.customerName).firstName
  const dayLabel = formatHumanDate(input.dropOffDate)
  const serviceBit = input.serviceName ? ` (${input.serviceName})` : ''
  const text = [
    `Hi ${firstName}, you're booked in with ${input.storeName}.`,
    '',
    `Your ${input.bike}${serviceBit} is due for completion on ${dayLabel}.`,
    `You can drop the bike off any time before then. If you're dropping it off on the same day it's due, please bring it in before 10am so we have time to finish it.`,
    '',
    'Reply to this message anytime if you need to change anything. See you then!',
  ].join('\n')

  try {
    const res = await fetch(`${getLinqBaseUrl()}/chats`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.customerPhoneE164],
        message: { parts: [{ type: 'text', value: text }] },
      }),
    })
    const raw = await res.text().catch(() => '')
    const payload = parseLinqJson(raw)
    if (!res.ok) {
      const detail = typeof payload.raw === 'string' ? payload.raw : raw
      return { sent: false, error: `Nest send failed (${res.status}): ${detail.slice(0, 160)}` }
    }

    const { chatId, providerMessageId } = extractLinqChatResult(payload)
    if (!chatId) {
      console.warn('[service-booking] Linq send ok but no chat id; Nest will lack reply context')
      return { sent: true, error: 'Confirmation sent, but Nest chat id was missing' }
    }

    const nest = getNestConversationClient()
    if (!nest) {
      console.warn('[service-booking] Nest DB not configured; confirmation sent without context persist')
      return { sent: true, error: 'Confirmation sent, but Nest context could not be saved' }
    }

    try {
      await persistNestBookingContext({
        nest,
        yj: input.yj,
        chatId,
        providerMessageId,
        botNumber: from,
        text,
        brandKey: input.brandKey,
        storeUserId: input.storeUserId,
        storeName: input.storeName,
        customerName: input.customerName,
        customerPhoneE164: input.customerPhoneE164,
        bike: input.bike,
        dropOffDate: input.dropOffDate,
        serviceName: input.serviceName,
        workorderId: input.workorderId,
      })
    } catch (persistError) {
      console.error(
        '[service-booking] Nest context persist failed:',
        persistError instanceof Error ? persistError.message : persistError,
      )
      return {
        sent: true,
        error:
          persistError instanceof Error
            ? persistError.message
            : 'Confirmation sent, but Nest context could not be saved',
      }
    }

    return { sent: true }
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Nest send failed',
    }
  }
}

export type CreateServiceBookingInput = {
  storeUserId: string
  storeName: string
  brandKey?: string | null
  customerName: string
  customerPhone: string
  bike: string
  notes?: string | null
  dropOffDate: string
  serviceName?: string | null
  serviceId?: string | null
}

export type CreateServiceBookingResult =
  | {
      ok: true
      workorderId: number
      dropOffDate: string
      nestSent: boolean
      nestError?: string
    }
  | {
      ok: false
      error: string
      code?:
        | 'not_connected'
        | 'day_full'
        | 'invalid_phone'
        | 'invalid_date'
        | 'past_date'
        | 'weekend'
        | 'validation'
        | 'create_failed'
    }

export async function createServiceBooking(
  supabase: SupabaseClient,
  input: CreateServiceBookingInput,
): Promise<CreateServiceBookingResult> {
  const customerName = cleanLine(input.customerName, 80)
  const bike = cleanLine(input.bike, 120)
  const notes = cleanLine(input.notes ?? '', 400)
  const serviceName = input.serviceName ? cleanLine(input.serviceName, 120) : null
  const dropOffDate = input.dropOffDate.trim()
  const brandKey = resolveStoreNestBrandKey({
    nest_brand_key: input.brandKey,
    business_name: input.storeName,
  })

  if (!customerName) {
    return { ok: false, error: 'Your name is required', code: 'validation' }
  }
  if (!bike) {
    return { ok: false, error: 'Please tell us which bike you are bringing in', code: 'validation' }
  }
  if (!DATE_RE.test(dropOffDate)) {
    return { ok: false, error: 'Please select a valid drop-off day', code: 'invalid_date' }
  }

  const today = melbourneYmd()
  if (dropOffDate < today) {
    return { ok: false, error: 'Please choose today or a future day', code: 'past_date' }
  }
  if (isServiceBookingWeekend(dropOffDate)) {
    return {
      ok: false,
      error: 'We cannot take service bookings for Saturday or Sunday. Please choose a weekday.',
      code: 'weekend',
    }
  }

  const phoneE164 = normaliseToE164(input.customerPhone)
  if (!phoneE164) {
    return {
      ok: false,
      error: 'Enter a valid mobile number including the area code',
      code: 'invalid_phone',
    }
  }

  if (!(await storeHasLightspeed(input.storeUserId))) {
    return {
      ok: false,
      error: 'Online booking is not available for this store right now',
      code: 'not_connected',
    }
  }

  const capacity = await countOpenWorkordersDueOnDate(input.storeUserId, dropOffDate)
  if (!capacity.connected) {
    return {
      ok: false,
      error: 'Online booking is not available for this store right now',
      code: 'not_connected',
    }
  }
  if (!capacity.available) {
    return {
      ok: false,
      error: `That day is fully booked (${SERVICE_BOOKING_DAILY_CAP} services). Please choose another day.`,
      code: 'day_full',
    }
  }

  try {
    const client = createLightspeedClient(input.storeUserId)
    const customerId = await findOrCreateCustomer(client, input.storeUserId, customerName, phoneE164)
    const shopId = await resolveShopId(client)
    if (!shopId) {
      return {
        ok: false,
        error: 'Could not resolve the workshop for this store',
        code: 'create_failed',
      }
    }

    const marker = `[Website booking ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}]`
    const noteLines = [
      'Booked via website',
      serviceName ? `Service: ${serviceName}` : '',
      `Bike: ${bike}`,
      `Customer: ${customerName}`,
      `Due / completion: ${formatHumanDate(dropOffDate)}`,
      'Customer can drop off on or before this date.',
      notes || (serviceName ? `Website booking for ${serviceName}` : 'Website service booking'),
      marker,
    ].filter(Boolean)

    const workorderId = await createWorkorder(input.storeUserId, {
      timeIn: melbourneDropOffIso(dropOffDate),
      etaOut: melbourneEtaOutIso(dropOffDate),
      note: noteLines.join('\n').slice(0, 1200),
      internalNote: `Created from the storefront Book a Service form.\n${marker}`,
      warranty: false,
      saveParts: false,
      assignEmployeeToAll: false,
      customerID: Number(customerId),
      serializedID: 0,
      shopID: Number(shopId),
      workorderStatusID: 1,
    })

    const nest = await sendNestBookingConfirmation({
      yj: supabase,
      storeUserId: input.storeUserId,
      storeName: input.storeName,
      brandKey,
      customerName,
      customerPhoneE164: phoneE164,
      bike,
      dropOffDate,
      serviceName,
      workorderId,
    })

    return {
      ok: true,
      workorderId,
      dropOffDate,
      nestSent: nest.sent,
      ...(nest.error ? { nestError: nest.error } : {}),
    }
  } catch (error) {
    console.error(
      '[service-booking] create failed:',
      error instanceof Error ? error.message : error,
    )
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not create the booking',
      code: 'create_failed',
    }
  }
}

export { formatHumanDate, melbourneYmd }
