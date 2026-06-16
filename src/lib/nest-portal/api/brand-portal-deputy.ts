import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Supabase helpers inlined — Vercel serverless bundles can omit sibling imports for some API routes.

function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
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

async function resolvePortalSession(
  supabase: SupabaseClient,
  req: VercelRequest,
): Promise<{ brandKey: string } | null> {
  const auth = (req.headers.authorization || '') as string
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await supabase
    .from('nest_brand_portal_sessions')
    .select('brand_key, expires_at')
    .eq('id', token)
    .maybeSingle()

  if (error || !data?.brand_key || !data.expires_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  return { brandKey: data.brand_key }
}

const PROVIDER = 'deputy'
const STATE_TTL_MIN = 15
const DEPUTY_OAUTH_LOGIN = 'https://once.deputy.com/my/oauth/login'
const DEPUTY_TOKEN_URL = 'https://once.deputy.com/my/oauth/access_token'

function deputyOAuthConfig():
  | { clientId: string; clientSecret: string; redirectUri: string }
  | { error: string } {
  const clientId = pickEnv(['DEPUTY_OAUTH_CLIENT_ID', 'NEST_DEPUTY_OAUTH_CLIENT_ID'])
  const clientSecret = pickEnv(['DEPUTY_OAUTH_CLIENT_SECRET', 'NEST_DEPUTY_OAUTH_CLIENT_SECRET'])
  const redirectUri = pickEnv(['DEPUTY_OAUTH_REDIRECT_URI', 'NEST_DEPUTY_OAUTH_REDIRECT_URI'])
  if (!clientId || !clientSecret || !redirectUri) {
    return {
      error:
        'Deputy OAuth is not configured. Set DEPUTY_OAUTH_CLIENT_ID, DEPUTY_OAUTH_CLIENT_SECRET, and DEPUTY_OAUTH_REDIRECT_URI (must match your OAuth client in Deputy Once, e.g. https://your-domain.com/api/brand-portal-deputy-callback).',
    }
  }
  return { clientId, clientSecret, redirectUri }
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

function normaliseDeputyApiHost(endpoint: unknown): string | null {
  if (typeof endpoint !== 'string') return null
  let h = endpoint.trim()
  if (!h) return null
  h = h.replace(/^https?:\/\//i, '')
  h = h.replace(/\/$/, '')
  if (!/\.deputy\.com$/i.test(h)) return null
  return h
}

function redirectDeputyOAuth(res: VercelResponse, origin: string, params: Record<string, string>): void {
  const q = new URLSearchParams(params).toString()
  res.status(302).setHeader('Location', `${origin}/portal/connections?${q}`).end()
}

/** OAuth redirect from Deputy hits this without a Bearer token (rewritten from /api/brand-portal-deputy-callback). */
function isDeputyOAuthCallback(req: VercelRequest): boolean {
  if (req.method !== 'GET') return false
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (auth) return false
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!state) return false
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const oauthErr = typeof req.query.error === 'string' ? req.query.error : ''
  return Boolean(code || oauthErr)
}

async function runBrandPortalDeputyCallback(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  const origin = getPublicSiteOrigin()
  if (!origin) {
    res.status(500).setHeader('Content-Type', 'text/plain').send('Missing NEST_PUBLIC_SITE_URL or VERCEL_URL')
    return
  }

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const oauthErr = typeof req.query.error === 'string' ? req.query.error : ''

  if (oauthErr) {
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: oauthErr.slice(0, 120) })
    return
  }

  if (!code || !state) {
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'missing_code_or_state' })
    return
  }

  const clientId = pickEnv(['DEPUTY_OAUTH_CLIENT_ID', 'NEST_DEPUTY_OAUTH_CLIENT_ID'])
  const clientSecret = pickEnv(['DEPUTY_OAUTH_CLIENT_SECRET', 'NEST_DEPUTY_OAUTH_CLIENT_SECRET'])
  const redirectUri = pickEnv(['DEPUTY_OAUTH_REDIRECT_URI', 'NEST_DEPUTY_OAUTH_REDIRECT_URI'])

  if (!clientId || !clientSecret || !redirectUri) {
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'oauth_not_configured' })
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
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'invalid_state' })
    return
  }

  if (new Date(st.expires_at).getTime() < Date.now()) {
    await supabase.from('nest_brand_oauth_states').delete().eq('id', state)
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'state_expired' })
    return
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code,
    scope: 'longlife_refresh_token',
  })

  let tokenJson: Record<string, unknown>
  try {
    const tr = await fetch(DEPUTY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const text = await tr.text()
    try {
      tokenJson = JSON.parse(text) as Record<string, unknown>
    } catch {
      redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'token_parse' })
      return
    }
    if (!tr.ok) {
      const msg =
        typeof tokenJson.error === 'string'
          ? tokenJson.error
          : typeof tokenJson.message === 'string'
            ? tokenJson.message
            : 'token_exchange_failed'
      redirectDeputyOAuth(res, origin, { deputy: 'error', reason: msg.slice(0, 120) })
      return
    }
  } catch {
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'token_network' })
    return
  }

  const accessToken = tokenJson.access_token
  const refreshToken = tokenJson.refresh_token
  const expiresIn = tokenJson.expires_in
  const apiHost = normaliseDeputyApiHost(tokenJson.endpoint)

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || !apiHost) {
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'invalid_token_response' })
    return
  }

  const expiresSec = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn)
  const accessExpiresAt =
    Number.isFinite(expiresSec) && expiresSec > 0
      ? new Date(Date.now() + expiresSec * 1000).toISOString()
      : null

  const { error: upErr } = await supabase.from('nest_brand_portal_connections').upsert(
    {
      brand_key: st.brand_key,
      provider: PROVIDER,
      access_token: accessToken,
      refresh_token: refreshToken,
      api_endpoint: apiHost,
      access_expires_at: accessExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'brand_key,provider' },
  )

  await supabase.from('nest_brand_oauth_states').delete().eq('id', state)

  if (upErr) {
    redirectDeputyOAuth(res, origin, { deputy: 'error', reason: 'save_failed' })
    return
  }

  redirectDeputyOAuth(res, origin, { deputy: 'connected' })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (isDeputyOAuthCallback(req)) {
      await runBrandPortalDeputyCallback(req, res)
      return
    }
    await runBrandPortalDeputy(req, res)
  } catch (err) {
    console.error('[brand-portal-deputy]', err)
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error',
      })
    }
  }
}

