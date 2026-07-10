import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listUnpaidWorkorders } from '@/lib/services/lightspeed/workorder-queries'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/workorders/open
 *
 * Every workorder still waiting for payment (not paid, not archived),
 * read live from Lightspeed.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const { workorders, truncated } = await listUnpaidWorkorders(user.id)
    return NextResponse.json({ workorders, truncated })
  } catch (error) {
    console.error('[workorders/open] Failed to list workorders:', error)
    const message = error instanceof Error ? error.message : 'Failed to load workorders'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
