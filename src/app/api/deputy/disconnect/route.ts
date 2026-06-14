/**
 * Deputy Disconnect Endpoint
 *
 * POST /api/deputy/disconnect — clears stored tokens and marks the connection disconnected.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectDeputyUser } from '@/lib/services/deputy'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    await disconnectDeputyUser(user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Deputy Disconnect] Error:', error)
    return NextResponse.json({ error: 'Failed to disconnect Deputy' }, { status: 500 })
  }
}
