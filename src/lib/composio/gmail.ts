import {
  getComposioClient,
  getComposioUserId,
  isComposioConfigured,
} from '@/lib/composio/client'
import {
  getActiveConnection,
  listActiveConnections,
  listConnectedAccounts,
  listConnectedAccountsSafe,
  mintToolkitConnectLink,
  type ComposioConnectedAccount,
} from '@/lib/composio/toolkit'
import type {
  GmailEmailPreview,
  GmailEmailsPayload,
  GmailMessageContent,
  GmailScanDepth,
  GmailSenderSummary,
  GmailSortOrder,
} from '@/lib/types/genie-agent'
import {
  buildContactAnalysis,
  enrichSenderSummary,
} from '@/lib/composio/gmail-contact-analysis'
import { buildGmailAnswerReadiness } from '@/lib/genie/answer-verification'
import {
  extractBodyTextFromMessage,
  questionNeedsEmailBody,
} from '@/lib/composio/gmail-message-body'

export type { ComposioConnectedAccount }
export { listConnectedAccounts, listConnectedAccountsSafe }

/** Composio/Gmail hard cap per page. */
const GMAIL_PAGE_SIZE = 500
const QUICK_PAGE_SIZE = 100
/** Safety stop for full scans (500 × 30 = 15k messages). */
const GMAIL_MAX_PAGES = 30
const DEFAULT_DISPLAY_LIMIT = 8
const MAX_DISPLAY_LIMIT = 50
const MAX_SENDER_SUMMARY = 80
const MAX_BODY_CHARS = 12_000
const AUTO_HYDRATE_BODY_COUNT = 3

export async function listGmailConnections(userId: string): Promise<ComposioConnectedAccount[]> {
  const { accounts, error } = await listConnectedAccountsSafe(userId)
  if (error) throw new Error(error)
  return listActiveConnections(accounts, 'gmail')
}

export async function getGmailConnection(
  userId: string,
  connectedAccountId?: string,
): Promise<ComposioConnectedAccount | null> {
  const connections = await listGmailConnections(userId)
  if (connectedAccountId) {
    return connections.find((connection) => connection.id === connectedAccountId) ?? null
  }
  return connections[0] ?? null
}

export async function mintGmailConnectLink(userId: string): Promise<{ url: string }> {
  const link = await mintToolkitConnectLink(userId, 'gmail', { allowMultiple: true })
  return { url: link.url }
}

function unwrapToolResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {}
  const row = result as Record<string, unknown>
  const data = row.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return row
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseEmailTimestampMs(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric)) return null
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
  }
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function extractEmailTimestampMs(
  raw: Record<string, unknown>,
  headerValue?: (name: string) => string | null,
): number | null {
  const candidates = [
    raw.messageTimestamp,
    raw.message_timestamp,
    raw.internalDate,
    raw.internal_date,
    raw.date,
    headerValue?.('Date'),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate < 1_000_000_000_000 ? candidate * 1000 : candidate
    }
    if (typeof candidate === 'string') {
      const ms = parseEmailTimestampMs(candidate)
      if (ms != null) return ms
    }
  }
  return null
}

