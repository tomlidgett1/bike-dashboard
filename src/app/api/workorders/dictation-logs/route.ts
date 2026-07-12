import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

/**
 * GET /api/workorders/dictation-logs
 *
 * Returns recent dictation audit entries for the signed-in store user.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const limitParam = Number(request.url ? new URL(request.url).searchParams.get('limit') : null)
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const { data, error } = await supabase
    .from('workorder_dictation_logs')
    .select(
      'id, workorder_id, customer_name, template_name, raw_transcript, formatted_note, saved_note, started_at, created_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[workorders/dictation-logs] list failed:', error)
    return NextResponse.json({ error: 'Failed to load dictation logs' }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}
