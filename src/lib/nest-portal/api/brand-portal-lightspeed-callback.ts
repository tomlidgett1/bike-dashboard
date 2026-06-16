import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { waitUntil } from '@vercel/functions'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
}

function internalEdgeJsonHeaders(): Record<string, string> {
  const secret =
    pickEnv(['INTERNAL_EDGE_SHARED_SECRET', 'NEST_INTERNAL_EDGE_SHARED_SECRET']) ?? ''
  if (!secret) {
    throw new Error('INTERNAL_EDGE_SHARED_SECRET is not configured')
  }
  return {
    'Content-Type': 'application/json',
    'x-internal-secret': secret,
  }
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const key = pickEnv([
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
  ])
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function supabaseConfigErrorMessage(): string {
  const hasUrl = Boolean(
    pickEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL']),
  )
  const hasKey = Boolean(pickEnv([
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
  ]))
  if (!hasUrl && !hasKey) {
    return 'Server missing Supabase URL and server secret key. In Vercel -> Settings -> Environment Variables, add SUPABASE_URL and SUPABASE_SECRET_KEY from Supabase -> Project Settings -> API Keys.'
  }
  if (!hasUrl) {
    return 'Server missing Supabase URL. Add SUPABASE_URL to Vercel (same value as VITE_SUPABASE_URL), or enable VITE_SUPABASE_URL for Production and redeploy.'
  }
  return 'Server missing SUPABASE_SECRET_KEY. Add it in Vercel -> Settings -> Environment Variables (Production). Use the secret key from Supabase -> Project Settings -> API Keys. Do not use a VITE_ prefix for this secret.'
}

function getSupabaseFunctionsBaseUrl(): string | null {
  const explicit = pickEnv(['SUPABASE_FUNCTIONS_URL', 'NEST_SUPABASE_FUNCTIONS_URL'])
  if (explicit) return explicit.replace(/\/$/, '')
  const supabaseUrl = pickEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
  if (!supabaseUrl) return null
  try {
    const u = new URL(supabaseUrl)
    return `${u.origin}/functions/v1`
  } catch {
    return null
  }
}

/**
 * After OAuth, kick inventory then sales/work orders (items first for work order line labels).
 * Uses waitUntil so the redirect is not blocked; runs after the response on Vercel.
 */
function scheduleLightspeedInitialSyncs(brandKey: string): void {
  const fnBase = getSupabaseFunctionsBaseUrl()
  if (!fnBase) {
    console.warn('[brand-portal-lightspeed-callback] Skipping auto-sync: missing functions URL or server secret key')
    return
  }

  const run = async (): Promise<void> => {
    const headers = internalEdgeJsonHeaders()
    const body = JSON.stringify({ brand_key: brandKey })
    try {
      const inv = await fetch(`${fnBase}/lightspeed-inventory-cron`, { method: 'POST', headers, body })
      const invText = await inv.text()
      console.log(
        '[brand-portal-lightspeed-callback] inventory auto-sync',
        inv.status,
        invText.slice(0, 200),
      )
    } catch (e) {
      console.error('[brand-portal-lightspeed-callback] inventory auto-sync failed', e)
    }
    try {
      const sw = await fetch(`${fnBase}/lightspeed-sync-sales-workorders`, { method: 'POST', headers, body })
      const swText = await sw.text()
      console.log(
        '[brand-portal-lightspeed-callback] sales/workorders auto-sync',
        sw.status,
        swText.slice(0, 200),
      )
    } catch (e) {
      console.error('[brand-portal-lightspeed-callback] sales/workorders auto-sync failed', e)
    }
  }

  try {
    waitUntil(run())
  } catch (e) {
    console.warn('[brand-portal-lightspeed-callback] waitUntil unavailable, starting sync unawaited', e)
    void run()
  }
}

function getPublicSiteOrigin(): string | null {
  const explicit = pickEnv(['NEST_PUBLIC_SITE_URL', 'PUBLIC_SITE_URL', 'SITE_URL', 'VITE_PUBLIC_SITE_URL'])
  if (explicit) {
    try {
      const u = new URL(explicit.startsWith('http') ? explicit : `https://${explicit}`)
      return `${u.protocol}//${u.host}`
    } catch {
      return null
    }
  }
  const vercel = process.env.VERCEL_URL
  if (vercel && vercel.trim()) {
    return `https://${vercel.trim().replace(/^https?:\/\//, '')}`
  }
  return null
}

const PROVIDER = 'lightspeed'
const TOKEN_URL = 'https://cloud.lightspeedapp.com/auth/oauth/token'
const ACCOUNT_URL = 'https://api.lightspeedapp.com/API/V3/Account.json'

function redirectWithQuery(res: VercelResponse, origin: string, params: Record<string, string>): void {
  const q = new URLSearchParams(params).toString()
  res.status(302).setHeader('Location', `${origin}/portal/connections?${q}`).end()
}

/** Short, URL-safe snippet for the portal banner (no secrets). */
function lightspeedSaveFailureDetail(err: { message?: string; code?: string; details?: string }): string {
  const raw = [err.code, err.message, err.details].filter((s) => typeof s === 'string' && s.trim().length > 0).join(' — ')
  return raw.replace(/[\r\n]+/g, ' ').trim().slice(0, 220)
}

function extractAccountIdFromAccountPayload(data: Record<string, unknown>): string | null {
  const acc = data.Account
  if (acc == null) return null
  if (Array.isArray(acc)) {
    const first = acc[0] as Record<string, unknown> | undefined
    if (first && first.accountID != null) return String(first.accountID).trim()
    return null
  }
  if (typeof acc === 'object') {
    const o = acc as Record<string, unknown>
    if (o.accountID != null) return String(o.accountID).trim()
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  const origin = getPublicSiteOrigin()
  if (!origin) {
    res.status(500).setHeader('Content-Type', 'text/plain').send('Missing NEST_PUBLIC_SITE_URL or VERCEL_URL')
    return
  }

  if (req.method !== 'GET') {
    res.status(405).setHeader('Content-Type', 'application/json').json({ error: 'Method not allowed' })
    return
  }

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const oauthErr = typeof req.query.error === 'string' ? req.query.error : ''

  if (oauthErr) {
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: oauthErr.slice(0, 120) })
    return
  }

  if (!code || !state) {
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'missing_code_or_state' })
    return
  }

  const clientId = pickEnv(['LIGHTSPEED_OAUTH_CLIENT_ID', 'NEST_LIGHTSPEED_OAUTH_CLIENT_ID'])
  const clientSecret = pickEnv(['LIGHTSPEED_OAUTH_CLIENT_SECRET', 'NEST_LIGHTSPEED_OAUTH_CLIENT_SECRET'])
  const redirectUri = pickEnv(['LIGHTSPEED_OAUTH_REDIRECT_URI', 'NEST_LIGHTSPEED_OAUTH_REDIRECT_URI'])

  if (!clientId || !clientSecret || !redirectUri) {
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'oauth_not_configured' })
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).setHeader('Content-Type', 'text/plain').send(supabaseConfigErrorMessage())
    return
  }

  const { data: st, error: stErr } = await supabase
    .from('nest_brand_oauth_states')
    .select('brand_key, provider, expires_at')
    .eq('id', state)
    .maybeSingle()

  if (stErr || !st?.brand_key || st.provider !== PROVIDER) {
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'invalid_state' })
    return
  }

  if (new Date(st.expires_at).getTime() < Date.now()) {
    await supabase.from('nest_brand_oauth_states').delete().eq('id', state)
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'state_expired' })
    return
  }

  let tokenJson: Record<string, unknown>
  try {
    const tr = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })
    const text = await tr.text()
    try {
      tokenJson = JSON.parse(text) as Record<string, unknown>
    } catch {
      redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'token_parse' })
      return
    }
    if (!tr.ok) {
      const msg =
        typeof tokenJson.error === 'string'
          ? tokenJson.error
          : typeof tokenJson.error_description === 'string'
            ? tokenJson.error_description
            : 'token_exchange_failed'
      redirectWithQuery(res, origin, { lightspeed: 'error', reason: msg.slice(0, 120) })
      return
    }
  } catch {
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'token_network' })
    return
  }

  const accessToken = tokenJson.access_token
  const refreshToken = tokenJson.refresh_token
  const expiresIn = tokenJson.expires_in

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'invalid_token_response' })
    return
  }

  const expiresSec = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn)
  const accessExpiresAt =
    Number.isFinite(expiresSec) && expiresSec > 0
      ? new Date(Date.now() + expiresSec * 1000).toISOString()
      : null

  let accountId: string | null = null
  try {
    const ar = await fetch(ACCOUNT_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    const atext = await ar.text()
    const adata = JSON.parse(atext) as Record<string, unknown>
    if (ar.ok) {
      accountId = extractAccountIdFromAccountPayload(adata)
    }
  } catch {
    /* handled below */
  }

  if (!accountId) {
    redirectWithQuery(res, origin, { lightspeed: 'error', reason: 'account_id_unresolved' })
    return
  }

  const { error: upErr } = await supabase.from('nest_brand_portal_connections').upsert(
    {
      brand_key: st.brand_key,
      provider: PROVIDER,
      access_token: accessToken,
      refresh_token: refreshToken,
      api_endpoint: accountId,
      access_expires_at: accessExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'brand_key,provider' },
  )

  await supabase.from('nest_brand_oauth_states').delete().eq('id', state)

  if (upErr) {
    console.error('[brand-portal-lightspeed-callback] nest_brand_portal_connections upsert', upErr)
    const detail = lightspeedSaveFailureDetail(upErr)
    redirectWithQuery(res, origin, {
      lightspeed: 'error',
      reason: 'save_failed',
      ...(detail ? { detail } : {}),
    })
    return
  }

  scheduleLightspeedInitialSyncs(st.brand_key)

  redirectWithQuery(res, origin, { lightspeed: 'connected', conn_sub: 'lightspeed' })
}
