import { NextRequest, NextResponse } from 'next/server'
import { syncCustomerInquiriesForConnectedStores } from '@/lib/customer-inquiries/sync'

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
    const summary = await syncCustomerInquiriesForConnectedStores()

    return NextResponse.json(
      {
        success: summary.failed === 0,
        customer_inquiries: summary,
      },
      {
        status: summary.failed === 0 ? 200 : 207,
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
