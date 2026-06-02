import { NextRequest, NextResponse } from 'next/server'
import { processLightspeedTitleCleaningBatch } from '@/lib/server/lightspeed-title-cleaning'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorisedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret) return true
  if (authHeader === `Bearer ${cronSecret}`) return true
  return request.headers.get('x-vercel-cron') === '1'
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorisedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const batchSize = Number(request.nextUrl.searchParams.get('batchSize') || '2')
    const result = await processLightspeedTitleCleaningBatch(batchSize)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Cron Title Cleaning] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Title cleaning cron failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
