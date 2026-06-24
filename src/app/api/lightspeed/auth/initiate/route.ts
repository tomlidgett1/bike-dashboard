/**
 * Lightspeed OAuth Initiation Endpoint
 * 
 * GET /api/lightspeed/auth/initiate
 * GET /api/lightspeed/auth/initiate?force=1  — intentional reconnect
 * 
 * Generates a secure state token, stores it in the database,
 * and redirects the user to Lightspeed's OAuth authorization page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateOAuthState,
  buildAuthUrl,
  hasFreshLightspeedConnection,
} from '@/lib/services/lightspeed'
import { logLightspeedConnectionEvent } from '@/lib/services/lightspeed/connection-events'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log('[Lightspeed Initiate] No authenticated user')
      return NextResponse.json(
        { error: 'Unauthorised. Please log in first.' },
        { status: 401 }
      )
    }

    const { searchParams, origin } = new URL(request.url)
    const forceReconnect =
      searchParams.get('force') === '1' || searchParams.get('force') === 'true'

    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto')
    const baseUrl = forwardedHost
      ? `${forwardedProto || 'https'}://${forwardedHost}`
      : origin

    if (!forceReconnect && await hasFreshLightspeedConnection(user.id)) {
      await logLightspeedConnectionEvent({
        userId: user.id,
        eventType: 'already_connected_skipped',
        source: 'oauth_initiate',
      })

      return NextResponse.redirect(
        `${baseUrl}/connect-lightspeed?already_connected=true`,
      )
    }

    console.log('[Lightspeed Initiate] Starting OAuth flow for user:', user.id, {
      forceReconnect,
    })

    const state = await generateOAuthState(user.id, { source: 'oauth_initiate' })
    const authUrl = buildAuthUrl(state)

    console.log('[Lightspeed Initiate] Redirecting to Lightspeed OAuth')

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Error initiating OAuth:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage.includes('environment variable')) {
      return NextResponse.json(
        { error: 'Lightspeed integration is not configured. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to initiate Lightspeed connection' },
      { status: 500 }
    )
  }
}
