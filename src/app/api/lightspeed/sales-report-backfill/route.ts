import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  getSalesReportBackfillStatus,
  runSalesReportBackfillUntilDeadline,
} from '@/lib/services/lightspeed/sales-report-backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function getAuthenticatedUserId() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null
  return user.id
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorised. Please log in first.' },
        { status: 401 },
      )
    }

    const admin = createServiceRoleClient()
    const status = await getSalesReportBackfillStatus(userId, admin)

    return NextResponse.json({ success: true, ...status })
  } catch (error) {
    console.error('[Lightspeed Sales Report Backfill] Status failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load sales report backfill status',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorised. Please log in first.' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body.action || 'continue')
    const restart = action === 'restart'
    const maxPagesPerChunk = Math.min(Math.max(Number(body.maxPagesPerChunk || body.maxPages || 5), 1), 25)
    const maxChunks = Math.min(Math.max(Number(body.maxChunks || 25), 1), 250)
    const timeBudgetMs = Math.min(Math.max(Number(body.timeBudgetMs || 45_000), 10_000), 270_000)

    if (!['start', 'continue', 'restart'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use start, continue, or restart.' },
        { status: 400 },
      )
    }

    const admin = createServiceRoleClient()
    const result = await runSalesReportBackfillUntilDeadline({
      userId,
      restart,
      admin,
      maxPagesPerChunk,
      maxChunks,
      timeBudgetMs,
    })

    return NextResponse.json({
      success: result.state?.status !== 'error',
      ...result,
    }, {
      status: result.state?.status === 'error' ? 500 : 200,
    })
  } catch (error) {
    console.error('[Lightspeed Sales Report Backfill] Chunk failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run sales report backfill',
      },
      { status: 500 },
    )
  }
}
