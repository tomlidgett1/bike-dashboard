/**
 * Xero Disconnect Endpoint
 *
 * POST /api/xero/disconnect — clears stored tokens and marks the connection disconnected.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectXeroUser } from '@/lib/services/xero'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    await disconnectXeroUser(user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Xero Disconnect] Error:', error)
    return NextResponse.json({ error: 'Failed to disconnect Xero' }, { status: 500 })
  }
}
