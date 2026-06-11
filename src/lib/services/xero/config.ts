/**
 * Xero Integration Configuration
 *
 * Required Environment Variables:
 * - XERO_CLIENT_ID: OAuth client ID from the Xero developer portal (developer.xero.com/app/manage)
 * - XERO_CLIENT_SECRET: OAuth client secret
 * - XERO_REDIRECT_URI: OAuth callback URL (e.g., http://localhost:3000/api/xero/auth/callback)
 * - TOKEN_ENCRYPTION_KEY: shared 32-byte hex key (same key used for Lightspeed tokens)
 */

export const XERO_CONFIG = {
  // OAuth endpoints (standard authorization code flow)
  AUTH_URL: 'https://login.xero.com/identity/connect/authorize',
  TOKEN_URL: 'https://identity.xero.com/connect/token',

  // Tenant connections endpoint — maps an access token to authorised organisations
  CONNECTIONS_URL: 'https://api.xero.com/connections',

  // Accounting API base URL
  API_BASE_URL: 'https://api.xero.com/api.xro/2.0',

  DEFAULT_SCOPES: [
    'openid',
    'profile',
    'email',
    'offline_access',
    'app.connections',
    'accounting.settings.read',
    'accounting.contacts.read',
    'accounting.attachments.read',
    'accounting.budgets.read',
    'accounting.payments.read',
    'accounting.invoices.read',
    'accounting.banktransactions.read',
    'accounting.manualjournals.read',
    'accounting.reports.aged.read',
    'accounting.reports.balancesheet.read',
    'accounting.reports.banksummary.read',
    'accounting.reports.budgetsummary.read',
    'accounting.reports.executivesummary.read',
    'accounting.reports.profitandloss.read',
    'accounting.reports.trialbalance.read',
    'accounting.reports.taxreports.read',
    'accounting.reports.tenninetynine.read',
    'assets.read',
    'files.read',
    'projects.read',
    'payroll.employees.read',
    'payroll.payruns.read',
    'payroll.payslip.read',
    'payroll.settings.read',
    'payroll.timesheets.read',
  ],

  // Access tokens last 30 minutes; refresh 5 minutes before expiry
  TOKEN_EXPIRY_BUFFER_MS: 5 * 60 * 1000,

  // Xero limits: 60 calls/min, 5,000/day per tenant
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,

  STATE_TOKEN_EXPIRY_MS: 10 * 60 * 1000, // 10 minutes
} as const

/**
 * Get Xero client credentials from environment
 */
export function getXeroCredentials() {
  // Trim — env pastes often include a trailing newline, which breaks OAuth
  const clientId = process.env.XERO_CLIENT_ID?.trim()
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim()
  const redirectUri = (
    process.env.XERO_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/xero/auth/callback`
  ).trim()

  if (!clientId) {
    throw new Error('XERO_CLIENT_ID environment variable is required')
  }

  if (!clientSecret) {
    throw new Error('XERO_CLIENT_SECRET environment variable is required')
  }

  return { clientId, clientSecret, redirectUri }
}

export function isXeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID?.trim() && process.env.XERO_CLIENT_SECRET?.trim())
}

/**
 * Build Xero OAuth authorization URL
 */
export function buildXeroAuthUrl(state: string, scopes: readonly string[] = XERO_CONFIG.DEFAULT_SCOPES): string {
  const { clientId, redirectUri } = getXeroCredentials()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })

  return `${XERO_CONFIG.AUTH_URL}?${params.toString()}`
}
