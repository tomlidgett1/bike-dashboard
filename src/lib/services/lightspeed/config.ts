/**
 * Lightspeed R-Series Integration Configuration
 * 
 * Required Environment Variables:
 * - LIGHTSPEED_CLIENT_ID: OAuth client ID from Lightspeed
 * - LIGHTSPEED_CLIENT_SECRET: OAuth client secret from Lightspeed
 * - LIGHTSPEED_REDIRECT_URI: OAuth callback URL (e.g., http://localhost:3000/api/lightspeed/auth/callback)
 * - TOKEN_ENCRYPTION_KEY: 32-byte hex string for AES-256-GCM encryption
 * 
 * To generate a secure TOKEN_ENCRYPTION_KEY:
 * node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

export const LIGHTSPEED_CONFIG = {
  // OAuth endpoints
  AUTH_URL: 'https://cloud.lightspeedapp.com/auth/oauth/authorize',
  TOKEN_URL: 'https://cloud.lightspeedapp.com/auth/oauth/token',
  
  // API base URL
  API_BASE_URL: 'https://api.lightspeedapp.com/API/V3',
  
  // OAuth scopes (employee:all includes inventory_log)
  DEFAULT_SCOPES: ['employee:all'],
  
  // Token settings
  TOKEN_EXPIRY_BUFFER_MS: 5 * 60 * 1000, // Refresh 5 minutes before expiry
  
  // Rate limiting
  RATE_LIMIT_REQUESTS_PER_SECOND: 5,
  
  // Retry settings
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  
  // State token settings
  STATE_TOKEN_EXPIRY_MS: 10 * 60 * 1000, // 10 minutes
} as const

/**
 * Get Lightspeed client credentials from environment
 */
export function getLightspeedCredentials() {
  const clientId = process.env.LIGHTSPEED_CLIENT_ID
  const clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET
  const redirectUri = process.env.LIGHTSPEED_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/lightspeed/auth/callback`

  if (!clientId) {
    throw new Error('LIGHTSPEED_CLIENT_ID environment variable is required')
  }

  if (!clientSecret) {
    throw new Error('LIGHTSPEED_CLIENT_SECRET environment variable is required')
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  }
}

/**
 * Get encryption key for token storage
 */
export function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY

  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required')
  }

  if (key.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }

  return Buffer.from(key, 'hex')
}

/**
 * Build OAuth authorization URL
 */
export function buildAuthUrl(state: string, scopes: readonly string[] = LIGHTSPEED_CONFIG.DEFAULT_SCOPES): string {
  const { clientId, redirectUri } = getLightspeedCredentials()
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes.join(' '),
    state: state,
    redirect_uri: redirectUri,
  })

  return `${LIGHTSPEED_CONFIG.AUTH_URL}?${params.toString()}`
}

