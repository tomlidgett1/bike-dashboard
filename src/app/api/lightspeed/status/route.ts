/**
 * Lightspeed Connection Status Endpoint
 * 
 * GET /api/lightspeed/status
 * 
 * Returns the current Lightspeed connection status and sync settings
 * for the authenticated user.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnection, createLightspeedClient } from '@/lib/services/lightspeed'
import type { LightspeedConnection, LightspeedSyncSettings } from '@/lib/services/lightspeed'

export interface LightspeedStatusResponse {
  isConnected: boolean
  connection: Omit<LightspeedConnection, 'access_token_encrypted' | 'refresh_token_encrypted' | 'oauth_state'> | null
  syncSettings: LightspeedSyncSettings | null
  accountInfo: {
    id: string
    name: string
  } | null
}

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

    // Get connection status
    const connection = await getConnection(user.id)

    if (!connection) {
      return NextResponse.json<LightspeedStatusResponse>({
        isConnected: false,
        connection: null,
        syncSettings: null,
        accountInfo: null,
      })
    }

    // Get sync settings
    const { data: syncSettings } = await supabase
      .from('lightspeed_sync_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Check if token is valid by testing connection
    let isTokenValid = false
    if (connection.status === 'connected' && connection.access_token_encrypted) {
      try {
        const client = createLightspeedClient(user.id)
        isTokenValid = await client.testConnection()
      } catch {
        isTokenValid = false
      }
    }

    // Remove sensitive data from connection
    const safeConnection = {
      id: connection.id,
      user_id: connection.user_id,
      status: isTokenValid ? connection.status : 'expired',
      account_id: connection.account_id,
      account_name: connection.account_name,
      token_expires_at: connection.token_expires_at,
      scopes: connection.scopes,
      connected_at: connection.connected_at,
      disconnected_at: connection.disconnected_at,
      last_sync_at: connection.last_sync_at,
      last_token_refresh_at: connection.last_token_refresh_at,
      last_error: connection.last_error,
      last_error_at: connection.last_error_at,
      error_count: connection.error_count,
      created_at: connection.created_at,
      updated_at: connection.updated_at,
      oauth_state_expires_at: connection.oauth_state_expires_at,
    }

    const isConnected = connection.status === 'connected' && isTokenValid

    return NextResponse.json<LightspeedStatusResponse>({
      isConnected,
      connection: safeConnection,
      syncSettings: syncSettings || null,
      accountInfo: connection.account_id && connection.account_name
        ? { id: connection.account_id, name: connection.account_name }
        : null,
    })
  } catch (error) {
    console.error('Error fetching Lightspeed status:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch connection status' },
      { status: 500 }
    )
  }
}

