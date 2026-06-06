import { NextRequest, NextResponse } from 'next/server'
import { continueHistoricalSalesReportBackfills } from '@/lib/services/lightspeed/sales-report-backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return handleHistoricalSalesReportBackfill(request)
}

export async function POST(request: NextRequest) {
  return handleHistoricalSalesReportBackfill(request)
}

async function handleHistoricalSalesReportBackfill(request: NextRequest) {
  const cronSecret = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const historicalBackfills = await continueHistoricalSalesReportBackfills({
      maxUsers: 10,
      maxChunksPerUser: 100,
      maxPagesPerChunk: 5,
      timeBudgetMs: 240_000,
    })

    return NextResponse.json({
      success: historicalBackfills.failed === 0,
      historical_backfills: historicalBackfills,
    }, {
      status: historicalBackfills.failed === 0 ? 200 : 207,
    })
  } catch (error) {
    console.error('[Lightspeed Sales Report Backfill Cron] Failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Lightspeed sales report historical backfill failed',
      },
      { status: 500 },
    )
  }
}
