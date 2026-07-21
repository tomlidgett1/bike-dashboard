import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import brandDefaultPrompts from './_data/brand-default-prompts.json'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  isValidIanaTimezone,
  normaliseBusinessTimezone,
  normaliseOpeningSchedule,
  validateOpeningSchedule,
} from '../lib/opening-schedule'
import {
  buildBusinessViewPrompt,
  hasBusinessRawPromptSeedContent,
  parseBusinessRawPrompt,
  pickBusinessFieldsFromParsed,
  type BusinessRawPromptConfig,
} from '../lib/brand-raw-prompt'
import { pickServerEnv } from '../lib/server-env'
import {
  extractImageAttachmentsFromLinqParts,
  fetchLinqChatMessages,
  type LinqChatMessage,
} from '@/lib/nest/linq-attachments'
import { getLinqFromNumber } from '@/lib/nest/linq-sender'
import { ensureSmsUrlsAreClickable } from '@/lib/nest/sms-link-format'
import { moderateNestOutboundMessage } from '@/lib/nest/outbound-content-moderation'
import {
  resolveAgentPayCheckoutUrl,
  sendLinqAgentPayCheckout,
  stripCheckoutUrlFromText,
} from '@/lib/nest/linq-agent-pay'
import { getLightspeedAccess, lightspeedGetJson } from '../lib/lightspeed-portal-access'

/** Inlined so the Vercel Node bundle always includes it (nested `api/lib/*` can be omitted). */
const ADMIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
let brandDefaultPromptCache: Record<string, string> | null = null

/**
 * Brand portal intentionally bypasses the 24-hour `expires_at` TTL on `conversation_messages`
 * so brands can browse their full message history. We pass this past sentinel everywhere a
 * `expires_at > <iso>` filter (or the RPC's `p_now` parameter) is used. The TTL still applies
 * for non-portal callers that build their own `nowIso`.
 */
const BRAND_PORTAL_TTL_FLOOR = '1970-01-01T00:00:00.000Z'
const LINQ_BASE_URL =
  pickServerEnv(['LINQ_API_BASE_URL']) || 'https://api.linqapp.com/api/partner/v3'
export { getLightspeedAccess, lightspeedGetJson } from '../lib/lightspeed-portal-access'

function getRegistryBusinessBaseline(brandKey: string): string {
  if (!brandDefaultPromptCache) {
    brandDefaultPromptCache = brandDefaultPrompts as Record<string, string>
  }
  const text = brandDefaultPromptCache[brandKey]
  return typeof text === 'string' ? text.trim() : ''
}

function normaliseToE164(input: string): string | null {
  const s0 = input.trim().replace(/[\s().-]/g, '')
  if (!s0 || s0.includes('@')) return null
  let digits = s0.startsWith('+') ? s0.slice(1).replace(/\D/g, '') : s0.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  if (digits.startsWith('0')) digits = '61' + digits.slice(1)
  if (digits.startsWith('61') && digits.length >= 11 && digits.length <= 15) return `+${digits}`
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null
}

function getLinqFrom(): string | null {
  return getLinqFromNumber()
}

type LinqMessageResult = {
  chatId: string
  providerMessageId: string | null
}

async function parseLinqResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}

function extractProviderMessageId(payload: Record<string, unknown>): string | null {
  const chat = payload.chat && typeof payload.chat === 'object' ? payload.chat as Record<string, unknown> : null
  const topMessage = payload.message && typeof payload.message === 'object' ? payload.message as Record<string, unknown> : null
  const chatMessage = chat?.message && typeof chat.message === 'object' ? chat.message as Record<string, unknown> : null
  const id = chatMessage?.id ?? topMessage?.id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

async function linqCreateChat(from: string, to: string, text: string): Promise<LinqMessageResult> {
  const token = pickServerEnv(['LINQ_API_TOKEN'])
  if (!token) throw new Error('LINQ_API_TOKEN is not configured')

  const res = await fetch(`${LINQ_BASE_URL}/chats`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      message: { parts: [{ type: 'text', value: text }] },
    }),
  })
  const payload = await parseLinqResponse(res)
  if (!res.ok) {
    const detail = typeof payload.raw === 'string' ? payload.raw : JSON.stringify(payload)
    throw new Error(`Linq ${res.status}: ${detail.slice(0, 240)}`)
  }

  const chat = payload.chat && typeof payload.chat === 'object' ? payload.chat as Record<string, unknown> : null
  const chatId = typeof chat?.id === 'string' && chat.id.trim() ? chat.id.trim() : ''
  if (!chatId) throw new Error('Linq did not return a chat id')

  return { chatId, providerMessageId: extractProviderMessageId(payload) }
}

async function linqPostMessageParts(
  chatId: string,
  parts: Array<{ type: string; value?: string; attachment_id?: string }>,
): Promise<LinqMessageResult> {
  const token = pickServerEnv(['LINQ_API_TOKEN'])
  if (!token) throw new Error('LINQ_API_TOKEN is not configured')
  if (parts.length === 0) {
    throw new Error('Message must include text, a link, or an attachment')
  }

  const res = await fetch(`${LINQ_BASE_URL}/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { parts },
    }),
  })
  const payload = await parseLinqResponse(res)
  if (!res.ok) {
    const detail = typeof payload.raw === 'string' ? payload.raw : JSON.stringify(payload)
    throw new Error(`Linq ${res.status}: ${detail.slice(0, 240)}`)
  }

  return { chatId, providerMessageId: extractProviderMessageId(payload) }
}

async function linqSendMessage(
  chatId: string,
  text: string,
  attachmentIds: string[] = [],
  explicitCheckoutUrl?: string | null,
): Promise<LinqMessageResult> {
  const trimmed = text.trim()

  const agentPayUrl =
    attachmentIds.length === 0
      ? resolveAgentPayCheckoutUrl(trimmed, explicitCheckoutUrl)
      : null
  if (agentPayUrl) {
    const intro = stripCheckoutUrlFromText(trimmed, agentPayUrl)
      .replace(/\n*Tap to pay:\s*$/i, '')
      .replace(/\n*Tap the payment card below.*$/i, '')
      .trim()
    return sendLinqAgentPayCheckout({
      chatId,
      checkoutUrl: agentPayUrl,
      introText: intro || null,
    })
  }

  const parts: Array<{ type: string; value?: string; attachment_id?: string }> = []
  if (trimmed) parts.push({ type: 'text', value: trimmed })
  for (const attachmentId of attachmentIds) {
    const id = attachmentId.trim()
    if (id) parts.push({ type: 'media', attachment_id: id })
  }
  return linqPostMessageParts(chatId, parts)
}

function normaliseBrandInternalAccessHandle(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  if (s.toLowerCase().startsWith('mailto:')) {
    s = s.slice('mailto:'.length).trim()
  }
  if (s.includes('@')) {
    const t = s.toLowerCase()
    return ADMIN_EMAIL_RE.test(t) ? t : null
  }
  return normaliseToE164(s)
}

function normaliseInternalAdminPhoneList(raw: unknown, max = 24): string[] {
  const lines: string[] = []
  if (Array.isArray(raw)) {
    for (const x of raw) lines.push(String(x ?? ''))
  } else if (typeof raw === 'string') {
    for (const part of raw.split(/[\n,;]+/)) lines.push(part)
  } else return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const key = normaliseBrandInternalAccessHandle(line)
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= max) break
  }
  return out
}

/**
 * Normalise and validate the `lightspeed_settings` JSON blob before storing.
 * Mirrors the shape in website/src/pages/portal/constants.ts but is kept
 * inline here so the server-side API file has no frontend import dependency.
 */
function normaliseLightspeedSettingsForApi(raw: unknown): Record<string, unknown> {
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : fallback
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const wo = (r.workorder_lookup && typeof r.workorder_lookup === 'object' ? r.workorder_lookup : {}) as Record<string, unknown>
  const inv = (r.inventory_lookup && typeof r.inventory_lookup === 'object' ? r.inventory_lookup : {}) as Record<string, unknown>
  const px = (r.inventory_pricing && typeof r.inventory_pricing === 'object' ? r.inventory_pricing : {}) as Record<string, unknown>
  const bk = (r.booking && typeof r.booking === 'object' ? r.booking : {}) as Record<string, unknown>
  const hw = (r.handoff_workorder && typeof r.handoff_workorder === 'object' ? r.handoff_workorder : {}) as Record<string, unknown>
  return {
    workorder_lookup: {
      enabled: bool(wo.enabled, true),
      require_phone_match: bool(wo.require_phone_match, true),
      share_completed_price: bool(wo.share_completed_price, true),
    },
    inventory_lookup: {
      enabled: bool(inv.enabled, true),
      share_stock_quantity: bool(inv.share_stock_quantity, true),
      share_sku: bool(inv.share_sku, false),
    },
    inventory_pricing: {
      enabled: bool(px.enabled, true),
    },
    booking: {
      enabled: bool(bk.enabled, true),
      default_note:
        typeof bk.default_note === 'string' && bk.default_note.trim()
          ? bk.default_note.trim()
          : 'Booked in over Nest',
      require_drop_off_date: bool(bk.require_drop_off_date, true),
    },
    handoff_workorder: {
      enabled: bool(hw.enabled, false),
    },
  }
}


type TeamReportPresetKey =
  | 'opening_brief'
  | 'trade_pulse'
  | 'closing_wrap'
  | 'monday_team_plan'
  | 'weekly_owner_summary'
  | 'monthly_scorecard'

type TeamReportMetricKey =
  | 'sales_total_revenue'
  | 'sales_transactions'
  | 'sales_avg_sale'
  | 'sales_gross_profit'
  | 'sales_gross_margin'
  | 'sales_top_items'
  | 'workshop_open'
  | 'workshop_awaiting'
  | 'workshop_due_today'
  | 'workshop_due_this_week'
  | 'workshop_period_count'
  | 'workshop_backlog'
  | 'roster_shifts'
  | 'roster_people'
  | 'roster_hours'
  | 'roster_first_start'
  | 'roster_names'
  | 'timesheet_hours'

const PRESET_AVAILABLE_METRICS: Record<TeamReportPresetKey, TeamReportMetricKey[]> = {
  opening_brief: [
    'sales_total_revenue', 'sales_transactions', 'sales_avg_sale', 'sales_top_items',
    'workshop_open', 'workshop_awaiting', 'workshop_due_today',
    'roster_shifts', 'roster_people', 'roster_first_start', 'roster_names',
  ],
  trade_pulse: [
    'sales_total_revenue', 'sales_transactions', 'sales_avg_sale', 'sales_top_items',
    'workshop_due_today', 'workshop_open',
  ],
  closing_wrap: [
    'sales_total_revenue', 'sales_transactions', 'sales_avg_sale', 'sales_gross_margin', 'sales_top_items',
    'workshop_open', 'workshop_awaiting', 'workshop_due_today',
    'roster_shifts', 'roster_hours', 'roster_names',
  ],
  monday_team_plan: [
    'roster_shifts', 'roster_people', 'roster_hours', 'roster_names',
    'workshop_open', 'workshop_awaiting', 'workshop_due_this_week',
    'sales_total_revenue', 'sales_transactions',
  ],
  weekly_owner_summary: [
    'sales_total_revenue', 'sales_gross_profit', 'sales_gross_margin',
    'sales_transactions', 'sales_avg_sale', 'sales_top_items',
    'workshop_period_count', 'workshop_backlog',
    'timesheet_hours', 'roster_names',
  ],
  monthly_scorecard: [
    'sales_total_revenue', 'sales_gross_profit', 'sales_gross_margin',
    'sales_transactions', 'sales_avg_sale', 'sales_top_items',
    'workshop_period_count', 'timesheet_hours',
  ],
}

const TEAM_REPORT_DEFAULTS: Record<TeamReportPresetKey, {
  time_local: string
  weekdays: number[]
  weekday: number
  day_of_month: number
}> = {
  opening_brief: { time_local: '08:15', weekdays: [1, 2, 3, 4, 5, 6], weekday: 1, day_of_month: 1 },
  trade_pulse: { time_local: '13:00', weekdays: [1, 2, 3, 4, 5, 6], weekday: 1, day_of_month: 1 },
  closing_wrap: { time_local: '17:45', weekdays: [1, 2, 3, 4, 5, 6], weekday: 1, day_of_month: 1 },
  monday_team_plan: { time_local: '07:30', weekdays: [1], weekday: 1, day_of_month: 1 },
  weekly_owner_summary: { time_local: '18:00', weekdays: [0], weekday: 0, day_of_month: 1 },
  monthly_scorecard: { time_local: '08:30', weekdays: [1], weekday: 1, day_of_month: 1 },
}

function normaliseIncludedMetricsForApi(
  raw: unknown,
  presetKey: TeamReportPresetKey,
): Record<string, boolean> {
  const available = PRESET_AVAILABLE_METRICS[presetKey]
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: Record<string, boolean> = {}
  for (const metric of available) {
    const value = source[metric]
    out[metric] = typeof value === 'boolean' ? value : true
  }
  return out
}

function normaliseMobileRecipientList(raw: unknown, fallback: string[] = [], max = 12): string[] {
  const lines: string[] = []
  if (Array.isArray(raw)) {
    for (const x of raw) lines.push(String(x ?? ''))
  } else if (typeof raw === 'string') {
    for (const part of raw.split(/[\n,;]+/)) lines.push(part)
  } else {
    for (const item of fallback) lines.push(item)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const key = normaliseToE164(String(line ?? ''))
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= max) break
  }
  return out
}

function normaliseTimeLocal(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw) ? raw : fallback
}

function normaliseWeekdayArray(value: unknown, fallback: number[]): number[] {
  const source = Array.isArray(value) ? value : fallback
  const out: number[] = []
  const seen = new Set<number>()
  for (const item of source) {
    const n = Number(item)
    if (!Number.isInteger(n) || n < 0 || n > 6 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out.length > 0 ? out.sort((a, b) => a - b) : [...fallback]
}

const REPORTING_LINQ_CHAT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normaliseReportingDeliveryMode(value: unknown): 'dm' | 'group' {
  return value === 'group' ? 'group' : 'dm'
}

function normaliseReportingLinqGroupChatId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return REPORTING_LINQ_CHAT_ID_RE.test(s) ? s : null
}

function normaliseReportingGroupDisplayName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 120)
}

async function syncReportingGroupDisplayNamesAfterSave(brandKey: string): Promise<void> {
  const supabaseUrl = pickServerEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const edgeAuth = pickServerEnv([
    'INTERNAL_EDGE_SHARED_SECRET',
    'NEST_INTERNAL_EDGE_SHARED_SECRET',
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
  ])
  if (!supabaseUrl || !edgeAuth) return
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/brand-reporting-automation`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': edgeAuth,
      },
      body: JSON.stringify({ mode: 'sync_group_display_names', brandKey }),
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(20_000)
          : undefined,
    })
    if (!res.ok) {
      const t = await res.text()
      console.error('[brand-portal-config] sync_group_display_names', res.status, t.slice(0, 400))
    }
  } catch (e) {
    console.error('[brand-portal-config] sync_group_display_names', e)
  }
}

