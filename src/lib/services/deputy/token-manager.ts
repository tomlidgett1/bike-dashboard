/**
 * Token Manager for Deputy OAuth
 *
 * Mirrors the Xero/Lightspeed token managers: AES-256-GCM encryption at rest
 * (shared encryptToken/decryptToken helpers) against the deputy_connections
 * table. Deputy rotates refresh tokens on every refresh, so the same
 * concurrent-refresh race guards apply.
 *
 * Deputy specifics:
 * - The initial code exchange goes to once.deputy.com; the response carries the
 *   per-install `endpoint`. We persist that host and use it for every API call
 *   and for the refresh call (which hits {endpoint}/oauth/access_token, not the
 *   once.deputy.com gateway).
 */

import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken, decryptToken } from '@/lib/services/lightspeed/token-manager'
import {
  DEPUTY_CONFIG,
  getDeputyCredentials,
  deputyRefreshUrl,
  normaliseDeputyEndpoint,
  parseDeputyEndpoint,
} from './config'
import type { DeputyConnection, DeputyTokenResponse } from './types'
import crypto from 'crypto'

export interface StoreDeputyTokensOptions {
  endpoint?: string | null
  accountName?: string | null
  companyName?: string | null
  deputyEmployeeId?: string | null
}

/**
 * Store tokens for a user (encrypts before storage).
 */
export async function storeDeputyTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  options: StoreDeputyTokensOptions = {},
): Promise<DeputyConnection> {
  const supabase = createServiceRoleClient()

  const update: Record<string, unknown> = {
    user_id: userId,
    status: 'connected',
    access_token_encrypted: encryptToken(accessToken),
    refresh_token_encrypted: encryptToken(refreshToken),
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    connected_at: new Date().toISOString(),
    last_token_refresh_at: new Date().toISOString(),
    oauth_state: null,
    oauth_state_expires_at: null,
    last_error: null,
    last_error_at: null,
    error_count: 0,
  }

  if (options.endpoint !== undefined && options.endpoint !== null) {
    const host = normaliseDeputyEndpoint(options.endpoint)
    const { installName, geo } = parseDeputyEndpoint(host)
    update.endpoint = host
    update.install_name = installName
    update.geo = geo
  }
  if (options.accountName !== undefined) update.account_name = options.accountName
  if (options.companyName !== undefined) update.company_name = options.companyName
  if (options.deputyEmployeeId !== undefined) update.deputy_employee_id = options.deputyEmployeeId

  const { data, error } = await supabase
    .from('deputy_connections')
    .upsert(update, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) {
    console.error('[Deputy] Error storing tokens:', error)
    throw new Error(`Failed to store Deputy tokens: ${error.message}`)
  }

  return data
}

/**
 * Get decrypted tokens for a user.
 */
export async function getDecryptedDeputyTokens(userId: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
  connection: DeputyConnection
} | null> {
  const supabase = createServiceRoleClient()

  const { data: connection, error } = await supabase
    .from('deputy_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !connection) return null
  if (!connection.access_token_encrypted || !connection.refresh_token_encrypted) return null

  try {
    return {
      accessToken: decryptToken(connection.access_token_encrypted),
      refreshToken: decryptToken(connection.refresh_token_encrypted),
      expiresAt: new Date(connection.token_expires_at),
      connection,
    }
  } catch (decryptError) {
    console.error('[Deputy] Error decrypting tokens:', decryptError)
    return null
  }
}

/**
 * Get connection row without decrypting tokens.
 */
export async function getDeputyConnection(userId: string): Promise<DeputyConnection | null> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('deputy_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[Deputy] Error fetching connection:', error)
    throw new Error(`Failed to fetch Deputy connection: ${error.message}`)
  }

  return data
}

export function deputyTokenNeedsRefresh(expiresAt: Date): boolean {
  return Date.now() >= expiresAt.getTime() - DEPUTY_CONFIG.TOKEN_EXPIRY_BUFFER_MS
}

/**
 * Exchange an authorization code for tokens.
 *
 * Deputy passes client credentials in the form body (not Basic auth) and the
 * initial exchange always hits the once.deputy.com gateway.
 */
export async function exchangeDeputyAuthCode(code: string): Promise<DeputyTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getDeputyCredentials()

  const response = await fetch(DEPUTY_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: DEPUTY_CONFIG.DEFAULT_SCOPES.join(' '),
      code,
    }),
  })

  if (!response.ok) {
    const errorData = await response.text().catch(() => '')
    console.error('[Deputy] Token exchange failed:', response.status, errorData.slice(0, 500))
    throw new Error('Deputy token exchange failed')
  }

  return response.json()
}

/**
 * Refresh the access token using the rotating refresh token.
 *
 * Hits the per-install endpoint, not the once.deputy.com gateway.
 *
 * Guard: if another process refreshed in the last 10 seconds, return the
 * already-fresh token instead of consuming the (single-use) refresh token twice.
 */