function formatEmailDateLabel(ms: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

function normaliseEmailPreview(raw: Record<string, unknown>): GmailEmailPreview | null {
  const messageId = pickString(raw.messageId, raw.message_id, raw.id)
  if (!messageId) return null

  const payload = raw.payload as Record<string, unknown> | undefined
  const headers = Array.isArray(payload?.headers)
    ? payload.headers as Array<{ name?: string; value?: string }>
    : Array.isArray(raw.headers)
      ? raw.headers as Array<{ name?: string; value?: string }>
      : []

  const headerValue = (name: string) =>
    headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? null

  const subject = pickString(raw.subject, headerValue('Subject')) ?? '(No subject)'
  const from = pickString(raw.from, raw.sender, headerValue('From')) ?? 'Unknown sender'
  const to = pickString(raw.to, headerValue('To'))
  const bodyText = extractBodyTextFromMessage(raw)
  const snippetSource = pickString(raw.snippet, raw.preview, raw.body_preview) ?? bodyText
  const snippet = snippetSource.slice(0, 280)
  const threadId = pickString(raw.threadId, raw.thread_id)
  const internalDateMs = extractEmailTimestampMs(raw, headerValue)
  const dateLabel = internalDateMs != null ? formatEmailDateLabel(internalDateMs) : null

  return {
    message_id: messageId,
    thread_id: threadId,
    subject,
    from,
    to,
    snippet,
    internal_date_ms: internalDateMs,
    date_label: dateLabel,
  }
}

function extractEmailPreviews(messages: Array<Record<string, unknown>>): GmailEmailPreview[] {
  return messages
    .map((message) => normaliseEmailPreview(message))
    .filter((message): message is GmailEmailPreview => Boolean(message))
}

interface GmailPageResult {
  messages: Array<Record<string, unknown>>
  nextPageToken: string | null
}

async function fetchGmailPage(
  composioUserId: string,
  connectedAccountId: string | undefined,
  args: {
    query: string
    pageToken?: string
    maxResults: number
  },
): Promise<GmailPageResult> {
  const composio = getComposioClient()
  const executeArgs = {
    userId: composioUserId,
    connectedAccountId,
    arguments: {
      query: args.query,
      max_results: args.maxResults,
      ...(args.pageToken ? { page_token: args.pageToken } : {}),
      ids_only: false,
      include_payload: true,
      verbose: false,
    },
    dangerouslySkipVersionCheck: true,
  } as Parameters<typeof composio.tools.execute>[1]

  const result = await composio.tools.execute('GMAIL_FETCH_EMAILS', executeArgs)
  const data = unwrapToolResult(result)
  const messages = (
    Array.isArray(data.messages) ? data.messages : []
  ) as Array<Record<string, unknown>>
  const nextPageToken = pickString(data.nextPageToken as string, data.next_page_token as string)

  return { messages, nextPageToken }
}

async function fetchAllGmailMatches(
  composioUserId: string,
  connectedAccountId: string | undefined,
  query: string,
): Promise<{ emails: GmailEmailPreview[]; pagesScanned: number; capped: boolean }> {
  let pageToken: string | undefined
  let pagesScanned = 0
  let capped = false
  const emails: GmailEmailPreview[] = []

  while (pagesScanned < GMAIL_MAX_PAGES) {
    const page = await fetchGmailPage(composioUserId, connectedAccountId, {
      query,
      pageToken,
      maxResults: GMAIL_PAGE_SIZE,
    })
    emails.push(...extractEmailPreviews(page.messages))
    pagesScanned += 1

    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
    if (pagesScanned >= GMAIL_MAX_PAGES) capped = true
  }

  return { emails, pagesScanned, capped }
}

function buildSenderSummary(emails: GmailEmailPreview[]): GmailSenderSummary[] {
  const bySender = new Map<string, GmailSenderSummary>()

  for (const email of emails) {
    const from = email.from
    const existing = bySender.get(from)
    const ms = email.internal_date_ms

    if (!existing) {
      bySender.set(from, {
        from,
        email_count: 1,
        first_seen_ms: ms,
        first_seen_label: email.date_label,
        last_seen_ms: ms,
        last_seen_label: email.date_label,
      })
      continue
    }

    existing.email_count += 1
    if (ms != null && (existing.first_seen_ms == null || ms < existing.first_seen_ms)) {
      existing.first_seen_ms = ms
      existing.first_seen_label = email.date_label
    }
    if (ms != null && (existing.last_seen_ms == null || ms > existing.last_seen_ms)) {
      existing.last_seen_ms = ms
      existing.last_seen_label = email.date_label
    }
  }

  return [...bySender.values()]
    .sort((a, b) => (a.first_seen_ms ?? Number.MAX_SAFE_INTEGER) - (b.first_seen_ms ?? Number.MAX_SAFE_INTEGER))
    .slice(0, MAX_SENDER_SUMMARY)
}

function dateRangeFromEmails(emails: GmailEmailPreview[]) {
  let oldestMs: number | null = null
  let newestMs: number | null = null

  for (const email of emails) {
    const ms = email.internal_date_ms
    if (ms == null) continue
    if (oldestMs == null || ms < oldestMs) oldestMs = ms
    if (newestMs == null || ms > newestMs) newestMs = ms
  }

  return {
    oldest_date_ms: oldestMs,
    newest_date_ms: newestMs,
    oldest_date_label: oldestMs != null ? formatEmailDateLabel(oldestMs) : null,
    newest_date_label: newestMs != null ? formatEmailDateLabel(newestMs) : null,
  }
}

function sortEmails(emails: GmailEmailPreview[], sortOrder: GmailSortOrder): GmailEmailPreview[] {
  return [...emails].sort((a, b) => {
    const aTime = a.internal_date_ms ?? 0
    const bTime = b.internal_date_ms ?? 0
    return sortOrder === 'oldest' ? aTime - bTime : bTime - aTime
  })
}

function clampDisplayLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? DEFAULT_DISPLAY_LIMIT, 1), MAX_DISPLAY_LIMIT)
}