function normaliseReportingAutomationsForApi(raw: unknown, baseRecipients: string[] = []): Record<string, unknown> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return Object.entries(TEAM_REPORT_DEFAULTS).reduce<Record<string, unknown>>((acc, [key, defaults]) => {
    const row = source[key] && typeof source[key] === 'object'
      ? (source[key] as Record<string, unknown>)
      : {}
    acc[key] = {
      enabled: typeof row.enabled === 'boolean' ? row.enabled : false,
      time_local: normaliseTimeLocal(row.time_local, defaults.time_local),
      weekdays: normaliseWeekdayArray(row.weekdays, defaults.weekdays),
      weekday: Number.isInteger(Number(row.weekday)) && Number(row.weekday) >= 0 && Number(row.weekday) <= 6
        ? Number(row.weekday)
        : defaults.weekday,
      day_of_month: Number.isInteger(Number(row.day_of_month)) && Number(row.day_of_month) >= 1 && Number(row.day_of_month) <= 28
        ? Number(row.day_of_month)
        : defaults.day_of_month,
      delivery_mode: normaliseReportingDeliveryMode(row.delivery_mode),
      linq_group_chat_id: normaliseReportingLinqGroupChatId(row.linq_group_chat_id),
      group_chat_display_name: normaliseReportingGroupDisplayName(row.group_chat_display_name),
      recipient_mobile_e164s: normaliseMobileRecipientList(row.recipient_mobile_e164s, baseRecipients),
      included_metrics: normaliseIncludedMetricsForApi(row.included_metrics, key as TeamReportPresetKey),
    }
    return acc
  }, {})
}

const ALLOWED_TEXT_FIELDS = [
  'business_raw_prompt',
  'business_display_name',
  'opening_line',
  'business_timezone',
  'hours_text',
  'prices_text',
  'services_products_text',
  'policies_text',
  'contact_text',
  'booking_info_text',
  'extra_knowledge',
  'style_template',
  'style_notes',
  'topics_to_avoid',
  'escalation_text',
  'industry',
] as const

const RAW_PROMPT_SYNC_FIELDS = new Set<string>([
  'business_display_name',
  'opening_line',
  'business_timezone',
  'hours_text',
  'prices_text',
  'services_products_text',
  'policies_text',
  'contact_text',
  'booking_info_text',
  'extra_knowledge',
  'opening_schedule',
])

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const key = pickServerEnv([
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
    pickServerEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL']),
  )
  const hasKey = Boolean(pickServerEnv([
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

async function resolveSession(
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

function normalisePortalConfigRow(
  raw: Record<string, unknown> | null | undefined,
  brandKey: string,
): Record<string, unknown> {
  const config = { ...(raw ?? {}) }
  return {
    ...config,
    brand_key: typeof config.brand_key === 'string' && config.brand_key.trim() ? config.brand_key : brandKey,
    core_system_prompt: '',
    business_raw_prompt: typeof config.business_raw_prompt === 'string' ? config.business_raw_prompt : '',
    internal_admin_phone_e164s: Array.isArray(config.internal_admin_phone_e164s) ? config.internal_admin_phone_e164s : [],
    business_timezone: normaliseBusinessTimezone(
      typeof config.business_timezone === 'string' ? config.business_timezone : DEFAULT_BUSINESS_TIMEZONE,
    ),
    opening_schedule: normaliseOpeningSchedule(config.opening_schedule),
    voicemail_audio_url: typeof config.voicemail_audio_url === 'string' && config.voicemail_audio_url.trim()
      ? config.voicemail_audio_url.trim()
      : null,
    lightspeed_settings: normaliseLightspeedSettingsForApi(config.lightspeed_settings),
    reporting_automations: normaliseReportingAutomationsForApi(
      config.reporting_automations,
      Array.isArray(config.internal_admin_phone_e164s) ? normaliseMobileRecipientList(config.internal_admin_phone_e164s) : [],
    ),
    handoff_phone_e164:
      typeof config.handoff_phone_e164 === 'string' && config.handoff_phone_e164.trim()
        ? config.handoff_phone_e164.trim()
        : null,
  }
}

function shouldRebuildBusinessRawPrompt(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => RAW_PROMPT_SYNC_FIELDS.has(key))
}

function computeBusinessRawPrompt(config: Partial<BusinessRawPromptConfig>): string {
  return hasBusinessRawPromptSeedContent(config) ? buildBusinessViewPrompt(config) : ''
}

async function ensureBusinessRawPrompt(
  supabase: SupabaseClient,
  brandKey: string,
  raw: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  const config = normalisePortalConfigRow(raw, brandKey)
  const storedRawPrompt = typeof config.business_raw_prompt === 'string' ? config.business_raw_prompt.trim() : ''

  // DB is the source of truth. If there's already content, use it.
  if (storedRawPrompt) return config

  // DB row is empty — seed it. Prefer registry baseline (full rich content),
  // then fall back to generating from whatever structured fields exist.
  const generatedPrompt =
    getRegistryBusinessBaseline(brandKey) ||
    computeBusinessRawPrompt(config as Partial<BusinessRawPromptConfig>)
  if (!generatedPrompt) return config

  const { data, error } = await supabase
    .from('nest_brand_chat_config')
    .upsert(
      {
        brand_key: brandKey,
        business_raw_prompt: generatedPrompt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_key' },
    )
    .select('*')
    .single()

  if (error) {
    console.warn('[brand-portal-config] business_raw_prompt seed:', error.message)
    return { ...config, business_raw_prompt: generatedPrompt }
  }

  return normalisePortalConfigRow(data as Record<string, unknown> | null, brandKey)
}

// ─── Smart suggestions (inlined to stay under Vercel Hobby 12-function limit) ─────────────────

const SUGGESTION_CONFIG_FIELDS = [
  'business_display_name', 'opening_line', 'hours_text', 'prices_text',
  'services_products_text', 'booking_info_text', 'policies_text', 'contact_text',
  'extra_knowledge', 'style_notes', 'topics_to_avoid', 'escalation_text',
] as const

const SUGGESTION_FIELD_LABELS: Record<string, string> = {
  business_display_name: 'Business name', opening_line: 'Opening greeting',
  hours_text: 'Trading hours', prices_text: 'Prices & packages',
  services_products_text: 'Services & products', booking_info_text: 'Booking process',
  policies_text: 'Policies', contact_text: 'Contact details',
  extra_knowledge: 'Extra knowledge', style_notes: 'Brand voice notes',
  topics_to_avoid: 'Topics to avoid', escalation_text: 'Escalation rules',
}

async function buildSmartSuggestionsPayload(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<{ suggestions: { topic: string; starter: string; source: string; hint: string }[] }> {
  const openaiKey = pickServerEnv(['OPENAI_API_KEY', 'NEST_OPENAI_API_KEY'])
  if (!openaiKey) return { suggestions: [] }

  const [{ data: configRow }, recentMessages] = await Promise.all([
    supabase.from('nest_brand_chat_config').select('*').eq('brand_key', brandKey).maybeSingle(),
    (async () => {
      // Brand portal shows the full message history regardless of the 24h TTL.
      const nowIso = BRAND_PORTAL_TTL_FLOOR
      const { data: messages } = await supabase
        .from('conversation_messages').select('content')
        .eq('engagement_scope', 'brand')
        .eq('engagement_brand_key', brandKey)
        .eq('role', 'user')
        .gt('expires_at', nowIso)
        .not('handle', 'like', 'portal-test%')
        .order('created_at', { ascending: false }).limit(60)
      const seen = new Set<string>()
      const out: string[] = []
      for (const m of (messages ?? []) as { content: string }[]) {
        const norm = m.content.trim().toLowerCase().slice(0, 80)
        if (!norm || seen.has(norm)) continue
        seen.add(norm)
        out.push(m.content.trim().slice(0, 200))
        if (out.length >= 30) break
      }
      return out
    })(),
  ])

  const config = (configRow ?? {}) as Record<string, unknown>
  const businessName = typeof config.business_display_name === 'string' ? config.business_display_name.trim() : brandKey
  const filled: string[] = []
  const empty: string[] = []
  for (const field of SUGGESTION_CONFIG_FIELDS) {
    const val = config[field]
    const label = SUGGESTION_FIELD_LABELS[field] ?? field
    if (typeof val === 'string' && val.trim().length > 10) {
      filled.push(`${label}: ${val.trim().slice(0, 120)}${val.trim().length > 120 ? '…' : ''}`)
    } else {
      empty.push(label)
    }
  }

  const convoBlock = recentMessages.length > 0
    ? `Recent real customer messages (anonymised):\n${recentMessages.map((m) => `- "${m}"`).join('\n')}`
    : 'No recent customer conversations available yet.'

  const prompt = `You help business owners improve their AI chatbot by identifying what information is missing.

Business: ${businessName}

Already configured:\n${filled.length > 0 ? filled.map((f) => `- ${f}`).join('\n') : '(nothing yet)'}
Missing sections: ${empty.length > 0 ? empty.join(', ') : 'none'}

${convoBlock}

Generate exactly 5 suggestions for what the business owner should ADD. Each has:
- "topic": 2-4 word label shown as a chip (e.g. "Trading hours"). Title case, no punctuation.
- "starter": 5-8 word sentence opener they complete in the chat (e.g. "Our trading hours are "). Ends with a space.
- "source": "gap" for missing config sections, "conversation" for conversation-based gaps.
- "hint": 1-5 word reason (e.g. "Not yet configured").

Prioritise filling EMPTY sections. Do NOT write actual business content — just identify the topic and give a starter phrase.
Respond with valid JSON only: { "suggestions": [{ "topic": "...", "starter": "...", "source": "gap"|"conversation", "hint": "..." }] }`

  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      instructions: prompt,
      input: [{ role: 'user', content: 'Generate the 5 suggestions now.' }],
      text: {
        format: {
          type: 'json_schema', name: 'suggestions_response', strict: true,
          schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    topic: { type: 'string' }, starter: { type: 'string' },
                    source: { type: 'string', enum: ['gap', 'conversation'] }, hint: { type: 'string' },
                  },
                  required: ['topic', 'starter', 'source', 'hint'], additionalProperties: false,
                },
              },
            },
            required: ['suggestions'], additionalProperties: false,
          },
        },
      },
      store: false,
    }),
  })

  if (!openaiRes.ok) return { suggestions: [] }

  const data = await openaiRes.json() as Record<string, unknown>
  let rawContent = ''
  if (typeof data.output_text === 'string') {
    rawContent = data.output_text
  } else if (Array.isArray(data.output)) {
    for (const item of data.output as Record<string, unknown>[]) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const block of item.content as Record<string, unknown>[]) {
          if (block.type === 'output_text' && typeof block.text === 'string') { rawContent = block.text; break }
        }
        if (rawContent) break
      }
    }
  }

  if (!rawContent) return { suggestions: [] }

  try {
    const parsed = JSON.parse(rawContent) as { suggestions: { topic: string; starter: string; source: string; hint: string }[] }
    return {
      suggestions: (parsed.suggestions ?? [])
        .filter((s) => typeof s.topic === 'string' && s.topic.trim())
        .slice(0, 5)
        .map((s) => ({
          topic: s.topic.trim(),
          starter: typeof s.starter === 'string' ? s.starter : s.topic,
          source: s.source === 'conversation' ? 'conversation' : 'gap',
          hint: typeof s.hint === 'string' ? s.hint.trim() : '',
        })),
    }
  } catch {
    return { suggestions: [] }
  }
}

// ─── Conversations (same response as legacy `/api/brand-portal-conversations`; inlined to avoid
// subpath resolution issues in `vercel dev` / serverless bundling. ─────────────────────────────

type ConversationRow = {
  id: number
  chat_id: string
  role: string
  content: string
  handle: string | null
  created_at: string
  provider_message_id?: string | null
  metadata?: Record<string, unknown> | null
  engagement_scope?: 'nest' | 'brand'
  engagement_brand_key?: string | null
}

type LightspeedCustomerSuggestion = {
  name: string
  phone: string
}

type UserProfileRow = {
  handle: string
  name: string | null
  last_seen: number | null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function previewText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s*---\s*/g, ' ').trim().slice(0, 180)
}

