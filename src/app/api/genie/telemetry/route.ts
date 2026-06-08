import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { summarizeGenieAgentRuns } from '@/lib/genie/telemetry'

export const dynamic = 'force-dynamic'

function clampDays(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 7
  return Math.min(Math.max(Math.trunc(parsed), 1), 90)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Store telemetry is only available to verified bicycle stores.' }, { status: 403 })
    }

    const days = clampDays(request.nextUrl.searchParams.get('days'))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const route = request.nextUrl.searchParams.get('route')

    let query = supabase
      .from('genie_agent_runs')
      .select('request_id, route, status, orchestration_source, router_invoked, planner_used, executor_model, first_text_ms, total_ms, tool_call_count, tool_call_names, trace_id, error_message, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (route) query = query.eq('route', route)

    const { data, error } = await query
    if (error) throw error

    const runs = data ?? []
    return NextResponse.json({
      days,
      route,
      summary: summarizeGenieAgentRuns(runs),
      recent_runs: runs.slice(0, 50),
    })
  } catch (error) {
    console.error('Error in GET /api/genie/telemetry:', error)
    return NextResponse.json({ error: 'Failed to load Genie telemetry.' }, { status: 500 })
  }
}
