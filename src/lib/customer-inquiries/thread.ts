import { parseGmailSender } from '@/lib/composio/gmail-response-suggestions'
import type { GmailMessageContent } from '@/lib/types/genie-agent'
import type { InquiryThreadMessage } from '@/lib/customer-inquiries/types'

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

export function buildThreadMessages(
  rawMessages: GmailMessageContent[],
  shopEmails: string[],
  options?: { maxMessages?: number },
): InquiryThreadMessage[] {
  const maxMessages = options?.maxMessages ?? 12
  const sorted = [...rawMessages].sort(
    (a, b) => (a.internal_date_ms ?? 0) - (b.internal_date_ms ?? 0),
  )

  const messages = sorted.slice(-maxMessages).map((message) => {
    const sender = parseGmailSender(message.from)
    const role = isShopSender(message.from, shopEmails) ? 'shop' : 'customer'
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

  const latestCustomerId = [...messages]
    .reverse()
    .find((message) => message.role === 'customer')?.message_id

  return messages.map((message) => ({
    ...message,
    is_latest_customer: message.message_id === latestCustomerId,
  }))
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
