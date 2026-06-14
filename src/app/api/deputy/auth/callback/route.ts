/**
 * Deputy OAuth Callback Endpoint
 *
 * GET /api/deputy/auth/callback
 *
 * Handles the OAuth callback from Deputy, exchanges the authorization code for
 * tokens, persists the per-install endpoint + encrypted tokens, then enriches
 * with account/company labels. Redirects back to the settings home page where
 * the Connect Deputy pill lives.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  validateDeputyOAuthState,
  exchangeDeputyAuthCode,
  storeDeputyTokens,
  getDeputyMe,
  getDeputyCompanyName,
  updateDeputyConnectionStatus,
} from '@/lib/services/deputy'

const RETURN_PATH = '/settings/store/home'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Get the correct origin (handle ngrok/proxies)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const baseUrl = forwardedHost
    ? `${forwardedProto || 'https'}://${forwardedHost}`
    : origin

  const redirectWithError = (message: string) =>
    NextResponse.redirect(`${baseUrl}${RETURN_PATH}?deputy_error=${encodeURIComponent(message)}`)

  if (error) {
    console.error('[Deputy Callback] OAuth error from Deputy:', error, errorDescription)
    return redirectWithError(errorDescription || error)
  }

  if (!code || !state) {
    return redirectWithError('Missing authorization code or state')
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return redirectWithError('Session expired. Please log in and try again.')
    }

    const isValidState = await validateDeputyOAuthState(user.id, state)
    if (!isValidState) {
      return redirectWithError('Invalid or expired state token. Please try again.')
    }

    const tokenData = await exchangeDeputyAuthCode(code)

    if (!tokenData.endpoint) {
      await updateDeputyConnectionStatus(user.id, 'error', 'Deputy did not return an install endpoint')
      return redirectWithError('Could not resolve your Deputy account endpoint. Please try again.')
    }

    await storeDeputyTokens(user.id, tokenData.access_token, tokenData.refresh_token, tokenData.expires_in, {
      endpoint: tokenData.endpoint,
    })

    // Enrich with account/company labels (non-critical).
    try {
      const [me, companyName] = await Promise.all([
        getDeputyMe(user.id),
        getDeputyCompanyName(user.id),
      ])
      const serviceSupabase = (await import('@/lib/supabase/server')).createServiceRoleClient()
      await serviceSupabase
        .from('deputy_connections')
        .update({
          account_name: me?.name ?? null,
          company_name: companyName ?? null,
          deputy_employee_id: me?.employee_id != null ? String(me.employee_id) : null,
        })
        .eq('user_id', user.id)
    } catch (enrichError) {
      console.warn('[Deputy Callback] Could not fetch account info:', enrichError)
    }

    return NextResponse.redirect(`${baseUrl}${RETURN_PATH}?deputy_connected=true`)
  } catch (callbackError) {
    console.error('[Deputy Callback] OAuth callback error:', callbackError)
    const errorMessage = callbackError instanceof Error ? callbackError.message : 'Unknown error occurred'
    return redirectWithError(errorMessage)
  }
}
