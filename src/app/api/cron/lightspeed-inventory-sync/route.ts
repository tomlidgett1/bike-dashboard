import { NextRequest, NextResponse } from 'next/server'
import { syncLightspeedInventoryMirrorForConnectedUsers } from '@/lib/services/lightspeed/inventory-mirror'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return handleInventorySyncCron(request)
}

export async function POST(request: NextRequest) {
  return handleInventorySyncCron(request)
}

async function handleInventorySyncCron(request: NextRequest) {
  const cronSecret = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const inventorySync = await syncLightspeedInventoryMirrorForConnectedUsers({
      maxUsers: 10,
    })

    return NextResponse.json({
      success: inventorySync.failed === 0,
      inventory_sync: inventorySync,
    }, {
      status: inventorySync.failed === 0 ? 200 : 207,
    })
  } catch (error) {
    console.error('[Lightspeed Inventory Cron] Failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Lightspeed inventory cron failed',
      },
      { status: 500 },
    )
  }
}