function isManualPortalRow(row: ConversationRow): boolean {
  const metadata = row.metadata ?? {}
  const source = typeof metadata.source === 'string' ? metadata.source : ''
  const service = typeof metadata.service === 'string' ? metadata.service : ''
  const senderKind = typeof metadata.sender_kind === 'string' ? metadata.sender_kind : ''
  return (
    row.handle?.startsWith('staff@') === true ||
    senderKind === 'staff' ||
    source.startsWith('brand_portal_') ||
    service.startsWith('brand_portal_')
  )
}

function extractParticipantHandle(chatId: string, rows: ConversationRow[]): string | null {
  for (const row of rows) {
    if (row.role === 'user' && row.handle) return row.handle
  }
  for (const row of rows) {
    const recipient = row.metadata?.recipient_phone_e164
    if (typeof recipient === 'string' && recipient.trim()) return recipient.trim()
  }
  const dmMatch = chatId.match(/^DM#[^#]+#(.+)$/)
  if (dmMatch?.[1]) return dmMatch[1]
  return null
}

function extractParticipantName(rows: ConversationRow[]): string | null {
  for (const row of rows) {
    const name = row.metadata?.customer_name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return null
}

function titleForConversation(displayName: string | null, participantHandle: string | null, chatId: string): string {
  if (displayName?.trim()) return displayName.trim()
  if (participantHandle?.trim()) {
    if (participantHandle.startsWith('portal-test@')) return 'Portal test'
    if (participantHandle.startsWith('portal-sim@')) return 'Portal simulation'
    return participantHandle.trim()
  }
  if (chatId.startsWith('portal-test#')) return 'Portal test'
  if (chatId.startsWith('portal-sim#')) return 'Portal simulation'
  return chatId
}

function lightspeedCustomerName(row: Record<string, unknown>): string {
  const firstName = typeof row.firstName === 'string' ? row.firstName.trim() : ''
  const lastName = typeof row.lastName === 'string' ? row.lastName.trim() : ''
  return [firstName, lastName].filter(Boolean).join(' ').trim()
}

function lightspeedCustomerPhones(row: Record<string, unknown>): string[] {
  const contact = row.Contact && typeof row.Contact === 'object' ? row.Contact as Record<string, unknown> : {}
  const phonesNode = contact.Phones && typeof contact.Phones === 'object'
    ? (contact.Phones as Record<string, unknown>).ContactPhone ?? contact.Phones
    : null
  const phones = Array.isArray(phonesNode) ? phonesNode : phonesNode && typeof phonesNode === 'object' ? [phonesNode] : []
  const out: string[] = []
  for (const phoneRow of phones as Array<Record<string, unknown>>) {
    const rawPhone = typeof phoneRow.number === 'string' ? phoneRow.number : ''
    const phone = normaliseToE164(rawPhone)
    if (phone) out.push(phone)
  }
  return out
}

function nextLightspeedPath(nextUrl: unknown, accountId: string): string | null {
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

async function fetchLightspeedNamesByPhone(
  supabase: SupabaseClient,
  brandKey: string,
  phones: string[],
): Promise<Map<string, string>> {
  const candidates = [...new Set(phones.map((p) => normaliseToE164(p) ?? p.trim()).filter(Boolean))]
  if (candidates.length === 0) return new Map()
  const access = await getLightspeedAccess(supabase, brandKey).catch((err) => {
    console.warn('[brand-portal-config] lightspeed names access:', err instanceof Error ? err.message : String(err))
    return null
  })
  if (!access) return new Map()
  const wanted = new Set(candidates)
  const out = new Map<string, string>()
  const relations = encodeURIComponent(JSON.stringify(['Contact']))
  let path: string | null = `Customer.json?limit=100&load_relations=${relations}&sort=customerID`
  let pages = 0
  while (path && pages < 12 && out.size < wanted.size) {
    pages += 1
    const data = await lightspeedGetJson(access.accessToken, access.accountId, path).catch((err) => {
      console.warn('[brand-portal-config] lightspeed names API:', err instanceof Error ? err.message : String(err))
      return null
    })
    if (!data) break
    const raw = data.Customer
    const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
    for (const row of rows as Array<Record<string, unknown>>) {
      const name = lightspeedCustomerName(row)
      if (!name) continue
      for (const phone of lightspeedCustomerPhones(row)) {
        if (wanted.has(phone) && !out.has(phone)) out.set(phone, name)
      }
    }
    path = nextLightspeedPath((data['@attributes'] as Record<string, unknown> | undefined)?.next, access.accountId)
  }
  return out
}

async function searchLightspeedCustomers(
  supabase: SupabaseClient,
  brandKey: string,
  query: string,
): Promise<LightspeedCustomerSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const access = await getLightspeedAccess(supabase, brandKey)
  if (!access) return []
  const safe = q.replace(/[%]/g, '').trim()
  if (safe.length < 2) return []
  const encodedLike = encodeURIComponent(`~,%${safe}%`)
  const relations = encodeURIComponent(JSON.stringify(['Contact']))
  const paths = [
    `Customer.json?limit=20&load_relations=${relations}&lastName=${encodedLike}`,
    `Customer.json?limit=20&load_relations=${relations}&firstName=${encodedLike}`,
  ]

  const results = await Promise.allSettled(
    paths.map((path) => lightspeedGetJson(access.accessToken, access.accountId, path)),
  )
  const seen = new Set<string>()
  const out: LightspeedCustomerSuggestion[] = []
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[brand-portal-config] lightspeed customer API search:', result.reason instanceof Error ? result.reason.message : String(result.reason))
      continue
    }
    const raw = result.value.Customer
    const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
    for (const row of rows as Array<Record<string, unknown>>) {
      const name = lightspeedCustomerName(row)
      for (const p of lightspeedCustomerPhones(row)) {
        if (!p || !name || seen.has(p)) continue
        seen.add(p)
        out.push({ name, phone: p })
      }
      if (out.length >= 8) return out
    }
  }
  return out
}

function normaliseBrandKey(brandKey: string): string {
  return brandKey.trim().toLowerCase()
}

type ExistingHumanModeRow = {
  id: string
  chat_id: string
  brand_key: string
  released_at: string | null
}

async function activatePortalHumanMode(
  supabase: SupabaseClient,
  params: {
    chatId: string
    recipientHandle: string
    botNumber: string
    brandKey: string
    source: 'brand_portal_manual_reply' | 'brand_portal_start_message'
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await assertPortalHumanModeAvailable(supabase, {
    recipientHandle: params.recipientHandle,
    botNumber: params.botNumber,
    brandKey: params.brandKey,
  })

  const now = new Date().toISOString()
  const brandKey = normaliseBrandKey(params.brandKey)
  const payload = {
    chat_id: params.chatId,
    recipient_handle: params.recipientHandle,
    bot_number: params.botNumber,
    brand_key: brandKey,
    source: params.source,
    activated_by: `staff@${brandKey}`,
    activated_at: now,
    last_staff_message_at: now,
    released_at: null,
    released_reason: null,
    release_route: null,
    release_brand_key: null,
    metadata: params.metadata ?? {},
  }

  const [chatLookup, recipientLookup] = await Promise.all([
    supabase
      .from('linq_human_mode_threads')
      .select('id, chat_id, brand_key, released_at')
      .eq('chat_id', params.chatId)
      .maybeSingle<ExistingHumanModeRow>(),
    supabase
      .from('linq_human_mode_threads')
      .select('id, chat_id, brand_key, released_at')
      .eq('recipient_handle', params.recipientHandle)
      .eq('bot_number', params.botNumber)
      .maybeSingle<ExistingHumanModeRow>(),
  ])

  if (chatLookup.error) {
    throw new Error(`Could not activate human-only mode: ${chatLookup.error.message}`)
  }
  if (recipientLookup.error) {
    throw new Error(`Could not activate human-only mode: ${recipientLookup.error.message}`)
  }

  const existingByChat = chatLookup.data ?? null
  const existingByRecipient = recipientLookup.data ?? null

  if (
    existingByRecipient?.released_at == null &&
    existingByRecipient?.brand_key &&
    normaliseBrandKey(existingByRecipient.brand_key) !== brandKey
  ) {
    throw new Error('This recipient is already in human-only mode for another brand.')
  }

  if (
    existingByChat?.id &&
    existingByRecipient?.id &&
    existingByChat.id !== existingByRecipient.id
  ) {
    if (existingByRecipient.released_at == null) {
      throw new Error('This recipient is already in human-only mode for another chat.')
    }

    const { error } = await supabase
      .from('linq_human_mode_threads')
      .delete()
      .eq('id', existingByRecipient.id)
    if (error) throw new Error(`Could not activate human-only mode: ${error.message}`)
  }

  const existing = existingByChat ?? existingByRecipient
  if (existing?.id) {
    const { error } = await supabase
      .from('linq_human_mode_threads')
      .update(payload)
      .eq('id', existing.id)
    if (error) throw new Error(`Could not activate human-only mode: ${error.message}`)
    return
  }

  const { error } = await supabase.from('linq_human_mode_threads').insert(payload)
  if (error) throw new Error(`Could not activate human-only mode: ${error.message}`)
}

async function assertPortalHumanModeAvailable(
  supabase: SupabaseClient,
  params: { recipientHandle: string; botNumber: string; brandKey: string },
): Promise<void> {
  const brandKey = normaliseBrandKey(params.brandKey)
  const { data: active, error: activeError } = await supabase
    .from('linq_human_mode_threads')
    .select('brand_key')
    .eq('recipient_handle', params.recipientHandle)
    .eq('bot_number', params.botNumber)
    .is('released_at', null)
    .maybeSingle<{ brand_key: string }>()

  if (activeError) throw new Error(`Could not check human-only mode: ${activeError.message}`)
  if (active?.brand_key && normaliseBrandKey(active.brand_key) !== brandKey) {
    throw new Error('This recipient is already in human-only mode for another brand.')
  }
}

async function enforceStartMessageRateLimit(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('outbound_messages')
    .select('id', { count: 'exact', head: true })
    .filter('payload->>source', 'eq', 'brand_portal_start_message')
    .filter('payload->>brandKey', 'eq', normaliseBrandKey(brandKey))
    .gte('created_at', since)

  if (error) throw new Error(`Could not check send limit: ${error.message}`)
  if ((count ?? 0) >= 20) {
    throw new Error('Hourly new-message limit reached for this business. Try again later.')
  }
}

async function logPortalOutboundMessage(
  supabase: SupabaseClient,
  params: {
    chatId: string
    content: string
    providerMessageId: string | null
    brandKey: string
    recipientHandle: string
    source: 'brand_portal_manual_reply' | 'brand_portal_start_message'
  },
): Promise<void> {
  const { error } = await supabase
    .from('outbound_messages')
    .insert({
      chat_id: params.chatId,
      kind: 'text',
      payload: {
        text: params.content,
        source: params.source,
        brandKey: normaliseBrandKey(params.brandKey),
        recipientHandle: params.recipientHandle,
      },
      status: 'sent',
      provider_message_id: params.providerMessageId,
      sent_at: new Date().toISOString(),
    })

  if (error) {
    console.warn('[brand-portal-config] outbound log:', error.message)
  }
}

function isPortalHarnessChat(chatId: string): boolean {
  return chatId.startsWith('portal-test#') || chatId.startsWith('portal-sim#') || chatId.startsWith('portal-quick#')
}

function isPortalHarnessRow(row: ConversationRow, brandKey: string): boolean {
  const handle = row.handle?.trim().toLowerCase()
  const bk = normaliseBrandKey(brandKey)
  return handle === `portal-test@${bk}` || handle === `portal-sim@${bk}` || isPortalHarnessChat(row.chat_id)
}

function isBrandScopedRow(row: ConversationRow, brandKey: string): boolean {
  return row.engagement_scope === 'brand' && row.engagement_brand_key === normaliseBrandKey(brandKey)
}

function isTwilioWelcomeRow(row: ConversationRow, brandKey: string): boolean {
  const metadata = row.metadata ?? {}
  return (
    row.role === 'assistant' &&
    metadata.source === 'twilio-voice-webhook' &&
    metadata.welcomeBrandKey === normaliseBrandKey(brandKey)
  )
}

function filterRowsForBrandPortalConversation(
  chatId: string,
  rows: ConversationRow[],
  brandKey: string,
): ConversationRow[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  if (isPortalHarnessChat(chatId)) {
    return sorted.filter((row) => isPortalHarnessRow(row, brandKey))
  }

  const anchorRows = sorted.filter((row) => isBrandScopedRow(row, brandKey) || isTwilioWelcomeRow(row, brandKey))
  if (anchorRows.length === 0) return []
  return anchorRows
}

type PortalChatListItem = {
  chatId: string
  title: string
  displayName: string | null
  participantHandle: string | null
  preview: string
  previewRole: string
  lastMessageAt: string
  lastCustomerMessageAt: string | null
  hasManualMessages?: boolean
  latestManualMessageAt?: string | null
  source: 'customer' | 'portal_test'
  nestMessageCount?: number
  userMessageCount?: number
  connectionsUsed?: string[]
}

type ChatAggregate = {
  nest: number
  user: number
  connections: string[]
}

/** Map raw tool names from `metadata.tools_used[*].tool` to the friendly "connection" label shown in the brand portal. Returns null for tools that aren't surfaced as connections. */
function mapToolToConnectionLabel(tool: string): string | null {
  if (!tool) return null
  if (
    tool === 'brand_customer_lookup' ||
    tool === 'brand_inventory_lookup' ||
    tool === 'brand_workorder_lookup' ||
    tool === 'brand_sales_lookup' ||
    tool.startsWith('brand_lightspeed')
  ) {
    return 'Lightspeed'
  }
  if (tool.startsWith('brand_deputy')) return 'Deputy'
  if (tool.startsWith('brand_booking')) return 'Bookings'
  if (tool === 'calendar_read' || tool === 'calendar_write') return 'Calendar'
  if (tool === 'web_search') return 'Web search'
  if (tool === 'travel_time') return 'Travel time'
  return null
}

async function fetchChatAggregates(
  supabase: SupabaseClient,
  chatIds: string[],
  brandKey: string,
  nowIso: string,
): Promise<Map<string, ChatAggregate>> {
  if (chatIds.length === 0) return new Map()

  const buckets = new Map<string, { nest: number; user: number; connections: Set<string> }>()

  const allRows = await fetchConversationRows(supabase, chatIds, nowIso, brandKey)
  const rowsByChat = new Map<string, ConversationRow[]>()
  for (const row of allRows) {
    const bucket = rowsByChat.get(row.chat_id) ?? []
    bucket.push(row)
    rowsByChat.set(row.chat_id, bucket)
  }

  for (const chatId of chatIds) {
    const rows = filterRowsForBrandPortalConversation(chatId, rowsByChat.get(chatId) ?? [], brandKey)
    const bucket = { nest: 0, user: 0, connections: new Set<string>() }
    for (const row of rows) {
      if (row.role === 'assistant') bucket.nest += 1
      else if (row.role === 'user') bucket.user += 1

      const tools = (row.metadata as { tools_used?: Array<{ tool?: unknown }> } | null)?.tools_used
      if (Array.isArray(tools)) {
        for (const entry of tools) {
          const toolName = typeof entry?.tool === 'string' ? entry.tool : ''
          const label = mapToolToConnectionLabel(toolName)
          if (label) bucket.connections.add(label)
        }
      }
    }
    buckets.set(chatId, bucket)
  }

  const out = new Map<string, ChatAggregate>()
  for (const [chatId, agg] of buckets) {
    out.set(chatId, {
      nest: agg.nest,
      user: agg.user,
      connections: [...agg.connections].sort(),
    })
  }
  return out
}

async function fetchChatsAndProfilesForPortal(
  supabase: SupabaseClient,
  session: { brandKey: string },
  nowIso: string,
): Promise<{ chats: PortalChatListItem[]; profilesByHandle: Map<string, UserProfileRow> }> {
  // Use the JS path rather than `nest_brand_portal_conversation_list`: mixed chats can contain
  // both normal Nest rows and brand rows, and the RPC cannot split those into explicit brand
  // segments. The portal must never surface normal Nest history in a business inbox.

  const portalTestHandle = `portal-test@${session.brandKey}`
  const [{ data: brandRows, error: brandRowsError }, { data: portalTestRows, error: portalTestError }, { data: twilioRows, error: twilioRowsError }] =
    await Promise.all([
      supabase
        .from('conversation_messages')
        .select('id, chat_id, role, content, handle, created_at, metadata, engagement_scope, engagement_brand_key')
        .eq('engagement_scope', 'brand')
        .eq('engagement_brand_key', session.brandKey)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1200),
      supabase
        .from('conversation_messages')
        .select('id, chat_id, role, content, handle, created_at, metadata')
        .eq('handle', portalTestHandle)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('outbound_messages')
        .select('chat_id, payload, created_at')
        .filter('payload->>source', 'eq', 'twilio-voice-webhook')
        .filter('payload->>brandKey', 'eq', session.brandKey)
        .order('created_at', { ascending: false })
        .limit(500),
    ])

  if (brandRowsError) {
    throw new Error(brandRowsError.message)
  }
  if (portalTestError) {
    throw new Error(portalTestError.message)
  }
  if (twilioRowsError) {
    throw new Error(twilioRowsError.message)
  }

  const portalTestChatIds = new Set(((portalTestRows ?? []) as ConversationRow[]).map((row) => row.chat_id))
  const twilioCallerByChat = new Map<string, string>()
  for (const row of (twilioRows ?? []) as Array<{ chat_id: string; payload: Record<string, unknown> | null }>) {
    const caller = typeof row.payload?.callerE164 === 'string' ? row.payload.callerE164.trim() : ''
    if (row.chat_id && caller && !twilioCallerByChat.has(row.chat_id)) twilioCallerByChat.set(row.chat_id, caller)
  }
  const allowedChatIds = Array.from(
    new Set([
      ...((brandRows ?? []) as ConversationRow[]).map((row) => row.chat_id),
      ...portalTestChatIds,
      ...twilioCallerByChat.keys(),
    ]),
  )

  if (allowedChatIds.length === 0) {
    return { chats: [], profilesByHandle: new Map() }
  }

  const allRows = await fetchConversationRows(supabase, allowedChatIds, nowIso, session.brandKey)
  const rowsByChat = new Map<string, ConversationRow[]>()
  for (const row of allRows) {
    const bucket = rowsByChat.get(row.chat_id) ?? []
    bucket.push(row)
    rowsByChat.set(row.chat_id, bucket)
  }

  const handles = new Set<string>()
  for (const chatId of allowedChatIds) {
    const participantHandle = extractParticipantHandle(chatId, rowsByChat.get(chatId) ?? [])
    if (participantHandle && !participantHandle.startsWith('portal-test@')) handles.add(participantHandle)
  }
  const profilesByHandle = await fetchUserProfiles(supabase, [...handles])
  const lightspeedNamesByPhone = await fetchLightspeedNamesByPhone(supabase, session.brandKey, [...handles])

  const chats = allowedChatIds
    .map((chatId) => {
      const rows = filterRowsForBrandPortalConversation(
        chatId,
        rowsByChat.get(chatId) ?? [],
        session.brandKey,
      ).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      const latest = rows[0]
      if (!latest) return null

      let lastCustomerMessageAt: string | null = null
      let latestManualMessageAt: string | null = null
      let hasManualMessages = false
      for (const row of rows) {
        if (row.role === 'user') {
          lastCustomerMessageAt = row.created_at
          break
        }
      }
      for (const row of rows) {
        if (isManualPortalRow(row)) {
          hasManualMessages = true
          latestManualMessageAt = row.created_at
          break
        }
      }

      const participantHandle = extractParticipantHandle(chatId, rows)
        ?? twilioCallerByChat.get(chatId)
        ?? null
      const profile = participantHandle ? profilesByHandle.get(participantHandle) ?? null : null
      const metadataName = extractParticipantName(rows)
      const displayName = profile?.name ?? metadataName ?? (participantHandle ? lightspeedNamesByPhone.get(participantHandle) ?? null : null)
      const source: 'customer' | 'portal_test' = portalTestChatIds.has(chatId) ? 'portal_test' : 'customer'

      return {
        chatId,
        title: titleForConversation(displayName, participantHandle, chatId),
        displayName,
        participantHandle,
        preview: previewText(latest.content ?? ''),
        previewRole: latest.role,
        lastMessageAt: latest.created_at,
        lastCustomerMessageAt,
        hasManualMessages,
        latestManualMessageAt,
        source,
      }
    })
    .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat))
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

  return { chats, profilesByHandle }
}

