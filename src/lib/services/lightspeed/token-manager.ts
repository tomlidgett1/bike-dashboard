/**
 * Token Manager for Lightspeed OAuth
 * 
 * Handles secure token encryption/decryption and automatic refresh.
 * Uses AES-256-GCM for token encryption at rest.
 */

import { createServiceRoleClient } from '@/lib/supabase/server'
import { getEncryptionKey, getLightspeedCredentials, LIGHTSPEED_CONFIG } from './config'
import type { LightspeedConnection, LightspeedConnectionStatus, LightspeedTokenResponse } from './types'
import { logLightspeedConnectionEvent } from './connection-events'
import crypto from 'crypto'

// ============================================================
// Encryption/Decryption Functions
// ============================================================

/**
 * Encrypt a token using AES-256-GCM
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12) // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  // Format: iv:authTag:encryptedData (all hex encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt a token using AES-256-GCM
 */
export function decryptToken(encryptedToken: string): string {
  const key = getEncryptionKey()
  const parts = encryptedToken.split(':')
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }
  
  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

// ============================================================
// Token Storage Functions
// ============================================================

/**
 * Store tokens for a user (encrypts before storage).
 * Increments token_generation and clears stale disconnect/error/lock fields.
 */
export async function storeTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  accountId?: string,
  accountName?: string,
  options?: { source?: string },
): Promise<LightspeedConnection> {
  const supabase = createServiceRoleClient()
  const existing = await getConnection(userId)
  const previousStatus = existing?.status ?? null
  const nextGeneration = (existing?.token_generation ?? 0) + 1

  const encryptedAccessToken = encryptToken(accessToken)
  const encryptedRefreshToken = encryptToken(refreshToken)
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('lightspeed_connections')
    .upsert({
      user_id: userId,
      status: 'connected',
      account_id: accountId || existing?.account_id || null,
      account_name: accountName || existing?.account_name || null,
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      token_expires_at: tokenExpiresAt,
      connected_at: existing?.connected_at ?? now,
      last_token_refresh_at: now,
      oauth_state: null,
      oauth_state_expires_at: null,
      disconnected_at: null,
      token_refresh_locked_at: null,
      last_error: null,
      last_error_at: null,
      error_count: 0,
      token_generation: nextGeneration,
    }, {
      onConflict: 'user_id',
    })
    .select()
    .single()

  if (error) {
    console.error('Error storing tokens:', error)
    throw new Error(`Failed to store tokens: ${error.message}`)
  }

  await logLightspeedConnectionEvent({
    userId,
    connectionId: data.id,
    eventType: options?.source === 'oauth_callback' ? 'oauth_callback_success' : 'token_refresh_success',
    source: options?.source,
    previousStatus,
    newStatus: 'connected',
    tokenGeneration: nextGeneration,
    tokenExpiresAt,
  })

  return data
}

/**
 * Persist refreshed tokens only if token_generation is unchanged (compare-and-set).
 */
