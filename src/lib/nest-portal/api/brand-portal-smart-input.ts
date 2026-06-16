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

const FIELD_SCHEMA = `
You manage a chatbot configuration with these fields:

- business_display_name: The trading name of the business (short string)
- opening_line: First greeting message customers see (1-2 sentences)
- contact_text: Phone, email, address, website, social links
- hours_text: Business hours, timezone, holiday notes
- prices_text: Pricing, packages, deposits, quotes
- services_products_text: What the business offers — services, products
- booking_info_text: How to book, response times, booking process
- policies_text: Cancellations, refunds, weather policies, age limits
- extra_knowledge: FAQs, parking, accessibility, service area, business background, ownership, team info, history, and ANYTHING ELSE that doesn't fit another field
- style_notes: Brand voice and tone preferences
- topics_to_avoid: What the bot must not promise or guess
- escalation_text: When the bot should hand off to a human
`

const SYSTEM_PROMPT = `You are a smart assistant that helps business owners set up their chatbot by categorising free-form input into the right configuration fields.

${FIELD_SCHEMA}

## Your job

When the user provides information about their business, you must:

1. CLASSIFY which field the information belongs to
2. FORMAT just the NEW snippet cleanly — concise, no filler
3. CHECK if this info already exists in the field (duplicate)
4. CHECK if it contradicts existing content (contradiction)

## Response format

Respond with valid JSON only:

{
  "action": "add" | "append" | "duplicate" | "contradiction" | "clarify" | "none",
  "field": "<field_name or null>",
  "snippet": "<ONLY the new piece of info being added, cleaned up — NOT the full field value>",
  "merged": "<the full field value after intelligently merging the snippet into existing content, or null>",
  "conflicting_line": "<the specific existing line/sentence that conflicts, for contradictions only, or null>",
  "message": "<1 short sentence confirming what you found>",
  "followUp": "<optional follow-up question, or null>"
}

## Action rules

- "add": The field was empty. snippet = the new content. merged = same as snippet.
- "append": The field has content and this is new, non-conflicting info. snippet = only the new bit. merged = existing content with snippet appended/merged naturally.
- "duplicate": This info (or something very similar) already exists. snippet = what they said. merged = null.
- "contradiction": The new info conflicts with OR NARROWS/CHANGES existing info. snippet = the new statement. conflicting_line = the specific existing line it conflicts with. merged = null.
- "clarify": You need more detail. snippet = null. merged = null.
- "none": ONLY for complete nonsense, greetings like "hi", or things that are clearly not business information. snippet = null. merged = null.

## Contradiction detection — BE AGGRESSIVE

You MUST flag a contradiction when:
- New info says DIFFERENT people own/run the business (e.g. existing says "Jack and Dan own the store", new says "Jack owns the store" — this REMOVES Dan, which is a contradiction)
- New info changes hours, prices, policies, or any factual claim
- New info narrows or changes scope (e.g. "we sell all brands" vs "we only sell Pirelli")
- New info states something that would make an existing statement wrong or misleading

If the existing field mentions people, numbers, times, or facts, and the new input states DIFFERENT people, numbers, times, or facts — even partially — that is a contradiction. Do NOT silently append or merge. Flag it.

## Critical rules

- ALMOST EVERYTHING a business owner says is useful info. If in doubt, put it in extra_knowledge. NEVER return "none" for real business information like ownership, team, location, background, history, values, etc.
- snippet must be SHORT — just the new information, never the full existing field content
- message must be 1 short sentence, not a paragraph. E.g. "Adding Pirelli tubes to your brands list." not a full description of what the field contains.
- For "append", merged must be the intelligently combined result (no duplicated lines)
- Be warm but brief. These are busy small business owners.
- Always respond with valid JSON only.`

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
    const message = String(body.message ?? '').trim()
    const chatHistory = Array.isArray(body.chatHistory) ? body.chatHistory : []

    if (!message) {
      res.status(400).json({ error: 'message is required' })
      return
    }

    const { data: configRow } = await supabase
      .from('nest_brand_chat_config')
      .select('*')
      .eq('brand_key', session.brandKey)
      .maybeSingle()

    const currentConfig = configRow ?? {}

    const configContext = Object.entries(currentConfig)
      .filter(([k]) =>
        !['brand_key', 'created_at', 'updated_at', 'core_system_prompt', 'business_raw_prompt', 'internal_admin_phone_e164s', 'handoff_phone_e164'].includes(k),
      )
      .map(([k, v]) => `${k}: ${typeof v === 'string' && v.trim() ? v.trim() : '(empty)'}`)
      .join('\n')

    const input: { role: string; content: string }[] = [
      { role: 'developer', content: `Current configuration for ${session.brandKey}:\n\n${configContext}` },
    ]

    for (const h of chatHistory.slice(-10)) {
      if (h.role === 'user' || h.role === 'assistant') {
        input.push({ role: h.role, content: String(h.text ?? '') })
      }
    }

    input.push({ role: 'user', content: message })

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
            name: 'smart_input_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['add', 'append', 'duplicate', 'contradiction', 'clarify', 'none'] },
                field: { type: ['string', 'null'] },
                snippet: { type: ['string', 'null'] },
                merged: { type: ['string', 'null'] },
                conflicting_line: { type: ['string', 'null'] },
                message: { type: 'string' },
                followUp: { type: ['string', 'null'] },
              },
              required: ['action', 'field', 'snippet', 'merged', 'conflicting_line', 'message', 'followUp'],
              additionalProperties: false,
            },
          },
        },
        store: false,
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[smart-input] OpenAI error:', openaiRes.status, errText)
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
      console.error('[smart-input] No text in AI response. Keys:', Object.keys(openaiData), 'output:', JSON.stringify(openaiData.output ?? openaiData).slice(0, 500))
      res.status(200).json({
        action: 'none', field: null, snippet: null, merged: null, conflicting_line: null,
        message: 'AI returned an empty response. Try again.',
        followUp: null,
      })
      return
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      console.error('[smart-input] Failed to parse AI response:', rawContent.slice(0, 500))
      res.status(200).json({
        action: 'none', field: null, snippet: null, merged: null, conflicting_line: null,
        message: 'I had trouble understanding that. Could you try rephrasing?',
        followUp: null,
      })
      return
    }

    const action = String(parsed.action ?? 'none')
    const field = typeof parsed.field === 'string' ? parsed.field : null

    res.status(200).json({
      action: action === 'update' ? 'append' : action,
      field,
      snippet: typeof parsed.snippet === 'string' ? parsed.snippet : null,
      merged: typeof parsed.merged === 'string' ? parsed.merged : null,
      conflicting_line: typeof parsed.conflicting_line === 'string' ? parsed.conflicting_line : null,
      message: typeof parsed.message === 'string' ? parsed.message : 'Done.',
      followUp: typeof parsed.followUp === 'string' ? parsed.followUp : null,
    })
  } catch (err) {
    console.error('[smart-input]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}
