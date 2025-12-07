/**
 * Check Sync State Endpoint
 * 
 * GET /api/lightspeed/check-sync-state
 * 
 * Checks if there's an incomplete sync that needs to continue
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Check for in-progress sync state
    const { data: syncState } = await supabase
      .from('lightspeed_sync_state')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .single()

    // If sync state exists, check if it's stale (>15 minutes old)
    if (syncState) {
      const startedAt = new Date(syncState.started_at).getTime()
      const now = Date.now()
      const fifteenMinutes = 15 * 60 * 1000
      
      if (now - startedAt > fifteenMinutes) {
        // Mark as failed
        await supabase
          .from('lightspeed_sync_state')
          .update({ status: 'failed', error_message: 'Sync timed out' })
          .eq('id', syncState.id)
        
        return NextResponse.json({ syncState: null })
      }
    }

    return NextResponse.json({
      syncState: syncState || null,
    })
  } catch (error) {
    console.error('Error checking sync state:', error)
    return NextResponse.json({ error: 'Failed to check sync state' }, { status: 500 })
  }
}








