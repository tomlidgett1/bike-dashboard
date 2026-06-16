import type { SupabaseClient } from '@supabase/supabase-js'
import { listKnowledgeItems } from './brand-knowledge-service'
import { pickServerEnv } from './server-env'

export type KnowledgeAnalyseStatus = 'clear' | 'duplicate' | 'contradiction' | 'overlap'

export type KnowledgeAnalyseMatch = {
  itemId: string
  title: string
  relationship: 'duplicate' | 'contradicts' | 'overlaps'
  reason: string
}

export type KnowledgeAnalyseResult = {
  summary: string
  status: KnowledgeAnalyseStatus
  matches: KnowledgeAnalyseMatch[]
}

const ANALYSE_SYSTEM = `You review new or edited business knowledge for a multi-channel assistant (chat, phone, outbound).

Compare the draft entry against existing Knowledge Base entries. Identify:
- duplicate: same facts already covered; adding would be redundant
- contradicts: conflicts with existing facts (different hours, prices, policies, etc.)
- overlaps: partial overlap but not a full duplicate; merging or editing may help

Return JSON only:
{
  "summary": "1-3 short sentences for the business owner in plain Australian English",
  "status": "clear" | "duplicate" | "contradiction" | "overlap",
  "matches": [
    { "itemId": "<uuid>", "title": "<title>", "relationship": "duplicate"|"contradicts"|"overlaps", "reason": "<one sentence>" }
  ]
}

Rules:
- status "clear" when no meaningful duplicate or contradiction (minor overlap alone is "overlap" only if worth noting).
- status "duplicate" when the draft largely repeats an existing entry.
- status "contradiction" when any material fact conflicts.
- status "overlap" when related but not duplicate nor contradictory.
- matches: only include entries with a real issue (max 5). Empty array if clear.
- Never invent item IDs; only use IDs from the catalogue provided.`

function truncate(text: string, max: number): string {
  const t = String(text ?? '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export async function analyseKnowledgeDraft(
  supabase: SupabaseClient,
  brandKey: string,
  draft: { title: string; content_text: string; exclude_item_id?: string | null },
): Promise<KnowledgeAnalyseResult> {
  const content = String(draft.content_text ?? '').trim()
  if (!content) {
    return { summary: 'Add some content before running analysis.', status: 'clear', matches: [] }
  }

  const all = await listKnowledgeItems(supabase, brandKey, null)
  const excludeId = draft.exclude_item_id?.trim() || null
  const others = all.filter((item) => item.id !== excludeId)

  if (others.length === 0) {
    return {
      summary: 'This is your first knowledge entry — nothing to conflict with yet.',
      status: 'clear',
      matches: [],
    }
  }

  const openaiKey = pickServerEnv(['OPENAI_API_KEY', 'NEST_OPENAI_API_KEY'])
  if (!openaiKey) {
    return {
      summary: 'Conflict check is unavailable (OpenAI not configured).',
      status: 'clear',
      matches: [],
    }
  }

  const catalogue = others.slice(0, 40).map((item) => ({
    itemId: item.id,
    title: item.title,
    summary: item.summary,
    content: truncate(item.content_text, 900),
    products: item.assigned_products,
  }))

  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      instructions: ANALYSE_SYSTEM,
      input: [
        {
          role: 'user',
          content: JSON.stringify({
            draft: {
              title: draft.title.trim() || 'Untitled',
              content,
            },
            existing_entries: catalogue,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'knowledge_analyse',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              status: { type: 'string', enum: ['clear', 'duplicate', 'contradiction', 'overlap'] },
              matches: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    itemId: { type: 'string' },
                    title: { type: 'string' },
                    relationship: { type: 'string', enum: ['duplicate', 'contradicts', 'overlaps'] },
                    reason: { type: 'string' },
                  },
                  required: ['itemId', 'title', 'relationship', 'reason'],
                  additionalProperties: false,
                },
              },
            },
            required: ['summary', 'status', 'matches'],
            additionalProperties: false,
          },
        },
      },
    }),
  })

  const payload = await openaiRes.json().catch(() => ({})) as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
    error?: { message?: string }
  }

  if (!openaiRes.ok) {
    throw new Error(payload.error?.message ?? `Analysis failed (${openaiRes.status})`)
  }

  const text = payload.output
    ?.flatMap((part) => part.content ?? [])
    .filter((c) => c.type === 'output_text' && c.text)
    .map((c) => c.text)
    .join('')

  if (!text) {
    return { summary: 'Could not interpret analysis response.', status: 'clear', matches: [] }
  }

  const parsed = JSON.parse(text) as KnowledgeAnalyseResult
  const validIds = new Set(others.map((i) => i.id))
  const matches = (parsed.matches ?? []).filter((m) => validIds.has(m.itemId))

  return {
    summary: String(parsed.summary ?? '').trim() || 'Analysis complete.',
    status: parsed.status ?? 'clear',
    matches,
  }
}
