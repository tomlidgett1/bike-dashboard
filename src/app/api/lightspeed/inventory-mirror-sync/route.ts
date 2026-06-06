import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  getInventoryMirrorStatus,
  syncLightspeedInventoryMirrorForUser,
} from '@/lib/services/lightspeed/inventory-mirror'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const status = await getInventoryMirrorStatus(user.id, createServiceRoleClient())
    return NextResponse.json({ success: true, ...status })
  } catch (error) {
    console.error('[Lightspeed Inventory Mirror] Status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load inventory mirror status' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const maxStockPages = body?.maxStockPages ? Number(body.maxStockPages) : undefined
    const requestedSyncMode = body?.syncMode === 'full' || body?.syncMode === 'incremental'
      ? body.syncMode
      : undefined
    const beforeStatus = await getInventoryMirrorStatus(user.id, createServiceRoleClient())
    const syncMode = requestedSyncMode ?? (beforeStatus.total_rows > 0 ? 'incremental' : 'full')

    const result = await syncLightspeedInventoryMirrorForUser({
      userId: user.id,
      syncType: 'manual',
      syncMode,
      maxStockPages,
    })
    const status = await getInventoryMirrorStatus(user.id, createServiceRoleClient())

    return NextResponse.json({
      success: true,
      result,
      status,
    })
  } catch (error) {
    console.error('[Lightspeed Inventory Mirror] Sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Inventory mirror sync failed' },
      { status: 500 },
    )
  }
}