async function isChatAllowedForBrandPortal(
  supabase: SupabaseClient,
  brandKey: string,
  chatId: string,
  nowIso: string,
): Promise<boolean> {
  if (chatId.startsWith(`portal-test#${brandKey}`)) return true
  if (chatId.startsWith(`portal-sim#${brandKey}`)) return true
  const portalHandle = `portal-test@${brandKey}`
  const [{ data: brandProbe }, { data: portalProbe }] = await Promise.all([
    supabase
      .from('conversation_messages')
      .select('id')
      .eq('chat_id', chatId)
      .eq('engagement_scope', 'brand')
      .eq('engagement_brand_key', brandKey)
      .gt('expires_at', nowIso)
      .limit(1),
    supabase
      .from('conversation_messages')
      .select('id')
      .eq('chat_id', chatId)
      .eq('handle', portalHandle)
      .gt('expires_at', nowIso)
      .limit(1),
  ])
  if ((brandProbe?.length ?? 0) > 0) return true
  return (portalProbe?.length ?? 0) > 0
}

function rowNeedsLinqMediaLookup(row: ConversationRow): boolean {
  if (row.role !== 'user') return false
  const images = Array.isArray(row.metadata?.images) ? row.metadata.images : []
  if (images.length > 0) return false
  const trimmed = (row.content ?? '').trim()
  return SYNTHETIC_INBOUND_PLACEHOLDER.test(trimmed) || trimmed.length === 0
}

function linqMessageHandle(message: LinqChatMessage): string {
  const handle = message.from_handle?.handle
  return typeof handle === 'string' ? handle.trim() : ''
}