async function persistRefreshedTokens(
  userId: string,
  expectedGeneration: number,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  accountId?: string | null,
  accountName?: string | null,
  source?: string,
): Promise<LightspeedConnection | null> {
  const supabase = createServiceRoleClient()
  const nextGeneration = expectedGeneration + 1
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('lightspeed_connections')
    .update({
      status: 'connected',
      access_token_encrypted: encryptToken(accessToken),
      refresh_token_encrypted: encryptToken(refreshToken),
      token_expires_at: tokenExpiresAt,
      last_token_refresh_at: now,
      token_refresh_locked_at: null,
      disconnected_at: null,
      last_error: null,
      last_error_at: null,
      error_count: 0,
      token_generation: nextGeneration,
      account_id: accountId ?? null,
      account_name: accountName ?? null,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('token_generation', expectedGeneration)
    .select()
    .single()

  if (error || !data) {
    return null
  }

  await logLightspeedConnectionEvent({
    userId,
    connectionId: data.id,
    eventType: 'token_refresh_success',
    source,
    previousStatus: 'connected',
    newStatus: 'connected',
    tokenGeneration: nextGeneration,
    tokenExpiresAt,
  })

  return data
}

/**
 * Get decrypted tokens for a user
 */
export async function getDecryptedTokens(userId: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
  connection: LightspeedConnection
} | null> {
  const supabase = createServiceRoleClient()
  
  const { data: connection, error } = await supabase
    .from('lightspeed_connections')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error || !connection) {
    return null
  }
  
  if (!connection.access_token_encrypted || !connection.refresh_token_encrypted) {
    return null
  }
  
  try {
    const accessToken = decryptToken(connection.access_token_encrypted)
    const refreshToken = decryptToken(connection.refresh_token_encrypted)
    const expiresAt = new Date(connection.token_expires_at)
    
    return {
      accessToken,
      refreshToken,
      expiresAt,
      connection,
    }
  } catch (error) {
    console.error('Error decrypting tokens:', error)
    return null
  }
}

/**
 * Get connection without decrypted tokens
 */
export async function getConnection(userId: string): Promise<LightspeedConnection | null> {
  const supabase = createServiceRoleClient()
  
  const { data, error } = await supabase
    .from('lightspeed_connections')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null
    }
    console.error('Error fetching connection:', error)
    throw new Error(`Failed to fetch connection: ${error.message}`)
  }
  
  return data
}

// ============================================================
// Token Refresh Functions
// ============================================================

/**
 * Check if token needs refresh (within buffer period of expiry)
 */
export function tokenNeedsRefresh(expiresAt: Date): boolean {
  const now = Date.now()
  const expiryTime = expiresAt.getTime()
  return now >= expiryTime - LIGHTSPEED_CONFIG.TOKEN_EXPIRY_BUFFER_MS
}

/**
 * How long a refresh lock is honoured before it is considered stale and may be
 * stolen by another refresher. Bounds the worst case if a refresher crashes mid-flight.
 */
const REFRESH_LOCK_TTL_MS = 60_000

type DecryptedTokens = NonNullable<Awaited<ReturnType<typeof getDecryptedTokens>>>

/**
 * Atomically claim the exclusive right to refresh this connection's tokens.
 *
 * Lightspeed uses SINGLE-USE rotating refresh tokens: if two processes redeem the same
 * refresh token, Lightspeed revokes the whole token family and the user is forced to
 * reconnect. This lock guarantees only one refresher per connection talks to Lightspeed
 * at a time; the others reuse the freshly-stored token.
 *
 * The conditional UPDATE is atomic at the database (Postgres row lock), so exactly one
 * concurrent caller wins. Returns the claim timestamp when acquired, `'locked'` when
 * another refresh is in flight, or `'unsupported'` when the lock column is missing
 * (migration not applied yet) — in which case callers proceed without the lock.
 */
async function claimRefreshLock(
  userId: string,
): Promise<{ claimedAt: string } | 'locked' | 'unsupported' | 'failed'> {
  const supabase = createServiceRoleClient()
  const claimedAt = new Date().toISOString()
  const staleCutoff = new Date(Date.now() - REFRESH_LOCK_TTL_MS).toISOString()

  const { data, error } = await supabase
    .from('lightspeed_connections')
    .update({ token_refresh_locked_at: claimedAt })
    .eq('user_id', userId)
    // Acquire only if nobody holds the lock, or the existing lock has gone stale.
    .or(`token_refresh_locked_at.is.null,token_refresh_locked_at.lt."${staleCutoff}"`)
    .select('id')

  if (error) {
    // 42703 = undefined_column → the migration adding token_refresh_locked_at has not
    // been applied yet. Degrade gracefully to the unlocked path rather than failing.
    if (error.code === '42703') return 'unsupported'
    console.error('[Lightspeed] Failed to claim refresh lock — aborting refresh (fail closed):', error)
    return 'failed'
  }

  return data && data.length > 0 ? { claimedAt } : 'locked'
}

/**
 * Release a refresh lock, but only if we still hold it (the stored claim timestamp
 * is unchanged). This prevents a slow/stale refresher from clearing a lock that has
 * since been re-acquired by someone else.
 */
