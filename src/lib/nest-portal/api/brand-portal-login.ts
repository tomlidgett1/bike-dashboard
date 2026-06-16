import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SESSION_DAYS = 7

function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim()
    }
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

/**
 * When no row exists in nest_brand_portal_secrets yet, allow password via Vercel env:
 * PORTAL_PASSWORD_ASH=ash  (brand key uppercased)
 */
function portalPasswordFromEnv(brandKey: string): string | undefined {
  const suffix = brandKey.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return pickEnv([`PORTAL_PASSWORD_${suffix}`, `NEST_PORTAL_PASSWORD_${suffix}`])
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).json({ error: supabaseConfigErrorMessage() })
    return
  }

  let body: { brandKey?: string; password?: string }
  try {
    body = typeof req.body === 'string' ? (JSON.parse(req.body) as typeof body) : req.body || {}
  } catch {
    res.status(400).json({ error: 'Invalid JSON' })
    return
  }

  const brandKey = String(body.brandKey ?? '')
    .trim()
    .toLowerCase()
  const password = String(body.password ?? '').trim()

  if (!brandKey || !password) {
    res.status(400).json({ error: 'Brand and password required' })
    return
  }

  const { data: secret, error: secErr } = await supabase
    .from('nest_brand_portal_secrets')
    .select('portal_password')
    .eq('brand_key', brandKey)
    .maybeSingle()

  if (secErr) {
    res.status(500).json({ error: 'Could not verify credentials' })
    return
  }

  const dbPassword = secret?.portal_password?.trim() ?? ''
  const expectedPassword =
    dbPassword.length > 0 ? dbPassword : portalPasswordFromEnv(brandKey)?.trim() ?? ''

  if (!expectedPassword || expectedPassword !== password) {
    res.status(401).json({ error: 'Invalid brand or password' })
    return
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS)

  const { data: session, error: sessErr } = await supabase
    .from('nest_brand_portal_sessions')
    .insert({ brand_key: brandKey, expires_at: expiresAt.toISOString() })
    .select('id')
    .single()

  if (sessErr || !session?.id) {
    res.status(500).json({ error: 'Could not start session' })
    return
  }

  res.status(200).json({
    token: session.id,
    brandKey,
  })
}
