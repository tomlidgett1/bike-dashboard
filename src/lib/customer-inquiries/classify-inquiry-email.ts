import OpenAI from 'openai'
import {
  emailLooksLowValue,
  isLikelyCustomerInquiryContent,
} from '@/lib/composio/gmail-response-suggestions'
import type { GmailEmailPreview } from '@/lib/types/genie-agent'

const MODEL = 'gpt-4.1-mini'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export type InquiryEmailClassification = {
  message_id: string
  is_customer_enquiry: boolean
  confidence: 'high' | 'medium' | 'low'
  category:
    | 'customer_enquiry'
    | 'promotional'
    | 'newsletter'
    | 'automated'
    | 'supplier'
    | 'receipt'
    | 'other'
  reason: string
}

type EmailToClassify = {
  message_id: string
  from: string
  subject: string
  snippet: string
  body: string
}

const CLASSIFY_INSTRUCTIONS = `You triage inbound emails for an Australian bicycle shop inbox.

Decide whether each email is a genuine customer enquiry that a shop staff member should review and reply to.

Set is_customer_enquiry=true for:
- A real person asking about bikes, parts, service, repairs, bookings, stock, pricing, orders, warranties, or technical compatibility
- Follow-ups from customers about an existing purchase or workshop job
- Test emails that clearly mimic a customer question (still treat as enquiry if content is a real question)

Set is_customer_enquiry=false for:
- Marketing, promotions, sales campaigns, discount codes, "shop our sale"
- Newsletters, digests, unsubscribe footers, bulk supplier/vendor catalogues
- Automated notifications (shipping labels, platform alerts, security codes, login alerts)
- Invoices/receipts/statements from suppliers or platforms unless a customer is explicitly asking for help
- No-reply senders, mailer-daemon, postmaster
- Internal chatter with no customer question

Be strict about promos: if it reads like advertising or a campaign, exclude it even if it mentions bikes.

Use Australian English in reason fields. Keep each reason under 20 words.`

const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          message_id: { type: 'string' },
          is_customer_enquiry: { type: 'boolean' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: {
            type: 'string',
            enum: [
              'customer_enquiry',
              'promotional',
              'newsletter',
              'automated',
              'supplier',
              'receipt',
              'other',
            ],
          },
          reason: { type: 'string' },
        },
        required: ['message_id', 'is_customer_enquiry', 'confidence', 'category', 'reason'],
      },
    },
  },
  required: ['results'],
} as const

function truncate(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trim()}…`
}

function ruleBasedClassification(
  email: GmailEmailPreview,
  bodyText: string,
): InquiryEmailClassification {
  if (emailLooksLowValue(email)) {
    return {
      message_id: email.message_id,
      is_customer_enquiry: false,
      confidence: 'high',
      category: 'promotional',
      reason: 'Matched low-value sender or subject patterns.',
    }
  }

  const likely = isLikelyCustomerInquiryContent(email.subject, email.snippet, bodyText)
  return {
    message_id: email.message_id,
    is_customer_enquiry: likely,
    confidence: likely ? 'medium' : 'high',
    category: likely ? 'customer_enquiry' : 'other',
    reason: likely
      ? 'Rule-based match on enquiry signals in the message.'
      : 'No customer enquiry signals found in the message.',
  }
}

function shouldImport(classification: InquiryEmailClassification): boolean {
  if (!classification.is_customer_enquiry) return false
  return classification.confidence === 'high' || classification.confidence === 'medium'
}

export async function classifyInquiryEmails(
  emails: Array<{ email: GmailEmailPreview; bodyText: string }>,
): Promise<Map<string, InquiryEmailClassification>> {
  const map = new Map<string, InquiryEmailClassification>()
  if (emails.length === 0) return map

  if (!openai) {
    for (const item of emails) {
      const result = ruleBasedClassification(item.email, item.bodyText)
      map.set(item.email.message_id, result)
    }
    return map
  }

  const payload: EmailToClassify[] = emails.map(({ email, bodyText }) => ({
    message_id: email.message_id,
    from: email.from,
    subject: email.subject,
    snippet: truncate(email.snippet, 400),
    body: truncate(bodyText, 2000),
  }))

  try {
    const response = await openai.responses.create({
      model: MODEL,
      instructions: CLASSIFY_INSTRUCTIONS,
      input: JSON.stringify({ emails: payload }),
      text: {
        format: {
          type: 'json_schema',
          name: 'inquiry_email_classification',
          schema: CLASSIFY_SCHEMA,
        },
      },
    })

    const parsed = JSON.parse(response.output_text?.trim() || '{}') as {
      results?: InquiryEmailClassification[]
    }

    const byId = new Map(
      (parsed.results ?? []).map((row) => [row.message_id, row] as const),
    )

    for (const item of emails) {
      const ai = byId.get(item.email.message_id)
      if (ai && typeof ai.is_customer_enquiry === 'boolean') {
        map.set(item.email.message_id, ai)
      } else {
        map.set(item.email.message_id, ruleBasedClassification(item.email, item.bodyText))
      }
    }
  } catch (error) {
    console.warn('[customer-inquiries] AI classification failed, using rules:', error)
    for (const item of emails) {
      map.set(item.email.message_id, ruleBasedClassification(item.email, item.bodyText))
    }
  }

  return map
}

export function isImportableInquiry(
  classification: InquiryEmailClassification | undefined,
): boolean {
  if (!classification) return false
  return shouldImport(classification)
}
