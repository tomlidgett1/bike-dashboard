import OpenAI from 'openai'
import type { Response } from 'openai/resources/responses/responses'
import {
  inferIntent,
  inferPriority,
  parseGmailSender,
} from '@/lib/composio/gmail-response-suggestions'
import type { GmailMessageContent } from '@/lib/types/genie-agent'
import { getOfficialSearchDomains } from '@/lib/bikes/official-spec-sources'
import { resolveBrandWebsite } from '@/lib/bikes/brand-websites'
import type {
  CustomerInquiryIntent,
  CustomerInquiryPriority,
  EmailStyleProfile,
  InquiryCitation,
  LightspeedInquiryContext,
} from '@/lib/customer-inquiries/types'

const MODEL = 'gpt-4.1-mini'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

type DraftResult = {
  intent: CustomerInquiryIntent
  priority: CustomerInquiryPriority
  draft_body: string
  draft_subject: string
  reasoning: string
  citations: InquiryCitation[]
  needs_web_research: boolean
}

function extractCitations(response: Response | null | undefined): InquiryCitation[] {
  const citations: InquiryCitation[] = []
  for (const item of response?.output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text') continue
      for (const ann of content.annotations ?? []) {
        if (ann.type === 'url_citation' && ann.url) {
          citations.push({
            url: ann.url,
            title: ann.title ?? ann.url,
            excerpt: 'start_index' in ann && 'end_index' in ann && content.text
              ? content.text.slice(
                  Number((ann as { start_index?: number }).start_index ?? 0),
                  Number((ann as { end_index?: number }).end_index ?? 0),
                ).trim() || null
              : null,
          })
        }
      }
    }
  }
  return citations
}

function looksTechnical(question: string): boolean {
  return /\b(bottom bracket|bb\d+|freehub|headset|tyre|tire|derailleur|shimano|sram|campagnolo|rotor|bearing|axle|hub|crank|chainring|cassette|groupset|compatibility|standard|spec|geometry|torque|psi|tubeless|disc brake|rim brake|boost|thru axle|qr|madone|trek|giant|specialized|cannondale|orbea|gravel|road bike|mtb|e-bike)\b/i.test(
    question,
  )
}

function inferInquiryIntent(message: GmailMessageContent): CustomerInquiryIntent {
  const body = message.body_text.trim() || message.snippet.trim()
  const haystack = `${message.subject} ${body}`
  if (looksTechnical(haystack)) return 'technical_question'
  return inferIntent(message)
}