function linqMessageTimeMs(message: LinqChatMessage): number {
  const ms = new Date(message.created_at).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function rowTimeMs(row: ConversationRow): number {
  const ms = new Date(row.created_at).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function linqMessageText(message: LinqChatMessage): string {
  if (!Array.isArray(message.parts)) return ''
  return message.parts
    .filter(
      (part): part is Record<string, unknown> =>
        !!part && typeof part === 'object' && (part as { type?: unknown }).type === 'text',
    )
    .map((part) => (typeof part.value === 'string' ? part.value : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function mapLinqImages(message: LinqChatMessage): unknown[] {
  return extractImageAttachmentsFromLinqParts(message.parts).map((item) => ({
    attachmentId: item.attachmentId,
    attachment_id: item.attachmentId,
    mimeType: item.mimeType,
    mime_type: item.mimeType,
    filename: item.filename,
    url: item.url,
  }))
}

function knownProviderMessageIds(rows: ConversationRow[]): Set<string> {
  const ids = new Set<string>()
  for (const row of rows) {
    const fromColumn = row.provider_message_id?.trim()
    if (fromColumn) ids.add(fromColumn)
    const fromMeta = row.metadata?.linq_provider_message_id
    if (typeof fromMeta === 'string' && fromMeta.trim()) ids.add(fromMeta.trim())
  }
  return ids
}

function syntheticLinqRowId(providerMessageId: string): number {
  let hash = 0
  for (let i = 0; i < providerMessageId.length; i += 1) {
    hash = (hash * 31 + providerMessageId.charCodeAt(i)) | 0
  }
  // Negative so it never collides with real conversation_messages ids.
  return hash === 0 ? -1 : -Math.abs(hash)
}

/**
 * Human-mode inbound (especially image-only) can land in Linq without ever being
 * written to conversation_messages. Merge those missing messages into the thread
 * and persist them so the Nest inbox / chat list stay complete.
 */
async function enrichRowsWithLinqAttachments(
  supabase: SupabaseClient,
  chatId: string,
  brandKey: string,
  rows: ConversationRow[],
): Promise<ConversationRow[]> {
  if (!pickServerEnv(['LINQ_API_TOKEN'])) return rows

  const linqMessages = await fetchLinqChatMessages(chatId)
  if (linqMessages.length === 0) return rows

  const knownIds = knownProviderMessageIds(rows)
  const inboundMediaByProviderId = new Map<string, unknown[]>()
  const inboundMediaByHandleTime: Array<{
    handle: string
    createdAtMs: number
    images: unknown[]
  }> = []
  const missingInbound: LinqChatMessage[] = []

  for (const message of linqMessages) {
    if (message.is_from_me) continue

    const images = mapLinqImages(message)
    if (images.length > 0) {
      inboundMediaByProviderId.set(message.id, images)
      const handle = linqMessageHandle(message)
      if (handle) {
        inboundMediaByHandleTime.push({
          handle,
          createdAtMs: linqMessageTimeMs(message),
          images,
        })
      }
    }

    if (!knownIds.has(message.id)) {
      missingInbound.push(message)
    }
  }

  const merged: ConversationRow[] = [...rows]

  if (missingInbound.length > 0) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const inserts = missingInbound.map((message) => {
      const images = mapLinqImages(message)
      const text = linqMessageText(message)
      const handle = linqMessageHandle(message) || null
      return {
        chat_id: chatId,
        role: 'user' as const,
        content: text,
        handle,
        engagement_scope: 'brand' as const,
        engagement_brand_key: brandKey,
        provider_message_id: message.id,
        created_at: message.created_at,
        expires_at: expiresAt,
        metadata: {
          source: 'linq_human_mode_backfill',
          service: 'linq_human_mode_backfill',
          linq_provider_message_id: message.id,
          linq_human_mode: true,
          ...(images.length > 0 ? { images } : {}),
        },
      }
    })

    const { data: inserted, error: insertError } = await supabase
      .from('conversation_messages')
      .insert(inserts)
      .select(
        'id, chat_id, role, content, handle, created_at, provider_message_id, metadata, engagement_scope, engagement_brand_key',
      )

    if (insertError) {
      console.error('[brand-portal] linq inbound backfill insert failed:', insertError.message)
      // Still surface in the API response even if persistence failed.
      for (const message of missingInbound) {
        const images = mapLinqImages(message)
        merged.push({
          id: syntheticLinqRowId(message.id),
          chat_id: chatId,
          role: 'user',
          content: linqMessageText(message),
          handle: linqMessageHandle(message) || null,
          created_at: message.created_at,
          provider_message_id: message.id,
          engagement_scope: 'brand',
          engagement_brand_key: brandKey,
          metadata: {
            source: 'linq_human_mode_backfill',
            service: 'linq_human_mode_backfill',
            linq_provider_message_id: message.id,
            linq_human_mode: true,
            ...(images.length > 0 ? { images } : {}),
          },
        })
      }
    } else if (inserted && inserted.length > 0) {
      merged.push(...(inserted as ConversationRow[]))
    }
  }

  if (inboundMediaByProviderId.size === 0) {
    return merged.sort((a, b) => rowTimeMs(a) - rowTimeMs(b))
  }

  const enriched = merged.map((row) => {
    if (!rowNeedsLinqMediaLookup(row)) return row

    const providerId = row.provider_message_id?.trim() ?? ''
    let images = providerId ? inboundMediaByProviderId.get(providerId) : undefined

    if (!images || images.length === 0) {
      const metaId =
        typeof row.metadata?.linq_provider_message_id === 'string'
          ? row.metadata.linq_provider_message_id.trim()
          : ''
      if (metaId) images = inboundMediaByProviderId.get(metaId)
    }

    if (!images || images.length === 0) {
      const handle = row.handle?.trim() ?? ''
      const rowMs = rowTimeMs(row)
      let best: { delta: number; images: unknown[] } | null = null
      for (const candidate of inboundMediaByHandleTime) {
        if (handle && candidate.handle !== handle) continue
        const delta = Math.abs(candidate.createdAtMs - rowMs)
        if (delta > 120_000) continue
        if (!best || delta < best.delta) best = { delta, images: candidate.images }
      }
      images = best?.images
    }

    if (!images || images.length === 0) return row

    return {
      ...row,
      metadata: {
        ...(row.metadata ?? {}),
        images,
      },
    }
  })

  return enriched.sort((a, b) => rowTimeMs(a) - rowTimeMs(b))
}

async function buildConversationRecord(
  supabase: SupabaseClient,
  brandKey: string,
  chatId: string,
  selectedRows: ConversationRow[],
  profilesByHandle: Map<string, UserProfileRow>,
  selectedChat: PortalChatListItem | null,
  pendingImagesBySender: Map<string, unknown[]> = new Map(),
): Promise<Record<string, unknown>> {
  const enrichedRows = await enrichRowsWithLinqAttachments(
    supabase,
    chatId,
    brandKey,
    selectedRows,
  )
  const participantHandle = extractParticipantHandle(chatId, enrichedRows)
  const profile = participantHandle ? profilesByHandle.get(participantHandle) ?? null : null
  const metadataName = extractParticipantName(enrichedRows)

  return {
    chatId,
    title: selectedChat?.title ?? titleForConversation(profile?.name ?? metadataName ?? null, participantHandle, chatId),
    displayName: profile?.name ?? metadataName ?? selectedChat?.displayName ?? null,
    participantHandle,
    source: selectedChat?.source ?? (chatId.startsWith('portal-test#') || chatId.startsWith('portal-sim#') ? 'portal_test' : 'customer'),
    lastSeen: profile?.last_seen ?? null,
    messages: enrichedRows.map((row) => sanitisePortalMessageRow(row, pendingImagesBySender)),
  }
}

const SYNTHETIC_INBOUND_PLACEHOLDER = /^what'?s in this image\??$/i

function sanitisePortalMessageRow(
  row: ConversationRow,
  pendingImagesBySender: Map<string, unknown[]>,
): {
  id: number
  role: string
  content: string
  handle: string | null
  createdAt: string
  metadata: Record<string, unknown>
} {
  const metadata: Record<string, unknown> = { ...(row.metadata ?? {}) }
  let content = row.content ?? ''

  const existingImages = Array.isArray(metadata.images) ? metadata.images : []
  const senderHandle = row.handle ?? ''
  const pendingImages = pendingImagesBySender.get(senderHandle) ?? []
  const isSyntheticPlaceholder = SYNTHETIC_INBOUND_PLACEHOLDER.test(content.trim())

  if (
    row.role === 'user' &&
    existingImages.length === 0 &&
    pendingImages.length > 0 &&
    (isSyntheticPlaceholder || !content.trim())
  ) {
    metadata.images = pendingImages
  }

  const images = Array.isArray(metadata.images) ? metadata.images : []
  const trimmed = content.trim()

  if (SYNTHETIC_INBOUND_PLACEHOLDER.test(trimmed)) {
    content = images.length > 0
      ? images
          .map((item) =>
            item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string'
              ? (item as { url: string }).url
              : '',
          )
          .filter(Boolean)
          .join('\n')
      : ''
  }

  const providerMessageId =
    typeof row.provider_message_id === 'string' ? row.provider_message_id.trim() : ''
  if (providerMessageId) {
    metadata.linq_provider_message_id = providerMessageId
    if (typeof metadata.provider_message_id !== 'string' || !metadata.provider_message_id.trim()) {
      metadata.provider_message_id = providerMessageId
    }
  }

  return {
    id: row.id,
    role: row.role,
    content,
    handle: row.handle,
    createdAt: row.created_at,
    metadata,
  }
}

async function loadPendingInboundImagesBySender(
  supabase: SupabaseClient,
  chatId: string,
  _nowIso: string,
): Promise<Map<string, unknown[]>> {
  // Brand portal bypasses the 24h message TTL — keep pending image URLs for inbox display too.
  const { data, error } = await supabase
    .from('pending_inbound_images')
    .select('sender_handle, images, expires_at')
    .eq('chat_id', chatId)

  if (error) {
    console.error('[brand-portal] pending inbound images load failed:', error.message)
    return new Map()
  }

  const map = new Map<string, unknown[]>()
  for (const row of data ?? []) {
    const handle = typeof row.sender_handle === 'string' ? row.sender_handle : ''
    if (!handle || !Array.isArray(row.images) || row.images.length === 0) continue
    map.set(handle, row.images)
  }
  return map
}

async function fetchConversationRows(
  supabase: SupabaseClient,
  chatIds: string[],
  nowIso: string,
  brandKey: string,
): Promise<ConversationRow[]> {
  const parts = await Promise.all(
    chunk(chatIds, 25).map(async (ids) => {
      const portalTestHandle = `portal-test@${brandKey}`
      const portalSimHandle = `portal-sim@${brandKey}`
      const select = 'id, chat_id, role, content, handle, created_at, provider_message_id, metadata, engagement_scope, engagement_brand_key'

      const [{ data: brandData, error: brandError }, { data: portalData, error: portalError }, { data: twilioData, error: twilioError }] =
        await Promise.all([
          supabase
            .from('conversation_messages')
            .select(select)
            .in('chat_id', ids)
            .eq('engagement_scope', 'brand')
            .eq('engagement_brand_key', brandKey)
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: true })
            .limit(Math.max(5000, ids.length * 250)),
          supabase
            .from('conversation_messages')
            .select(select)
            .in('chat_id', ids)
            .in('handle', [portalTestHandle, portalSimHandle])
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: true })
            .limit(Math.max(1000, ids.length * 100)),
          supabase
            .from('conversation_messages')
            .select(select)
            .in('chat_id', ids)
            .filter('metadata->>source', 'eq', 'twilio-voice-webhook')
            .filter('metadata->>welcomeBrandKey', 'eq', brandKey)
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: true })
            .limit(Math.max(1000, ids.length * 100)),
        ])

      if (brandError) throw new Error(brandError.message)
      if (portalError) throw new Error(portalError.message)
      if (twilioError) throw new Error(twilioError.message)

      const scopedRows = [
        ...((brandData ?? []) as ConversationRow[]),
        ...((portalData ?? []) as ConversationRow[]),
        ...((twilioData ?? []) as ConversationRow[]),
      ]
      const earliestScopedAtByChat = new Map<string, string>()
      for (const row of scopedRows) {
        const earliest = earliestScopedAtByChat.get(row.chat_id)
        if (!earliest || row.created_at < earliest) earliestScopedAtByChat.set(row.chat_id, row.created_at)
      }

      const contextParts = await Promise.all(
        [...earliestScopedAtByChat.entries()].map(async ([chatId, earliestScopedAt]) => {
          const { data: contextData, error: contextError } = await supabase
            .from('conversation_messages')
            .select(select)
            .eq('chat_id', chatId)
            .gte('created_at', earliestScopedAt)
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: true })
            .limit(10000)

          if (contextError) throw new Error(contextError.message)
          return (contextData ?? []) as ConversationRow[]
        }),
      )
      const contextRows = contextParts.flat()

      const byId = new Map<number, ConversationRow>()
      for (const row of [...scopedRows, ...contextRows]) byId.set(row.id, row)
      return [...byId.values()]
    }),
  )
  return parts.flat()
}

async function fetchScopedThreadRows(
  supabase: SupabaseClient,
  chatId: string,
  brandKey: string,
  nowIso: string,
): Promise<ConversationRow[]> {
  const scopedRows = filterRowsForBrandPortalConversation(
    chatId,
    await fetchConversationRows(supabase, [chatId], nowIso, brandKey),
    brandKey,
  )
  const isPortalTestThread = chatId.startsWith(`portal-test#${brandKey}`)
  const isPortalSimThread = chatId.startsWith(`portal-sim#${brandKey}`)
  if (scopedRows.length > 0 || (!isPortalTestThread && !isPortalSimThread)) {
    return scopedRows
  }

  const portalHandle = isPortalSimThread ? `portal-sim@${brandKey}` : `portal-test@${brandKey}`
  const { data: legacyData, error: legacyError } = await supabase
    .from('conversation_messages')
    .select('id, chat_id, role, content, handle, created_at, metadata, engagement_scope, engagement_brand_key')
    .eq('chat_id', chatId)
    .eq('handle', portalHandle)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(500)

  if (legacyError) {
    throw new Error(legacyError.message)
  }

  return (legacyData ?? []) as ConversationRow[]
}

async function fetchUserProfiles(
  supabase: SupabaseClient,
  handles: string[],
): Promise<Map<string, UserProfileRow>> {
  const parts = await Promise.all(
    chunk(handles, 100).map(async (ids) => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('handle, name, last_seen')
        .in('handle', ids)

      if (error) {
        console.warn('[brand-portal-config] user_profiles:', error.message)
        return [] as UserProfileRow[]
      }
      return (data ?? []) as UserProfileRow[]
    }),
  )
  const out = new Map<string, UserProfileRow>()
  for (const row of parts.flat()) {
    out.set(row.handle, row)
  }
  return out
}

async function buildBrandPortalConversationsPayload(
  supabase: SupabaseClient,
  session: { brandKey: string },
  req: VercelRequest,
): Promise<Record<string, unknown>> {
  // Brand portal shows the full message history regardless of the 24h TTL.
  const nowIso = BRAND_PORTAL_TTL_FLOOR
  const requestedChatId = typeof req.query.chatId === 'string' ? req.query.chatId.trim() : ''
  const listOnly = req.query.listOnly === '1' || req.query.listOnly === 'true'
  const threadOnly = req.query.threadOnly === '1' || req.query.threadOnly === 'true'
  const withAggregates = req.query.withAggregates === '1' || req.query.withAggregates === 'true'

  if (threadOnly && requestedChatId) {
    const allowed = await isChatAllowedForBrandPortal(supabase, session.brandKey, requestedChatId, nowIso)
    if (!allowed) {
      return { chats: [], selectedChatId: null, conversation: null }
    }

    const selectedRows = await fetchScopedThreadRows(supabase, requestedChatId, session.brandKey, nowIso)
    const participantHandle = extractParticipantHandle(requestedChatId, selectedRows)
    let profilesByHandle = new Map<string, UserProfileRow>()
    if (participantHandle && !participantHandle.startsWith('portal-test@')) {
      profilesByHandle = await fetchUserProfiles(supabase, [participantHandle])
    }

    const pendingImagesBySender = await loadPendingInboundImagesBySender(
      supabase,
      requestedChatId,
      nowIso,
    )
    const conversation = await buildConversationRecord(
      supabase,
      session.brandKey,
      requestedChatId,
      selectedRows,
      profilesByHandle,
      null,
      pendingImagesBySender,
    )

    return { chats: [], selectedChatId: requestedChatId, conversation }
  }

  const { chats, profilesByHandle } = await fetchChatsAndProfilesForPortal(supabase, session, nowIso)

  if (chats.length === 0) {
    return { chats: [], selectedChatId: null, conversation: null }
  }

  let enrichedChats: PortalChatListItem[] = chats
  if (withAggregates) {
    const aggregates = await fetchChatAggregates(
      supabase,
      chats.map((c) => c.chatId),
      session.brandKey,
      nowIso,
    )
    enrichedChats = chats.map((chat) => {
      const agg = aggregates.get(chat.chatId)
      return {
        ...chat,
        nestMessageCount: agg?.nest ?? 0,
        userMessageCount: agg?.user ?? 0,
        connectionsUsed: agg?.connections ?? [],
      }
    })
  }

  if (listOnly) {
    return { chats: enrichedChats, selectedChatId: null, conversation: null }
  }

  const selectedChatId =
    requestedChatId && enrichedChats.some((chat) => chat.chatId === requestedChatId)
      ? requestedChatId
      : (enrichedChats[0]?.chatId ?? null)

  let conversation: Record<string, unknown> | null = null

  if (selectedChatId) {
    const selectedRows = await fetchScopedThreadRows(supabase, selectedChatId, session.brandKey, nowIso)
    const selectedChat = enrichedChats.find((chat) => chat.chatId === selectedChatId) ?? null
    const pendingImagesBySender = await loadPendingInboundImagesBySender(
      supabase,
      selectedChatId,
      nowIso,
    )
    conversation = await buildConversationRecord(
      supabase,
      session.brandKey,
      selectedChatId,
      selectedRows,
      profilesByHandle,
      selectedChat,
      pendingImagesBySender,
    )
  }

  return {
    chats: enrichedChats,
    selectedChatId,
    conversation,
  }
}

const CONVERSATION_LEARNING_TARGET_FIELDS = [
  'hours_text',
  'prices_text',
  'services_products_text',
  'booking_info_text',
  'policies_text',
  'extra_knowledge',
  'style_notes',
  'topics_to_avoid',
  'escalation_text',
  'business_raw_prompt',
] as const

