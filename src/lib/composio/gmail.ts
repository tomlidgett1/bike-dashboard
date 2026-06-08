import {
  isComposioConfigured,
} from '@/lib/composio/client'
import {
  getOrCreateGmailComposioSession,
  type ComposioSessionNotice,
  type GmailComposioSessionExecutor,
} from '@/lib/composio/session'
import {
  listActiveConnections,
  listConnectedAccounts,
  listConnectedAccountsSafe,
  mintToolkitConnectLink,
  type ComposioConnectedAccount,
} from '@/lib/composio/toolkit'
import type {
  GmailCardMode,
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
import {
  buildImplicitGmailQuery,
  buildReplySearchPlan,
  buildSentContextQuery,
  extractCorrespondentHint,
  questionNeedsSentContext,
} from '@/lib/composio/gmail-reply-context'

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
const AUTO_HYDRATE_REPLY_COUNT = 5

interface GmailComposioSessionOptions {
  composio_session_id?: string
  on_composio_session?: (notice: ComposioSessionNotice) => void | Promise<void>
}

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
  session: GmailComposioSessionExecutor,
  connectedAccountId: string | undefined,
  args: {
    query: string
    pageToken?: string
    maxResults: number
  },
): Promise<GmailPageResult> {
  const result = await session.execute('GMAIL_FETCH_EMAILS', {
    query: args.query,
    max_results: args.maxResults,
    ...(args.pageToken ? { page_token: args.pageToken } : {}),
    ids_only: false,
    include_payload: true,
    verbose: false,
  }, connectedAccountId)
  const data = unwrapToolResult(result)
  const messages = (
    Array.isArray(data.messages) ? data.messages : []
  ) as Array<Record<string, unknown>>
  const nextPageToken = pickString(data.nextPageToken as string, data.next_page_token as string)

  return { messages, nextPageToken }
}

