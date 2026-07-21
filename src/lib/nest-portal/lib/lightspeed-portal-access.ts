import type { SupabaseClient } from '@supabase/supabase-js'
import { pickServerEnv } from './server-env'

const LIGHTSPEED_TOKEN_URL = 'https://cloud.lightspeedapp.com/auth/oauth/token'
const LIGHTSPEED_API_ORIGIN = 'https://api.lightspeedapp.com'

type LightspeedConnectionRow = {
  brand_key: string
  access_token: string
  refresh_token: string
  api_endpoint: string
  access_expires_at: string | null
}

function lightspeedOAuthConfig(): { clientId: string; clientSecret: string } {
  const clientId = pickServerEnv(['LIGHTSPEED_OAUTH_CLIENT_ID', 'NEST_LIGHTSPEED_OAUTH_CLIENT_ID'])
  const clientSecret = pickServerEnv(['LIGHTSPEED_OAUTH_CLIENT_SECRET', 'NEST_LIGHTSPEED_OAUTH_CLIENT_SECRET'])
  if (!clientId || !clientSecret) {
    throw new Error('Lightspeed OAuth is not configured')
  }
  return { clientId, clientSecret }
}

function accessTokenNeedsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) return true
  const time = new Date(expiresAt).getTime()
  return !Number.isFinite(time) || time <= Date.now() + 120_000
}

async function loadLightspeedConnection(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<LightspeedConnectionRow | null> {
  const { data, error } = await supabase
    .from('nest_brand_portal_connections')
    .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
    .eq('brand_key', brandKey)
    .eq('provider', 'lightspeed')
    .maybeSingle()
  if (error) throw new Error(`Lightspeed connection load failed: ${error.message}`)
  return data as LightspeedConnectionRow | null
}

export async function getLightspeedAccess(
  supabase: SupabaseClient,
  brandKey: string,
): Promise<{ accessToken: string; accountId: string } | null> {
  const row = await loadLightspeedConnection(supabase, brandKey)
  if (!row?.access_token || !row.api_endpoint) return null
  if (!accessTokenNeedsRefresh(row.access_expires_at)) {
    return { accessToken: row.access_token, accountId: row.api_endpoint.trim() }
  }

  const { clientId, clientSecret } = lightspeedOAuthConfig()
  const res = await fetch(LIGHTSPEED_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`Lightspeed token refresh failed: ${typeof data.error === 'string' ? data.error : res.status}`)
  }
  const accessToken = typeof data.access_token === 'string' ? data.access_token : ''
  const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : ''
  const expiresIn = Number(data.expires_in)
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) {
    throw new Error('Lightspeed token refresh returned an invalid response')
  }
  await supabase
    .from('nest_brand_portal_connections')
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      access_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('brand_key', brandKey)
    .eq('provider', 'lightspeed')
  return { accessToken, accountId: row.api_endpoint.trim() }
}

export async function lightspeedGetJson(
  accessToken: string,
  accountId: string,
  path: string,
): Promise<Record<string, unknown>> {
  return lightspeedRequestJson(accessToken, accountId, path, { method: 'GET' })
}

export async function lightspeedPostJson(
  accessToken: string,
  accountId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return lightspeedRequestJson(accessToken, accountId, path, { method: 'POST', body })
}

async function lightspeedRequestJson(
  accessToken: string,
  accountId: string,
  path: string,
  opts: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const res = await fetch(`${LIGHTSPEED_API_ORIGIN}/API/V3/Account/${encodeURIComponent(accountId)}/${path}`, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`Lightspeed API returned non-JSON (${res.status})`)
  }
  if (!res.ok) {
    throw new Error(
      `Lightspeed API failed (${res.status}): ${typeof data.message === 'string' ? data.message : text.slice(0, 120)}`,
    )
  }
  return data
}
