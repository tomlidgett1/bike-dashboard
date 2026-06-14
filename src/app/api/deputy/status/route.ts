/**
 * Deputy Connection Status Endpoint
 *
 * GET /api/deputy/status — returns connection state for the Connect Deputy pill.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDeputyConnection, isDeputyConfigured } from '@/lib/services/deputy'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!isDeputyConfigured()) {
      return NextResponse.json({ configured: false, connected: false })
    }

    const connection = await getDeputyConnection(user.id)

    return NextResponse.json({
      configured: true,
      connected: connection?.status === 'connected',
      status: connection?.status ?? 'disconnected',
      account_name: connection?.company_name ?? connection?.account_name ?? connection?.install_name ?? null,
      connected_at: connection?.connected_at ?? null,
      last_error: connection?.status === 'error' || connection?.status === 'expired' ? connection?.last_error ?? null : null,
    })
  } catch (error) {
    console.error('[Deputy Status] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch Deputy status' }, { status: 500 })
  }
}
