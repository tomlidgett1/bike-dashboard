/**
 * Deputy Integration Configuration
 *
 * Deputy is the store's staff scheduling / time & attendance system. The Genie
 * reads it (read-only) to answer rostering, timesheet, and hours-worked
 * questions ("who worked this week", "who is on tomorrow", "how many hours did
 * X do").
 *
 * Required Environment Variables:
 * - DEPUTY_CLIENT_ID: OAuth client ID from the Deputy developer portal
 * - DEPUTY_CLIENT_SECRET: OAuth client secret
 * - DEPUTY_REDIRECT_URI: OAuth callback URL (e.g. http://localhost:3000/api/deputy/auth/callback)
 * - TOKEN_ENCRYPTION_KEY: shared 32-byte hex key (same key used for Lightspeed/Xero tokens)
 *
 * OAuth model (differs from Xero):
 * - Deputy is multi-tenant by subdomain. Authorisation always starts at the
 *   shared once.deputy.com gateway; the token response carries an `endpoint`
 *   ({install}.{geo}.deputy.com) that is the store-specific API host. Every
 *   subsequent API call AND the refresh call go to that host, not once.deputy.com.
 * - Access tokens last 24 hours. Refresh tokens rotate on every use.
 * - The `longlife_refresh_token` scope is what makes a refresh_token available.
 */

export const DEPUTY_CONFIG = {
  // OAuth gateway (authorization + initial code exchange happen here)
  AUTH_URL: 'https://once.deputy.com/my/oauth/login',
  TOKEN_URL: 'https://once.deputy.com/my/oauth/access_token',

  // API + refresh happen against the per-install host returned as `endpoint`.
  // Path appended to https://{endpoint}
  API_BASE_PATH: '/api/v1',
  REFRESH_PATH: '/oauth/access_token',

  // Deputy only documents this scope; it unlocks the rotating refresh_token.
  DEFAULT_SCOPES: ['longlife_refresh_token'],

  // Access tokens last 24h; refresh well before expiry.
  TOKEN_EXPIRY_BUFFER_MS: 30 * 60 * 1000, // 30 minutes

  // Deputy resource API returns at most 500 records per call.
  MAX_RECORDS: 500,

  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,

  STATE_TOKEN_EXPIRY_MS: 10 * 60 * 1000, // 10 minutes
} as const

/** Store timezone — Deputy stores StartTime/EndTime as unix seconds. */
export const DEPUTY_TIME_ZONE = 'Australia/Brisbane'

/**
 * Get Deputy client credentials from environment.
 */
export function getDeputyCredentials() {
  // Trim — env pastes often include a trailing newline, which breaks OAuth.
  const clientId = process.env.DEPUTY_CLIENT_ID?.trim()
  const clientSecret = process.env.DEPUTY_CLIENT_SECRET?.trim()
  const redirectUri = (
    process.env.DEPUTY_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/deputy/auth/callback`
  ).trim()

  if (!clientId) {
    throw new Error('DEPUTY_CLIENT_ID environment variable is required')
  }

  if (!clientSecret) {
    throw new Error('DEPUTY_CLIENT_SECRET environment variable is required')
  }

  return { clientId, clientSecret, redirectUri }
}

export function isDeputyConfigured(): boolean {
  return Boolean(process.env.DEPUTY_CLIENT_ID?.trim() && process.env.DEPUTY_CLIENT_SECRET?.trim())
}

/**
 * Normalise the `endpoint` value Deputy returns ("abc.au.deputy.com" or
 * "https://abc.au.deputy.com/") down to a bare host we can prefix with https://.
 */
export function normaliseDeputyEndpoint(endpoint: string): string {
  return endpoint
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
}

/** Full API base URL for a connected install, e.g. https://abc.au.deputy.com/api/v1 */
export function deputyApiBaseUrl(endpoint: string): string {
  return `https://${normaliseDeputyEndpoint(endpoint)}${DEPUTY_CONFIG.API_BASE_PATH}`
}

/** Token refresh URL for a connected install (NOT once.deputy.com). */
export function deputyRefreshUrl(endpoint: string): string {
  return `https://${normaliseDeputyEndpoint(endpoint)}${DEPUTY_CONFIG.REFRESH_PATH}`
}

/** Subdomain ("abc") and geo ("au") parsed from an endpoint host. */
export function parseDeputyEndpoint(endpoint: string): { installName: string | null; geo: string | null } {
  const host = normaliseDeputyEndpoint(endpoint)
  const match = host.match(/^([^.]+)\.([^.]+)\.deputy\.com$/i)
  if (!match) return { installName: host.split('.')[0] || null, geo: null }
  return { installName: match[1], geo: match[2] }
}

/**
 * Build the Deputy OAuth authorization URL.
 */
export function buildDeputyAuthUrl(state: string, scopes: readonly string[] = DEPUTY_CONFIG.DEFAULT_SCOPES): string {
  const { clientId, redirectUri } = getDeputyCredentials()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })

  return `${DEPUTY_CONFIG.AUTH_URL}?${params.toString()}`
}