async function releaseRefreshLock(userId: string, claimedAt: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('lightspeed_connections')
    .update({ token_refresh_locked_at: null })
    .eq('user_id', userId)
    .eq('token_refresh_locked_at', claimedAt)
  if (error && error.code !== '42703') {
    console.error('[Lightspeed] Failed to release refresh lock:', error)
  }
}

/**
 * Invoked when another refresher holds the lock. Keep using the current access token
 * while it is still valid; only if it has already expired do we wait briefly for the
 * in-flight refresh to store a new one.
 */
async function waitForConcurrentRefresh(
  userId: string,
  current: DecryptedTokens,
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  // Still valid — let the in-flight refresh store the next token; we use this one now.
  if (current.expiresAt.getTime() > Date.now()) {
    return { accessToken: current.accessToken, expiresAt: current.expiresAt }
  }

  // Already expired — wait up to ~5s for the concurrent refresh to land.
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const latest = await getDecryptedTokens(userId)
    if (!latest) return null
    if (
      latest.connection.status === 'expired' ||
      latest.connection.status === 'disconnected'
    ) {
      return null
    }
    if (latest.expiresAt.getTime() > Date.now() && !tokenNeedsRefresh(latest.expiresAt)) {
      return { accessToken: latest.accessToken, expiresAt: latest.expiresAt }
    }
  }
  return null
}

/**
 * Refresh the access token using the (single-use, rotating) refresh token.
 *
 * Lightspeed revokes the entire token family if a refresh token is redeemed twice, so
 * all refreshes are serialised per connection via claimRefreshLock(): exactly one caller
 * talks to Lightspeed; concurrent callers reuse the freshly-stored token. This is the
 * single refresh code path — the Vercel cron, the pre-expiry check in
 * getValidAccessToken, and the 401 handler in the API client all funnel through here.
 */
