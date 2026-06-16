import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pickServerEnv } from '../lib/server-env'

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL'])
  const key = pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
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

const SEARCHABLE_FIELDS = [
  { field: 'business_display_name', section: 'Basics', label: 'Business display name', description: 'The trading name of the business.' },
  { field: 'opening_line', section: 'Basics', label: 'Opening line', description: 'The first greeting customers see.' },
  { field: 'contact_text', section: 'Basics', label: 'Contact details', description: 'Phone, email, address, links, and contact methods.' },
  { field: 'hours_text', section: 'Hours', label: 'Business hours', description: 'Opening hours, timezone, holiday notes, and availability.' },
  { field: 'prices_text', section: 'Hours', label: 'Prices & packages', description: 'Prices, packages, deposits, fees, and quotes.' },
  { field: 'services_products_text', section: 'Knowledge', label: 'Services & products', description: 'What the business offers in plain language.' },
  { field: 'booking_info_text', section: 'Knowledge', label: 'Booking & enquiries', description: 'How to book, response times, and enquiry handling.' },
  { field: 'policies_text', section: 'Knowledge', label: 'Policies', description: 'Refunds, cancellations, age limits, and rules.' },
  { field: 'extra_knowledge', section: 'Knowledge', label: 'Anything else', description: 'FAQs, parking, accessibility, service area, and extra context.' },
  { field: 'style_notes', section: 'Style', label: 'Brand voice notes', description: 'Tone, personality, and writing style.' },
  { field: 'topics_to_avoid', section: 'Guardrails', label: 'Topics to avoid', description: 'Claims or topics the bot must not guess or promise.' },
  { field: 'escalation_text', section: 'Guardrails', label: 'When to hand off', description: 'When the bot should send the customer to a human.' },
] as const

const FIELD_NAMES = SEARCHABLE_FIELDS.map((item) => item.field)
const FIELD_NAME_SET = new Set<string>(FIELD_NAMES)

const FIELD_SCHEMA = SEARCHABLE_FIELDS.map((item) => (
  `- ${item.field} (${item.section}): ${item.label}. ${item.description}`
)).join('\n')

const SYSTEM_PROMPT = `You are Nest AI search.

You help business owners search their chatbot prompt in natural language, find the most relevant editable fields, and explain what should be updated.

Editable fields:
${FIELD_SCHEMA}

Return valid JSON only:
{
  "summary": "<1-2 short sentences for a busy business owner>",
  "results": [
    {
      "field": "<field name>",
      "relevance": "primary" | "secondary" | "missing",
      "reason": "<1 short sentence>"
    }
  ]
}

Rules:
- Return 1-5 results.
- "primary" means this is the first place the owner should inspect or edit.
- "secondary" means it is also relevant supporting context.
- "missing" means this is the right place for the query, but the current field is empty or clearly missing the requested detail.
- Search semantically, not just by exact words.
- Prefer fewer, stronger results over long noisy lists.
- Order results from strongest to weakest.
- Never invent field names.
- Use "missing" instead of pretending the content exists.
- If the query spans multiple fields, include all fields that genuinely matter.
- Example: "bike servicing prices" may require both prices_text and services_products_text.
- Example: "opening hours" should prioritise hours_text, and only include another field if it genuinely helps.
- Summary should explain where the information lives now, or where it should be added if missing.`

type AiSearchResult = {
  field: string
  relevance: 'primary' | 'secondary' | 'missing'
  reason: string
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      res.status(500).json({ error: 'Server missing Supabase configuration' })
      return
    }

    const session = await resolveSession(supabase, req)
    if (!session) {
      res.status(401).json({ error: 'Unauthorised' })
      return
    }

    const openaiKey = pickServerEnv(['OPENAI_API_KEY', 'NEST_OPENAI_API_KEY'])
    if (!openaiKey) {
      res.status(500).json({ error: 'Server missing OpenAI API key' })
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
    const query = String(body.query ?? '').trim()
    if (!query) {
      res.status(400).json({ error: 'query is required' })
      return
    }

    const { data: configRow } = await supabase
      .from('nest_brand_chat_config')
      .select('*')
      .eq('brand_key', session.brandKey)
      .maybeSingle()

    const configSnapshot = SEARCHABLE_FIELDS.map((item) => {
      const value = configRow?.[item.field]
      return {
        field: item.field,
        section: item.section,
        label: item.label,
        description: item.description,
        value: typeof value === 'string' && value.trim() ? value.trim() : '(empty)',
      }
    })

    const input: { role: string; content: string }[] = [
      {
        role: 'developer',
        content: `Brand key: ${session.brandKey}\n\nCurrent editable configuration:\n${JSON.stringify(configSnapshot, null, 2)}`,
      },
      { role: 'user', content: query },
    ]

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        instructions: SYSTEM_PROMPT,
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'portal_ai_search_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string', enum: FIELD_NAMES as unknown as string[] },
                      relevance: { type: 'string', enum: ['primary', 'secondary', 'missing'] },
                      reason: { type: 'string' },
                    },
                    required: ['field', 'relevance', 'reason'],
                    additionalProperties: false,
                  },
                  maxItems: 5,
                },
              },
              required: ['summary', 'results'],
              additionalProperties: false,
            },
          },
        },
        store: false,
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[portal-ai-search] OpenAI error:', openaiRes.status, errText)
      res.status(502).json({ error: `AI service error (${openaiRes.status}). Try again.` })
      return
    }

    const openaiData = await openaiRes.json()

    let rawContent = ''
    if (typeof openaiData.output_text === 'string') {
      rawContent = openaiData.output_text
    } else if (Array.isArray(openaiData.output)) {
      for (const item of openaiData.output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const block of item.content) {
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
      console.error('[portal-ai-search] No text in AI response')
      res.status(200).json({
        summary: 'Nest could not read the prompt clearly. Try asking again.',
        results: [],
      })
      return
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      console.error('[portal-ai-search] Failed to parse AI response:', rawContent.slice(0, 500))
      res.status(200).json({
        summary: 'Nest had trouble understanding that search. Try rephrasing it.',
        results: [],
      })
      return
    }

    const rawResults = Array.isArray(parsed.results) ? parsed.results : []
    const deduped = new Set<string>()
    const results: AiSearchResult[] = []

    for (const item of rawResults) {
      if (!item || typeof item !== 'object') continue
      const field = typeof item.field === 'string' ? item.field : ''
      const relevance = item.relevance
      const reason = typeof item.reason === 'string' ? item.reason.trim() : ''

      if (!FIELD_NAME_SET.has(field) || deduped.has(field)) continue
      if (relevance !== 'primary' && relevance !== 'secondary' && relevance !== 'missing') continue

      deduped.add(field)
      results.push({
        field,
        relevance,
        reason: reason || 'Nest thinks this section is relevant.',
      })
    }

    res.status(200).json({
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : 'Nest searched your prompt and surfaced the most relevant sections.',
      results,
    })
  } catch (err) {
    console.error('[portal-ai-search]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}
