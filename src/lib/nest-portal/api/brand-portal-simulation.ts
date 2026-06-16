import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pickServerEnv } from '../lib/server-env'

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL'])
  const key = pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getMainSupabaseUrl(): string | null {
  return pickServerEnv(['SUPABASE_URL', 'NEST_SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL']) ?? null
}

function getInternalEdgeSharedSecret(): string | null {
  return pickServerEnv(['INTERNAL_EDGE_SHARED_SECRET', 'NEST_INTERNAL_EDGE_SHARED_SECRET']) ?? null
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

function extractOpenAiText(openaiData: Record<string, unknown>): string {
  if (typeof openaiData.output_text === 'string') return openaiData.output_text
  if (Array.isArray(openaiData.output)) {
    for (const item of openaiData.output) {
      if (item && typeof item === 'object' && (item as { type?: string }).type === 'message' && Array.isArray((item as { content?: unknown }).content)) {
        for (const block of (item as { content: unknown[] }).content) {
          if (block && typeof block === 'object' && (block as { type?: string }).type === 'output_text' && typeof (block as { text?: string }).text === 'string') {
            return (block as { text: string }).text
          }
        }
      }
    }
  }
  return ''
}

function isEndSimulation(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/^END_SIMULATION$/i.test(t)) return true
  if (/^\[END\]$/i.test(t)) return true
  return false
}

async function generateCustomerMessage(
  openaiKey: string,
  scenario: string,
  prior: { role: 'user' | 'assistant'; text: string }[],
): Promise<string> {
  const transcript =
    prior.length === 0
      ? '(No messages yet — write the customer’s first message in character.)'
      : prior
          .map((m) => (m.role === 'user' ? `Customer: ${m.text}` : `Business bot: ${m.text}`))
          .join('\n')

  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      instructions: `You play the role of a customer messaging a business in a short SMS-style chat.

Output rules:
- Reply with ONLY the customer’s next message as plain text (no quotes, no "Customer:" prefix).
- Follow the scenario exactly: persona, language level, goals, and quirks the business owner describes.
- Keep each message to 1–4 short sentences, like a real mobile chat.
- Stay in character. Do not explain the scenario or break the fourth wall.
- If the scenario goal is achieved or the conversation should naturally stop, reply with exactly: END_SIMULATION`,
      input: [
        {
          role: 'user',
          content: `## Scenario (instructions from the business owner)\n${scenario}\n\n## Conversation so far\n${transcript}\n\nWrite the customer’s next message only, or END_SIMULATION if done.`,
        },
      ],
      store: false,
    }),
  })

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error('[brand-portal-simulation] OpenAI error:', openaiRes.status, errText.slice(0, 400))
    throw new Error(`Customer simulation failed (${openaiRes.status})`)
  }

  const openaiData = (await openaiRes.json()) as Record<string, unknown>
  return extractOpenAiText(openaiData).trim()
}

async function callBrandChat(
  supabaseUrl: string,
  secret: string,
  brandKey: string,
  chatId: string,
  message: string,
): Promise<string> {
  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/brand-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({
      chatId,
      senderHandle: `portal-sim@${brandKey}`,
      brandKey,
      message,
    }),
  })

  const raw = await edgeRes.text()
  if (!edgeRes.ok) {
    console.error('[brand-portal-simulation] brand-chat error:', edgeRes.status, raw.slice(0, 400))
    throw new Error('Chatbot did not respond for this turn.')
  }

  try {
    const data = JSON.parse(raw) as { text?: string }
    return typeof data.text === 'string' ? data.text : ''
  } catch {
    throw new Error('Invalid response from chatbot.')
  }
}

type SimMessage = { role: 'user' | 'assistant'; text: string }

const REVIEW_TARGET_FIELDS = [
  'hours_text',
  'prices_text',
  'services_products_text',
  'booking_info_text',
  'policies_text',
  'extra_knowledge',
  'style_notes',
  'topics_to_avoid',
  'escalation_text',
  'business_raw_prompt',
] as const

const REVIEW_CATEGORIES = [
  'knowledge',
  'tone',
  'booking',
  'pricing',
  'policy',
  'guardrail',
  'handoff',
  'prompt',
] as const

type ReviewTargetField = (typeof REVIEW_TARGET_FIELDS)[number]
type ReviewCategory = (typeof REVIEW_CATEGORIES)[number]

type SimulationReviewSuggestion = {
  id: string
  category: ReviewCategory
  title: string
  reason: string
  evidence: string
  targetField: ReviewTargetField
  suggestedText: string
}

type SimulationReview = {
  summary: string
  suggestions: SimulationReviewSuggestion[]
}

