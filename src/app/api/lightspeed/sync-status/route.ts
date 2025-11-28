/**
 * Lightspeed Sync Status Endpoint
 * 
 * GET /api/lightspeed/sync-status
 * 
 * Returns whether a sync is currently in progress
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    // Check for in-progress syncs
    const { data: inProgressSync } = await supabase
      .from('lightspeed_sync_logs')
      .select('id, started_at, sync_type')
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    // Check if sync is stale (started more than 10 minutes ago - likely failed)
    let isSyncing = false
    if (inProgressSync) {
      const startedAt = new Date(inProgressSync.started_at).getTime()
      const now = Date.now()
      const tenMinutes = 10 * 60 * 1000
      
      if (now - startedAt < tenMinutes) {
        isSyncing = true
      } else {
        // Mark as failed if stale
        await supabase
          .from('lightspeed_sync_logs')
          .update({ 
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: 'Sync timed out',
          })
          .eq('id', inProgressSync.id)
      }
    }

    // Get last sync time from connection
    const { data: connection } = await supabase
      .from('lightspeed_connections')
      .select('last_sync_at')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      isSyncing,
      sync: inProgressSync || null,
      lastSyncAt: connection?.last_sync_at || null,
    })
  } catch (error) {
    console.error('Error checking sync status:', error)
    
    return NextResponse.json(
      { error: 'Failed to check sync status' },
      { status: 500 }
    )
  }
}