const CONVERSATION_LEARNING_CATEGORIES = [
  'knowledge',
  'tone',
  'booking',
  'pricing',
  'policy',
  'guardrail',
  'handoff',
  'prompt',
] as const

type ConversationLearningTargetField = (typeof CONVERSATION_LEARNING_TARGET_FIELDS)[number]
type ConversationLearningCategory = (typeof CONVERSATION_LEARNING_CATEGORIES)[number]

type ConversationLearningSuggestion = {
  id: string
  category: ConversationLearningCategory
  title: string
  reason: string
  evidence: string
  targetField: ConversationLearningTargetField
  suggestedText: string
  conversationCount: number
  quotes: string[]
}

type ConversationLearningPayload = {
  summary: string
  analysedConversationCount: number
  analysedMessageCount: number
  suggestions: ConversationLearningSuggestion[]
}

type HeuristicLearningTopic = {
  id: string
  title: string
  category: ConversationLearningCategory
  targetField: ConversationLearningTargetField
  patterns: RegExp[]
  reason: string
  evidence: string
  suggestedText: string
}

function fallbackConversationLearningPayload(summary?: string): ConversationLearningPayload {
  return {
    summary: summary ?? 'Scan real customer conversations to surface the next facts, rules, and tone guidance your bot should learn.',
    analysedConversationCount: 0,
    analysedMessageCount: 0,
    suggestions: [],
  }
}

function normaliseLearningText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function joinWithinCharLimit(items: string[], maxChars: number): string[] {
  const out: string[] = []
  let used = 0
  for (const item of items) {
    if (!item) continue
    if (out.length > 0 && used + item.length + 2 > maxChars) break
    if (out.length === 0 && item.length > maxChars) {
      out.push(item.slice(0, Math.max(0, maxChars - 1)).trim())
      break
    }
    out.push(item)
    used += item.length + (out.length > 1 ? 2 : 0)
  }
  return out
}

const HEURISTIC_LEARNING_TOPICS: HeuristicLearningTopic[] = [
  {
    id: 'hours',
    title: 'Clarify business hours',
    category: 'knowledge',
    targetField: 'hours_text',
    patterns: [/\bopen\b/i, /\bhours?\b/i, /\bclose\b/i, /\bweekend\b/i, /\btoday\b/i, /\btomorrow\b/i],
    reason: 'Customers are asking when the business is open, which suggests the bot needs clearer operating hours guidance.',
    evidence: 'Customers repeatedly ask about open days, open times, or whether they can come in today.',
    suggestedText: 'Business hours: include each trading day, opening and closing times, timezone, and how the bot should answer holiday or after-hours questions.',
  },
  {
    id: 'pricing',
    title: 'Explain pricing better',
    category: 'pricing',
    targetField: 'prices_text',
    patterns: [/\bhow much\b/i, /\bprice\b/i, /\bcost\b/i, /\bquote\b/i, /\bdeposit\b/i, /\bfee\b/i],
    reason: 'Customers are asking for prices or quotes, so the bot needs clearer pricing and estimate guidance.',
    evidence: 'Recent chats show repeated questions about cost, quotes, deposits, or price ranges.',
    suggestedText: 'Pricing guidance: include starting prices, package ranges, quote rules, any deposit expectations, and how the bot should answer when an exact price depends on more details.',
  },
  {
    id: 'booking',
    title: 'Tighten booking guidance',
    category: 'booking',
    targetField: 'booking_info_text',
    patterns: [/\bbook\b/i, /\bbooking\b/i, /\bappointment\b/i, /\bavailable\b/i, /\bavailability\b/i, /\bslot\b/i],
    reason: 'Customers are trying to book or check availability, which suggests the bot needs a clearer booking flow.',
    evidence: 'Recent chats include recurring questions about booking steps, available times, or how to secure a spot.',
    suggestedText: 'Booking process: explain how customers book, what details they should send, how availability is confirmed, and the expected response time if a human needs to check the calendar.',
  },
  {
    id: 'services',
    title: 'Spell out services',
    category: 'knowledge',
    targetField: 'services_products_text',
    patterns: [/\bdo you\b/i, /\bcan you\b/i, /\boffer\b/i, /\bservice\b/i, /\brepair\b/i, /\bfix\b/i],
    reason: 'Customers are checking whether the business offers something specific, so the bot needs stronger service coverage.',
    evidence: 'Recent chats show repeated questions about whether the business provides particular services or products.',
    suggestedText: 'Services and products: list the main jobs, products, or customer requests the business handles so the bot can answer “do you offer…” questions clearly.',
  },
  {
    id: 'policy',
    title: 'Add policy answers',
    category: 'policy',
    targetField: 'policies_text',
    patterns: [/\bcancel\b/i, /\bcancellation\b/i, /\brefund\b/i, /\bpolicy\b/i, /\bwarranty\b/i, /\bguarantee\b/i],
    reason: 'Customers are asking about rules and expectations, so the bot should have clearer policy guidance.',
    evidence: 'Recent chats include recurring questions about cancellations, refunds, warranties, or other policy terms.',
    suggestedText: 'Policies: include cancellation rules, refund expectations, warranty or guarantee notes, and any preparation or eligibility rules customers need to know before booking.',
  },
  {
    id: 'location',
    title: 'Add practical visit details',
    category: 'knowledge',
    targetField: 'extra_knowledge',
    patterns: [/\bwhere\b/i, /\blocated\b/i, /\baddress\b/i, /\bparking\b/i, /\bpickup\b/i, /\bservice area\b/i],
    reason: 'Customers are asking where to go or whether the business covers their area, so the bot needs more practical logistics knowledge.',
    evidence: 'Recent chats show repeated questions about location, address, parking, pickup, or service area details.',
    suggestedText: 'Practical details: include address, parking notes, pickup or drop-off instructions, service area boundaries, and any arrival guidance customers often need.',
  },
]

function buildHeuristicConversationLearnings(
  rows: ConversationRow[],
  analysedConversationCount: number,
  analysedMessageCount: number,
): ConversationLearningPayload {
  const userRows = rows
    .filter((row) => row.role === 'user')
    .map((row) => ({
      chatId: row.chat_id,
      content: normaliseLearningText(row.content ?? ''),
    }))
    .filter((row) => row.content.length > 0)

  const suggestions = HEURISTIC_LEARNING_TOPICS
    .map<ConversationLearningSuggestion | null>((topic) => {
      const matched = userRows.filter((row) => topic.patterns.some((pattern) => pattern.test(row.content)))
      if (matched.length === 0) return null
      const conversationCount = new Set(matched.map((row) => row.chatId)).size
      const quotes = [...new Set(matched.map((row) => row.content))].slice(0, 3)
      return {
        id: `history-${topic.id}`,
        category: topic.category,
        title: topic.title,
        reason: topic.reason,
        evidence: topic.evidence,
        targetField: topic.targetField,
        suggestedText: topic.suggestedText,
        conversationCount,
        quotes,
      }
    })
    .filter((item): item is ConversationLearningSuggestion => Boolean(item))
    .sort((a, b) => b.conversationCount - a.conversationCount)
    .slice(0, 6)

  return {
    summary:
      suggestions.length > 0
        ? 'Nest identified recurring customer question themes from your real chats and turned them into draftable bot updates.'
        : 'Nest scanned recent customer chats but did not find a strong recurring theme to turn into a confident suggestion yet.',
    analysedConversationCount,
    analysedMessageCount,
    suggestions,
  }
}

async function fetchConversationRowsForInsights(
  supabase: SupabaseClient,
  chatIds: string[],
  nowIso: string,
  brandKey: string,
): Promise<ConversationRow[]> {
  const parts = await Promise.all(
    chunk(chatIds, 25).map(async (ids) => {
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('id, chat_id, role, content, handle, created_at, engagement_scope, engagement_brand_key')
        .in('chat_id', ids)
        .eq('engagement_scope', 'brand')
        .eq('engagement_brand_key', brandKey)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(2000)

      if (error) throw new Error(error.message)
      return (data ?? []) as ConversationRow[]
    }),
  )
  return parts.flat()
}

function sanitiseConversationLearningSuggestion(
  row: unknown,
  index: number,
): ConversationLearningSuggestion | null {
  if (!row || typeof row !== 'object') return null
  const item = row as Record<string, unknown>
  const category = CONVERSATION_LEARNING_CATEGORIES.includes(item.category as ConversationLearningCategory)
    ? (item.category as ConversationLearningCategory)
    : 'knowledge'
  const targetField = CONVERSATION_LEARNING_TARGET_FIELDS.includes(item.targetField as ConversationLearningTargetField)
    ? (item.targetField as ConversationLearningTargetField)
    : 'extra_knowledge'
  const title = typeof item.title === 'string' && item.title.trim()
    ? item.title.trim()
    : 'Suggested improvement'
  const reason = typeof item.reason === 'string' && item.reason.trim()
    ? item.reason.trim()
    : 'This would help the bot handle recurring customer chats more clearly.'
  const evidence = typeof item.evidence === 'string' && item.evidence.trim()
    ? item.evidence.trim()
    : 'Recurring customer questions and bot replies point to this gap.'
  const suggestedText = typeof item.suggestedText === 'string' ? item.suggestedText.trim() : ''
  if (!suggestedText) return null
  const conversationCount = typeof item.conversationCount === 'number' && Number.isFinite(item.conversationCount)
    ? Math.max(1, Math.round(item.conversationCount))
    : 1
  const quotes = Array.isArray(item.quotes)
    ? item.quotes
        .filter((quote): quote is string => typeof quote === 'string' && quote.trim().length > 0)
        .map((quote) => quote.trim())
        .slice(0, 3)
    : []

  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `history-${index + 1}`,
    category,
    title,
    reason,
    evidence,
    targetField,
    suggestedText,
    conversationCount,
    quotes,
  }
}