function buildTitle(query: string, sortOrder: GmailSortOrder, scanDepth: GmailScanDepth): string {
  const base = query === 'in:inbox' ? 'Inbox emails' : `Emails matching “${query}”`
  if (scanDepth === 'full') {
    return sortOrder === 'oldest' ? `Oldest · ${base}` : `Full scan · ${base}`
  }
  return sortOrder === 'oldest' ? `Oldest page · ${base}` : base
}

function attachAnalysis(
  emails: GmailEmailPreview[],
  senderSummary: GmailSenderSummary[],
): Pick<GmailEmailsPayload, 'sender_summary' | 'contact_analysis'> {
  const contact_analysis = buildContactAnalysis(emails) ?? undefined
  const sender_summary =
    emails.length > 0 ? enrichSenderSummary(senderSummary, emails) : senderSummary
  return { sender_summary, contact_analysis }
}

function unwrapGmailMessage(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.message
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>
  }
  return raw
}

async function fetchGmailMessageRaw(
  composioUserId: string,
  connectedAccountId: string | undefined,
  messageId: string,
): Promise<Record<string, unknown>> {
  const composio = getComposioClient()
  const executeArgs = {
    userId: composioUserId,
    connectedAccountId,
    arguments: {
      message_id: messageId,
      format: 'full',
    },
    dangerouslySkipVersionCheck: true,
  } as Parameters<typeof composio.tools.execute>[1]

  const result = await composio.tools.execute('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', executeArgs)
  return unwrapGmailMessage(unwrapToolResult(result))
}

function toMessageContent(
  preview: GmailEmailPreview,
  bodyText: string,
  maxBodyChars: number,
): GmailMessageContent {
  const trimmed = bodyText.trim()
  return {
    ...preview,
    body_text: trimmed.slice(0, maxBodyChars),
    body_truncated: trimmed.length > maxBodyChars,
  }
}

export async function readGmailMessages(
  userId: string,
  args: {
    message_ids?: string[]
    connected_account_id?: string
    messages?: Array<{ message_id: string; connected_account_id?: string }>
    max_body_chars?: number
  },
): Promise<GmailMessageContent[]> {
  const composioUserId = getComposioUserId(userId)
  const maxBodyChars = args.max_body_chars ?? MAX_BODY_CHARS
  const targets = args.messages?.length
    ? args.messages
    : [...new Set((args.message_ids ?? []).map((id) => id.trim()).filter(Boolean))]
        .slice(0, 5)
        .map((message_id) => ({
          message_id,
          connected_account_id: args.connected_account_id,
        }))
  const results: GmailMessageContent[] = []

  for (const target of targets.slice(0, 5)) {
    try {
      const raw = await fetchGmailMessageRaw(
        composioUserId,
        target.connected_account_id,
        target.message_id,
      )
      const preview = normaliseEmailPreview(raw)
      if (!preview) continue
      const bodyText = extractBodyTextFromMessage(raw)
      results.push(
        toMessageContent(
          {
            ...preview,
            connected_account_id: target.connected_account_id ?? preview.connected_account_id,
          },
          bodyText,
          maxBodyChars,
        ),
      )
    } catch (error) {
      console.error('[gmail] read message failed:', target.message_id, error)
    }
  }

  return results
}