export async function refreshAccessToken(
  userId: string,
  options?: { source?: string },
): Promise<{
  accessToken: string
  expiresAt: Date
} | null> {
  const tokens = await getDecryptedTokens(userId)

  if (!tokens) {
    console.error('No tokens found for user')
    return null
  }

  if (
    tokens.connection.status === 'disconnected' ||
    tokens.connection.status === 'expired'
  ) {
    console.warn('[Lightspeed] Skipping refresh for inactive connection', {
      userId,
      status: tokens.connection.status,
    })
    return null
  }

  const generationAtStart = tokens.connection.token_generation ?? 0

  // Fast path: a refresh happened in the last 10 seconds and the token is still fresh.
  // Return it rather than redeeming the (now-rotated) refresh token again.
  const lastRefresh = tokens.connection.last_token_refresh_at
  if (lastRefresh) {
    const secondsSinceRefresh = (Date.now() - new Date(lastRefresh).getTime()) / 1000
    if (secondsSinceRefresh < 10 && !tokenNeedsRefresh(tokens.expiresAt)) {
      console.log('[Lightspeed] Recent refresh detected, returning current token')
      return { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }
    }
  }

  // Serialise: only the lock holder may redeem the rotating refresh token.
  const lock = await claimRefreshLock(userId)
  if (lock === 'failed') {
    await logLightspeedConnectionEvent({
      userId,
      connectionId: tokens.connection.id,
      eventType: 'lock_failed',
      source: options?.source,
      tokenGeneration: generationAtStart,
      errorMessage: 'Could not acquire refresh lock',
    })
    return null
  }
  if (lock === 'locked') {
    await logLightspeedConnectionEvent({
      userId,
      connectionId: tokens.connection.id,
      eventType: 'lock_contention',
      source: options?.source,
      tokenGeneration: generationAtStart,
    })
    return waitForConcurrentRefresh(userId, tokens)
  }
  const claimedAt = lock === 'unsupported' ? null : lock.claimedAt

  await logLightspeedConnectionEvent({
    userId,
    connectionId: tokens.connection.id,
    eventType: 'token_refresh_started',
    source: options?.source,
    tokenGeneration: generationAtStart,
    tokenExpiresAt: tokens.connection.token_expires_at,
  })

  try {
    // Re-read after acquiring the lock: another process may have refreshed between our
    // first read and the claim, leaving a fresh token already stored.
    const latest = (await getDecryptedTokens(userId)) ?? tokens
    const latestGeneration = latest.connection.token_generation ?? 0

    if (latestGeneration !== generationAtStart) {
      await logLightspeedConnectionEvent({
        userId,
        connectionId: latest.connection.id,
        eventType: 'stale_refresh_suppressed',
        source: options?.source,
        tokenGeneration: latestGeneration,
        metadata: { generationAtStart },
      })
      if (!tokenNeedsRefresh(latest.expiresAt) && latest.connection.status === 'connected') {
        return { accessToken: latest.accessToken, expiresAt: latest.expiresAt }
      }
      return null
    }

    if (
      latest.connection.last_token_refresh_at !== tokens.connection.last_token_refresh_at &&
      !tokenNeedsRefresh(latest.expiresAt)
    ) {
      console.log('[Lightspeed] Token already refreshed by another process, reusing it')
      return { accessToken: latest.accessToken, expiresAt: latest.expiresAt }
    }

    const { clientId, clientSecret } = getLightspeedCredentials()

    const response = await fetch(LIGHTSPEED_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: latest.refreshToken,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Token refresh failed:', errorData)

      const afterFail = await getDecryptedTokens(userId)
      if (afterFail) {
        const currentGeneration = afterFail.connection.token_generation ?? 0
        if (currentGeneration !== generationAtStart) {
          await logLightspeedConnectionEvent({
            userId,
            connectionId: afterFail.connection.id,
            eventType: 'stale_refresh_suppressed',
            source: options?.source,
            tokenGeneration: currentGeneration,
            errorCode: errorData.error,
            errorMessage: 'Refresh failed after a newer token generation was stored',
            metadata: { generationAtStart },
          })
          if (
            afterFail.connection.status === 'connected' &&
            !tokenNeedsRefresh(afterFail.expiresAt)
          ) {
            console.log('[Lightspeed] Stale refresh failure suppressed — using newer token')
            return { accessToken: afterFail.accessToken, expiresAt: afterFail.expiresAt }
          }
          return null
        }
      }

      // Rotating refresh-token race: another request may have refreshed successfully.
      if (errorData.error !== 'invalid_grant' && afterFail && !tokenNeedsRefresh(afterFail.expiresAt)) {
        console.log('[Lightspeed] Refresh lost race but concurrent refresh succeeded — using fresh token')
        return { accessToken: afterFail.accessToken, expiresAt: afterFail.expiresAt }
      }

      await logLightspeedConnectionEvent({
        userId,
        connectionId: tokens.connection.id,
        eventType: 'token_refresh_failed',
        source: options?.source,
        tokenGeneration: generationAtStart,
        errorCode: errorData.error,
        errorMessage: errorData.error_description ?? errorData.error,
      })

      // Genuine failure — mark expired only for invalid_grant (truly revoked token).
      // For transient errors (5xx, network) just return null so the caller can retry.
      if (errorData.error === 'invalid_grant') {
        await updateConnectionStatus(
          userId,
          'expired',
          'Refresh token invalid or revoked. Please reconnect.',
          { expectedGeneration: generationAtStart, source: options?.source },
        )
      } else {
        console.warn('[Lightspeed] Transient refresh error, not marking as expired:', errorData)
      }
      return null
    }

    const tokenData: LightspeedTokenResponse = await response.json()

    const persisted = await persistRefreshedTokens(
      userId,
      generationAtStart,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.expires_in,
      latest.connection.account_id,
      latest.connection.account_name,
      options?.source,
    )

    if (!persisted) {
      const afterRace = await getDecryptedTokens(userId)
      if (afterRace) {
        await logLightspeedConnectionEvent({
          userId,
          connectionId: afterRace.connection.id,
          eventType: 'stale_refresh_suppressed',
          source: options?.source,
          tokenGeneration: afterRace.connection.token_generation ?? 0,
          metadata: { generationAtStart, reason: 'persist_cas_miss' },
        })
        if (
          afterRace.connection.status === 'connected' &&
          !tokenNeedsRefresh(afterRace.expiresAt)
        ) {
          return { accessToken: afterRace.accessToken, expiresAt: afterRace.expiresAt }
        }
      }
      return null
    }

    return {
      accessToken: tokenData.access_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    }
  } catch (error) {
    console.error('Error refreshing token:', error)
    await updateConnectionStatus(
      userId,
      'error',
      'Token refresh error',
      { expectedGeneration: generationAtStart, source: options?.source, incrementGeneration: false },
    )
    return null
  } finally {
    if (claimedAt) {
      await releaseRefreshLock(userId, claimedAt)
    }
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokens = await getDecryptedTokens(userId)
  
  if (!tokens) {
    return null
  }

  if (
    tokens.connection.status === 'disconnected' ||
    tokens.connection.status === 'expired'
  ) {
    return null
  }
  
  // Check if token needs refresh
  if (tokenNeedsRefresh(tokens.expiresAt)) {
    const refreshed = await refreshAccessToken(userId)
    if (refreshed) {
      return refreshed.accessToken
    }
    return null
  }
  
  return tokens.accessToken
}

/**
 * Whether Lightspeed API calls can be attempted for this user.
 * Unlike connection.status alone, this also allows a stored access token
 * when status is transiently "error" but the token has not expired yet.
 */
export async function isLightspeedApiAvailable(userId: string): Promise<boolean> {
  const connection = await getConnection(userId)
  if (!connection) return false
  if (
    connection.status === 'disconnected' ||
    connection.status === 'expired'
  ) {
    return false
  }

  return Boolean(await getValidAccessToken(userId))
}

/** DB-only check — no token refresh, no Lightspeed API calls. */
export async function isLightspeedConnected(userId: string): Promise<boolean> {
  const connection = await getConnection(userId)
  return connection?.status === 'connected'
}

// ============================================================
// Connection Management Functions
// ============================================================

export interface UpdateConnectionStatusOptions {
  expectedGeneration?: number
  source?: string
  incrementGeneration?: boolean
}

/**
 * Update connection status
 */
export async function updateConnectionStatus(
  userId: string,
  status: LightspeedConnectionStatus,
  errorMessage?: string,
  options?: UpdateConnectionStatusOptions,
): Promise<void> {
  const supabase = createServiceRoleClient()

  const { data: current } = await supabase
    .from('lightspeed_connections')
    .select('id, status, token_generation, error_count')
    .eq('user_id', userId)
    .single()

  if (!current) {
    console.error('[Lightspeed] Cannot update status — connection not found for user:', userId)
    return
  }

  const previousStatus = current.status as LightspeedConnectionStatus
  const shouldIncrement =
    options?.incrementGeneration ??
    (status === 'disconnected' || status === 'expired')
  const currentGeneration = current.token_generation ?? 0

  if (
    options?.expectedGeneration !== undefined &&
    currentGeneration !== options.expectedGeneration
  ) {
    await logLightspeedConnectionEvent({
      userId,
      connectionId: current.id,
      eventType: 'stale_refresh_suppressed',
      source: options.source,
      previousStatus,
      newStatus: previousStatus,
      tokenGeneration: currentGeneration,
      metadata: {
        attemptedStatus: status,
        expectedGeneration: options.expectedGeneration,
      },
    })
    return
  }

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (shouldIncrement) {
    updateData.token_generation = currentGeneration + 1
  }

  if (status === 'disconnected') {
    updateData.disconnected_at = new Date().toISOString()
    updateData.access_token_encrypted = null
    updateData.refresh_token_encrypted = null
    updateData.token_expires_at = null
    updateData.token_refresh_locked_at = null
  }

  if (status === 'connected') {
    updateData.disconnected_at = null
    updateData.last_error = null
    updateData.last_error_at = null
  }

  if (errorMessage) {
    updateData.last_error = errorMessage
    updateData.last_error_at = new Date().toISOString()
  }

  if (status === 'error' || status === 'expired') {
    updateData.error_count = (current.error_count || 0) + 1
  }

  let query = supabase
    .from('lightspeed_connections')
    .update(updateData)
    .eq('user_id', userId)

  if (options?.expectedGeneration !== undefined) {
    query = query.eq('token_generation', options.expectedGeneration)
  }

  const { data: updated, error } = await query.select('id, token_generation').single()

  if (error) {
    console.error('Error updating connection status:', error)
    return
  }

  const eventType =
    status === 'disconnected'
      ? 'manual_disconnect'
      : 'status_changed'

  await logLightspeedConnectionEvent({
    userId,
    connectionId: updated?.id ?? current.id,
    eventType,
    source: options?.source,
    previousStatus,
    newStatus: status,
    tokenGeneration: (updated?.token_generation as number | undefined) ?? currentGeneration,
    errorMessage: errorMessage ?? null,
  })
}

/**
 * Update last sync timestamp
 */
export async function updateLastSyncTime(userId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  
  const { error } = await supabase
    .from('lightspeed_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error updating last sync time:', error)
  }
}