function buildOfficialSearchHints(subject: string, body: string): string {
  const haystack = `${subject} ${body}`
  const brandMatch =
    haystack.match(/\b(trek|giant|specialized|cannondale|orbea|shimano|sram|campagnolo|bianchi|scott|cervelo|merida|cube|focus)\b/i)?.[0] ??
    null
  const brandWebsite = brandMatch ? resolveBrandWebsite(brandMatch) : null
  const officialDomains = getOfficialSearchDomains({
    bikeBrand: brandMatch,
    specValue: haystack,
  })

  const domainBlock =
    officialDomains.length > 0
      ? officialDomains
          .map((domain, index) => `${index + 1}. site:${domain} official specifications OR compatibility OR service manual`)
          .join('\n')
      : 'Identify the official manufacturer or standards body, then search those domains first.'

  return [
    brandWebsite ? `Official brand website: ${brandWebsite}` : null,
    'Required official-domain searches before general web results:',
    domainBlock,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generateInquiryDraft(args: {
  message: GmailMessageContent
  storeName?: string | null
  styleProfile: EmailStyleProfile
  lightspeedContext: LightspeedInquiryContext
}): Promise<DraftResult> {
  const sender = parseGmailSender(args.message.from)
  const body = args.message.body_text.trim() || args.message.snippet.trim()
  const intent = inferInquiryIntent(args.message)
  const priority = inferPriority(args.message)
  const needsWebResearch = intent === 'technical_question' || looksTechnical(body)
  const draftSubject = /^re:/i.test(args.message.subject.trim())
    ? args.message.subject.trim()
    : `Re: ${args.message.subject.trim() || '(No subject)'}`

  if (!openai) {
    return {
      intent,
      priority,
      draft_body: `Hi ${sender.name.split(/\s+/)[0] || 'there'},\n\nThanks for your email. We will review this and come back to you shortly.\n\nRegards${args.storeName ? `,\n${args.storeName}` : ''}`,
      draft_subject: draftSubject,
      reasoning: 'OpenAI is not configured; using fallback draft.',
      citations: [],
      needs_web_research: needsWebResearch,
    }
  }

  const instructions = `You draft customer email replies for an Australian bicycle shop.

Rules:
- Write in Australian English.
- Match the store reply style profile provided.
- Never invent stock availability, prices, appointment times, order status, warranty outcomes, or completed actions.
- If facts are missing, say the shop will check and ask for the smallest useful detail.
- For technical cycling questions, prefer official manufacturer manuals, technical docs, standards bodies, or supplier technical pages.
- Do not include a subject line in draft_body.
- Never put URLs, web links, "source:" notes, or citation markers in draft_body. Write the answer in plain prose as if you already know it. Sources are recorded separately for staff and must never appear in the customer reply.
- When web research is used, each staff citation must include a short excerpt (one or two sentences) quoting the specific fact from that source.
- Keep the draft concise, professional, and ready for a staff member to edit.
- Use Lightspeed customer context when it helps personalise the reply, but do not expose internal IDs.`

  const userPayload = {
    store_name: args.storeName?.trim() || 'the bike shop',
    customer: {
      name: sender.name,
      email: sender.email,
    },
    inquiry: {
      subject: args.message.subject,
      body,
      intent,
      priority,
    },
    style_profile: args.styleProfile,
    lightspeed_context: args.lightspeedContext,
    official_search_hints: needsWebResearch ? buildOfficialSearchHints(args.message.subject, body) : null,
  }

  try {
    const response = await openai.responses.create({
      model: MODEL,
      instructions,
      input: JSON.stringify(userPayload),
      ...(needsWebResearch
        ? {
            tools: [
              {
                type: 'web_search_preview' as const,
                search_context_size: 'high' as const,
                user_location: { type: 'approximate' as const, country: 'AU' },
              },
            ],
          }
        : {}),
      text: {
        format: {
          type: 'json_schema',
          name: 'customer_inquiry_draft',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              draft_body: { type: 'string' },
              reasoning: { type: 'string' },
              citations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    url: { type: 'string' },
                    title: { type: 'string' },
                    excerpt: { type: 'string' },
                  },
                  required: ['url', 'title', 'excerpt'],
                },
              },
            },
            required: ['draft_body', 'reasoning', 'citations'],
          },
        },
      },
    })

    const outputText = response.output_text?.trim()
    let draftBody = ''
    let reasoning = 'Generated draft from inquiry context.'
    let modelCitations: InquiryCitation[] = []
    if (outputText) {
      try {
        const parsed = JSON.parse(outputText) as {
          draft_body?: string
          reasoning?: string
          citations?: InquiryCitation[]
        }
        draftBody = String(parsed.draft_body ?? '').trim()
        reasoning = String(parsed.reasoning ?? reasoning).trim()
        modelCitations = Array.isArray(parsed.citations)
          ? parsed.citations
              .map((citation) => ({
                url: String(citation.url ?? '').trim(),
                title: String(citation.title ?? citation.url ?? '').trim(),
                excerpt: String(citation.excerpt ?? '').trim() || null,
              }))
              .filter((citation) => citation.url)
          : []
      } catch {
        draftBody = outputText.trim()
      }
    }

    const annotationCitations = extractCitations(response)
    const merged = new Map<string, InquiryCitation>()
    for (const citation of [...modelCitations, ...annotationCitations]) {
      const existing = merged.get(citation.url)
      if (!existing) {
        merged.set(citation.url, citation)
        continue
      }
      if (!existing.excerpt && citation.excerpt) {
        merged.set(citation.url, { ...existing, excerpt: citation.excerpt })
      }
    }
    const uniqueCitations = Array.from(merged.values())

    return {
      intent,
      priority,
      draft_body:
        draftBody ||
        `Hi ${sender.name.split(/\s+/)[0] || 'there'},\n\nThanks for your email. We will review this and come back to you shortly.\n\nRegards${args.storeName ? `,\n${args.storeName}` : ''}`,
      draft_subject: draftSubject,
      reasoning,
      citations: uniqueCitations,
      needs_web_research: needsWebResearch,
    }
  } catch (error) {
    console.error('[customer-inquiries] draft generation failed:', error)
    return {
      intent,
      priority,
      draft_body: `Hi ${sender.name.split(/\s+/)[0] || 'there'},\n\nThanks for your email. We will review this and come back to you shortly.\n\nRegards${args.storeName ? `,\n${args.storeName}` : ''}`,
      draft_subject: draftSubject,
      reasoning: 'Draft generation failed; using safe fallback.',
      citations: [],
      needs_web_research: needsWebResearch,
    }
  }
}
