import OpenAI from 'openai'

// Cheap, fast model — this only writes 3 short follow-up questions. Mirrors the
// proven chat.completions + json_object pattern used elsewhere in the app.
const MODEL = 'gpt-4.1-mini'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`
}

function parseSuggestions(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as { suggestions?: unknown }
    if (!Array.isArray(parsed.suggestions)) return []
    return parsed.suggestions
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Suggests the next questions a bike-shop owner would naturally tap after
 * reading a Genie answer. Returns up to 3 short, specific, actionable follow-ups
 * scoped to what the agent can actually do. Returns [] on any failure.
 */
export async function generateGenieFollowups(args: {
  question: string
  answer: string
  storeName?: string | null
}): Promise<string[]> {
  if (!openai) return []
  const question = clip(args.question, 600)
  const answer = clip(args.answer, 2400)
  if (!question || !answer) return []

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You suggest the next questions a bicycle-shop owner would naturally ask their store assistant right after reading an answer.

The assistant can answer questions about Lightspeed sales, inventory, stock-on-hand, costs, margins, customers and work orders; Xero accounting and financials; Deputy staff rosters and timesheets; Gmail; the storefront; and cycling product/market/compatibility research.

Return JSON only: {"suggestions":["...","...","..."]}

Rules:
- Exactly 3 suggestions. Each is one short question the owner could tap next (max ~9 words).
- Make them SPECIFIC follow-ups that drill into, compare against, or act on the answer just given — never generic ("tell me more").
- Only suggest things the assistant can actually do (store data, accounting, staff, email, storefront, cycling research).
- Write in the owner's voice ("Show me…", "How does…", "Which…", "Compare…"). No numbering, no surrounding quotes.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            store_name: args.storeName?.trim() || 'the store',
            question,
            answer,
          }),
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) return []
    return parseSuggestions(content)
      .map((item) => clip(item, 80))
      .filter(Boolean)
      .slice(0, 3)
  } catch (error) {
    console.error('[genie-followups] generation failed:', error)
    return []
  }
}