async function buildConversationLearningsPayload(
  supabase: SupabaseClient,
  session: { brandKey: string },
): Promise<ConversationLearningPayload> {
  const openaiKey = pickServerEnv(['OPENAI_API_KEY', 'NEST_OPENAI_API_KEY'])
  if (!openaiKey) {
    return fallbackConversationLearningPayload('Conversation learnings are unavailable because the server is missing an OpenAI key.')
  }

  // Brand portal shows the full message history regardless of the 24h TTL.
  const nowIso = BRAND_PORTAL_TTL_FLOOR
  const [{ data: configRow }, { chats, profilesByHandle }] = await Promise.all([
    supabase.from('nest_brand_chat_config').select('*').eq('brand_key', session.brandKey).maybeSingle(),
    fetchChatsAndProfilesForPortal(supabase, session, nowIso),
  ])

  const customerChats = chats.filter((chat) => chat.source === 'customer' && !chat.chatId.startsWith('portal-sim#'))
  if (customerChats.length === 0) {
    return fallbackConversationLearningPayload('No real customer conversations are available yet. Once customers start messaging, Nest can suggest missing facts from their actual questions.')
  }

  const rows = await fetchConversationRowsForInsights(
    supabase,
    customerChats.map((chat) => chat.chatId),
    nowIso,
    session.brandKey,
  )

  const rowsByChat = new Map<string, ConversationRow[]>()
  for (const row of rows) {
    if ((row.role !== 'user' && row.role !== 'assistant') || !normaliseLearningText(row.content ?? '')) continue
    if (row.handle?.startsWith('portal-test@') || row.handle?.startsWith('portal-sim@')) continue
    const bucket = rowsByChat.get(row.chat_id) ?? []
    bucket.push(row)
    rowsByChat.set(row.chat_id, bucket)
  }

  const chatSnapshots = customerChats
    .map((chat) => {
      const rawRows = rowsByChat.get(chat.chatId) ?? []
      if (rawRows.length === 0) return null
      const orderedRows = [...rawRows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      const excerptRows = orderedRows.slice(-12)
      const participantHandle = extractParticipantHandle(chat.chatId, orderedRows)
      const profile = participantHandle ? profilesByHandle.get(participantHandle) ?? null : null
      const label = profile?.name?.trim() || chat.displayName?.trim() || chat.title
      const transcript = excerptRows
        .map((row) => `${row.role === 'user' ? 'Customer' : 'Bot'}: ${normaliseLearningText(row.content).slice(0, 220)}`)
        .join('\n')
      if (!transcript.trim()) return null
      return `## ${label}\n${transcript}`
    })
    .filter((snapshot): snapshot is string => Boolean(snapshot))

  const customerMessageCount = rows.filter((row) => row.role === 'user').length
  const compactSnapshots = joinWithinCharLimit(chatSnapshots, 36_000)
  const analysedConversationCount = compactSnapshots.length

  if (analysedConversationCount === 0 || customerMessageCount === 0) {
    return fallbackConversationLearningPayload('No retained customer message history could be analysed yet.')
  }

  const config = (configRow ?? {}) as Record<string, unknown>
  const businessName = typeof config.business_display_name === 'string' && config.business_display_name.trim()
    ? config.business_display_name.trim()
    : session.brandKey
  const filled: string[] = []
  const empty: string[] = []
  for (const field of SUGGESTION_CONFIG_FIELDS) {
    const value = config[field]
    const label = SUGGESTION_FIELD_LABELS[field] ?? field
    if (typeof value === 'string' && value.trim().length > 10) {
      filled.push(`${label}: ${value.trim().slice(0, 120)}${value.trim().length > 120 ? '…' : ''}`)
    } else {
      empty.push(label)
    }
  }

  const prompt = `You review retained real customer conversations for Nest business owners and turn recurring gaps into bot configuration updates.

Business: ${businessName}

Already configured:
${filled.length > 0 ? filled.map((item) => `- ${item}`).join('\n') : '(nothing meaningful yet)'}

Thin or missing areas:
${empty.length > 0 ? empty.join(', ') : 'None obvious'}

Conversation history reviewed:
- ${analysedConversationCount} customer conversations
- ${customerMessageCount} customer messages

Conversation excerpts:
${compactSnapshots.join('\n\n')}

Return JSON only. Choose the highest-leverage suggestions that would improve future replies across many chats.

Rules:
- Focus on what the business owner should add or clarify in their bot configuration.
- Prefer recurring facts, rules, booking details, pricing details, policy details, hand-off rules, and tone guidance.
- Base each suggestion on actual customer asks and the bot's replies.
- Do not suggest something that is already clearly covered in the config unless conversations show the current wording is still too weak.
- Use concise Australian English.
- "evidence" should mention the recurring pattern, not just say "customers asked this".
- "suggestedText" must be ready to add directly into the target field.
- Keep suggestions concrete and specific.
- Return at most 6 suggestions.

Target field mapping:
- hours_text: operating hours, days, timezone, public holiday timing
- prices_text: prices, deposits, quote rules, package ranges
- services_products_text: what the business offers
- booking_info_text: booking flow, response timing, required details
- policies_text: cancellations, refunds, prep rules, eligibility
- extra_knowledge: FAQs, parking, service area, miscellaneous facts
- style_notes: tone, warmth, brevity, phrasing style
- topics_to_avoid: things the bot must not guess or promise
- escalation_text: when to stop and hand off to a human
- business_raw_prompt: broader markdown guidance when the learning spans multiple situations`

  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      instructions: prompt,
      input: [{ role: 'user', content: 'Review the conversation history and return the structured learnings now.' }],
      text: {
        format: {
          type: 'json_schema',
          name: 'conversation_learnings',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    category: { type: 'string', enum: [...CONVERSATION_LEARNING_CATEGORIES] },
                    title: { type: 'string' },
                    reason: { type: 'string' },
                    evidence: { type: 'string' },
                    targetField: { type: 'string', enum: [...CONVERSATION_LEARNING_TARGET_FIELDS] },
                    suggestedText: { type: 'string' },
                    conversationCount: { type: 'integer' },
                    quotes: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['id', 'category', 'title', 'reason', 'evidence', 'targetField', 'suggestedText', 'conversationCount', 'quotes'],
                  additionalProperties: false,
                },
              },
            },
            required: ['summary', 'suggestions'],
            additionalProperties: false,
          },
        },
      },
      store: false,
    }),
  })

  if (!openaiRes.ok) {
    const raw = await openaiRes.text()
    console.error('[brand-portal-config] conversation learnings OpenAI:', openaiRes.status, raw.slice(0, 400))
    return buildHeuristicConversationLearnings(rows, analysedConversationCount, customerMessageCount)
  }

  const data = (await openaiRes.json()) as Record<string, unknown>
  let rawContent = ''
  if (typeof data.output_text === 'string') {
    rawContent = data.output_text
  } else if (Array.isArray(data.output)) {
    for (const item of data.output as Record<string, unknown>[]) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const block of item.content as Record<string, unknown>[]) {
          if (block.type === 'output_text' && typeof block.text === 'string') {
            rawContent = block.text
            break
          }
        }
        if (rawContent) break
      }
    }
  }

  if (!rawContent) {
    return buildHeuristicConversationLearnings(rows, analysedConversationCount, customerMessageCount)
  }

  try {
    const parsed = JSON.parse(rawContent) as {
      summary?: unknown
      suggestions?: unknown
    }
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .map((row, index) => sanitiseConversationLearningSuggestion(row, index))
          .filter((item): item is ConversationLearningSuggestion => Boolean(item))
          .slice(0, 6)
      : []

    const payload = {
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : 'Nest scanned recent customer conversations and identified the highest-leverage facts and rules the bot should learn next.',
      analysedConversationCount,
      analysedMessageCount: customerMessageCount,
      suggestions,
    }
    if (payload.suggestions.length === 0) {
      return buildHeuristicConversationLearnings(rows, analysedConversationCount, customerMessageCount)
    }
    return payload
  } catch {
    return buildHeuristicConversationLearnings(rows, analysedConversationCount, customerMessageCount)
  }
}

type OutboundTwilioRow = {
  id: number
  chat_id: string
  payload: Record<string, unknown>
  status: string
  created_at: string
  sent_at: string | null
  provider_message_id: string | null
}

async function aggregateConversationStatsByChat(
  supabase: SupabaseClient,
  chatIds: string[],
  nowIso: string,
  brandKey: string,
): Promise<Map<string, { total: number; userMsgs: number }>> {
  const stats = new Map<string, { total: number; userMsgs: number }>()
  if (chatIds.length === 0) return stats

  const pageSize = 1000
  /** Cap total rows scanned so one brand cannot pin the API on pathological threads. */
  const maxRows = 12_000

  for (const ids of chunk(chatIds, 40)) {
    let from = 0
    let scanned = 0
    while (scanned < maxRows) {
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('chat_id, role')
        .in('chat_id', ids)
        .eq('engagement_scope', 'brand')
        .eq('engagement_brand_key', brandKey)
        .gt('expires_at', nowIso)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) {
        throw new Error(error.message)
      }
      const rows = (data ?? []) as { chat_id: string; role: string }[]
      for (const row of rows) {
        const bucket = stats.get(row.chat_id) ?? { total: 0, userMsgs: 0 }
        bucket.total += 1
        if (row.role === 'user') bucket.userMsgs += 1
        stats.set(row.chat_id, bucket)
      }
      scanned += rows.length
      if (rows.length < pageSize) break
      from += pageSize
    }
  }

  return stats
}

async function buildBrandPortalTwilioActivityPayload(
  supabase: SupabaseClient,
  session: { brandKey: string },
): Promise<Record<string, unknown>> {
  // Brand portal shows the full message history regardless of the 24h TTL.
  const nowIso = BRAND_PORTAL_TTL_FLOOR
  const { data, error } = await supabase
    .from('outbound_messages')
    .select('id, chat_id, payload, status, created_at, sent_at, provider_message_id')
    .filter('payload->>source', 'eq', 'twilio-voice-webhook')
    .filter('payload->>brandKey', 'eq', session.brandKey)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as OutboundTwilioRow[]
  const chatIds = [...new Set(rows.map((r) => r.chat_id).filter(Boolean))]

  const [statsByChat, profilesMap] = await Promise.all([
    aggregateConversationStatsByChat(supabase, chatIds, nowIso, session.brandKey),
    (async () => {
      const handles = new Set<string>()
      for (const row of rows) {
        const p = row.payload
        const phone = typeof p.callerE164 === 'string' ? p.callerE164.trim() : ''
        if (phone) handles.add(phone)
      }
      return fetchUserProfiles(supabase, [...handles])
    })(),
  ])

  const events = rows.map((row) => {
    const p = row.payload
    const callerE164 = typeof p.callerE164 === 'string' ? p.callerE164.trim() : ''
    const callSid = typeof p.callSid === 'string' ? p.callSid.trim() : ''
    const text = typeof p.text === 'string' ? p.text : ''
    const st = statsByChat.get(row.chat_id) ?? { total: 0, userMsgs: 0 }
    const profile = callerE164 ? profilesMap.get(callerE164) ?? null : null

    return {
      id: row.id,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      status: row.status,
      chatId: row.chat_id,
      callSid: callSid || null,
      callerE164: callerE164 || null,
      callerDisplayName: profile?.name?.trim() || null,
      welcomeMessage: text,
      providerMessageId: row.provider_message_id,
      threadMessageCount: st.total,
      threadCustomerMessageCount: st.userMsgs,
      hasConversationBeyondWelcome: st.total > 1 || st.userMsgs > 0,
    }
  })

  return { events }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await handleBrandPortalConfig(req, res)
  } catch (err) {
    console.error('[brand-portal-config]', err)
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error',
      })
    }
  }
}