async function hydrateMessageBodiesForAgent(
  userId: string,
  emails: GmailEmailPreview[],
  args: {
    user_question?: string
    max_count?: number
  },
): Promise<GmailMessageContent[]> {
  if (!questionNeedsEmailBody(args.user_question) || emails.length === 0) return []
  const targets = emails.slice(0, args.max_count ?? AUTO_HYDRATE_BODY_COUNT)
  return readGmailMessages(userId, {
    messages: targets.map((email) => ({
      message_id: email.message_id,
      connected_account_id: email.connected_account_id,
    })),
  })
}

function tagEmailsForMailbox(
  emails: GmailEmailPreview[],
  account: ComposioConnectedAccount,
): GmailEmailPreview[] {
  const mailboxLabel = account.email_address ?? account.label
  return emails.map((email) => ({
    ...email,
    connected_account_id: account.id,
    mailbox_label: mailboxLabel,
  }))
}

function buildMultiMailboxTitle(query: string, sortOrder: GmailSortOrder, scanDepth: GmailScanDepth, mailboxCount: number): string {
  const base = buildTitle(query, sortOrder, scanDepth)
  return mailboxCount > 1 ? `${base} · ${mailboxCount} mailboxes` : base
}

function mergeSearchPayloads(
  payloads: GmailEmailsPayload[],
  args: {
    query: string
    sort_order: GmailSortOrder
    scan_depth: GmailScanDepth
    max_results: number
    user_question?: string
  },
  mailboxCount: number,
): GmailEmailsPayload {
  const displayLimit = clampDisplayLimit(args.max_results)
  const mergedEmails = sortEmails(
    payloads.flatMap((payload) => payload.emails),
    args.sort_order,
  )
  const displayEmails = mergedEmails.slice(0, displayLimit)
  const allForAnalysis = payloads.flatMap((payload) => payload.emails)
  const rawSummary = buildSenderSummary(allForAnalysis)
  const analysis = attachAnalysis(allForAnalysis, rawSummary)
  const dateRange = dateRangeFromEmails(mergedEmails)
  const totalMatched = payloads.reduce((sum, payload) => sum + (payload.scan_stats?.total_matched ?? payload.emails.length), 0)
  const pagesScanned = payloads.reduce((sum, payload) => sum + (payload.scan_stats?.pages_scanned ?? 1), 0)
  const capped = payloads.some((payload) => payload.scan_stats?.capped)

  return buildSearchPayload(
    {
      title: buildMultiMailboxTitle(args.query, args.sort_order, args.scan_depth, mailboxCount),
      query: args.query,
      emails: displayEmails,
      truncated: mergedEmails.length > displayLimit || payloads.some((payload) => payload.truncated),
      scan_stats: {
        total_matched: totalMatched,
        pages_scanned: pagesScanned,
        scan_mode: args.scan_depth === 'full' ? 'full' : 'quick',
        capped,
        mailboxes_searched: mailboxCount,
        ...dateRange,
      },
      connected_mailboxes: payloads.flatMap((payload) => payload.connected_mailboxes ?? []),
      ...analysis,
    },
    args.user_question,
    { sort_order: args.sort_order, scan_depth: args.scan_depth },
    payloads.flatMap((payload) => payload.message_bodies ?? []),
  )
}

