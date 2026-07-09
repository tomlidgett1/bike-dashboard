import { createServiceRoleClient } from '@/lib/supabase/server'
import type { GenieOrchestrationDecision } from '@/lib/genie/orchestration'

export interface GenieAgentRunTelemetry {
  request_id: string
  user_id: string
  route: GenieOrchestrationDecision['route'] | null
  status: 'completed' | 'error' | 'cancelled'
  orchestration_source: 'model' | 'governed_fast_path' | null
  router_invoked: boolean
  planner_used: boolean
  executor_model: string | null
  first_text_ms: number | null
  total_ms: number
  tool_call_count: number
  tool_call_names: Record<string, number>
  trace_id: string | null
  error_message?: string | null
}

export interface GenieLatencySummary {
  sample_count: number
  completed_count: number
  error_count: number
  avg_total_ms: number | null
  p50_total_ms: number | null
  p90_total_ms: number | null
  avg_first_text_ms: number | null
  p50_first_text_ms: number | null
  p90_first_text_ms: number | null
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function summarizeGenieAgentRuns(rows: Array<{
  status: string | null
  first_text_ms: number | null
  total_ms: number | null
}>): GenieLatencySummary {
  const totals = rows
    .map(row => row.total_ms)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const firstTexts = rows
    .map(row => row.first_text_ms)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const completed = rows.filter(row => row.status === 'completed').length
  const errors = rows.filter(row => row.status === 'error').length

  return {
    sample_count: rows.length,
    completed_count: completed,
    error_count: errors,
    avg_total_ms: average(totals),
    p50_total_ms: percentile(totals, 0.5),
    p90_total_ms: percentile(totals, 0.9),
    avg_first_text_ms: average(firstTexts),
    p50_first_text_ms: percentile(firstTexts, 0.5),
    p90_first_text_ms: percentile(firstTexts, 0.9),
  }
}

export async function persistGenieAgentRun(run: GenieAgentRunTelemetry): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('genie_agent_runs')
    .insert({
      request_id: run.request_id,
      user_id: run.user_id,
      route: run.route,
      status: run.status,
      orchestration_source: run.orchestration_source,
      router_invoked: run.router_invoked,
      planner_used: run.planner_used,
      executor_model: run.executor_model,
      first_text_ms: run.first_text_ms,
      total_ms: run.total_ms,
      tool_call_count: run.tool_call_count,
      tool_call_names: run.tool_call_names,
      trace_id: run.trace_id,
      error_message: run.error_message ?? null,
    })

  if (error) throw error
}