async function handleBrandPortalConfig(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).json({ error: supabaseConfigErrorMessage() })
    return
  }

  const session = await resolveSession(supabase, req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (req.method === 'GET') {
    const wantConversations = req.query.conversations === '1' || req.query.conversations === 'true'
    const wantSuggestions = req.query.suggestions === '1' || req.query.suggestions === 'true'
    const wantConversationLearnings = req.query.conversationLearnings === '1' || req.query.conversationLearnings === 'true'
    const wantTwilioActivity = req.query.twilioActivity === '1' || req.query.twilioActivity === 'true'
    const wantHomeSummary = req.query.homeSummary === '1' || req.query.homeSummary === 'true'
    const wantCustomerSearch = req.query.customerSearch === '1' || req.query.customerSearch === 'true'

    if (wantHomeSummary) {
      try {
        const [lsConn, deputyConn, latestRun] = await Promise.all([
          supabase
            .from('nest_brand_portal_connections')
            .select('api_endpoint, access_expires_at, updated_at')
            .eq('brand_key', session.brandKey)
            .eq('provider', 'lightspeed')
            .maybeSingle(),
          supabase
            .from('nest_brand_portal_connections')
            .select('access_expires_at, updated_at')
            .eq('brand_key', session.brandKey)
            .eq('provider', 'deputy')
            .maybeSingle(),
          supabase
            .from('nest_brand_reporting_automation_runs')
            .select('preset_key, status, created_at')
            .eq('brand_key', session.brandKey)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        const lsCountsResult = lsConn.data
          ? await supabase
              .from('nest_brand_lightspeed_sync_state')
              .select('resource, updated_at')
              .eq('brand_key', session.brandKey)
          : null

        const syncStates = lsCountsResult?.data as { resource: string; updated_at: string }[] | null
        const lastSync = syncStates?.length
          ? syncStates.reduce((latest, s) => (!latest || s.updated_at > latest ? s.updated_at : latest), '' as string)
          : null

        res.status(200).json({
          lightspeed: lsConn.data
            ? { connected: true, lastSyncAt: lastSync, updatedAt: lsConn.data.updated_at }
            : { connected: false, lastSyncAt: null, updatedAt: null },
          deputy: deputyConn.data
            ? { connected: true, expiresAt: deputyConn.data.access_expires_at }
            : { connected: false, expiresAt: null },
          lastReportingRun: latestRun.data
            ? { presetKey: latestRun.data.preset_key, status: latestRun.data.status, sentAt: latestRun.data.created_at }
            : null,
        })
      } catch (err) {
        console.error('[brand-portal-config] home summary:', err)
        res.status(200).json({ lightspeed: null, deputy: null, lastReportingRun: null })
      }
      return
    }

    if (wantTwilioActivity) {
      try {
        const payload = await buildBrandPortalTwilioActivityPayload(supabase, session)
        res.status(200).json(payload)
      } catch (err) {
        console.error('[brand-portal-config] twilio activity:', err)
        res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
      }
      return
    }

    if (wantConversations) {
      try {
        const payload = await buildBrandPortalConversationsPayload(supabase, session, req)
        res.status(200).json(payload)
      } catch (err) {
        console.error('[brand-portal-config] conversations:', err)
        res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
      }
      return
    }

    if (wantCustomerSearch) {
      try {
        const query = typeof req.query.q === 'string' ? req.query.q : ''
        const customers = await searchLightspeedCustomers(supabase, session.brandKey, query)
        res.status(200).json({ customers })
      } catch (err) {
        console.error('[brand-portal-config] customer search:', err)
        res.status(200).json({ customers: [] })
      }
      return
    }

    if (wantSuggestions) {
      try {
        const payload = await buildSmartSuggestionsPayload(supabase, session.brandKey)
        res.status(200).json(payload)
      } catch (err) {
        console.error('[brand-portal-config] suggestions:', err)
        res.status(200).json({ suggestions: [] })
      }
      return
    }

    if (wantConversationLearnings) {
      try {
        const payload = await buildConversationLearningsPayload(supabase, session)
        res.status(200).json(payload)
      } catch (err) {
        console.error('[brand-portal-config] conversation learnings:', err)
        res.status(200).json(fallbackConversationLearningPayload())
      }
      return
    }

    const { data, error } = await supabase
      .from('nest_brand_chat_config')
      .select('*')
      .eq('brand_key', session.brandKey)
      .maybeSingle()

    if (error) {
      res.status(500).json({ error: 'Could not load config' })
      return
    }

    res.status(200).json({
      config: await ensureBusinessRawPrompt(supabase, session.brandKey, data as Record<string, unknown> | null),
    })
    return
  }

  if (req.method === 'PATCH') {
    let body: Record<string, unknown>
    try {
      body = typeof req.body === 'string' ? (JSON.parse(req.body) as Record<string, unknown>) : req.body || {}
    } catch {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }

    const regenerateBusinessRawPrompt = body.regenerate_business_raw_prompt === true
    const { data: existing, error: existingError } = await supabase
      .from('nest_brand_chat_config')
      .select('*')
      .eq('brand_key', session.brandKey)
      .maybeSingle()

    if (existingError) {
      res.status(500).json({ error: 'Could not load current config' })
      return
    }

    const expectedUpdatedAt =
      typeof body.expected_updated_at === 'string'
        ? body.expected_updated_at
        : typeof body.expectedUpdatedAt === 'string'
          ? body.expectedUpdatedAt
          : null
    if (
      expectedUpdatedAt &&
      typeof existing?.updated_at === 'string' &&
      existing.updated_at !== expectedUpdatedAt
    ) {
      res.status(409).json({
        error: 'This Nest setting changed since you opened it.',
        detail: 'Reload and review the latest version before saving.',
      })
      return
    }

    const baseConfig = normalisePortalConfigRow(existing as Record<string, unknown> | null, session.brandKey)
    const patch: Record<string, unknown> = {}
    for (const key of ALLOWED_TEXT_FIELDS) {
      if (key in body && body[key] !== undefined) {
        if (key === 'business_timezone') {
          const timezone = String(body[key] ?? '').trim()
          if (!timezone) {
            patch[key] = DEFAULT_BUSINESS_TIMEZONE
          } else if (!isValidIanaTimezone(timezone)) {
            res.status(400).json({
              error: 'Invalid business timezone',
              detail: 'Use a valid IANA timezone such as Australia/Melbourne.',
            })
            return
          } else {
            patch[key] = timezone
          }
        } else if (key === 'style_template') {
          patch[key] = String(body[key] ?? '').trim() || 'warm_local'
        } else {
          patch[key] = String(body[key] ?? '')
        }
      }
    }

    if ('opening_schedule' in body && body.opening_schedule !== undefined) {
      const schedule = normaliseOpeningSchedule(body.opening_schedule)
      const errors = validateOpeningSchedule(schedule)
      if (errors.length > 0) {
        res.status(400).json({ error: 'Invalid opening schedule', detail: errors[0] })
        return
      }
      patch.opening_schedule = schedule
    }

    if ('internal_admin_phone_e164s' in body && body.internal_admin_phone_e164s !== undefined) {
      patch.internal_admin_phone_e164s = normaliseInternalAdminPhoneList(body.internal_admin_phone_e164s)
    }

    if ('setup_complete' in body && body.setup_complete !== undefined) {
      patch.setup_complete = Boolean(body.setup_complete)
    }

    if ('lightspeed_settings' in body && body.lightspeed_settings !== undefined) {
      patch.lightspeed_settings = normaliseLightspeedSettingsForApi(body.lightspeed_settings)
    }

    if ('reporting_automations' in body && body.reporting_automations !== undefined) {
      patch.reporting_automations = normaliseReportingAutomationsForApi(
        body.reporting_automations,
        normaliseMobileRecipientList(
          body.internal_admin_phone_e164s ?? baseConfig.internal_admin_phone_e164s,
        ),
      )
    }

    if ('voicemail_audio_url' in body) {
      // Allow null (delete) or a string URL
      patch.voicemail_audio_url = body.voicemail_audio_url == null ? null
        : typeof body.voicemail_audio_url === 'string' ? body.voicemail_audio_url.trim().slice(0, 2000)
        : undefined
      if (patch.voicemail_audio_url === undefined) delete patch.voicemail_audio_url
    }

    if ('handoff_phone_e164' in body && body.handoff_phone_e164 !== undefined) {
      const raw = body.handoff_phone_e164
      if (raw == null || (typeof raw === 'string' && !raw.trim())) {
        patch.handoff_phone_e164 = null
      } else {
        const str = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : null
        if (str === null || !str) {
          res.status(400).json({
            error: 'Invalid handoff number',
            detail: 'Enter a valid mobile number (including area code).',
          })
          return
        }
        const n = normaliseToE164(str)
        if (!n) {
          res.status(400).json({
            error: 'Invalid handoff number',
            detail: 'Enter a valid mobile number (including area code).',
          })
          return
        }
        patch.handoff_phone_e164 = n
      }
    }

    if (Object.keys(patch).length === 0 && !regenerateBusinessRawPrompt) {
      const metaKeys = new Set(['regenerate_business_raw_prompt'])
      const requested = Object.keys(body).filter((k) => !metaKeys.has(k))
      const detail =
        requested.includes('handoff_phone_e164')
          ? 'This request only contained fields the server did not accept. If you are on Vite localhost, /api/brand-portal is proxied to VITE_BRAND_PORTAL_API_ORIGIN (default: production). Deploy the latest website API or point that env var at `vercel dev` for this repo.'
          : requested.length > 0
            ? 'None of the fields in the request body are valid for this endpoint (check spelling and types).'
            : undefined
      res.status(400).json({ error: 'No valid fields to update', ...(detail ? { detail } : {}) })
      return
    }

    const nextConfig: Record<string, unknown> = {
      ...baseConfig,
      ...patch,
    }

    if ('business_raw_prompt' in patch) {
      const parsedRawPrompt = parseBusinessRawPrompt(String(patch.business_raw_prompt ?? ''))
      Object.assign(nextConfig, pickBusinessFieldsFromParsed(parsedRawPrompt))
      nextConfig.business_raw_prompt = String(patch.business_raw_prompt ?? '')
    } else if (regenerateBusinessRawPrompt || shouldRebuildBusinessRawPrompt(patch)) {
      nextConfig.business_raw_prompt = computeBusinessRawPrompt(nextConfig as Partial<BusinessRawPromptConfig>)
    }

    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('nest_brand_chat_config')
      .upsert(
        {
          brand_key: session.brandKey,
          ...nextConfig,
          core_system_prompt: existing?.core_system_prompt ?? '',
          updated_at: patch.updated_at,
        },
        { onConflict: 'brand_key' },
      )
      .select('*')
      .single()

    if (error) {
      res.status(500).json({ error: 'Could not save' })
      return
    }

    if ('reporting_automations' in patch) {
      await syncReportingGroupDisplayNamesAfterSave(session.brandKey)
    }

    res.status(200).json({
      config: normalisePortalConfigRow(data as Record<string, unknown> | null, session.brandKey),
    })
    return
  }

  if (req.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = typeof req.body === 'string' ? (JSON.parse(req.body) as Record<string, unknown>) : req.body || {}
    } catch {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }

    if (body.action === 'send_message') {
      const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : ''
      const rawContent = typeof body.content === 'string' ? body.content.trim() : ''
      const content = rawContent ? ensureSmsUrlsAreClickable(rawContent) : ''
      const attachmentIds = Array.isArray(body.mediaAttachmentIds)
        ? body.mediaAttachmentIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : []
      const agentPayCheckoutUrl =
        typeof body.agentPayCheckoutUrl === 'string' ? body.agentPayCheckoutUrl.trim() : ''
      const skipLinqDelivery = body.skipLinqDelivery === true
      if (!chatId) { res.status(400).json({ error: 'chatId is required' }); return }
      if (!content && attachmentIds.length === 0 && !agentPayCheckoutUrl) {
        res.status(400).json({ error: 'content or mediaAttachmentIds is required' })
        return
      }

      if (content) {
        const moderation = await moderateNestOutboundMessage(content)
        if (!moderation.allowed) {
          res.status(422).json({
            error: moderation.userMessage,
            code: moderation.code,
            categories: moderation.categories,
          })
          return
        }
      }

      // Verify chatId belongs to this brand
      const { data: brandMessages } = await supabase
        .from('conversation_messages')
        .select('id')
        .eq('chat_id', chatId)
        .eq('engagement_scope', 'brand')
        .eq('engagement_brand_key', session.brandKey)
        .gt('expires_at', BRAND_PORTAL_TTL_FLOOR)
        .limit(1)

      // Also allow portal-test / portal-simulation chats for this brand
      const isPortalTest =
        chatId.startsWith(`portal-test#${session.brandKey}`) || chatId.startsWith(`portal-sim#${session.brandKey}`)

      if ((brandMessages?.length ?? 0) === 0 && !isPortalTest) {
        res.status(403).json({ error: 'Conversation not found for this brand' })
        return
      }

      const selectedRows = await fetchScopedThreadRows(supabase, chatId, session.brandKey, BRAND_PORTAL_TTL_FLOOR)
      const recipientHandle = extractParticipantHandle(chatId, selectedRows)
      const linqFrom = getLinqFrom()
      let providerMessageId: string | null = null

      if (!isPortalTest) {
        if (!recipientHandle) {
          res.status(400).json({ error: 'Could not identify the recipient for this conversation' })
          return
        }
        if (!linqFrom) {
          res.status(503).json({ error: 'Linq US sender is not configured (set LINQ_VOICE_FROM to a +1 number)' })
          return
        }
        try {
          await assertPortalHumanModeAvailable(supabase, {
            recipientHandle,
            botNumber: linqFrom,
            brandKey: session.brandKey,
          })
        } catch (err) {
          res.status(409).json({ error: err instanceof Error ? err.message : 'Recipient is not available for human-only mode' })
          return
        }
        try {
          if (!skipLinqDelivery) {
            const sent = await linqSendMessage(
              chatId,
              content,
              attachmentIds,
              agentPayCheckoutUrl || null,
            )
            providerMessageId = sent.providerMessageId
          }
        } catch (err) {
          res.status(502).json({ error: err instanceof Error ? err.message : 'Could not send via Linq' })
          return
        }
        await activatePortalHumanMode(supabase, {
          chatId,
          recipientHandle,
          botNumber: linqFrom,
          brandKey: session.brandKey,
          source: 'brand_portal_manual_reply',
          metadata: {
            source: 'brand_portal_manual_reply',
            recipient_phone_e164: recipientHandle,
          },
        })
        await logPortalOutboundMessage(supabase, {
          chatId,
          content,
          providerMessageId,
          brandKey: session.brandKey,
          recipientHandle,
          source: 'brand_portal_manual_reply',
        })
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const { data: inserted, error: insertError } = await supabase
        .from('conversation_messages')
        .insert({
          chat_id: chatId,
          role: 'assistant',
          content,
          handle: `staff@${session.brandKey}`,
          engagement_scope: 'brand',
          engagement_brand_key: session.brandKey,
          metadata: {
            is_group_chat: false,
            service: 'brand_portal_manual_reply',
            source: 'brand_portal_manual_reply',
            sender_kind: 'staff',
            linq_provider_message_id: providerMessageId,
            recipient_phone_e164: recipientHandle,
            linq_human_mode: !isPortalTest,
          },
          expires_at: expiresAt,
        })
        .select('id, chat_id, role, content, handle, created_at, metadata')
        .single()

      if (insertError) {
        console.error('[brand-portal-config] send_message:', insertError)
        res.status(500).json({ error: 'Could not send message' })
        return
      }

      res.status(200).json({
        message: {
          id: inserted.id,
          role: inserted.role,
          content: inserted.content,
          handle: inserted.handle,
          createdAt: inserted.created_at,
          metadata: inserted.metadata ?? {},
        },
      })
      return
    }

    if (body.action === 'start_message') {
      const rawMobile = typeof body.mobile === 'string' ? body.mobile.trim() : ''
      const rawContent = typeof body.content === 'string' ? body.content.trim() : ''
      const content = rawContent ? ensureSmsUrlsAreClickable(rawContent) : ''
      const customerName = typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 160) : ''
      if (!rawMobile) { res.status(400).json({ error: 'Mobile number is required' }); return }
      if (!content) { res.status(400).json({ error: 'Message is required' }); return }

      const moderation = await moderateNestOutboundMessage(content)
      if (!moderation.allowed) {
        res.status(422).json({
          error: moderation.userMessage,
          code: moderation.code,
          categories: moderation.categories,
        })
        return
      }

      const recipientHandle = normaliseToE164(rawMobile)
      if (!recipientHandle) {
        res.status(400).json({
          error: 'Invalid mobile number',
          detail: 'Enter a valid mobile number including the area code.',
        })
        return
      }

      const linqFrom = getLinqFrom()
      if (!linqFrom) {
        res.status(503).json({ error: 'Linq US sender is not configured (set LINQ_VOICE_FROM to a +1 number)' })
        return
      }

      try {
        await enforceStartMessageRateLimit(supabase, session.brandKey)
        await assertPortalHumanModeAvailable(supabase, {
          recipientHandle,
          botNumber: linqFrom,
          brandKey: session.brandKey,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'New-message limit reached'
        res.status(message.includes('another brand') ? 409 : 429).json({ error: message })
        return
      }

      let created: LinqMessageResult
      try {
        created = await linqCreateChat(linqFrom, recipientHandle, content)
      } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'Could not create Linq chat' })
        return
      }

      await activatePortalHumanMode(supabase, {
        chatId: created.chatId,
        recipientHandle,
        botNumber: linqFrom,
        brandKey: session.brandKey,
        source: 'brand_portal_start_message',
        metadata: {
          source: 'brand_portal_start_message',
          recipient_phone_e164: recipientHandle,
          ...(customerName ? { customer_name: customerName } : {}),
        },
      })
      await logPortalOutboundMessage(supabase, {
        chatId: created.chatId,
        content,
        providerMessageId: created.providerMessageId,
        brandKey: session.brandKey,
        recipientHandle,
        source: 'brand_portal_start_message',
      })

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const { data: inserted, error: insertError } = await supabase
        .from('conversation_messages')
        .insert({
          chat_id: created.chatId,
          role: 'assistant',
          content,
          handle: `staff@${session.brandKey}`,
          engagement_scope: 'brand',
          engagement_brand_key: session.brandKey,
          metadata: {
            is_group_chat: false,
            service: 'brand_portal_start_message',
            source: 'brand_portal_start_message',
            sender_kind: 'staff',
            linq_provider_message_id: created.providerMessageId,
            recipient_phone_e164: recipientHandle,
            ...(customerName ? { customer_name: customerName } : {}),
            linq_human_mode: true,
          },
          expires_at: expiresAt,
        })
        .select('id, chat_id, role, content, handle, created_at, metadata')
        .single()

      if (insertError) {
        console.error('[brand-portal-config] start_message:', insertError)
        res.status(500).json({ error: 'Message sent, but could not save it to the inbox' })
        return
      }

      res.status(200).json({
        chatId: created.chatId,
        message: {
          id: inserted.id,
          role: inserted.role,
          content: inserted.content,
          handle: inserted.handle,
          createdAt: inserted.created_at,
          metadata: inserted.metadata ?? {},
        },
      })
      return
    }

    res.status(400).json({ error: 'Unknown action' })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
