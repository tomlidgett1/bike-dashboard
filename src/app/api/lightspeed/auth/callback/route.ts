/**
 * Lightspeed OAuth Callback Endpoint
 * 
 * GET /api/lightspeed/auth/callback
 * 
 * Handles the OAuth callback from Lightspeed, exchanges the authorization
 * code for tokens, and stores them securely in the database.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  validateOAuthState,
  storeTokens,
  updateConnectionStatus,
  getLightspeedCredentials,
  LIGHTSPEED_CONFIG,
} from '@/lib/services/lightspeed'
import type { LightspeedTokenResponse } from '@/lib/services/lightspeed'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  console.log('[Lightspeed Callback] Received callback:', {
    hasCode: !!code,
    hasState: !!state,
    error,
    errorDescription
  })

  // Get the correct origin (handle ngrok/proxies)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const baseUrl = forwardedHost 
    ? `${forwardedProto || 'https'}://${forwardedHost}`
    : origin

  // Base redirect URL for errors
  const errorRedirectBase = `${baseUrl}/connect-lightspeed`

  // Handle OAuth errors from Lightspeed
  if (error) {
    console.error('OAuth error from Lightspeed:', error, errorDescription)
    return NextResponse.redirect(
      `${errorRedirectBase}?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      `${errorRedirectBase}?error=${encodeURIComponent('Missing authorization code or state')}`
    )
  }

  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.redirect(
        `${errorRedirectBase}?error=${encodeURIComponent('Session expired. Please log in and try again.')}`
      )
    }

    // Validate state token (CSRF protection)
    const isValidState = await validateOAuthState(user.id, state)
    
    if (!isValidState) {
      return NextResponse.redirect(
        `${errorRedirectBase}?error=${encodeURIComponent('Invalid or expired state token. Please try again.')}`
      )
    }

    // Exchange authorization code for tokens
    const { clientId, clientSecret, redirectUri } = getLightspeedCredentials()
    
    const tokenResponse = await fetch(LIGHTSPEED_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      console.error('Token exchange failed:', errorData)
      
      await updateConnectionStatus(user.id, 'error', 'Token exchange failed')
      
      return NextResponse.redirect(
        `${errorRedirectBase}?error=${encodeURIComponent('Failed to exchange authorization code. Please try again.')}`
      )
    }

    const tokenData: LightspeedTokenResponse = await tokenResponse.json()

    console.log('[Lightspeed Callback] Token exchange successful, storing tokens for user:', user.id)

    // Store tokens (encrypted)
    const connection = await storeTokens(
      user.id,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.expires_in
    )

    console.log('[Lightspeed Callback] Tokens stored successfully:', {
      connectionId: connection.id,
      status: connection.status,
      hasAccessToken: !!connection.access_token_encrypted,
      hasRefreshToken: !!connection.refresh_token_encrypted
    })

    // Fetch account info to store account ID and name
    try {
      // Use the access token we just received to get account info
      const accountResponse = await fetch(`${LIGHTSPEED_CONFIG.API_BASE_URL}/Account.json`, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json',
        },
      })

      if (accountResponse.ok) {
        const accountData = await accountResponse.json()
        
        console.log('[Lightspeed Callback] Account info retrieved:', {
          accountId: accountData.Account?.accountID,
          accountName: accountData.Account?.name
        })

        // Update connection with account info
        await supabase
          .from('lightspeed_connections')
          .update({
            account_id: accountData.Account?.accountID || null,
            account_name: accountData.Account?.name || null,
          })
          .eq('user_id', user.id)
      } else {
        console.warn('[Lightspeed Callback] Could not fetch account info:', accountResponse.status)
      }
    } catch (accountError) {
      // Non-critical - connection still works without account info
      console.warn('[Lightspeed Callback] Error fetching account info:', accountError)
    }

    // Trigger automatic full inventory sync
    console.log('[Lightspeed Callback] Triggering automatic full inventory sync...')
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const { data: { session } } = await supabase.auth.getSession()

      if (supabaseUrl && session) {
        const functionUrl = `${supabaseUrl}/functions/v1/sync-all-lightspeed-products`
        
        // Trigger async (don't wait for completion)
        fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId: user.id }),
        }).catch(syncError => {
          console.error('[Lightspeed Callback] Background sync failed:', syncError)
        })

        console.log('[Lightspeed Callback] Full inventory sync triggered in background')
      }
    } catch (syncError) {
      // Non-critical - user can manually trigger sync if needed
      console.warn('[Lightspeed Callback] Could not trigger automatic sync:', syncError)
    }

    // Success - redirect to connect page
    return NextResponse.redirect(`${baseUrl}/connect-lightspeed?success=true`)
  } catch (error) {
    console.error('OAuth callback error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.redirect(
      `${errorRedirectBase}?error=${encodeURIComponent(errorMessage)}`
    )
  }
}

