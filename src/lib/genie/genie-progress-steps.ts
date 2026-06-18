import type { GenieProgressStepRecord } from '@/lib/genie/genie-job-types'

export function appendGenieProgressStep(
  steps: GenieProgressStepRecord[] | undefined,
  phase: string,
  text: string,
): GenieProgressStepRecord[] {
  const trimmed = text.trim()
  if (!trimmed) return steps ?? []
  const current = steps ?? []
  const last = current[current.length - 1]
  if (last?.phase === phase && last?.text === trimmed) return current
  return [...current, { phase, text: trimmed, at: new Date().toISOString() }].slice(-80)
}
