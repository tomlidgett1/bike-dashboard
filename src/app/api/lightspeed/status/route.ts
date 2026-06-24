/**
 * Lightspeed Connection Status Endpoint
 *
 * GET /api/lightspeed/status
 *
 * IMPORTANT – do NOT call testConnection() (which hits the Lightspeed API) here.
 * The hook polls this endpoint every 30 seconds.  If we call testConnection() on
 * every poll, we end up with concurrent callers all triggering refreshAccessToken()
 * at the same time.  Lightspeed uses *rotating* refresh tokens: the second caller
 * sends the already-consumed RT and gets invalid_grant, which our error handler
 * turns into status='expired', permanently breaking the connection.
 *
 * Instead we check token freshness from the DB:
 *  • Token still valid  → return isConnected:true immediately (no Lightspeed call).
 *  • Token expired/near-expiry → attempt a single refresh, return result.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getConnection,
  tokenNeedsRefresh,
  refreshAccessToken,
} from '@/lib/services/lightspeed'
import type { LightspeedConnection, LightspeedSyncSettings } from '@/lib/services/lightspeed'

export interface LightspeedStatusResponse {
  isConnected: boolean
  connection: Omit<LightspeedConnection, 'access_token_encrypted' | 'refresh_token_encrypted' | 'oauth_state' | 'token_refresh_locked_at'> | null
  syncSettings: LightspeedSyncSettings | null
  accountInfo: {
    id: string
    name: string
  } | null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const connection = await getConnection(user.id)

    if (!connection) {
      return NextResponse.json<LightspeedStatusResponse>({
        isConnected: false,
        connection: null,
        syncSettings: null,
        accountInfo: null,
      })
    }

    const { data: syncSettings } = await supabase
      .from('lightspeed_sync_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // ----------------------------------------------------------------
    // Determine connectivity WITHOUT hitting the Lightspeed API.
    // ----------------------------------------------------------------
    let isConnected = false

    if (
      (connection.status === 'connected' || connection.status === 'error') &&
      connection.access_token_encrypted
    ) {
      if (!connection.token_expires_at) {
        // No expiry stored — treat as connected (token will self-heal on next use)
        isConnected = true
      } else {
        const expiresAt = new Date(connection.token_expires_at)

        if (!tokenNeedsRefresh(expiresAt)) {
          // Token is fresh — no API call needed
          isConnected = true
        } else {
          // Token is expired or within the buffer window — refresh it now.
          // refreshAccessToken handles its own race-condition guard.
          const refreshed = await refreshAccessToken(user.id, { source: 'status_poll' })
          isConnected = refreshed !== null
        }
      }
    }
    // Any other status ('disconnected', 'expired') → isConnected stays false

    if (isConnected && connection.status === 'error') {
      await supabase
        .from('lightspeed_connections')
        .update({
          status: 'connected',
          last_error: null,
          last_error_at: null,
        })
        .eq('user_id', user.id)
    }

    const safeConnection = {
      id: connection.id,
      user_id: connection.user_id,
      status: isConnected ? 'connected' : connection.status,
      account_id: connection.account_id,
      account_name: connection.account_name,
      token_expires_at: connection.token_expires_at,
      scopes: connection.scopes,
      connected_at: connection.connected_at,
      disconnected_at: connection.disconnected_at,
      last_sync_at: connection.last_sync_at,
      last_token_refresh_at: connection.last_token_refresh_at,
      token_generation: connection.token_generation ?? 0,
      last_error: connection.last_error,
      last_error_at: connection.last_error_at,
      error_count: connection.error_count,
      created_at: connection.created_at,
      updated_at: connection.updated_at,
      oauth_state_expires_at: connection.oauth_state_expires_at,
    }

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
