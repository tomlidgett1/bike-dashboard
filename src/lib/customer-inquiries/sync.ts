import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isComposioConfigured,
  getGmailConnection,
  listGmailConnections,
  readGmailMessages,
  readGmailThread,
  searchGmailEmails,
} from '@/lib/composio/gmail'
import {
  emailLooksLowValue,
  parseGmailSender,
} from '@/lib/composio/gmail-response-suggestions'
import type { GmailEmailPreview } from '@/lib/types/genie-agent'
import { classifyInquiryEmails, isImportableInquiry } from '@/lib/customer-inquiries/classify-inquiry-email'
import { isBannedSender, listBannedSenderEmails } from '@/lib/customer-inquiries/banned-senders'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { recordInquiryEvent } from '@/lib/customer-inquiries/events'
import { generateInquiryDraft, reviseInquiryDraftWithInstruction } from '@/lib/customer-inquiries/draft-response'
import { buildLightspeedInquiryContext } from '@/lib/customer-inquiries/lightspeed-context'
import {
  extractPhoneFromInquirySender,
  resolvePhoneContactsForInbox,
} from '@/lib/customer-inquiries/lightspeed-phone-directory'
import { getOrRefreshEmailStyleProfile } from '@/lib/customer-inquiries/style-profile'
import type {
  CustomerInquiryRow,
  CustomerInquiryStatus,
  InquiryCitation,
  InquiryThreadMessage,
  LightspeedInquiryContext,
} from '@/lib/customer-inquiries/types'
import {
  buildThreadMessages,
  findLatestCustomerMessage,
  isShopSender,
  normaliseShopEmails,
  threadReplyState,
} from '@/lib/customer-inquiries/thread'

const INBOX_QUERY = 'in:inbox newer_than:14d -category:promotions -category:social'
const MAX_STORES_PER_RUN = 8
const MAX_NEW_INQUIRIES_PER_STORE = 6
const MAX_BODY_READS_PER_STORE = 14
const MAX_PROCESS_PER_STORE = 4
const MAX_RETRIES = 3
const MAX_RECONCILE_PER_STORE = 40

export type CustomerInquirySyncSummary = {
  stores_checked: number
  inquiries_created: number
  inquiries_processed: number
  inquiries_failed: number
  failed: number
}

function passesInitialInboxGate(email: GmailEmailPreview): boolean {
  if (emailLooksLowValue(email)) return false
  if (!parseGmailSender(email.from).email) return false
  return true
}

async function resolveInquiryCustomerName(
  supabase: SupabaseClient,
  userId: string,
  senderEmail: string,
  senderName: string,
): Promise<string | null> {
  const phone = extractPhoneFromInquirySender(senderEmail, senderName)
  if (!phone) return null

  const names = await resolvePhoneContactsForInbox(supabase, userId, [phone], {
    allowApi: true,
    apiLimit: 1,
  })
  return names.get(phone) ?? null
}

