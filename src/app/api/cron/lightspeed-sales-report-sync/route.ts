import { NextRequest, NextResponse } from 'next/server'
import { syncRecentSalesReportLinesForConnectedUsers } from '@/lib/services/lightspeed/sales-report-backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return handleSalesReportSync(request)
}

export async function POST(request: NextRequest) {
  return handleSalesReportSync(request)
}

async function handleSalesReportSync(request: NextRequest) {
  const cronSecret = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const recentSync = await syncRecentSalesReportLinesForConnectedUsers({
      maxUsers: 50,
      maxPagesPerUser: 10,
    })

    return NextResponse.json({
      success: recentSync.failed === 0,
      recent_sync: recentSync,
    }, {
      status: recentSync.failed === 0 ? 200 : 207,
    })
  } catch (error) {
    console.error('[Lightspeed Sales Report Cron] Failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Lightspeed sales report cron failed',
      },
      { status: 500 },
    )
  }
}