async function fetchAllGmailMatches(
  session: GmailComposioSessionExecutor,
  connectedAccountId: string | undefined,
  query: string,
): Promise<{ emails: GmailEmailPreview[]; pagesScanned: number; capped: boolean }> {
  let pageToken: string | undefined
  let pagesScanned = 0
  let capped = false
  const emails: GmailEmailPreview[] = []

  while (pagesScanned < GMAIL_MAX_PAGES) {
    const page = await fetchGmailPage(session, connectedAccountId, {
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
  session: GmailComposioSessionExecutor,
  connectedAccountId: string | undefined,
  messageId: string,
): Promise<Record<string, unknown>> {
  const result = await session.execute('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {
    message_id: messageId,
    format: 'full',
  }, connectedAccountId)
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
  } & GmailComposioSessionOptions,
): Promise<GmailMessageContent[]> {
  const connections = await listGmailConnections(userId)
  const connectedAccountIds = args.connected_account_id
    ? [args.connected_account_id]
    : connections.map((connection) => connection.id)
  const session = await getOrCreateGmailComposioSession({
    userId,
    sessionId: args.composio_session_id,
    connectedAccountIds,
    onSession: args.on_composio_session,
  })
  return readGmailMessagesWithSession(userId, args, session)
}

async function readGmailMessagesWithSession(
  _userId: string,
  args: {
    message_ids?: string[]
    connected_account_id?: string
    messages?: Array<{ message_id: string; connected_account_id?: string }>
    max_body_chars?: number
  },
  session: GmailComposioSessionExecutor,
): Promise<GmailMessageContent[]> {
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
        session,
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
  session: GmailComposioSessionExecutor,
  emails: GmailEmailPreview[],
  args: {
    user_question?: string
    max_count?: number
  },
): Promise<GmailMessageContent[]> {
  const needsBody = questionNeedsEmailBody(args.user_question)
  const isReply = questionNeedsSentContext(args.user_question)
  if ((!needsBody && !isReply) || emails.length === 0) return []
  const maxCount = args.max_count ?? (isReply ? AUTO_HYDRATE_REPLY_COUNT : AUTO_HYDRATE_BODY_COUNT)
  const targets = emails.slice(0, maxCount)
  return readGmailMessagesWithSession(userId, {
    messages: targets.map((email) => ({
      message_id: email.message_id,
      connected_account_id: email.connected_account_id,
    })),
  }, session)
}

function dedupeEmailsById(emails: GmailEmailPreview[]): GmailEmailPreview[] {
  const seen = new Set<string>()
  const merged: GmailEmailPreview[] = []
  for (const email of emails) {
    const key = `${email.connected_account_id ?? ''}:${email.message_id}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(email)
  }
  return merged
}

async function enrichWithSentContext(
  userId: string,
  session: GmailComposioSessionExecutor,
  account: ComposioConnectedAccount,
  args: {
    user_question?: string
    sort_order: GmailSortOrder
    displayLimit: number
  },
  baseEmails: GmailEmailPreview[],
): Promise<{ emails: GmailEmailPreview[]; includesSentContext: boolean }> {
  if (!questionNeedsSentContext(args.user_question)) {
    return { emails: baseEmails, includesSentContext: false }
  }

  const hint = extractCorrespondentHint(args.user_question ?? '')
  const sentQuery = buildSentContextQuery(hint)
  if (!sentQuery) return { emails: baseEmails, includesSentContext: false }

  const page = await fetchGmailPage(session, account.id, {
    query: sentQuery,
    maxResults: Math.max(args.displayLimit, QUICK_PAGE_SIZE),
  })
  const sentEmails = tagEmailsForMailbox(
    sortEmails(extractEmailPreviews(page.messages), args.sort_order),
    account,
  )

  if (sentEmails.length === 0) return { emails: baseEmails, includesSentContext: false }

  const merged = sortEmails(
    dedupeEmailsById([...baseEmails, ...sentEmails]),
    args.sort_order,
  )
  return { emails: merged, includesSentContext: true }
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

function buildGmailUiSummary(
  mode: GmailCardMode,
  payload: GmailEmailsPayload,
  userQuestion: string | undefined,
): string {
  const total = payload.scan_stats?.total_matched ?? payload.emails.length
  const mailboxCount = payload.scan_stats?.mailboxes_searched ?? payload.connected_mailboxes?.length ?? 1
  if (mode === 'contact_analysis') {
    const primary = payload.contact_analysis?.earliest_likely_sales_contact
    if (primary) {
      return `${primary.display_name ?? primary.email_address ?? primary.from} is the earliest likely sales contact from ${primary.first_seen_label ?? 'the scanned history'}.`
    }
    return 'Scanned sender history but did not find a clear sales contact.'
  }
  if (mode === 'reply_context') {
    const bodies = payload.message_bodies?.length ?? 0
    const sent = payload.includes_sent_context ? 'including sent context' : 'from matching threads'
    return `Found ${bodies || payload.emails.length} context item${(bodies || payload.emails.length) === 1 ? '' : 's'} ${sent} for the reply.`
  }
  if (mode === 'thread_context') {
    const bodies = payload.message_bodies?.length ?? 0
    return bodies > 0
      ? `Read ${bodies} relevant message${bodies === 1 ? '' : 's'} for the answer.`
      : `Found ${total.toLocaleString('en-AU')} matching email${total === 1 ? '' : 's'}; message bodies may still be needed.`
  }
  if (total === 0) {
    return `No Gmail matches for ${payload.query || userQuestion || 'that search'}.`
  }
  return `Found ${total.toLocaleString('en-AU')} matching email${total === 1 ? '' : 's'} across ${mailboxCount} mailbox${mailboxCount === 1 ? '' : 'es'}.`
}

export function inferGmailCardMode(
  _userQuestion: string | undefined,
  _payload: GmailEmailsPayload,
): GmailCardMode {
  return 'hidden'
}

function attachGmailUiMode(
  payload: GmailEmailsPayload,
  userQuestion: string | undefined,
): GmailEmailsPayload {
  const ui_mode = inferGmailCardMode(userQuestion, payload)
  return {
    ...payload,
    ui_mode,
    ui_summary: buildGmailUiSummary(ui_mode, payload, userQuestion),
  }
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
  const includesSentContext = payloads.some((payload) => payload.includes_sent_context)

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
    includesSentContext,
  )
}

async function searchGmailEmailsForAccount(
  userId: string,
  session: GmailComposioSessionExecutor,
  account: ComposioConnectedAccount,
  args: {
    query?: string
    max_results?: number
    sort_order?: GmailSortOrder
    scan_depth?: GmailScanDepth
    user_question?: string
  },
): Promise<GmailEmailsPayload> {
  const query = resolveSearchQuery(args)
  const sortOrder = args.sort_order ?? 'newest'
  const scanDepth = args.scan_depth ?? 'quick'
  const displayLimit = clampDisplayLimit(args.max_results)
  const connectedAccountId = account.id
  const mailboxLabel = account.email_address ?? account.label

  if (scanDepth === 'full') {
    const { emails: allEmails, pagesScanned, capped } = await fetchAllGmailMatches(
      session,
      connectedAccountId,
      query,
    )
    let sorted = tagEmailsForMailbox(sortEmails(allEmails, sortOrder), account)
    let includesSentContext = false

    if (questionNeedsSentContext(args.user_question) && !query.includes('in:sent')) {
      const enriched = await enrichWithSentContext(userId, session, account, {
        user_question: args.user_question,
        sort_order: sortOrder,
        displayLimit,
      }, sorted)
      sorted = sortEmails(enriched.emails, sortOrder)
      includesSentContext = enriched.includesSentContext
    }

    const dateRange = dateRangeFromEmails(sorted)
    const rawSummary = buildSenderSummary(sorted)
    const analysis = attachAnalysis(sorted, rawSummary)
    const displayEmails = sorted.slice(0, displayLimit)
    const messageBodies = await hydrateMessageBodiesForAgent(userId, session, displayEmails, {
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
      includesSentContext,
    )
  }

  const page = await fetchGmailPage(session, connectedAccountId, {
    query,
    maxResults: Math.min(Math.max(displayLimit, QUICK_PAGE_SIZE), QUICK_PAGE_SIZE),
  })
  let pageEmails = tagEmailsForMailbox(
    sortEmails(extractEmailPreviews(page.messages), sortOrder),
    account,
  )
  const enriched = await enrichWithSentContext(userId, session, account, {
    user_question: args.user_question,
    sort_order: sortOrder,
    displayLimit,
  }, pageEmails)
  pageEmails = enriched.emails
  const includesSentContext = enriched.includesSentContext

  const dateRange = dateRangeFromEmails(pageEmails)
  const rawSummary = buildSenderSummary(pageEmails)
  const analysis = attachAnalysis(pageEmails, rawSummary)
  const displayEmails = pageEmails.slice(0, displayLimit)
  const messageBodies = await hydrateMessageBodiesForAgent(userId, session, displayEmails, {
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
        pages_scanned: includesSentContext ? 2 : 1,
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
    includesSentContext,
  )
}
function resolveSearchQuery(args: { query?: string; user_question?: string }): string {
  return args.query?.trim() || buildImplicitGmailQuery(args.user_question) || 'in:inbox'
}

function buildSearchPayload(
  base: Omit<GmailEmailsPayload, 'answer_readiness'>,
  userQuestion: string | undefined,
  searchArgs: { sort_order?: GmailSortOrder; scan_depth?: GmailScanDepth },
  messageBodies: GmailMessageContent[],
  includesSentContext = false,
): GmailEmailsPayload {
  let payload: GmailEmailsPayload = {
    ...base,
    message_bodies: messageBodies.length > 0 ? messageBodies : undefined,
  }
  payload.answer_readiness = buildGmailAnswerReadiness(userQuestion, payload, searchArgs) ?? undefined
  payload = attachReplyMetadata(payload, userQuestion, includesSentContext)
  payload = attachGmailUiMode(payload, userQuestion)
  return payload
}

function attachReplyMetadata(
  payload: GmailEmailsPayload,
  userQuestion: string | undefined,
  includesSentContext: boolean,
): GmailEmailsPayload {
  if (!userQuestion?.trim()) return payload

  const hint = extractCorrespondentHint(userQuestion)
  const suggested = buildReplySearchPlan(userQuestion)
  const hasHint = Boolean(hint.name || hint.email)

  return {
    ...payload,
    correspondent_hint: hasHint ? hint : payload.correspondent_hint ?? null,
    suggested_reply_passes: suggested.length > 0 ? suggested : payload.suggested_reply_passes,
    includes_sent_context: includesSentContext || payload.includes_sent_context,
  }
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
  } & GmailComposioSessionOptions,
): Promise<GmailEmailsPayload> {
  const query = resolveSearchQuery(args)
  const sortOrder = args.sort_order ?? 'newest'
  const scanDepth = args.scan_depth ?? 'quick'

  const allConnections = await listGmailConnections(userId)
  const connections = args.connected_account_id
    ? allConnections.filter((connection) => connection.id === args.connected_account_id)
    : allConnections
  const searchableConnections = connections.length > 0 ? connections : allConnections

  if (args.connected_account_id && connections.length === 0 && allConnections.length > 0) {
    console.warn('[gmail] requested connected account not found; searching all active Gmail accounts:', args.connected_account_id)
  }

  if (searchableConnections.length === 0) {
    return buildSearchPayload(
      {
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
      },
      args.user_question,
      { sort_order: sortOrder, scan_depth: scanDepth },
      [],
    )
  }

  const session = await getOrCreateGmailComposioSession({
    userId,
    sessionId: args.composio_session_id,
    connectedAccountIds: searchableConnections.map((connection) => connection.id),
    onSession: args.on_composio_session,
  })

  if (searchableConnections.length === 1) {
    return searchGmailEmailsForAccount(userId, session, searchableConnections[0], args)
  }

  const perMailbox = await Promise.all(
    searchableConnections.map((connection) => searchGmailEmailsForAccount(userId, session, connection, args)),
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
    searchableConnections.length,
  )

  merged.connected_mailboxes = searchableConnections.map((connection) => ({
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
  } & GmailComposioSessionOptions,
): Promise<Record<string, unknown>> {
  const session = await getOrCreateGmailComposioSession({
    userId,
    sessionId: args.composio_session_id,
    connectedAccountIds: args.connected_account_id ? [args.connected_account_id] : undefined,
    onSession: args.on_composio_session,
  })
  const result = await session.execute('GMAIL_SEND_EMAIL', {
    recipient_email: args.recipient_email,
    subject: args.subject,
    body: args.body,
    ...(args.cc?.length ? { cc: args.cc } : {}),
    ...(args.bcc?.length ? { bcc: args.bcc } : {}),
    ...(args.is_html ? { is_html: true } : {}),
  }, args.connected_account_id)
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
  } & GmailComposioSessionOptions,
): Promise<Record<string, unknown>> {
  const session = await getOrCreateGmailComposioSession({
    userId,
    sessionId: args.composio_session_id,
    connectedAccountIds: args.connected_account_id ? [args.connected_account_id] : undefined,
    onSession: args.on_composio_session,
  })
  const result = await session.execute('GMAIL_CREATE_EMAIL_DRAFT', {
    recipient_email: args.recipient_email,
    subject: args.subject,
    body: args.body,
    ...(args.cc?.length ? { cc: args.cc } : {}),
    ...(args.bcc?.length ? { bcc: args.bcc } : {}),
    ...(args.is_html ? { is_html: true } : {}),
  }, args.connected_account_id)
  return unwrapToolResult(result)
}

export { isComposioConfigured }