export async function refreshDeputyAccessToken(userId: string): Promise<{
  accessToken: string
  expiresAt: Date
} | null> {
  const tokens = await getDecryptedDeputyTokens(userId)
  if (!tokens) {
    console.error('[Deputy] No tokens found for user')
    return null
  }

  const endpoint = tokens.connection.endpoint
  if (!endpoint) {
    console.error('[Deputy] No endpoint stored for user — cannot refresh')
    await updateDeputyConnectionStatus(userId, 'expired', 'Deputy endpoint missing. Please reconnect Deputy.')
    return null
  }

  const lastRefresh = tokens.connection.last_token_refresh_at
  if (lastRefresh) {
    const secondsSinceRefresh = (Date.now() - new Date(lastRefresh).getTime()) / 1000
    if (secondsSinceRefresh < 10 && !deputyTokenNeedsRefresh(tokens.expiresAt)) {
      return { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }
    }
  }

  const { clientId, clientSecret, redirectUri } = getDeputyCredentials()

  try {
    const response = await fetch(deputyRefreshUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        scope: DEPUTY_CONFIG.DEFAULT_SCOPES.join(' '),
        refresh_token: tokens.refreshToken,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text().catch(() => '')
      console.error('[Deputy] Token refresh failed:', response.status, errorData.slice(0, 500))

      // A concurrent caller may have already rotated the refresh token successfully
      const latest = await getDecryptedDeputyTokens(userId)
      if (latest && !deputyTokenNeedsRefresh(latest.expiresAt)) {
        return { accessToken: latest.accessToken, expiresAt: latest.expiresAt }
      }

      if (response.status === 400 || response.status === 401) {
        await updateDeputyConnectionStatus(userId, 'expired', 'Refresh token invalid or revoked. Please reconnect Deputy.')
      } else {
        console.warn('[Deputy] Transient refresh error, not marking as expired')
      }
      return null
    }

    const tokenData: DeputyTokenResponse = await response.json()

    await storeDeputyTokens(userId, tokenData.access_token, tokenData.refresh_token, tokenData.expires_in, {
      // Deputy returns the endpoint again on refresh; keep it fresh.
      endpoint: tokenData.endpoint ?? endpoint,
    })

    return {
      accessToken: tokenData.access_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    }
  } catch (error) {
    console.error('[Deputy] Error refreshing token:', error)
    await updateDeputyConnectionStatus(userId, 'error', 'Token refresh error')
    return null
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 */
export async function getValidDeputyAccessToken(userId: string): Promise<string | null> {
  const tokens = await getDecryptedDeputyTokens(userId)
  if (!tokens) return null

  if (deputyTokenNeedsRefresh(tokens.expiresAt)) {
    const refreshed = await refreshDeputyAccessToken(userId)
    return refreshed?.accessToken ?? null
  }

  return tokens.accessToken
}

/**
 * Update connection status.
 */
export async function updateDeputyConnectionStatus(
  userId: string,
  status: 'connected' | 'disconnected' | 'error' | 'expired',
  errorMessage?: string,
): Promise<void> {
  const supabase = createServiceRoleClient()

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'disconnected') {
    updateData.disconnected_at = new Date().toISOString()
    updateData.access_token_encrypted = null
    updateData.refresh_token_encrypted = null
    updateData.token_expires_at = null
  }

  if (errorMessage) {
    updateData.last_error = errorMessage
    updateData.last_error_at = new Date().toISOString()
  }

  if (status === 'error' || status === 'expired') {
    const { data: current } = await supabase
      .from('deputy_connections')
      .select('error_count')
      .eq('user_id', userId)
      .single()

    updateData.error_count = (current?.error_count || 0) + 1
  }

  const { error } = await supabase
    .from('deputy_connections')
    .update(updateData)
    .eq('user_id', userId)

  if (error) {
    console.error('[Deputy] Error updating connection status:', error)
  }
}

export async function disconnectDeputyUser(userId: string): Promise<void> {
  await updateDeputyConnectionStatus(userId, 'disconnected')
}

/**
 * Generate and store OAuth state token (CSRF protection).
 */
export async function generateDeputyOAuthState(userId: string): Promise<string> {
  const supabase = createServiceRoleClient()

  const state = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + DEPUTY_CONFIG.STATE_TOKEN_EXPIRY_MS).toISOString()

  const { error } = await supabase
    .from('deputy_connections')
    .upsert({
      user_id: userId,
      status: 'disconnected',
      oauth_state: state,
      oauth_state_expires_at: expiresAt,
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('[Deputy] Error storing OAuth state:', error)
    throw new Error(`Failed to store Deputy OAuth state: ${error.message}`)
  }

  return state
}

/**
 * Validate and consume OAuth state token.
 */
export async function validateDeputyOAuthState(userId: string, state: string): Promise<boolean> {
  const supabase = createServiceRoleClient()

  const { data: connection, error } = await supabase
    .from('deputy_connections')
    .select('oauth_state, oauth_state_expires_at')
    .eq('user_id', userId)
    .single()

  if (error || !connection) return false
  if (connection.oauth_state !== state) return false

  if (connection.oauth_state_expires_at) {
    if (Date.now() > new Date(connection.oauth_state_expires_at).getTime()) return false
  }

  await supabase
    .from('deputy_connections')
    .update({ oauth_state: null, oauth_state_expires_at: null })
    .eq('user_id', userId)

  return true
}
