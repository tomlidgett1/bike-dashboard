/**
 * Token Manager for Lightspeed OAuth
 * 
 * Handles secure token encryption/decryption and automatic refresh.
 * Uses AES-256-GCM for token encryption at rest.
 */

import { createClient } from '@/lib/supabase/server'
import { getEncryptionKey, getLightspeedCredentials, LIGHTSPEED_CONFIG } from './config'
import type { LightspeedConnection, LightspeedTokenResponse } from './types'
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
 * Store tokens for a user (encrypts before storage)
 */
export async function storeTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  accountId?: string,
  accountName?: string
): Promise<LightspeedConnection> {
  const supabase = await createClient()
  
  const encryptedAccessToken = encryptToken(accessToken)
  const encryptedRefreshToken = encryptToken(refreshToken)
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  
  const { data, error } = await supabase
    .from('lightspeed_connections')
    .upsert({
      user_id: userId,
      status: 'connected',
      account_id: accountId || null,
      account_name: accountName || null,
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      token_expires_at: tokenExpiresAt,
      connected_at: new Date().toISOString(),
      last_token_refresh_at: new Date().toISOString(),
      oauth_state: null,
      oauth_state_expires_at: null,
      last_error: null,
      last_error_at: null,
      error_count: 0,
    }, {
      onConflict: 'user_id',
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error storing tokens:', error)
    throw new Error(`Failed to store tokens: ${error.message}`)
  }
  
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
  const supabase = await createClient()
  
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
  const supabase = await createClient()
  
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
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(userId: string): Promise<{
  accessToken: string
  expiresAt: Date
} | null> {
  const tokens = await getDecryptedTokens(userId)
  
  if (!tokens) {
    console.error('No tokens found for user')
    return null
  }
  
  const { clientId, clientSecret } = getLightspeedCredentials()
  
  try {
    const response = await fetch(LIGHTSPEED_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }),
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Token refresh failed:', errorData)
      
      // Mark connection as expired
      await updateConnectionStatus(userId, 'expired', 'Token refresh failed')
      return null
    }
    
    const tokenData: LightspeedTokenResponse = await response.json()
    
    // Store the new tokens
    await storeTokens(
      userId,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.expires_in,
      tokens.connection.account_id || undefined,
      tokens.connection.account_name || undefined
    )
    
    return {
      accessToken: tokenData.access_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    }
  } catch (error) {
    console.error('Error refreshing token:', error)
    await updateConnectionStatus(userId, 'error', 'Token refresh error')
    return null
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

// ============================================================
// Connection Management Functions
// ============================================================

/**
 * Update connection status
 */
export async function updateConnectionStatus(
  userId: string,
  status: 'connected' | 'disconnected' | 'error' | 'expired',
  errorMessage?: string
): Promise<void> {
  const supabase = await createClient()
  
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
      .from('lightspeed_connections')
      .select('error_count')
      .eq('user_id', userId)
      .single()
    
    updateData.error_count = (current?.error_count || 0) + 1
  }
  
  const { error } = await supabase
    .from('lightspeed_connections')
    .update(updateData)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error updating connection status:', error)
  }
}

/**
 * Update last sync timestamp
 */
export async function updateLastSyncTime(userId: string): Promise<void> {
  const supabase = await createClient()
  
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
export async function disconnectUser(userId: string): Promise<void> {
  await updateConnectionStatus(userId, 'disconnected')
}

// ============================================================
// OAuth State Management
// ============================================================

/**
 * Generate and store OAuth state token
 */
export async function generateOAuthState(userId: string): Promise<string> {
  const supabase = await createClient()
  
  // Generate secure random state
  const state = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + LIGHTSPEED_CONFIG.STATE_TOKEN_EXPIRY_MS).toISOString()
  
  // Upsert connection with state
  const { error } = await supabase
    .from('lightspeed_connections')
    .upsert({
      user_id: userId,
      status: 'disconnected',
      oauth_state: state,
      oauth_state_expires_at: expiresAt,
    }, {
      onConflict: 'user_id',
    })
  
  if (error) {
    console.error('Error storing OAuth state:', error)
    throw new Error(`Failed to store OAuth state: ${error.message}`)
  }
  
  return state
}

/**
 * Validate and consume OAuth state token
 */
export async function validateOAuthState(userId: string, state: string): Promise<boolean> {
  const supabase = await createClient()
  
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