async function searchGmailEmailsForAccount(
  userId: string,
  account: ComposioConnectedAccount,
  args: {
    query?: string
    max_results?: number
    sort_order?: GmailSortOrder
    scan_depth?: GmailScanDepth
    user_question?: string
  },
): Promise<GmailEmailsPayload> {
  const query = args.query?.trim() || 'in:inbox'
  const sortOrder = args.sort_order ?? 'newest'
  const scanDepth = args.scan_depth ?? 'quick'
  const displayLimit = clampDisplayLimit(args.max_results)
  const composioUserId = getComposioUserId(userId)
  const connectedAccountId = account.id
  const mailboxLabel = account.email_address ?? account.label

  if (scanDepth === 'full') {
    const { emails: allEmails, pagesScanned, capped } = await fetchAllGmailMatches(
      composioUserId,
      connectedAccountId,
      query,
    )
    const sorted = tagEmailsForMailbox(sortEmails(allEmails, sortOrder), account)
    const dateRange = dateRangeFromEmails(sorted)
    const rawSummary = buildSenderSummary(sorted)
    const analysis = attachAnalysis(sorted, rawSummary)
    const displayEmails = sorted.slice(0, displayLimit)
    const messageBodies = await hydrateMessageBodiesForAgent(userId, displayEmails, {
      user_question: args.user_question,
    })

    return buildSearchPayload(
      {
        title: buildTitle(query, sortOrder, scanDepth),
        query,
        emails: displayEmails,
        truncated: sorted.length > displayLimit,
        scan_stats: {
          total_matched: sorted.length,
          pages_scanned: pagesScanned,
          scan_mode: 'full',
          capped,
          mailboxes_searched: 1,
          ...dateRange,
        },
        connected_mailboxes: [{ id: account.id, label: mailboxLabel, email_address: account.email_address ?? null }],
        ...analysis,
      },
      args.user_question,
      { sort_order: sortOrder, scan_depth: scanDepth },
      messageBodies,
    )
  }

  const page = await fetchGmailPage(composioUserId, connectedAccountId, {
    query,
    maxResults: Math.min(Math.max(displayLimit, QUICK_PAGE_SIZE), QUICK_PAGE_SIZE),
  })
  const pageEmails = tagEmailsForMailbox(
    sortEmails(extractEmailPreviews(page.messages), sortOrder),
    account,
  )
  const dateRange = dateRangeFromEmails(pageEmails)
  const rawSummary = buildSenderSummary(pageEmails)
  const analysis = attachAnalysis(pageEmails, rawSummary)
  const displayEmails = pageEmails.slice(0, displayLimit)
  const messageBodies = await hydrateMessageBodiesForAgent(userId, displayEmails, {
    user_question: args.user_question,
  })

  return buildSearchPayload(
    {
      title: buildTitle(query, sortOrder, scanDepth),
      query,
      emails: displayEmails,
      truncated: Boolean(page.nextPageToken) || pageEmails.length > displayLimit,
      scan_stats: {
        total_matched: pageEmails.length,
        pages_scanned: 1,
        scan_mode: 'quick',
        capped: false,
        mailboxes_searched: 1,
        ...dateRange,
      },
      connected_mailboxes: [{ id: account.id, label: mailboxLabel, email_address: account.email_address ?? null }],
      ...analysis,
    },
    args.user_question,
    { sort_order: sortOrder, scan_depth: scanDepth },
    messageBodies,
  )
}
function buildSearchPayload(
  base: Omit<GmailEmailsPayload, 'answer_readiness'>,
  userQuestion: string | undefined,
  searchArgs: { sort_order?: GmailSortOrder; scan_depth?: GmailScanDepth },
  messageBodies: GmailMessageContent[],
): GmailEmailsPayload {
  const payload: GmailEmailsPayload = {
    ...base,
    message_bodies: messageBodies.length > 0 ? messageBodies : undefined,
  }
  payload.answer_readiness = buildGmailAnswerReadiness(userQuestion, payload, searchArgs) ?? undefined
  return payload
}