function mapRow(raw: Record<string, unknown>): CustomerInquiryRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    gmail_message_id: String(raw.gmail_message_id),
    gmail_thread_id: raw.gmail_thread_id ? String(raw.gmail_thread_id) : null,
    thread_messages: Array.isArray(raw.thread_messages)
      ? (raw.thread_messages as InquiryThreadMessage[])
      : [],
    thread_message_count: Number(raw.thread_message_count ?? 1),
    last_customer_at: raw.last_customer_at ? String(raw.last_customer_at) : null,
    last_shop_reply_at: raw.last_shop_reply_at ? String(raw.last_shop_reply_at) : null,
    connected_account_id: raw.connected_account_id ? String(raw.connected_account_id) : null,
    sender_name: String(raw.sender_name ?? ''),
    sender_email: String(raw.sender_email ?? ''),
    lightspeed_customer_name: raw.lightspeed_customer_name
      ? String(raw.lightspeed_customer_name)
      : null,
    subject: String(raw.subject ?? ''),
    snippet: String(raw.snippet ?? ''),
    body_preview: String(raw.body_preview ?? ''),
    received_at: raw.received_at ? String(raw.received_at) : null,
    intent: raw.intent as CustomerInquiryRow['intent'],
    priority: raw.priority as CustomerInquiryRow['priority'],
    status: raw.status as CustomerInquiryStatus,
    draft_body: String(raw.draft_body ?? ''),
    draft_subject: raw.draft_subject ? String(raw.draft_subject) : null,
    citations: Array.isArray(raw.citations) ? (raw.citations as InquiryCitation[]) : [],
    lightspeed_context: (raw.lightspeed_context as LightspeedInquiryContext) ?? { matched: false },
    style_profile_version: raw.style_profile_version != null ? Number(raw.style_profile_version) : null,
    reasoning: String(raw.reasoning ?? ''),
    error_message: raw.error_message ? String(raw.error_message) : null,
    retry_count: Number(raw.retry_count ?? 0),
    last_synced_at: raw.last_synced_at ? String(raw.last_synced_at) : null,
    draft_generated_at: raw.draft_generated_at ? String(raw.draft_generated_at) : null,
    sent_at: raw.sent_at ? String(raw.sent_at) : null,
    ignored_at: raw.ignored_at ? String(raw.ignored_at) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  }
}

export function mapCustomerInquiryRow(raw: Record<string, unknown>): CustomerInquiryRow {
  return mapRow(raw)
}

type ExistingInquiryRef = {
  id: string
  gmail_message_id: string
  gmail_thread_id: string | null
  received_at: string | null
  status: CustomerInquiryStatus
}

async function resolveThreadContext(
  userId: string,
  inquiry: CustomerInquiryRow,
): Promise<{
  threadMessages: InquiryThreadMessage[]
  replyState: ReturnType<typeof threadReplyState>
}> {
  const connection =
    (inquiry.connected_account_id
      ? await getGmailConnection(userId, inquiry.connected_account_id)
      : null) ?? (await getGmailConnection(userId))
  const shopEmails = normaliseShopEmails([connection?.email_address])

  if (!inquiry.gmail_thread_id) {
    const fallback = inquiry.thread_messages ?? []
    return { threadMessages: fallback, replyState: threadReplyState(fallback) }
  }

  const raw = await readGmailThread(userId, {
    thread_id: inquiry.gmail_thread_id,
    connected_account_id: inquiry.connected_account_id ?? undefined,
    max_body_chars: 6000,
  })
  const threadMessages = buildThreadMessages(raw, shopEmails, {
    customerEmail: inquiry.sender_email,
  })
  return { threadMessages, replyState: threadReplyState(threadMessages) }
}

async function resolveThreadReplyStateForImport(
  userId: string,
  threadId: string,
  connectedAccountId: string | null,
  shopEmails: string[],
  customerEmail: string,
): Promise<{
  needsReply: boolean
  threadMessages: InquiryThreadMessage[]
  lastShopReplyAt: string | null
} | null> {
  try {
    const raw = await readGmailThread(userId, {
      thread_id: threadId,
      connected_account_id: connectedAccountId ?? undefined,
      max_body_chars: 6000,
    })
    const threadMessages = buildThreadMessages(raw, shopEmails, { customerEmail })
    const replyState = threadReplyState(threadMessages)
    return {
      needsReply: replyState.needsReply,
      threadMessages,
      lastShopReplyAt: replyState.lastShopReplyAt,
    }
  } catch (threadError) {
    console.warn('[customer-inquiries] import thread check failed:', threadId, threadError)
    return null
  }
}

