/**
 * Xero Connection Status Endpoint
 *
 * GET /api/xero/status — returns connection state for the Connect Xero pill.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getXeroConnection, isXeroConfigured } from '@/lib/services/xero'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!isXeroConfigured()) {
      return NextResponse.json({ configured: false, connected: false })
    }

    const connection = await getXeroConnection(user.id)

    return NextResponse.json({
      configured: true,
      connected: connection?.status === 'connected',
      status: connection?.status ?? 'disconnected',
      organisation_name: connection?.organisation_name ?? connection?.tenant_name ?? null,
      connected_at: connection?.connected_at ?? null,
      last_error: connection?.status === 'error' || connection?.status === 'expired' ? connection?.last_error ?? null : null,
    })
  } catch (error) {
    console.error('[Xero Status] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch Xero status' }, { status: 500 })
  }
}
