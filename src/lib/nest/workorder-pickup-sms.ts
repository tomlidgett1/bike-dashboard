import OpenAI from 'openai'

const MODEL = 'gpt-4.1-mini'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export type WorkorderPickupSmsContext = {
  lineNotes: string[]
  workorderNote: string
  itemDescriptions: string[]
  statusName: string
}

export type WorkorderPickupSmsDraft = {
  body: string
  workPhrase: string
}

const SYSTEM_PROMPT = `You write pickup SMS messages for an Australian bicycle shop. Workshop data comes from Lightspeed POS and is often abbreviated or internal.

Return JSON only: {"body":"...","workPhrase":"..."}

Rules:
- Australian English spelling.
- body: ONE short SMS sentence (max 90 characters). Tell the customer their bike or work is ready for pickup. Must start with "Your". No greeting, sign-off, store name, or customer name.
- workPhrase: 2–8 words, lowercase, customer-friendly summary of what was done (for a UI label). Translate mechanic shorthand (e.g. "WT" → "wheel true", "bsk tune" → "basic tune").
- Use line notes and item names when helpful; ignore SKU codes, internal refs, and duplicate "labor" lines.
- Do not invent work not supported by the input.
- If details are too vague, use body "Your bike is ready for pickup." and workPhrase "bike service".`

function normaliseList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value && value.toLowerCase() !== 'labor'),
    ),
  )
}

export function buildWorkorderPickupSmsContext(input: {
  lineNotes: string[]
  workorderNote?: string | null
  itemDescriptions?: string[]
  statusName?: string | null
}): WorkorderPickupSmsContext {
  return {
    lineNotes: normaliseList(input.lineNotes),
    workorderNote: String(input.workorderNote ?? '').trim(),
    itemDescriptions: normaliseList(input.itemDescriptions ?? []),
    statusName: String(input.statusName ?? '').trim(),
  }
}

function formatContextForPrompt(context: WorkorderPickupSmsContext): string {
  const sections = [
    context.lineNotes.length
      ? `Line notes:\n${context.lineNotes.map((note) => `- ${note}`).join('\n')}`
      : 'Line notes: (none)',
    context.workorderNote
      ? `Work order note:\n${context.workorderNote}`
      : 'Work order note: (none)',
    context.itemDescriptions.length
      ? `Parts/items:\n${context.itemDescriptions.map((item) => `- ${item}`).join('\n')}`
      : 'Parts/items: (none)',
    context.statusName ? `Status: ${context.statusName}` : 'Status: (unknown)',
  ]
  return sections.join('\n\n')
}

function sanitiseBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Your bike is ready for pickup.'
  if (/^your\b/i.test(trimmed)) return trimmed
  return `Your ${trimmed.replace(/^your\s+/i, '')}`
}

function sanitiseWorkPhrase(workPhrase: string): string {
  const trimmed = workPhrase.trim().replace(/\s+/g, ' ').toLowerCase()
  return trimmed || 'bike service'
}

function parseDraft(content: string): WorkorderPickupSmsDraft | null {
  try {
    const parsed = JSON.parse(content) as { body?: unknown; workPhrase?: unknown }
    const body = typeof parsed.body === 'string' ? sanitiseBody(parsed.body) : ''
    const workPhrase =
      typeof parsed.workPhrase === 'string' ? sanitiseWorkPhrase(parsed.workPhrase) : ''
    if (!body) return null
    return {
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      workPhrase: workPhrase || 'bike service',
    }
  } catch {
    return null
  }
}

export async function generateWorkorderPickupSmsDraft(
  context: WorkorderPickupSmsContext,
): Promise<WorkorderPickupSmsDraft | null> {
  if (!openai) return null

  const hasSignal =
    context.lineNotes.length > 0 ||
    context.workorderNote.length > 0 ||
    context.itemDescriptions.length > 0

  if (!hasSignal) return null

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 180,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: formatContextForPrompt(context) },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) return null
    return parseDraft(content)
  } catch (error) {
    console.error('[workorder-pickup-sms] LLM failed:', error)
    return null
  }
}