async function markExistingThreadAnswered(
  supabase: SupabaseClient,
  userId: string,
  inquiryId: string,
  threadMessages: InquiryThreadMessage[],
  lastShopReplyAt: string | null,
): Promise<void> {
  const { data } = await supabase
    .from('store_customer_inquiries')
    .select('*')
    .eq('id', inquiryId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return
  await markInquiryRepliedExternally(
    supabase,
    mapRow(data as Record<string, unknown>),
    threadMessages,
    lastShopReplyAt,
  )
}

async function markInquiryRepliedExternally(
  supabase: SupabaseClient,
  inquiry: CustomerInquiryRow,
  threadMessages: InquiryThreadMessage[],
  lastShopReplyAt: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  const lastCustomer = findLatestCustomerMessage(threadMessages)
  await supabase
    .from('store_customer_inquiries')
    .update({
      status: 'sent',
      thread_messages: threadMessages,
      thread_message_count: threadMessages.length || 1,
      last_customer_at: lastCustomer?.received_at ?? inquiry.last_customer_at,
      last_shop_reply_at: lastShopReplyAt,
      sent_at: inquiry.sent_at ?? lastShopReplyAt ?? now,
      updated_at: now,
      last_synced_at: now,
    })
    .eq('id', inquiry.id)
    .eq('user_id', inquiry.user_id)
}

async function listStoreCandidates(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('user_id')
    .eq('account_type', 'bicycle_store')
    .eq('bicycle_store', true)
    .limit(100)

  if (error) {
    console.error('[customer-inquiries] store list failed:', error.message)
    return []
  }

  const candidates: string[] = []
  for (const row of data ?? []) {
    const userId = String(row.user_id ?? '').trim()
    if (!userId) continue
    if (!isComposioConfigured()) continue
    try {
      const connections = await listGmailConnections(userId)
      if (connections.length > 0) candidates.push(userId)
    } catch {
      // Skip stores without working Gmail connections.
    }
    if (candidates.length >= MAX_STORES_PER_RUN) break
  }

  return candidates
}

async function syncInboxForStore(
  supabase: SupabaseClient,
  userId: string,
  storeName?: string | null,
): Promise<{ created: number }> {
  const connection = await getGmailConnection(userId)
  const shopEmails = normaliseShopEmails([connection?.email_address])

  const payload = await searchGmailEmails(userId, {
    query: INBOX_QUERY,
    max_results: 20,
    scan_depth: 'quick',
  })

  const { data: existingRows } = await supabase
    .from('store_customer_inquiries')
    .select('id, gmail_message_id, gmail_thread_id, received_at, status')
    .eq('user_id', userId)

  const existingIds = new Set(
    (existingRows ?? []).map((row) => String(row.gmail_message_id ?? '')).filter(Boolean),
  )

  const existingByThread = new Map<string, ExistingInquiryRef>()
  for (const row of existingRows ?? []) {
    const threadId = String(row.gmail_thread_id ?? '').trim()
    if (!threadId) continue
    const receivedAt = row.received_at ? String(row.received_at) : null
    const current = existingByThread.get(threadId)
    const currentTime = current?.received_at ? new Date(current.received_at).getTime() : 0
    const nextTime = receivedAt ? new Date(receivedAt).getTime() : 0
    if (!current || nextTime >= currentTime) {
      existingByThread.set(threadId, {
        id: String(row.id),
        gmail_message_id: String(row.gmail_message_id ?? ''),
        gmail_thread_id: threadId,
        received_at: receivedAt,
        status: row.status as CustomerInquiryStatus,
      })
    }
  }

  const unscanned = payload.emails.filter(
    (email) => !existingIds.has(email.message_id) && passesInitialInboxGate(email),
  )

  const toRead = unscanned.slice(0, MAX_BODY_READS_PER_STORE)
  const bodyByMessageId = new Map<string, string>()

  if (toRead.length > 0) {
    const messages = await readGmailMessages(userId, {
      message_ids: toRead.map((email) => email.message_id),
      max_body_chars: 4000,
    })
    for (const message of messages) {
      bodyByMessageId.set(message.message_id, message.body_text ?? '')
    }
  }

  const withBodies = toRead.map((email) => ({
    email,
    bodyText: bodyByMessageId.get(email.message_id) ?? '',
  }))

  const classifications = await classifyInquiryEmails(withBodies)
  const bannedSenders = await listBannedSenderEmails(supabase, userId)

  const candidates = withBodies.filter(({ email }) => {
    const sender = parseGmailSender(email.from)
    if (isShopSender(email.from, shopEmails)) return false
    if (isBannedSender(sender.email, bannedSenders)) return false
    const classification = classifications.get(email.message_id)
    return isImportableInquiry(classification)
  })

  let created = 0
  for (const { email, bodyText } of candidates.slice(0, MAX_NEW_INQUIRIES_PER_STORE)) {
    const classification = classifications.get(email.message_id)
    const sender = parseGmailSender(email.from)
    const receivedAt =
      email.internal_date_ms != null
        ? new Date(email.internal_date_ms).toISOString()
        : null
    const threadId = email.thread_id?.trim() || null

    if (existingIds.has(email.message_id)) continue

    const existingThread = threadId ? existingByThread.get(threadId) : null

    if (threadId) {
      const threadCheck = await resolveThreadReplyStateForImport(
        userId,
        threadId,
        email.connected_account_id ?? null,
        shopEmails,
        sender.email,
      )
      if (threadCheck && !threadCheck.needsReply) {
        if (existingThread) {
          await markExistingThreadAnswered(
            supabase,
            userId,
            existingThread.id,
            threadCheck.threadMessages,
            threadCheck.lastShopReplyAt,
          )
        }
        existingIds.add(email.message_id)
        continue
      }
    }

    if (existingThread) {
      const previousTime = existingThread.received_at
        ? new Date(existingThread.received_at).getTime()
        : 0
      const nextTime = receivedAt ? new Date(receivedAt).getTime() : Date.now()
      if (nextTime <= previousTime) continue

      const reopen =
        existingThread.status === 'sent' ||
        existingThread.status === 'ignored' ||
        existingThread.gmail_message_id !== email.message_id

      const lightspeedCustomerName = await resolveInquiryCustomerName(
        supabase,
        userId,
        sender.email,
        sender.name,
      )

      const { error } = await supabase
        .from('store_customer_inquiries')
        .update({
          gmail_message_id: email.message_id,
          sender_name: sender.name,
          sender_email: sender.email,
          ...(lightspeedCustomerName
            ? { lightspeed_customer_name: lightspeedCustomerName }
            : {}),
          subject: email.subject,
          snippet: email.snippet || bodyText.slice(0, 280),
          body_preview: bodyText.slice(0, 1200) || email.snippet,
          received_at: receivedAt,
          last_customer_at: receivedAt,
          status: reopen ? 'new' : existingThread.status,
          ...(reopen
            ? {
                draft_body: '',
                error_message: null,
                retry_count: 0,
                sent_at: null,
                ignored_at: null,
              }
            : {}),
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingThread.id)
        .eq('user_id', userId)

      if (error) {
        console.warn('[customer-inquiries] thread update failed:', error.message)
        continue
      }

      existingThread.gmail_message_id = email.message_id
      existingThread.received_at = receivedAt
      existingThread.status = reopen ? 'new' : existingThread.status
      existingIds.add(email.message_id)
      created += 1

      await recordInquiryEvent(supabase, {
        inquiryId: existingThread.id,
        userId,
        eventType: 'synced',
        payload: {
          subject: email.subject,
          sender_email: sender.email,
          thread_follow_up: true,
          classification: classification
            ? {
                category: classification.category,
                confidence: classification.confidence,
                reason: classification.reason,
              }
            : null,
        },
      })
      continue
    }

    const lightspeedCustomerName = await resolveInquiryCustomerName(
      supabase,
      userId,
      sender.email,
      sender.name,
    )

    const { data, error } = await supabase
      .from('store_customer_inquiries')
      .insert({
        user_id: userId,
        gmail_message_id: email.message_id,
        gmail_thread_id: threadId,
        connected_account_id: email.connected_account_id ?? null,
        sender_name: sender.name,
        sender_email: sender.email,
        ...(lightspeedCustomerName
          ? { lightspeed_customer_name: lightspeedCustomerName }
          : {}),
        subject: email.subject,
        snippet: email.snippet || bodyText.slice(0, 280),
        body_preview: bodyText.slice(0, 1200) || email.snippet,
        received_at: receivedAt,
        last_customer_at: receivedAt,
        status: 'new',
        last_synced_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

    if (error) {
      console.warn('[customer-inquiries] insert failed:', error.message)
      continue
    }

    if (data?.id) {
      created += 1
      existingIds.add(email.message_id)
      if (threadId) {
        existingByThread.set(threadId, {
          id: String(data.id),
          gmail_message_id: email.message_id,
          gmail_thread_id: threadId,
          received_at: receivedAt,
          status: 'new',
        })
      }
      await recordInquiryEvent(supabase, {
        inquiryId: String(data.id),
        userId,
        eventType: 'synced',
        payload: {
          subject: email.subject,
          sender_email: sender.email,
          classification: classification
            ? {
                category: classification.category,
                confidence: classification.confidence,
                reason: classification.reason,
              }
            : null,
        },
      })
    }
  }

  if (created > 0 || candidates.length > 0) {
    await getOrRefreshEmailStyleProfile(supabase, userId, storeName)
  }

  return { created }
}

async function processPendingForStore(
  supabase: SupabaseClient,
  userId: string,
  storeName?: string | null,
): Promise<{ processed: number; failed: number }> {
  const { data: pendingRows, error } = await supabase
    .from('store_customer_inquiries')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['new', 'error'])
    .lt('retry_count', MAX_RETRIES)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(MAX_PROCESS_PER_STORE)

  if (error) {
    console.error('[customer-inquiries] pending query failed:', error.message)
    return { processed: 0, failed: 0 }
  }

  const { profile, version } = await getOrRefreshEmailStyleProfile(supabase, userId, storeName)

  let processed = 0
  let failed = 0

  for (const raw of pendingRows ?? []) {
    const inquiry = mapRow(raw as Record<string, unknown>)
    const now = new Date().toISOString()

    await supabase
      .from('store_customer_inquiries')
      .update({
        status: 'processing',
        error_message: null,
        updated_at: now,
      })
      .eq('id', inquiry.id)
      .eq('user_id', userId)

    try {
      const { threadMessages, replyState } = await resolveThreadContext(userId, inquiry)

      if (!replyState.needsReply && inquiry.status !== 'sent') {
        await markInquiryRepliedExternally(
          supabase,
          inquiry,
          threadMessages,
          replyState.lastShopReplyAt,
        )
        processed += 1
        continue
      }

      const messages = await readGmailMessages(userId, {
        message_ids: [inquiry.gmail_message_id],
        connected_account_id: inquiry.connected_account_id ?? undefined,
        max_body_chars: 8000,
      })
      const message = messages[0]
      if (!message) {
        throw new Error('Could not load Gmail message body.')
      }

      const lightspeedContext = await buildLightspeedInquiryContext({
        userId,
        senderEmail: inquiry.sender_email,
        senderName: inquiry.sender_name,
        supabase,
      })

      const draft = await generateInquiryDraft({
        message,
        threadMessages,
        storeName,
        styleProfile: profile,
        lightspeedContext,
      })

      const { error: updateError } = await supabase
        .from('store_customer_inquiries')
        .update({
          status: 'draft_ready',
          intent: draft.intent,
          priority: draft.priority,
          draft_body: draft.draft_body,
          draft_subject: draft.draft_subject,
          reasoning: draft.reasoning,
          citations: draft.citations,
          lightspeed_context: lightspeedContext,
          ...(lightspeedContext.matched && lightspeedContext.customer_name
            ? { lightspeed_customer_name: lightspeedContext.customer_name }
            : {}),
          style_profile_version: version,
          body_preview: message.body_text.slice(0, 1200) || inquiry.body_preview,
          thread_messages: threadMessages,
          thread_message_count: threadMessages.length || 1,
          last_customer_at: replyState.lastCustomerAt ?? inquiry.received_at,
          last_shop_reply_at: replyState.lastShopReplyAt,
          draft_generated_at: now,
          last_synced_at: now,
          error_message: null,
          updated_at: now,
        })
        .eq('id', inquiry.id)
        .eq('user_id', userId)

      if (updateError) throw new Error(updateError.message)

      await recordInquiryEvent(supabase, {
        inquiryId: inquiry.id,
        userId,
        eventType: 'draft_generated',
        payload: {
          intent: draft.intent,
          citation_count: draft.citations.length,
          lightspeed_matched: lightspeedContext.matched,
        },
      })

      processed += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'Processing failed'
      await supabase
        .from('store_customer_inquiries')
        .update({
          status: 'error',
          error_message: message,
          retry_count: inquiry.retry_count + 1,
          updated_at: now,
        })
        .eq('id', inquiry.id)
        .eq('user_id', userId)

      await recordInquiryEvent(supabase, {
        inquiryId: inquiry.id,
        userId,
        eventType: 'error',
        payload: { message },
      })
    }
  }

  return { processed, failed }
}

export async function reconcileAnsweredThreads(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('store_customer_inquiries')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['draft_ready', 'new', 'processing', 'error'])
    .not('gmail_thread_id', 'is', null)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(MAX_RECONCILE_PER_STORE)

  if (error) return 0

  let reconciled = 0
  for (const raw of data ?? []) {
    const inquiry = mapRow(raw as Record<string, unknown>)
    try {
      const { threadMessages, replyState } = await resolveThreadContext(userId, inquiry)
      if (!replyState.needsReply) {
        await markInquiryRepliedExternally(
          supabase,
          inquiry,
          threadMessages,
          replyState.lastShopReplyAt,
        )
        reconciled += 1
      }
    } catch (threadError) {
      console.warn('[customer-inquiries] thread reconcile failed:', inquiry.id, threadError)
    }
  }

  return reconciled
}

export async function syncCustomerInquiriesForConnectedStores(): Promise<CustomerInquirySyncSummary> {
  const supabase = createServiceRoleClient()
  const summary: CustomerInquirySyncSummary = {
    stores_checked: 0,
    inquiries_created: 0,
    inquiries_processed: 0,
    inquiries_failed: 0,
    failed: 0,
  }

  if (!isComposioConfigured()) {
    return summary
  }

  const storeIds = await listStoreCandidates(supabase)
  summary.stores_checked = storeIds.length

  for (const userId of storeIds) {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('business_name')
        .eq('user_id', userId)
        .maybeSingle()

      const storeName = profile?.business_name ?? null
      const inbox = await syncInboxForStore(supabase, userId, storeName)
      const pending = await processPendingForStore(supabase, userId, storeName)
      await reconcileAnsweredThreads(supabase, userId)
      summary.inquiries_created += inbox.created
      summary.inquiries_processed += pending.processed
      summary.inquiries_failed += pending.failed
    } catch (error) {
      summary.failed += 1
      console.error('[customer-inquiries] store sync failed:', userId, error)
    }
  }

  return summary
}

export async function refreshCustomerInquiriesForUser(
  supabase: SupabaseClient,
  userId: string,
  storeName?: string | null,
): Promise<CustomerInquirySyncSummary> {
  const summary: CustomerInquirySyncSummary = {
    stores_checked: 1,
    inquiries_created: 0,
    inquiries_processed: 0,
    inquiries_failed: 0,
    failed: 0,
  }

  if (!isComposioConfigured()) return summary

  const inbox = await syncInboxForStore(supabase, userId, storeName)
  const pending = await processPendingForStore(supabase, userId, storeName)
  await reconcileAnsweredThreads(supabase, userId)
  summary.inquiries_created = inbox.created
  summary.inquiries_processed = pending.processed
  summary.inquiries_failed = pending.failed
  return summary
}

export async function regenerateInquiryDraft(
  supabase: SupabaseClient,
  inquiry: CustomerInquiryRow,
  storeName?: string | null,
): Promise<CustomerInquiryRow> {
  const { profile, version } = await getOrRefreshEmailStyleProfile(
    supabase,
    inquiry.user_id,
    storeName,
    { force: true },
  )

  const messages = await readGmailMessages(inquiry.user_id, {
    message_ids: [inquiry.gmail_message_id],
    connected_account_id: inquiry.connected_account_id ?? undefined,
    max_body_chars: 8000,
  })
  const message = messages[0]
  if (!message) {
    throw new Error('Could not load Gmail message body.')
  }

  const { threadMessages, replyState } = await resolveThreadContext(inquiry.user_id, inquiry)

  const lightspeedContext = await buildLightspeedInquiryContext({
    userId: inquiry.user_id,
    senderEmail: inquiry.sender_email,
    senderName: inquiry.sender_name,
    supabase,
  })

  const draft = await generateInquiryDraft({
    message,
    threadMessages,
    storeName,
    styleProfile: profile,
    lightspeedContext,
  })

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('store_customer_inquiries')
    .update({
      status: 'draft_ready',
      intent: draft.intent,
      priority: draft.priority,
      draft_body: draft.draft_body,
      draft_subject: draft.draft_subject,
      reasoning: draft.reasoning,
      citations: draft.citations,
      lightspeed_context: lightspeedContext,
      ...(lightspeedContext.matched && lightspeedContext.customer_name
        ? { lightspeed_customer_name: lightspeedContext.customer_name }
        : {}),
      style_profile_version: version,
      body_preview: message.body_text.slice(0, 1200) || inquiry.body_preview,
      thread_messages: threadMessages,
      thread_message_count: threadMessages.length || 1,
      last_customer_at: replyState.lastCustomerAt ?? inquiry.received_at,
      last_shop_reply_at: replyState.lastShopReplyAt,
      draft_generated_at: now,
      error_message: null,
      updated_at: now,
    })
    .eq('id', inquiry.id)
    .eq('user_id', inquiry.user_id)
    .select('*')
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message || 'Could not save regenerated draft.')
  }

  await recordInquiryEvent(supabase, {
    inquiryId: inquiry.id,
    userId: inquiry.user_id,
    eventType: 'regenerated',
    payload: { citation_count: draft.citations.length },
  })

  return mapRow(data as Record<string, unknown>)
}