/**
 * Disconnect and clear tokens
 */
export async function disconnectUser(
  userId: string,
  options?: { source?: string },
): Promise<void> {
  await updateConnectionStatus(userId, 'disconnected', undefined, {
    source: options?.source ?? 'manual_disconnect',
  })
}

/**
 * Whether the user already has a connected Lightspeed account with a non-expiring token.
 * Used to block accidental OAuth reconnects unless force mode is requested.
 */
export async function hasFreshLightspeedConnection(userId: string): Promise<boolean> {
  const connection = await getConnection(userId)
  if (!connection || connection.status !== 'connected') return false
  if (!connection.access_token_encrypted || !connection.token_expires_at) return false
  return !tokenNeedsRefresh(new Date(connection.token_expires_at))
}

// ============================================================
// OAuth State Management
// ============================================================

/**
 * Generate and store OAuth state token without disturbing an existing connection.
 */
export async function generateOAuthState(
  userId: string,
  options?: { source?: string },
): Promise<string> {
  const supabase = createServiceRoleClient()
  const existing = await getConnection(userId)

  const state = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + LIGHTSPEED_CONFIG.STATE_TOKEN_EXPIRY_MS).toISOString()

  if (existing) {
    const { error } = await supabase
      .from('lightspeed_connections')
      .update({
        oauth_state: state,
        oauth_state_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (error) {
      console.error('Error storing OAuth state:', error)
      throw new Error(`Failed to store OAuth state: ${error.message}`)
    }
  } else {
    const { error } = await supabase
      .from('lightspeed_connections')
      .insert({
        user_id: userId,
        status: 'disconnected',
        oauth_state: state,
        oauth_state_expires_at: expiresAt,
      })

    if (error) {
      console.error('Error storing OAuth state:', error)
      throw new Error(`Failed to store OAuth state: ${error.message}`)
    }
  }

  await logLightspeedConnectionEvent({
    userId,
    connectionId: existing?.id,
    eventType: 'oauth_initiated',
    source: options?.source,
    previousStatus: existing?.status ?? null,
    newStatus: existing?.status ?? 'disconnected',
    tokenGeneration: existing?.token_generation ?? 0,
  })

  return state
}

/**
 * Validate and consume OAuth state token
 */
export async function validateOAuthState(userId: string, state: string): Promise<boolean> {
  const supabase = createServiceRoleClient()
  
  const { data: connection, error } = await supabase
    .from('lightspeed_connections')
    .select('oauth_state, oauth_state_expires_at')
    .eq('user_id', userId)
    .single()
  
  if (error || !connection) {
    return false
  }
  
  // Check state matches
  if (connection.oauth_state !== state) {
    return false
  }
  
  // Check not expired
  if (connection.oauth_state_expires_at) {
    const expiresAt = new Date(connection.oauth_state_expires_at)
    if (Date.now() > expiresAt.getTime()) {
      return false
    }
  }
  
  // Clear the state (consume it)
  await supabase
    .from('lightspeed_connections')
    .update({
      oauth_state: null,
      oauth_state_expires_at: null,
    })
    .eq('user_id', userId)
  
  return true
}















