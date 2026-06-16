import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function createAdminClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function getMainSupabaseUrl(): string | null {
  return pickEnv([
    'SUPABASE_URL',
    'NEST_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
    'VITE_SUPABASE_URL',
  ]) ?? null
}

export function getMainSecretKey(): string | null {
  return pickEnv([
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
    'NEST_SUPABASE_SECRET_KEY',
  ]) ?? null
}

export function getMainServiceRoleKey(): string | null {
  return getMainSecretKey()
}

export function getMainSupabaseAdmin(): SupabaseClient | null {
  const url = getMainSupabaseUrl()
  const key = getMainSecretKey()
  if (!url || !key) return null
  return createAdminClient(url, key)
}

export function getNestSupabaseUrl(): string | null {
  return pickEnv([
    'NEST_SUPABASE_URL',
    'SUPABASE_URL',
    'VITE_NEST_SUPABASE_URL',
    'VITE_SUPABASE_URL',
  ]) ?? null
}

export function getNestSecretKey(): string | null {
  return pickEnv([
    'NEST_SUPABASE_SECRET_KEY',
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
  ]) ?? null
}

export function getNestServiceRoleKey(): string | null {
  return getNestSecretKey()
}

export function getNestSupabaseAdmin(): SupabaseClient | null {
  const url = getNestSupabaseUrl()
  const key = getNestSecretKey()
  if (!url || !key) return null
  return createAdminClient(url, key)
}

export function applyJsonSecurityHeaders(res: VercelResponse): void {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

export function internalToolsEnabled(req?: VercelRequest): boolean {
  const configured = pickEnv(['INTERNAL_TOOLS_ENABLED'])
  if (configured != null) return configured === 'true'
  if (!req) return String(process.env.VERCEL_ENV ?? '').toLowerCase() !== 'production'
  return isLocalOrPreviewRequest(req)
}

export function requireInternalToolsEnabled(req: VercelRequest, res: VercelResponse): boolean {
  if (internalToolsEnabled(req)) return true
  res.status(404).json({ error: 'Not found' })
  return false
}

export function getBearerToken(req: VercelRequest): string {
  const auth = req.headers.authorization ?? ''
  return auth.replace(/^Bearer\s+/i, '').trim()
}

function parseAdminEmailAllowlist(): Set<string> {
  const raw = [
    pickEnv(['ADMIN_EMAIL_ALLOWLIST', 'NEST_ADMIN_EMAIL_ALLOWLIST']),
    pickEnv(['ADMIN_EMAIL', 'NEST_ADMIN_EMAIL']),
  ]
    .filter(Boolean)
    .join(',')

  return new Set(
    raw
      .split(/[\n,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

function isLocalOrPreviewRequest(req: VercelRequest): boolean {
  const host = String(req.headers.host ?? '').toLowerCase()
  const vercelEnv = String(process.env.VERCEL_ENV ?? '').toLowerCase()
  return (
    vercelEnv !== 'production' ||
    host.includes('localhost') ||
    host.includes('127.0.0.1')
  )
}

export async function requireAuthenticatedUser(
  req: VercelRequest,
  res: VercelResponse,
  mainSupabase: SupabaseClient | null = getMainSupabaseAdmin(),
): Promise<{ user: User; token: string; supabase: SupabaseClient } | null> {
  if (!mainSupabase) {
    res.status(503).json({ error: 'Server missing Supabase configuration' })
    return null
  }

  const token = getBearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Sign in required' })
    return null
  }

  const {
    data: { user },
    error,
  } = await mainSupabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired session' })
    return null
  }

  return { user, token, supabase: mainSupabase }
}

export async function requireAdminUser(
  req: VercelRequest,
  res: VercelResponse,
  mainSupabase: SupabaseClient | null = getMainSupabaseAdmin(),
): Promise<{ user: User; token: string; supabase: SupabaseClient } | null> {
  const authed = await requireAuthenticatedUser(req, res, mainSupabase)
  if (!authed) return null

  const allowlist = parseAdminEmailAllowlist()
  if (allowlist.size === 0) {
    if (isLocalOrPreviewRequest(req)) {
      return authed
    }

    res.status(503).json({ error: 'ADMIN_EMAIL_ALLOWLIST is not configured' })
    return null
  }

  const email = authed.user.email?.trim().toLowerCase() ?? ''
  if (!email || !allowlist.has(email)) {
    res.status(403).json({ error: 'Admin access required' })
    return null
  }

  return authed
}
