import { parseGmailSender } from '@/lib/composio/gmail-response-suggestions'
import type { GmailMessageContent } from '@/lib/types/genie-agent'
import type { CustomerInquiryStatus, InquiryThreadMessage } from '@/lib/customer-inquiries/types'

const QUOTE_SPLIT_PATTERNS = [
  /\n\s*On .+ wrote:\s*\n/i,
  /\n-{3,}\s*Original Message\s*-{3,}/i,
  /\nFrom:\s*.+\nSent:\s*.+\n/i,
  /\n_{3,}\s*\n/,
]

export function stripQuotedEmailBody(text: string): string {
  let body = text.replace(/\r\n/g, '\n').trim()
  if (!body) return ''

  for (const pattern of QUOTE_SPLIT_PATTERNS) {
    const match = pattern.exec(body)
    if (match?.index != null && match.index > 0) {
      body = body.slice(0, match.index).trim()
    }
  }

  const lines = body.split('\n')
  const withoutQuotes: string[] = []
  for (const line of lines) {
    if (/^\s*>/.test(line)) break
    withoutQuotes.push(line)
  }

  return withoutQuotes.join('\n').trim()
}

export function normaliseShopEmails(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ]
}

export function isShopSender(from: string, shopEmails: string[]): boolean {
  if (shopEmails.length === 0) return false
  const sender = parseGmailSender(from).email.toLowerCase()
  return shopEmails.includes(sender)
}

export function resolveMessageRole(
  from: string,
  shopEmails: string[],
  customerEmail?: string | null,
): 'shop' | 'customer' {
  const sender = parseGmailSender(from).email.toLowerCase()
  const customer = customerEmail?.trim().toLowerCase() ?? ''

  if (customer && sender === customer) return 'customer'
  if (isShopSender(from, shopEmails)) return 'shop'

  const senderDomain = sender.split('@')[1]
  const shopDomains = new Set(
    shopEmails
      .map((email) => email.split('@')[1]?.toLowerCase())
      .filter((domain): domain is string => Boolean(domain)),
  )
  if (senderDomain && shopDomains.has(senderDomain)) return 'shop'

  // Enquiry threads are 1:1 with the customer — any other sender is the store.
  if (customer && sender && sender !== customer) return 'shop'

  return 'customer'
}

function applyLatestCustomerFlag(messages: InquiryThreadMessage[]): InquiryThreadMessage[] {
  const latestCustomerId = [...messages]
    .reverse()
    .find((message) => message.role === 'customer')?.message_id

  return messages.map((message) => ({
    ...message,
    is_latest_customer: message.message_id === latestCustomerId,
  }))
}

export function buildThreadMessages(
  rawMessages: GmailMessageContent[],
  shopEmails: string[],
  options?: { maxMessages?: number; customerEmail?: string | null },
): InquiryThreadMessage[] {
  const maxMessages = options?.maxMessages ?? 12
  const sorted = [...rawMessages].sort(
    (a, b) => (a.internal_date_ms ?? 0) - (b.internal_date_ms ?? 0),
  )

  const messages = sorted.slice(-maxMessages).map((message) => {
    const sender = parseGmailSender(message.from)
    const role = resolveMessageRole(message.from, shopEmails, options?.customerEmail)
    const receivedAt =
      message.internal_date_ms != null
        ? new Date(message.internal_date_ms).toISOString()
        : null

    return {
      message_id: message.message_id,
      role,
      from: message.from,
      from_name: sender.name,
      body: stripQuotedEmailBody(message.body_text || message.snippet),
      received_at: receivedAt,
      date_label: message.date_label,
    } satisfies InquiryThreadMessage
  })

  return applyLatestCustomerFlag(messages)
}

/** Re-resolve roles on stored thread messages (fixes stale classifications after logic updates). */
export function refreshThreadMessageRoles(
  messages: InquiryThreadMessage[],
  shopEmails: string[],
  customerEmail?: string | null,
): InquiryThreadMessage[] {
  return applyLatestCustomerFlag(
    messages.map((message) => ({
      ...message,
      role: resolveMessageRole(message.from, shopEmails, customerEmail),
    })),
  )
}

export function findLatestCustomerMessage(
  messages: InquiryThreadMessage[],
): InquiryThreadMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'customer') return messages[index]
  }
  return null
}

export function findLatestShopMessage(
  messages: InquiryThreadMessage[],
): InquiryThreadMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'shop') return messages[index]
  }
  return null
}

export function threadReplyState(messages: InquiryThreadMessage[]): {
  needsReply: boolean
  lastCustomerAt: string | null
  lastShopReplyAt: string | null
} {
  const latestCustomer = findLatestCustomerMessage(messages)
  const latestShop = findLatestShopMessage(messages)

  if (!latestCustomer) {
    return {
      needsReply: false,
      lastCustomerAt: null,
      lastShopReplyAt: latestShop?.received_at ?? null,
    }
  }

  const customerTime = latestCustomer.received_at
    ? new Date(latestCustomer.received_at).getTime()
    : 0
  const shopTime = latestShop?.received_at
    ? new Date(latestShop.received_at).getTime()
    : 0

  return {
    needsReply: !latestShop || shopTime < customerTime,
    lastCustomerAt: latestCustomer.received_at,
    lastShopReplyAt: latestShop?.received_at ?? null,
  }
}

const OPEN_INQUIRY_STATUSES: CustomerInquiryStatus[] = [
  'new',
  'processing',
  'draft_ready',
  'error',
]

/** Whether an inquiry still needs a shop reply (excludes externally answered threads). */
export function inquiryNeedsReplyFromRow(row: {
  status: CustomerInquiryStatus
  sender_email?: string | null
  thread_messages?: InquiryThreadMessage[] | null
  last_customer_at?: string | null
  last_shop_reply_at?: string | null
}): boolean {
  if (row.status === 'sent' || row.status === 'ignored') return false
  if (!OPEN_INQUIRY_STATUSES.includes(row.status)) return false

  if (row.thread_messages && row.thread_messages.length > 0) {
    const refreshed = refreshThreadMessageRoles(
      row.thread_messages,
      [],
      row.sender_email,
    )
    return threadReplyState(refreshed).needsReply
  }

  if (row.last_shop_reply_at && row.last_customer_at) {
    return (
      new Date(row.last_shop_reply_at).getTime() <
      new Date(row.last_customer_at).getTime()
    )
  }

  if (row.last_shop_reply_at && !row.last_customer_at) return false

  return true
}
