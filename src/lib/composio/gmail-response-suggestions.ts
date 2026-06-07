import OpenAI from 'openai'
import type { GmailEmailPreview } from '@/lib/types/genie-agent'

const MODEL = 'gpt-4.1-mini'
const MAX_AI_SUGGESTIONS = 4
const MAX_DRAFT_LENGTH = 1800

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export type GmailSuggestionIntent =
  | 'service_booking'
  | 'stock_check'
  | 'quote_request'
  | 'warranty'
  | 'order_status'
  | 'general_reply'

export type GmailSuggestionPriority = 'urgent' | 'normal' | 'low'

export interface GmailResponseSuggestion {
  id: string
  messageId: string
  threadId: string | null
  from: string
  senderName: string
  senderEmail: string
  subject: string
  snippet: string
  dateLabel: string | null
  intent: GmailSuggestionIntent
  priority: GmailSuggestionPriority
  label: string
  reason: string
  responseDraft: string
  canDraft: boolean
  connectedAccountId?: string
  mailboxLabel?: string | null
}

type AiSuggestion = {
  message_id?: unknown
  intent?: unknown
  priority?: unknown
  label?: unknown
  reason?: unknown
  response_draft?: unknown
}

const BIKE_SHOP_SIGNAL = [
  /\bbike\b/i,
  /\bbicycle\b/i,
  /\bservice\b/i,
  /\brepair\b/i,
  /\bworkshop\b/i,
  /\bbooking\b/i,
  /\bappointment\b/i,
  /\bavailable\b/i,
  /\bin stock\b/i,
  /\bstock\b/i,
  /\bquote\b/i,
  /\bprice\b/i,
  /\btyre\b/i,
  /\btire\b/i,
  /\btube\b/i,
  /\bchain\b/i,
  /\bbrake\b/i,
  /\bgear\b/i,
  /\bderailleur\b/i,
  /\bwheel\b/i,
  /\bfork\b/i,
  /\bsuspension\b/i,
  /\bshimano\b/i,
  /\bsram\b/i,
  /\btrek\b/i,
  /\bgiant\b/i,
  /\bspecialized\b/i,
  /\bcannondale\b/i,
  /\borbea\b/i,
]

const LOW_VALUE_SIGNAL = [
  /\bno[-\s]?reply\b/i,
  /\bnoreply\b/i,
  /\bnewsletter\b/i,
  /\bunsubscribe\b/i,
  /\bpromotion\b/i,
  /\bsale ends\b/i,
  /\breceipt\b/i,
  /\binvoice paid\b/i,
  /\bsecurity alert\b/i,
  /\bverification code\b/i,
]

const URGENT_SIGNAL = [
  /\burgent\b/i,
  /\basap\b/i,
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\bthis morning\b/i,
  /\bthis afternoon\b/i,
]

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clampDraft(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= MAX_DRAFT_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_DRAFT_LENGTH - 1).trim()}…`
}

export function gmailReplySubject(subject: string): string {
  const trimmed = subject.trim()
  if (!trimmed) return ''
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`
}

export function parseGmailSender(from: string): { name: string; email: string } {
  const trimmed = from.trim()
  const angle = trimmed.match(/^(.*?)<([^>]+)>$/)
  const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const email = compact(angle?.[2] ?? emailMatch?.[0] ?? '')
  const rawName = compact(angle?.[1] ?? trimmed.replace(email, ''))
    .replace(/^"|"$/g, '')
    .trim()

  return {
    name: rawName || email || 'Customer',
    email,
  }
}

