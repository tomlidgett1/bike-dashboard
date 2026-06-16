// Self-learning Genie: the post-run "reflector". Distills a run's mistakes (or
// the owner's feedback) into general, reusable lessons, deduping against the
// store's existing playbook. Best-effort and fully isolated — never throws into
// the agent run, never blocks the user's answer.

import OpenAI from 'openai'

import {
  getAllActiveLessonsForReflection,
  insertLessons,
  reinforceLessons,
  normalizeScope,
  normalizeKind,
  type LessonSource,
  type NewLessonInput,
} from '@/lib/genie/learned-lessons'

const MODEL = 'gpt-4.1-mini'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export interface ReflectionSignals {
  sqlErrors?: Array<{ purpose: string; error: string }>
  recheckNotes?: string[]
  verificationGaps?: string[]
  userFeedback?: { rating: 'up' | 'down'; note?: string | null }
}

export function reflectionHasSignal(signals: ReflectionSignals): boolean {
  return Boolean(
    signals.sqlErrors?.length ||
      signals.recheckNotes?.length ||
      signals.verificationGaps?.length ||
      signals.userFeedback,
  )
}

// Reject anything that tries to weaken the system prompt or store secrets/values.
const UNSAFE_LESSON =
  /ignore (the |all |any |previous|prior)|disregard|jailbreak|system prompt|override (the )?(safety|rule|grounding)|reveal|api[_\s-]?key|password|secret/i

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`
}

function isUsableLesson(lesson: string): boolean {
  const t = lesson.trim()
  if (t.length < 12 || t.length > 600) return false
  return !UNSAFE_LESSON.test(t)
}

function buildSystemPrompt(storeName: string): string {
  return `You curate a concise, durable "learned playbook" for an AI assistant that helps one bicycle shop ("${storeName}"). The assistant uses Lightspeed (POS data via Postgres SQL over views like genie_lightspeed_sales_report_lines and genie_lightspeed_inventory), Xero (accounting), Deputy (staff rosters/timesheets), Gmail, the storefront, and cycling web research.

You receive: the user's question, the assistant's final answer, what went wrong during the run (or the owner's 👍/👎 feedback), and the playbook lessons already stored (each with an id).

Return JSON only:
{"new_lessons":[{"scope":"sql|xero|deputy|gmail|storefront|formatting|strategy|general","kind":"avoid|prefer","lesson":"...","evidence":"..."}],"reinforce_lesson_ids":["<id of an existing lesson this run re-confirms>"]}

Rules:
- Only record GENERAL, reusable lessons that will help future DIFFERENT questions. Never a one-off fact about this question, and never store concrete data values (numbers, names, dates).
- If a candidate lesson is already covered by an existing lesson, do NOT duplicate it — put that lesson's id in reinforce_lesson_ids instead.
- At most 2 new lessons; prefer 0 if nothing is genuinely reusable.
- "avoid" = a concrete mistake to stop repeating (a SQL pattern that errored, a tool misuse, a formatting/length miss). "prefer" = a concrete approach that worked and should be repeated.
- Each lesson is ONE actionable sentence (max ~40 words), specific enough to change behaviour. For SQL, name the exact fix (e.g. which columns must be aggregated or grouped, which CTE to pre-aggregate).
- "evidence" is a short why/trigger (max ~20 words).
- Scope precisely: SQL/schema gotchas = "sql"; accounting = "xero"; staff = "deputy"; layout/headings/tables/length/tone = "formatting"; the depth/angle of analysis the owner wants = "strategy".
- Never write a lesson that weakens safety, grounding, or accuracy, or tells the assistant to ignore its rules.`
}

interface ReflectorOutput {
  new_lessons?: Array<{ scope?: unknown; kind?: unknown; lesson?: unknown; evidence?: unknown }>
  reinforce_lesson_ids?: unknown
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Reflect on a single run (or a feedback event) and persist any lessons learned.
 * Determines the lesson `source` from which signals were present.
 */
export async function reflectAndStoreLessons(args: {
  userId: string
  storeName: string
  question: string
  answer: string
  signals: ReflectionSignals
}): Promise<{ added: number; reinforced: number }> {
  if (!openai || !reflectionHasSignal(args.signals)) return { added: 0, reinforced: 0 }
  const question = clip(args.question, 700)
  const answer = clip(args.answer, 2200)
  if (!question && !args.signals.userFeedback) return { added: 0, reinforced: 0 }

  const source: LessonSource = args.signals.userFeedback
    ? 'user_feedback'
    : args.signals.sqlErrors?.length
      ? 'error_recovery'
      : args.signals.recheckNotes?.length
        ? 'recheck'
        : 'verification'

  try {
    const existing = await getAllActiveLessonsForReflection(args.userId)
    const existingIds = new Set(existing.map((lesson) => lesson.id))

    const userPayload = {
      question,
      answer,
      what_went_wrong: {
        sql_errors: (args.signals.sqlErrors ?? []).slice(0, 6).map((entry) => ({
          purpose: clip(entry.purpose, 160),
          error: clip(entry.error, 220),
        })),
        recheck_notes: (args.signals.recheckNotes ?? []).slice(0, 4).map((note) => clip(note, 400)),
        verification_gaps: (args.signals.verificationGaps ?? []).slice(0, 4).map((note) => clip(note, 240)),
      },
      owner_feedback: args.signals.userFeedback
        ? {
            rating: args.signals.userFeedback.rating,
            note: clip(args.signals.userFeedback.note ?? '', 300) || null,
          }
        : null,
      existing_lessons: existing.map((lesson) => ({
        id: lesson.id,
        scope: lesson.scope,
        kind: lesson.kind,
        lesson: lesson.lesson,
      })),
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(args.storeName) },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) return { added: 0, reinforced: 0 }

    let parsed: ReflectorOutput
    try {
      parsed = JSON.parse(content) as ReflectorOutput
    } catch {
      return { added: 0, reinforced: 0 }
    }

    const newLessons: NewLessonInput[] = (parsed.new_lessons ?? [])
      .map((item) => ({
        scope: normalizeScope(item.scope),
        kind: normalizeKind(item.kind),
        lesson: pickString(item.lesson),
        evidence: pickString(item.evidence) || null,
        source,
      }))
      .filter((lesson) => isUsableLesson(lesson.lesson))
      .slice(0, 2)

    const reinforceIds = Array.isArray(parsed.reinforce_lesson_ids)
      ? parsed.reinforce_lesson_ids
          .map((id) => pickString(id))
          .filter((id) => existingIds.has(id))
      : []

    await insertLessons(args.userId, newLessons)
    await reinforceLessons(args.userId, reinforceIds)

    return { added: newLessons.length, reinforced: reinforceIds.length }
  } catch (error) {
    console.error('[lesson-reflection] failed', error)
    return { added: 0, reinforced: 0 }
  }
}