export async function reviseInquiryDraft(
  supabase: SupabaseClient,
  inquiry: CustomerInquiryRow,
  args: {
    instruction: string
    draft_body: string
    storeName?: string | null
  },
): Promise<CustomerInquiryRow> {
  if (inquiry.status === 'sent') {
    throw new Error('Sent inquiries cannot be revised.')
  }

  const { profile } = await getOrRefreshEmailStyleProfile(
    supabase,
    inquiry.user_id,
    args.storeName,
  )

  const customerMessage =
    inquiry.thread_messages?.find((message) => message.is_latest_customer)?.body ??
    inquiry.body_preview ??
    inquiry.snippet

  const revised = await reviseInquiryDraftWithInstruction({
    currentDraft: args.draft_body,
    instruction: args.instruction,
    customerName: inquiry.sender_name,
    subject: inquiry.subject,
    customerMessage,
    styleProfile: profile,
    storeName: args.storeName,
  })

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('store_customer_inquiries')
    .update({
      draft_body: revised.draft_body,
      reasoning: revised.reasoning,
      status: inquiry.status === 'ignored' ? inquiry.status : 'draft_ready',
      updated_at: now,
    })
    .eq('id', inquiry.id)
    .eq('user_id', inquiry.user_id)
    .select('*')
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message || 'Could not save revised draft.')
  }

  await recordInquiryEvent(supabase, {
    inquiryId: inquiry.id,
    userId: inquiry.user_id,
    eventType: 'draft_edited',
    payload: { revised_with_ai: true, instruction_length: args.instruction.trim().length },
  })

  return mapRow(data as Record<string, unknown>)
}