async function runBrandPortalDeputy(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).json({ error: supabaseConfigErrorMessage() })
    return
  }

  const session = await resolvePortalSession(supabase, req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('nest_brand_portal_connections')
      .select('api_endpoint, access_expires_at, updated_at')
      .eq('brand_key', session.brandKey)
      .eq('provider', PROVIDER)
      .maybeSingle()

    if (error) {
      console.error('[brand-portal-deputy] connections select', error)
      res.status(500).json({
        error: 'Could not load connection',
        detail: error.message,
        code: error.code,
      })
      return
    }

    if (!data) {
      res.status(200).json({ connected: false })
      return
    }

    res.status(200).json({
      connected: true,
      apiEndpoint: data.api_endpoint,
      accessExpiresAt: data.access_expires_at,
      updatedAt: data.updated_at,
    })
    return
  }

  if (req.method === 'POST') {
    const cfg = deputyOAuthConfig()
    if ('error' in cfg) {
      res.status(503).json({ error: cfg.error })
      return
    }

    const expiresAt = new Date(Date.now() + STATE_TTL_MIN * 60 * 1000).toISOString()
    const { data: stateRow, error: insErr } = await supabase
      .from('nest_brand_oauth_states')
      .insert({
        brand_key: session.brandKey,
        provider: PROVIDER,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (insErr || !stateRow?.id) {
      console.error('[brand-portal-deputy] nest_brand_oauth_states insert', insErr)
      res.status(500).json({
        error: 'Could not start OAuth',
        detail: insErr?.message ?? (stateRow?.id ? undefined : 'No state row returned'),
        code: insErr?.code ?? undefined,
      })
      return
    }

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: 'longlife_refresh_token',
      state: stateRow.id as string,
    })

    const authUrl = `${DEPUTY_OAUTH_LOGIN}?${params.toString()}`
    res.status(200).json({ authUrl })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
