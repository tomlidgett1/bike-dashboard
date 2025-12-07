/**
 * Lightspeed Disconnect Endpoint
 * 
 * POST /api/lightspeed/disconnect
 * 
 * Disconnects the user's Lightspeed account by clearing tokens
 * and updating the connection status.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectUser, getConnection } from '@/lib/services/lightspeed'

export async function POST() {
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

    // Check if connection exists
    const connection = await getConnection(user.id)
    
    if (!connection) {
      return NextResponse.json(
        { error: 'No Lightspeed connection found' },
        { status: 404 }
      )
    }

    // Disconnect the user (clears tokens and updates status)
    await disconnectUser(user.id)

    // Optionally delete sync settings
    await supabase
      .from('lightspeed_sync_settings')
      .delete()
      .eq('user_id', user.id)

    return NextResponse.json({
      success: true,
      message: 'Lightspeed account disconnected successfully',
    })
  } catch (error) {
    console.error('Error disconnecting Lightspeed:', error)
    
    return NextResponse.json(
      { error: 'Failed to disconnect Lightspeed account' },
      { status: 500 }
    )
  }
}








