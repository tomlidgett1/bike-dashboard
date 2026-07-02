import { NextRequest, NextResponse } from 'next/server'
import { syncCustomerInquiriesForConnectedStores } from '@/lib/customer-inquiries/sync'
import { syncNestInboxForAllStores } from '@/lib/store/unified-inbox-sync'
import { isNestMessagingConfigured } from '@/lib/nest/config'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return handleCustomerInquiriesCron(request)
}

export async function POST(request: NextRequest) {
  return handleCustomerInquiriesCron(request)
}

async function handleCustomerInquiriesCron(request: NextRequest) {
  const cronSecret = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
  }

  try {
    // Gmail and Nest sync in parallel. The Nest leg matters even without new
    // Gmail activity: Nest messages expire 24h after creation upstream, so this
    // cron is what guarantees customer replies get mirrored while the
    // dashboard is closed.
    const [summary, nestSummary] = await Promise.all([
      syncCustomerInquiriesForConnectedStores(),
      isNestMessagingConfigured()
        ? syncNestInboxForAllStores(createServiceRoleClient()).catch((error) => {
            console.error('[Customer Inquiries Cron] Nest sync failed:', error)
            return { stores_checked: 0, stores_synced: 0, failed: 1 }
          })
        : Promise.resolve(null),
    ])

    const nestFailed = nestSummary ? nestSummary.failed > 0 : false

    return NextResponse.json(
      {
        success: summary.failed === 0 && !nestFailed,
        customer_inquiries: summary,
        nest_inbox: nestSummary,
      },
      {
        status: summary.failed === 0 && !nestFailed ? 200 : 207,
      },
    )
  } catch (error) {
    console.error('[Customer Inquiries Cron] Failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Customer inquiries cron failed',
      },
      { status: 500 },
    )
  }
}
