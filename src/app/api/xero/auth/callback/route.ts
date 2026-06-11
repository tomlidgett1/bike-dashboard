/**
 * Xero OAuth Callback Endpoint
 *
 * GET /api/xero/auth/callback
 *
 * Handles the OAuth callback from Xero, exchanges the authorization code
 * for tokens, resolves the authorised tenant (organisation), and stores
 * everything encrypted in xero_connections. Redirects back to the settings
 * home page where the Connect Xero pill lives.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  validateXeroOAuthState,
  exchangeXeroAuthCode,
  fetchXeroTenantConnections,
  storeXeroTokens,
  getXeroOrganisation,
  updateXeroConnectionStatus,
} from '@/lib/services/xero'

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
    NextResponse.redirect(`${baseUrl}${RETURN_PATH}?xero_error=${encodeURIComponent(message)}`)

  if (error) {
    console.error('[Xero Callback] OAuth error from Xero:', error, errorDescription)
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

    const isValidState = await validateXeroOAuthState(user.id, state)
    if (!isValidState) {
      return redirectWithError('Invalid or expired state token. Please try again.')
    }

    const tokenData = await exchangeXeroAuthCode(code)

    // Resolve the authorised tenant — required for the Xero-tenant-id header
    const tenants = await fetchXeroTenantConnections(tokenData.access_token)
    const tenant = tenants.find(candidate => candidate.tenantType === 'ORGANISATION') ?? tenants[0]

    if (!tenant) {
      await updateXeroConnectionStatus(user.id, 'error', 'No Xero organisation authorised')
      return redirectWithError('No Xero organisation was authorised. Please try again and select your organisation.')
    }

    await storeXeroTokens(user.id, tokenData.access_token, tokenData.refresh_token, tokenData.expires_in, {
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      tenantType: tenant.tenantType,
    })

    // Enrich with organisation details (non-critical)
    try {
      const organisation = await getXeroOrganisation(user.id)
      if (organisation) {
        const serviceSupabase = (await import('@/lib/supabase/server')).createServiceRoleClient()
        await serviceSupabase
          .from('xero_connections')
          .update({
            organisation_name: organisation.name ?? null,
            base_currency: organisation.base_currency ?? null,
          })
          .eq('user_id', user.id)
      }
    } catch (orgError) {
      console.warn('[Xero Callback] Could not fetch organisation info:', orgError)
    }

    return NextResponse.redirect(`${baseUrl}${RETURN_PATH}?xero_connected=true`)
  } catch (callbackError) {
    console.error('[Xero Callback] OAuth callback error:', callbackError)
    const errorMessage = callbackError instanceof Error ? callbackError.message : 'Unknown error occurred'
    return redirectWithError(errorMessage)
  }
}