function fallbackSimulationReview(): SimulationReview {
  return {
    summary: 'Review the transcript, teach the bot what was missing, then rerun the same scenario.',
    suggestions: [],
  }
}

function buildReviewTranscript(messages: SimMessage[]): string {
  if (messages.length === 0) return '(No conversation transcript available.)'
  return messages
    .map((message, index) => {
      const speaker = message.role === 'user' ? 'Customer' : 'Business bot'
      return `${index + 1}. ${speaker}: ${message.text}`
    })
    .join('\n')
}

function sanitiseReviewSuggestion(row: unknown, index: number): SimulationReviewSuggestion | null {
  if (!row || typeof row !== 'object') return null
  const item = row as Record<string, unknown>
  const category = REVIEW_CATEGORIES.includes(item.category as ReviewCategory)
    ? (item.category as ReviewCategory)
    : 'knowledge'
  const targetField = REVIEW_TARGET_FIELDS.includes(item.targetField as ReviewTargetField)
    ? (item.targetField as ReviewTargetField)
    : 'extra_knowledge'
  const title = typeof item.title === 'string' && item.title.trim()
    ? item.title.trim()
    : 'Suggested improvement'
  const reason = typeof item.reason === 'string' && item.reason.trim()
    ? item.reason.trim()
    : 'This would help the bot handle similar chats more clearly.'
  const evidence = typeof item.evidence === 'string' && item.evidence.trim()
    ? item.evidence.trim()
    : 'See the transcript above.'
  let suggestedText = typeof item.suggestedText === 'string' ? item.suggestedText.trim() : ''
  if (!suggestedText) return null
  if (targetField === 'business_raw_prompt' && !/^##\s+/m.test(suggestedText)) {
    suggestedText = `## Simulation learnings\n${suggestedText}`
  }
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `suggestion-${index + 1}`,
    category,
    title,
    reason,
    evidence,
    targetField,
    suggestedText,
  }
}

async function reviewSimulationConversation(
  openaiKey: string,
  scenario: string,
  messages: SimMessage[],
): Promise<SimulationReview> {
  if (messages.length === 0) return fallbackSimulationReview()

  const reviewRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      instructions: `You review simulated customer chats for business owners using Nest.

Your job:
- Diagnose the highest-leverage ways the business owner can improve their bot configuration.
- Focus on what the owner should teach the bot, not on abstract model critique.
- Suggest 0 to 4 improvements only. Fewer is fine if the bot handled the chat well.

Critical safety rules:
- Never invent specific business facts such as exact prices, trading hours, addresses, stock levels, or policies that were not provided.
- If the bot was missing a factual answer, write a starter snippet the owner can edit, or a safe policy line such as "We can confirm this after checking."
- For style, guardrail, and handoff fields, write instruction-style text.
- If targetField is business_raw_prompt, suggestedText must start with a markdown heading like "## Simulation learnings".

Field mapping:
- hours_text: business hours or opening times
- prices_text: pricing, quotes, packages, deposits
- services_products_text: what the business offers
- booking_info_text: how to book, response times, enquiry steps
- policies_text: cancellations, refunds, age limits, weather, preparation
- extra_knowledge: extra business facts, FAQs, parking, service area, accessibility
- style_notes: how the bot should sound
- topics_to_avoid: what the bot must not claim or guess
- escalation_text: when the bot should hand off to a human
- business_raw_prompt: broader business-view guidance that belongs in the markdown prompt

Return concise, practical suggestions only.`,
      input: [
        {
          role: 'user',
          content: `## Scenario\n${scenario}\n\n## Transcript\n${buildReviewTranscript(messages)}\n\nReview this simulation and return the best improvements for the business owner.`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'simulation_review',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    category: { type: 'string', enum: [...REVIEW_CATEGORIES] },
                    title: { type: 'string' },
                    reason: { type: 'string' },
                    evidence: { type: 'string' },
                    targetField: { type: 'string', enum: [...REVIEW_TARGET_FIELDS] },
                    suggestedText: { type: 'string' },
                  },
                  required: ['id', 'category', 'title', 'reason', 'evidence', 'targetField', 'suggestedText'],
                  additionalProperties: false,
                },
              },
            },
            required: ['summary', 'suggestions'],
            additionalProperties: false,
          },
        },
      },
      store: false,
    }),
  })

  if (!reviewRes.ok) {
    const errText = await reviewRes.text()
    console.error('[brand-portal-simulation] review error:', reviewRes.status, errText.slice(0, 400))
    return fallbackSimulationReview()
  }

  const reviewData = (await reviewRes.json()) as Record<string, unknown>
  const raw = extractOpenAiText(reviewData).trim()
  if (!raw) return fallbackSimulationReview()

  try {
    const parsed = JSON.parse(raw) as { summary?: unknown; suggestions?: unknown }
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .map((item, index) => sanitiseReviewSuggestion(item, index))
          .filter((item): item is SimulationReviewSuggestion => Boolean(item))
          .slice(0, 4)
      : []
    return {
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : fallbackSimulationReview().summary,
      suggestions,
    }
  } catch (error) {
    console.error('[brand-portal-simulation] review parse error:', error, raw.slice(0, 400))
    return fallbackSimulationReview()
  }
}