function firstName(name: string): string {
  const cleaned = name
    .replace(/[<>"]/g, '')
    .replace(/\(.+?\)/g, '')
    .trim()
  return cleaned.split(/\s+/)[0] || 'there'
}

function emailLooksLowValue(email: GmailEmailPreview): boolean {
  const sender = email.from.toLowerCase()
  const haystack = `${email.from} ${email.subject} ${email.snippet}`
  if (LOW_VALUE_SIGNAL.some((pattern) => pattern.test(haystack))) return true
  return sender.includes('mailer-daemon') || sender.includes('postmaster@')
}

function hasBikeShopSignal(email: GmailEmailPreview): boolean {
  const haystack = `${email.subject} ${email.snippet}`
  return BIKE_SHOP_SIGNAL.some((pattern) => pattern.test(haystack))
}

function inferIntent(email: GmailEmailPreview): GmailSuggestionIntent {
  const haystack = `${email.subject} ${email.snippet}`
  if (/\bwarranty\b|\breturn\b|\breplace\b|\bfault\b|\bbroken\b/i.test(haystack)) return 'warranty'
  if (/\border\b|\btracking\b|\bdelivery\b|\bpickup\b|\bcollect\b/i.test(haystack)) return 'order_status'
  if (/\bquote\b|\bestimate\b|\bhow much\b|\bprice\b|\bcost\b/i.test(haystack)) return 'quote_request'
  if (/\bstock\b|\bavailable\b|\bavailability\b|\bsize\b|\bcolour\b|\bcolor\b|\bmodel\b/i.test(haystack)) return 'stock_check'
  if (/\bservice\b|\brepair\b|\bbooking\b|\bappointment\b|\btune\b|\bpuncture\b|\bbrake\b|\bgear\b/i.test(haystack)) return 'service_booking'
  return 'general_reply'
}

function inferPriority(email: GmailEmailPreview): GmailSuggestionPriority {
  const haystack = `${email.subject} ${email.snippet}`
  if (URGENT_SIGNAL.some((pattern) => pattern.test(haystack))) return 'urgent'
  if (/\bwhen can\b|\bcan you\b|\bdo you\b|\?/.test(haystack.toLowerCase())) return 'normal'
  return 'low'
}

function fallbackReason(intent: GmailSuggestionIntent): string {
  switch (intent) {
    case 'service_booking':
      return 'Looks like a customer is asking about workshop service or a repair.'
    case 'stock_check':
      return 'Looks like a customer is asking about product availability.'
    case 'quote_request':
      return 'Looks like a customer wants pricing or an estimate.'
    case 'warranty':
      return 'Looks like a customer has an issue that needs follow-up.'
    case 'order_status':
      return 'Looks like a customer is asking about an order, delivery, or pickup.'
    default:
      return 'Looks like a customer email may need a response.'
  }
}

function fallbackLabel(intent: GmailSuggestionIntent, senderName: string): string {
  const name = firstName(senderName)
  switch (intent) {
    case 'service_booking':
      return `Reply to ${name} about service`
    case 'stock_check':
      return `Reply to ${name} about stock`
    case 'quote_request':
      return `Reply to ${name} with quote next steps`
    case 'warranty':
      return `Reply to ${name} about the issue`
    case 'order_status':
      return `Reply to ${name} about their order`
    default:
      return `Reply to ${name}`
  }
}

function fallbackDraft(input: {
  intent: GmailSuggestionIntent
  senderName: string
  storeName?: string | null
}): string {
  const greeting = `Hi ${firstName(input.senderName)},`
  const signoff = input.storeName?.trim() ? `\n\nRegards,\n${input.storeName.trim()}` : '\n\nRegards'

  switch (input.intent) {
    case 'service_booking':
      return `${greeting}\n\nThanks for getting in touch. We can help with that. Could you please send through the bike make/model, what needs attention, and a couple of preferred drop-off times? We will check workshop availability and come back to you shortly.${signoff}`
    case 'stock_check':
      return `${greeting}\n\nThanks for checking. I will confirm stock and pricing for that item and get back to you shortly. If there is a specific size, colour, model, or part number you are after, please send that through so we match it correctly.${signoff}`
    case 'quote_request':
      return `${greeting}\n\nThanks for the message. I will check the details and come back with pricing shortly. If you have a photo, model name, size, or part number, please send it through so we can quote accurately.${signoff}`
    case 'warranty':
      return `${greeting}\n\nThanks for letting us know. Could you please send a photo of the issue, the product model, and when it was purchased or serviced? We will review it and let you know the next step.${signoff}`
    case 'order_status':
      return `${greeting}\n\nThanks for checking in. I will look up the order and come back to you shortly with the latest status.${signoff}`
    default:
      return `${greeting}\n\nThanks for your email. I will check this and come back to you shortly.${signoff}`
  }
}

function createFallbackSuggestion(
  email: GmailEmailPreview,
  storeName?: string | null,
): GmailResponseSuggestion | null {
  if (emailLooksLowValue(email)) return null
  if (!hasBikeShopSignal(email) && !email.snippet.includes('?')) return null

  const sender = parseGmailSender(email.from)
  if (!sender.email) return null

  const intent = inferIntent(email)
  const priority = inferPriority(email)
  return {
    id: email.message_id,
    messageId: email.message_id,
    threadId: email.thread_id,
    from: email.from,
    senderName: sender.name,
    senderEmail: sender.email,
    subject: email.subject,
    snippet: email.snippet,
    dateLabel: email.date_label,
    intent,
    priority,
    label: fallbackLabel(intent, sender.name),
    reason: fallbackReason(intent),
    responseDraft: fallbackDraft({ intent, senderName: sender.name, storeName }),
    canDraft: true,
    connectedAccountId: email.connected_account_id,
    mailboxLabel: email.mailbox_label ?? null,
  }
}

function suggestionRank(suggestion: GmailResponseSuggestion): number {
  const priorityScore =
    suggestion.priority === 'urgent' ? 300 : suggestion.priority === 'normal' ? 200 : 100
  const intentScore = suggestion.intent === 'general_reply' ? 0 : 40
  return priorityScore + intentScore
}

function normaliseIntent(value: unknown): GmailSuggestionIntent {
  const raw = pickString(value)
  if (
    raw === 'service_booking' ||
    raw === 'stock_check' ||
    raw === 'quote_request' ||
    raw === 'warranty' ||
    raw === 'order_status' ||
    raw === 'general_reply'
  ) {
    return raw
  }
  return 'general_reply'
}

function normalisePriority(value: unknown): GmailSuggestionPriority {
  const raw = pickString(value)
  return raw === 'urgent' || raw === 'low' ? raw : 'normal'
}

function buildAiPrompt(emails: GmailEmailPreview[], storeName?: string | null): string {
  const rows = emails.map((email, index) => ({
    index,
    message_id: email.message_id,
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
    date_label: email.date_label,
  }))

  return JSON.stringify({
    store_name: storeName?.trim() || 'the bike shop',
    emails: rows,
  })
}

function parseAiSuggestions(content: string): AiSuggestion[] {
  try {
    const parsed = JSON.parse(content) as { suggestions?: unknown }
    return Array.isArray(parsed.suggestions) ? parsed.suggestions as AiSuggestion[] : []
  } catch {
    return []
  }
}

async function buildAiSuggestions(args: {
  emails: GmailEmailPreview[]
  storeName?: string | null
}): Promise<GmailResponseSuggestion[]> {
  if (!openai || args.emails.length === 0) return []

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.25,
      max_tokens: 1600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You triage Gmail snippets for an Australian bicycle shop.

Return JSON only:
{"suggestions":[{"message_id":"...","intent":"service_booking|stock_check|quote_request|warranty|order_status|general_reply","priority":"urgent|normal|low","label":"...","reason":"...","response_draft":"..."}]}

Pick at most ${MAX_AI_SUGGESTIONS} emails that likely need a customer response. Ignore newsletters, promotions, receipts, supplier marketing, security alerts, and automated emails.

Write practical draft replies in Australian English. Never invent inventory availability, prices, appointment times, order status, warranty outcomes, or completed actions. If facts are missing, say the shop will check and ask for the smallest useful detail. Keep drafts concise, professional, and ready for a bike shop staff member to edit. Do not include a subject line in response_draft.`,
        },
        { role: 'user', content: buildAiPrompt(args.emails, args.storeName) },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) return []

    const byId = new Map(args.emails.map((email) => [email.message_id, email]))
    const suggestions: GmailResponseSuggestion[] = []

    for (const item of parseAiSuggestions(content)) {
      const messageId = pickString(item.message_id)
      const email = byId.get(messageId)
      if (!email || emailLooksLowValue(email)) continue

      const sender = parseGmailSender(email.from)
      if (!sender.email) continue

      const intent = pickString(item.intent)
        ? normaliseIntent(item.intent)
        : inferIntent(email)
      const responseDraft = clampDraft(pickString(item.response_draft))
      if (!responseDraft) continue

      suggestions.push({
        id: email.message_id,
        messageId: email.message_id,
        threadId: email.thread_id,
        from: email.from,
        senderName: sender.name,
        senderEmail: sender.email,
        subject: email.subject,
        snippet: email.snippet,
        dateLabel: email.date_label,
        intent,
        priority: normalisePriority(item.priority),
        label: pickString(item.label) || fallbackLabel(intent, sender.name),
        reason: pickString(item.reason) || fallbackReason(intent),
        responseDraft,
        canDraft: true,
        connectedAccountId: email.connected_account_id,
        mailboxLabel: email.mailbox_label ?? null,
      })
    }

    return suggestions
  } catch (error) {
    console.error('[gmail-response-suggestions] AI failed:', error)
    return []
  }
}

export async function buildGmailResponseSuggestions(args: {
  emails: GmailEmailPreview[]
  storeName?: string | null
  hiddenMessageIds?: Set<string>
  limit?: number
}): Promise<GmailResponseSuggestion[]> {
  const hiddenMessageIds = args.hiddenMessageIds ?? new Set<string>()
  const candidates = args.emails.filter((email) => !hiddenMessageIds.has(email.message_id))
  const aiSuggestions = await buildAiSuggestions({ emails: candidates, storeName: args.storeName })
  const seen = new Set(aiSuggestions.map((suggestion) => suggestion.messageId))

  const fallbackSuggestions = candidates
    .filter((email) => !seen.has(email.message_id))
    .map((email) => createFallbackSuggestion(email, args.storeName))
    .filter((suggestion): suggestion is GmailResponseSuggestion => Boolean(suggestion))

  return [...aiSuggestions, ...fallbackSuggestions]
    .sort((a, b) => suggestionRank(b) - suggestionRank(a))
    .slice(0, Math.max(1, Math.min(args.limit ?? MAX_AI_SUGGESTIONS, MAX_AI_SUGGESTIONS)))
}

export function gmailSuggestionToHiddenRow(
  userId: string,
  suggestion: GmailResponseSuggestion,
  action: 'hidden' | 'drafted',
): Record<string, unknown> {
  return {
    user_id: userId,
    message_id: suggestion.messageId,
    thread_id: suggestion.threadId,
    sender_name: suggestion.senderName,
    sender_email: suggestion.senderEmail,
    subject: suggestion.subject,
    snippet: suggestion.snippet,
    intent: suggestion.intent,
    priority: suggestion.priority,
    label: suggestion.label,
    reason: suggestion.reason,
    response_draft: suggestion.responseDraft,
    action,
    hidden_at: new Date().toISOString(),
  }
}
