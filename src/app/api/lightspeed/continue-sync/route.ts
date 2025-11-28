/**
 * Continue Sync Endpoint
 * 
 * POST /api/lightspeed/continue-sync
 * 
 * Simply re-runs the sync - Lightspeed's cursor-based pagination will continue from where it left off
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Simply call the sync function again with empty categories (sync all)
    // The Edge Function will pick up where it left off via Lightspeed cursors
    const { data, error } = await supabase.functions.invoke('sync-lightspeed-inventory', {
      body: {
        categoryIds: [], // Empty = sync all, will continue from cursor
      },
    })

    if (error) {
      console.error('Continue sync error:', error)
      throw new Error(error.message || 'Failed to continue sync')
    }

    if (data?.error) {
      throw new Error(data.error)
    }

    // Check if there's more to sync
    const stateResponse = await fetch('/api/lightspeed/check-sync-state')
    const stateData = await stateResponse.json()
    
    return NextResponse.json({
      success: true,
      shouldContinue: !!stateData.syncState,
      data: data.data,
    })
  } catch (error) {
    console.error('Continue sync error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to continue sync',
      shouldContinue: false,
    }, { status: 500 })
  }
}