type SimLoopEmit = {
  onUser: (text: string) => void
  onAssistant: (text: string) => void
}

class GenerateCustomerError extends Error {
  readonly messages: SimMessage[]

  constructor(message: string, messages: SimMessage[]) {
    super(message)
    this.name = 'GenerateCustomerError'
    this.messages = messages
  }
}

async function runSimulationLoop(
  params: {
    openaiKey: string
    scenario: string
    maxTurns: number
    supabaseUrl: string
    secret: string
    brandKey: string
    chatId: string
  },
  emit: SimLoopEmit | undefined,
): Promise<{ messages: SimMessage[] }> {
  const { openaiKey, scenario, maxTurns, supabaseUrl, secret, brandKey, chatId } = params
  const messages: SimMessage[] = []

  for (let turn = 0; turn < maxTurns; turn++) {
    let customerText: string
    try {
      customerText = await generateCustomerMessage(openaiKey, scenario, messages)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Simulation failed'
      throw new GenerateCustomerError(msg, messages)
    }

    if (isEndSimulation(customerText)) {
      return { messages }
    }

    messages.push({ role: 'user', text: customerText })
    emit?.onUser(customerText)

    try {
      const assistantText = await callBrandChat(supabaseUrl, secret, brandKey, chatId, customerText)
      const text = assistantText || 'No response.'
      messages.push({ role: 'assistant', text })
      emit?.onAssistant(text)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Chatbot error'
      messages.push({ role: 'assistant', text: msg })
      emit?.onAssistant(msg)
      return { messages }
    }
  }

  return { messages }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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

    const supabaseUrl = getMainSupabaseUrl()
    const secret = getInternalEdgeSharedSecret()
    if (!supabaseUrl || !secret) {
      res.status(500).json({ error: 'Server missing edge function configuration' })
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
    const scenario = String(body.scenario ?? '').trim()
    let maxTurns = Number(body.maxTurns)
    if (!Number.isFinite(maxTurns) || maxTurns < 1) maxTurns = 6
    if (maxTurns > 12) maxTurns = 12
    const stream = Boolean(body.stream)

    if (scenario.length < 12) {
      res.status(400).json({ error: 'Describe the scenario in a bit more detail (at least 12 characters).' })
      return
    }
    if (scenario.length > 6000) {
      res.status(400).json({ error: 'Scenario is too long (max 6000 characters).' })
      return
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const chatId = `portal-sim#${session.brandKey}#${runId}`

    const loopParams = {
      openaiKey,
      scenario,
      maxTurns,
      supabaseUrl,
      secret,
      brandKey: session.brandKey,
      chatId,
    }

    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Accel-Buffering', 'no')
      res.status(200)

      const writeLine = (obj: Record<string, unknown>) => {
        res.write(`${JSON.stringify(obj)}\n`)
      }

      try {
        const { messages } = await runSimulationLoop(loopParams, {
          onUser: (text) => writeLine({ role: 'user', text }),
          onAssistant: (text) => writeLine({ role: 'assistant', text }),
        })
        const review = await reviewSimulationConversation(openaiKey, scenario, messages)
        writeLine({ type: 'review', review })
        writeLine({ type: 'done' })
      } catch (e: unknown) {
        if (e instanceof GenerateCustomerError) {
          writeLine({ type: 'error', message: e.message, messages: e.messages })
        } else {
          writeLine({ type: 'error', message: e instanceof Error ? e.message : 'Internal server error' })
        }
      }
      res.end()
      return
    }

    try {
      const { messages } = await runSimulationLoop(loopParams, undefined)
      const review = await reviewSimulationConversation(openaiKey, scenario, messages)
      res.status(200).json({ messages, review })
    } catch (e: unknown) {
      if (e instanceof GenerateCustomerError) {
        res.status(502).json({ error: e.message, messages: e.messages })
        return
      }
      throw e
    }
  } catch (err) {
    console.error('[brand-portal-simulation]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}