export async function searchGmailEmails(
  userId: string,
  args: {
    query?: string
    max_results?: number
    connected_account_id?: string
    sort_order?: GmailSortOrder
    scan_depth?: GmailScanDepth
    user_question?: string
  },
): Promise<GmailEmailsPayload> {
  const query = args.query?.trim() || 'in:inbox'
  const sortOrder = args.sort_order ?? 'newest'
  const scanDepth = args.scan_depth ?? 'quick'

  const connections = args.connected_account_id
    ? (await listGmailConnections(userId)).filter((connection) => connection.id === args.connected_account_id)
    : await listGmailConnections(userId)

  if (connections.length === 0) {
    return {
      title: buildTitle(query, sortOrder, scanDepth),
      query,
      emails: [],
      truncated: false,
      scan_stats: {
        total_matched: 0,
        pages_scanned: 0,
        scan_mode: scanDepth === 'full' ? 'full' : 'quick',
        capped: false,
        mailboxes_searched: 0,
        oldest_date_ms: null,
        newest_date_ms: null,
        oldest_date_label: null,
        newest_date_label: null,
      },
    }
  }

  if (connections.length === 1) {
    return searchGmailEmailsForAccount(userId, connections[0], args)
  }

  const perMailbox = await Promise.all(
    connections.map((connection) => searchGmailEmailsForAccount(userId, connection, args)),
  )

  const merged = mergeSearchPayloads(
    perMailbox,
    {
      query,
      sort_order: sortOrder,
      scan_depth: scanDepth,
      max_results: args.max_results ?? DEFAULT_DISPLAY_LIMIT,
      user_question: args.user_question,
    },
    connections.length,
  )

  merged.connected_mailboxes = connections.map((connection) => ({
    id: connection.id,
    label: connection.email_address ?? connection.label,
    email_address: connection.email_address ?? null,
  }))

  return merged
}

export async function executeGmailSendEmail(
  userId: string,
  args: {
    recipient_email: string
    subject: string
    body: string
    cc?: string[]
    bcc?: string[]
    is_html?: boolean
    connected_account_id?: string
  },
): Promise<Record<string, unknown>> {
  const composio = getComposioClient()
  const composioUserId = getComposioUserId(userId)
  const executeArgs = {
    userId: composioUserId,
    connectedAccountId: args.connected_account_id,
    arguments: {
      recipient_email: args.recipient_email,
      subject: args.subject,
      body: args.body,
      ...(args.cc?.length ? { cc: args.cc } : {}),
      ...(args.bcc?.length ? { bcc: args.bcc } : {}),
      ...(args.is_html ? { is_html: true } : {}),
    },
    dangerouslySkipVersionCheck: true,
  } as Parameters<typeof composio.tools.execute>[1]

  const result = await composio.tools.execute('GMAIL_SEND_EMAIL', executeArgs)
  return unwrapToolResult(result)
}

export async function executeGmailCreateDraft(
  userId: string,
  args: {
    recipient_email: string
    subject: string
    body: string
    cc?: string[]
    bcc?: string[]
    is_html?: boolean
    connected_account_id?: string
  },
): Promise<Record<string, unknown>> {
  const composio = getComposioClient()
  const composioUserId = getComposioUserId(userId)
  const executeArgs = {
    userId: composioUserId,
    connectedAccountId: args.connected_account_id,
    arguments: {
      recipient_email: args.recipient_email,
      subject: args.subject,
      body: args.body,
      ...(args.cc?.length ? { cc: args.cc } : {}),
      ...(args.bcc?.length ? { bcc: args.bcc } : {}),
      ...(args.is_html ? { is_html: true } : {}),
    },
    dangerouslySkipVersionCheck: true,
  } as Parameters<typeof composio.tools.execute>[1]

  const result = await composio.tools.execute('GMAIL_CREATE_EMAIL_DRAFT', executeArgs)
  return unwrapToolResult(result)
}

export { isComposioConfigured }
