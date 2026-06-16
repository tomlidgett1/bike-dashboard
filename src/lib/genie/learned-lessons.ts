// Self-learning Genie: read/format/write the per-store "learned playbook".
// All reads are defensive — if the table is missing (migration not yet applied)
// or the query errors, we return empty so the agent behaves exactly as before.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { GenieOrchestrationDecision } from '@/lib/genie/orchestration'

type Supa = Awaited<ReturnType<typeof createClient>>

export type LessonScope =
  | 'sql'
  | 'xero'
  | 'deputy'
  | 'gmail'
  | 'storefront'
  | 'formatting'
  | 'strategy'
  | 'general'

export type LessonKind = 'avoid' | 'prefer'

export type LessonSource =
  | 'error_recovery'
  | 'recheck'
  | 'verification'
  | 'user_feedback'
  | 'reflection'

export interface LearnedLesson {
  id: string
  user_id: string
  scope: LessonScope
  kind: LessonKind
  lesson: string
  evidence: string | null
  source: LessonSource
  reinforced_count: number
  active: boolean
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export const LESSON_SCOPES: LessonScope[] = [
  'sql',
  'xero',
  'deputy',
  'gmail',
  'storefront',
  'formatting',
  'strategy',
  'general',
]

const MAX_LESSONS_PER_PROMPT = 14
/** Hard cap on stored active lessons per store so the playbook stays curated. */
export const MAX_ACTIVE_LESSONS_PER_STORE = 60

export function normalizeScope(value: unknown): LessonScope {
  return typeof value === 'string' && (LESSON_SCOPES as string[]).includes(value)
    ? (value as LessonScope)
    : 'general'
}

export function normalizeKind(value: unknown): LessonKind {
  return value === 'prefer' ? 'prefer' : 'avoid'
}

/** Scopes most relevant to a route, used only to order the playbook (all active lessons can still appear). */
function relevantScopesForRoute(route: GenieOrchestrationDecision['route'] | null): Set<LessonScope> {
  const base: LessonScope[] = ['formatting', 'strategy', 'general']
  switch (route) {
    case 'lightspeed_sql':
    case 'business_analysis':
      return new Set<LessonScope>([...base, 'sql', 'xero', 'deputy', 'storefront'])
    case 'storefront_action':
      return new Set<LessonScope>([...base, 'storefront', 'sql', 'gmail'])
    case 'mixed':
      return new Set<LessonScope>([...base, 'sql', 'storefront'])
    default:
      return new Set<LessonScope>(base)
  }
}

/**
 * Active lessons for a store, ordered by route relevance then reinforcement.
 * `supabase` is the caller's RLS-bound client. Never throws.
 */
export async function getActiveLessonsForUser(
  supabase: Supa,
  userId: string,
  options: { route?: GenieOrchestrationDecision['route'] | null; limit?: number } = {},
): Promise<LearnedLesson[]> {
  const limit = options.limit ?? MAX_LESSONS_PER_PROMPT
  try {
    const { data, error } = await supabase
      .from('genie_learned_lessons')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('reinforced_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit * 3)
    if (error || !data) return []

    const rows = data as LearnedLesson[]
    const relevant = relevantScopesForRoute(options.route ?? null)
    return [...rows]
      .sort((a, b) => {
        const ra = relevant.has(a.scope) ? 1 : 0
        const rb = relevant.has(b.scope) ? 1 : 0
        if (ra !== rb) return rb - ra
        return b.reinforced_count - a.reinforced_count
      })
      .slice(0, limit)
  } catch {
    return []
  }
}

/** Builds the LEARNED PLAYBOOK block injected into the dynamic tail of the system prompt. */
export function formatLessonsForPrompt(lessons: LearnedLesson[]): string {
  if (lessons.length === 0) return ''
  const lines = lessons.map((lesson) => {
    const tag = `${lesson.kind === 'prefer' ? 'PREFER' : 'AVOID'} · ${lesson.scope}`
    return `- [${tag}] ${lesson.lesson.trim()}`
  })
  return lines.join('\n')
}

/** All active lessons for the reflector to dedupe against (service-role read). */
export async function getAllActiveLessonsForReflection(userId: string): Promise<LearnedLesson[]> {
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('genie_learned_lessons')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('reinforced_count', { ascending: false })
      .limit(MAX_ACTIVE_LESSONS_PER_STORE)
    if (error || !data) return []
    return data as LearnedLesson[]
  } catch {
    return []
  }
}

export interface NewLessonInput {
  scope: LessonScope
  kind: LessonKind
  lesson: string
  evidence?: string | null
  source: LessonSource
}

/** Insert freshly distilled lessons (service-role). Best-effort, never throws. */
export async function insertLessons(userId: string, lessons: NewLessonInput[]): Promise<void> {
  if (lessons.length === 0) return
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('genie_learned_lessons').insert(
      lessons.map((lesson) => ({
        user_id: userId,
        scope: lesson.scope,
        kind: lesson.kind,
        lesson: lesson.lesson.trim().slice(0, 600),
        evidence: lesson.evidence?.trim().slice(0, 600) ?? null,
        source: lesson.source,
      })),
    )
    await pruneToCap(userId)
  } catch (error) {
    console.error('[learned-lessons] insert failed', error)
  }
}

/** Bump reinforced_count + last_used_at on lessons the reflector matched (service-role). */
export async function reinforceLessons(userId: string, lessonIds: string[]): Promise<void> {
  if (lessonIds.length === 0) return
  try {
    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('genie_learned_lessons')
      .select('id, reinforced_count')
      .eq('user_id', userId)
      .in('id', lessonIds)
    for (const row of (data as Array<{ id: string; reinforced_count: number }> | null) ?? []) {
      await supabase
        .from('genie_learned_lessons')
        .update({ reinforced_count: row.reinforced_count + 1, updated_at: now, last_used_at: now })
        .eq('id', row.id)
        .eq('user_id', userId)
    }
  } catch (error) {
    console.error('[learned-lessons] reinforce failed', error)
  }
}

/** Keep only the strongest lessons if a store somehow exceeds the cap (service-role). */
async function pruneToCap(userId: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('genie_learned_lessons')
      .select('id')
      .eq('user_id', userId)
      .eq('active', true)
      .order('reinforced_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(MAX_ACTIVE_LESSONS_PER_STORE, MAX_ACTIVE_LESSONS_PER_STORE + 200)
    const overflow = (data as Array<{ id: string }> | null) ?? []
    if (overflow.length === 0) return
    await supabase
      .from('genie_learned_lessons')
      .update({ active: false })
      .in('id', overflow.map((row) => row.id))
  } catch {
    // Best-effort.
  }
}
