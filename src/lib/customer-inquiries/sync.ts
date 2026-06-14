import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isComposioConfigured,
  listGmailConnections,
  readGmailMessages,
  searchGmailEmails,
} from '@/lib/composio/gmail'
import {
  emailLooksLowValue,
  parseGmailSender,
} from '@/lib/composio/gmail-response-suggestions'
import type { GmailEmailPreview } from '@/lib/types/genie-agent'
import { classifyInquiryEmails, isImportableInquiry } from '@/lib/customer-inquiries/classify-inquiry-email'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { recordInquiryEvent } from '@/lib/customer-inquiries/events'
import { generateInquiryDraft } from '@/lib/customer-inquiries/draft-response'
import { buildLightspeedInquiryContext } from '@/lib/customer-inquiries/lightspeed-context'
import { getOrRefreshEmailStyleProfile } from '@/lib/customer-inquiries/style-profile'
import type {
  CustomerInquiryRow,
  CustomerInquiryStatus,
  InquiryCitation,
  LightspeedInquiryContext,
} from '@/lib/customer-inquiries/types'

const INBOX_QUERY = 'in:inbox newer_than:14d -category:promotions -category:social'
const MAX_STORES_PER_RUN = 8
const MAX_NEW_INQUIRIES_PER_STORE = 6
const MAX_BODY_READS_PER_STORE = 14
const MAX_PROCESS_PER_STORE = 4
const MAX_RETRIES = 3

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

function mapRow(raw: Record<string, unknown>): CustomerInquiryRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    gmail_message_id: String(raw.gmail_message_id),
    gmail_thread_id: raw.gmail_thread_id ? String(raw.gmail_thread_id) : null,
    connected_account_id: raw.connected_account_id ? String(raw.connected_account_id) : null,
    sender_name: String(raw.sender_name ?? ''),
    sender_email: String(raw.sender_email ?? ''),
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
  const payload = await searchGmailEmails(userId, {
    query: INBOX_QUERY,
    max_results: 20,
    scan_depth: 'quick',
  })

  const { data: existingRows } = await supabase
    .from('store_customer_inquiries')
    .select('gmail_message_id')
    .eq('user_id', userId)

  const existingIds = new Set(
    (existingRows ?? []).map((row) => String(row.gmail_message_id ?? '')).filter(Boolean),
  )

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

  const candidates = withBodies.filter(({ email }) => {
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

    const { data, error } = await supabase
      .from('store_customer_inquiries')
      .insert({
        user_id: userId,
        gmail_message_id: email.message_id,
        gmail_thread_id: email.thread_id,
        connected_account_id: email.connected_account_id ?? null,
        sender_name: sender.name,
        sender_email: sender.email,
        subject: email.subject,
        snippet: email.snippet || bodyText.slice(0, 280),
        body_preview: bodyText.slice(0, 1200) || email.snippet,
        received_at: receivedAt,
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
      })

      const draft = await generateInquiryDraft({
        message,
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
          style_profile_version: version,
          body_preview: message.body_text.slice(0, 1200) || inquiry.body_preview,
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

  const lightspeedContext = await buildLightspeedInquiryContext({
    userId: inquiry.user_id,
    senderEmail: inquiry.sender_email,
    senderName: inquiry.sender_name,
  })

  const draft = await generateInquiryDraft({
    message,
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
      style_profile_version: version,
      body_preview: message.body_text.slice(0, 1200) || inquiry.body_preview,
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
