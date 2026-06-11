/**
 * Token Manager for Xero OAuth
 *
 * Mirrors the Lightspeed token manager: AES-256-GCM encryption at rest
 * (shared encryptToken/decryptToken helpers) against the xero_connections table.
 * Xero rotates refresh tokens on every refresh, so the same concurrent-refresh
 * race guards apply.
 */

import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken, decryptToken } from '@/lib/services/lightspeed/token-manager'
import { XERO_CONFIG, getXeroCredentials } from './config'
import type { XeroConnection, XeroTenantConnection, XeroTokenResponse } from './types'
import crypto from 'crypto'

export interface StoreXeroTokensOptions {
  tenantId?: string | null
  tenantName?: string | null
  tenantType?: string | null
  organisationName?: string | null
  baseCurrency?: string | null
}

/**
 * Store tokens for a user (encrypts before storage)
 */
export async function storeXeroTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  options: StoreXeroTokensOptions = {},
): Promise<XeroConnection> {
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
  if (options.tenantId !== undefined) update.tenant_id = options.tenantId
  if (options.tenantName !== undefined) update.tenant_name = options.tenantName
  if (options.tenantType !== undefined) update.tenant_type = options.tenantType
  if (options.organisationName !== undefined) update.organisation_name = options.organisationName
  if (options.baseCurrency !== undefined) update.base_currency = options.baseCurrency

  const { data, error } = await supabase
    .from('xero_connections')
    .upsert(update, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) {
    console.error('[Xero] Error storing tokens:', error)
    throw new Error(`Failed to store Xero tokens: ${error.message}`)
  }

  return data
}

/**
 * Get decrypted tokens for a user
 */
export async function getDecryptedXeroTokens(userId: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
  connection: XeroConnection
} | null> {
  const supabase = createServiceRoleClient()

  const { data: connection, error } = await supabase
    .from('xero_connections')
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
    console.error('[Xero] Error decrypting tokens:', decryptError)
    return null
  }
}

/**
 * Get connection row without decrypting tokens
 */
export async function getXeroConnection(userId: string): Promise<XeroConnection | null> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[Xero] Error fetching connection:', error)
    throw new Error(`Failed to fetch Xero connection: ${error.message}`)
  }

  return data
}

export function xeroTokenNeedsRefresh(expiresAt: Date): boolean {
  return Date.now() >= expiresAt.getTime() - XERO_CONFIG.TOKEN_EXPIRY_BUFFER_MS
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = getXeroCredentials()
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

/**
 * Exchange an authorization code for tokens
 */
export async function exchangeXeroAuthCode(code: string): Promise<XeroTokenResponse> {
  const { redirectUri } = getXeroCredentials()

  const response = await fetch(XERO_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[Xero] Token exchange failed:', errorData)
    throw new Error('Xero token exchange failed')
  }

  return response.json()
}

/**
 * List the tenants (organisations) the token is authorised for
 */
export async function fetchXeroTenantConnections(accessToken: string): Promise<XeroTenantConnection[]> {
  const response = await fetch(XERO_CONFIG.CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    console.error('[Xero] Connections fetch failed:', response.status)
    return []
  }

  return response.json()
}

/**
 * Refresh the access token using the rotating refresh token.
 *
 * Guard: if another process refreshed in the last 10 seconds, return the
 * already-fresh token instead of consuming the refresh token twice.
 */
export async function refreshXeroAccessToken(userId: string): Promise<{
  accessToken: string
  expiresAt: Date
} | null> {
  const tokens = await getDecryptedXeroTokens(userId)
  if (!tokens) {
    console.error('[Xero] No tokens found for user')
    return null
  }

  const lastRefresh = tokens.connection.last_token_refresh_at
  if (lastRefresh) {
    const secondsSinceRefresh = (Date.now() - new Date(lastRefresh).getTime()) / 1000
    if (secondsSinceRefresh < 10 && !xeroTokenNeedsRefresh(tokens.expiresAt)) {
      return { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }
    }
  }

  try {
    const response = await fetch(XERO_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Xero] Token refresh failed:', errorData)

      // A concurrent caller may have already rotated the refresh token successfully
      const latest = await getDecryptedXeroTokens(userId)
      if (latest && !xeroTokenNeedsRefresh(latest.expiresAt)) {
        return { accessToken: latest.accessToken, expiresAt: latest.expiresAt }
      }

      if (errorData.error === 'invalid_grant') {
        await updateXeroConnectionStatus(userId, 'expired', 'Refresh token invalid or revoked. Please reconnect Xero.')
      } else {
        console.warn('[Xero] Transient refresh error, not marking as expired:', errorData)
      }
      return null
    }

    const tokenData: XeroTokenResponse = await response.json()

    await storeXeroTokens(userId, tokenData.access_token, tokenData.refresh_token, tokenData.expires_in)

    return {
      accessToken: tokenData.access_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    }
  } catch (error) {
    console.error('[Xero] Error refreshing token:', error)
    await updateXeroConnectionStatus(userId, 'error', 'Token refresh error')
    return null
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidXeroAccessToken(userId: string): Promise<string | null> {
  const tokens = await getDecryptedXeroTokens(userId)
  if (!tokens) return null

  if (xeroTokenNeedsRefresh(tokens.expiresAt)) {
    const refreshed = await refreshXeroAccessToken(userId)
    return refreshed?.accessToken ?? null
  }

  return tokens.accessToken
}

/**
 * Update connection status
 */
export async function updateXeroConnectionStatus(
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
      .from('xero_connections')
      .select('error_count')
      .eq('user_id', userId)
      .single()

    updateData.error_count = (current?.error_count || 0) + 1
  }

  const { error } = await supabase
    .from('xero_connections')
    .update(updateData)
    .eq('user_id', userId)

  if (error) {
    console.error('[Xero] Error updating connection status:', error)
  }
}

export async function disconnectXeroUser(userId: string): Promise<void> {
  await updateXeroConnectionStatus(userId, 'disconnected')
}

/**
 * Generate and store OAuth state token (CSRF protection)
 */
export async function generateXeroOAuthState(userId: string): Promise<string> {
  const supabase = createServiceRoleClient()

  const state = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + XERO_CONFIG.STATE_TOKEN_EXPIRY_MS).toISOString()

  const { error } = await supabase
    .from('xero_connections')
    .upsert({
      user_id: userId,
      status: 'disconnected',
      oauth_state: state,
      oauth_state_expires_at: expiresAt,
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('[Xero] Error storing OAuth state:', error)
    throw new Error(`Failed to store Xero OAuth state: ${error.message}`)
  }

  return state
}

/**
 * Validate and consume OAuth state token
 */
export async function validateXeroOAuthState(userId: string, state: string): Promise<boolean> {
  const supabase = createServiceRoleClient()

  const { data: connection, error } = await supabase
    .from('xero_connections')
    .select('oauth_state, oauth_state_expires_at')
    .eq('user_id', userId)
    .single()

  if (error || !connection) return false
  if (connection.oauth_state !== state) return false

  if (connection.oauth_state_expires_at) {
    if (Date.now() > new Date(connection.oauth_state_expires_at).getTime()) return false
  }

  await supabase
    .from('xero_connections')
    .update({ oauth_state: null, oauth_state_expires_at: null })
    .eq('user_id', userId)

  return true
}
