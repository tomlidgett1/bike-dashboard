import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL'])
  const key = pickEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getMainSupabaseUrl(): string | null {
  return pickEnv(['SUPABASE_URL', 'NEST_SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL']) ?? null
}

function getInternalEdgeSharedSecret(): string | null {
  return pickEnv(['INTERNAL_EDGE_SHARED_SECRET', 'NEST_INTERNAL_EDGE_SHARED_SECRET']) ?? null
}

async function resolveSession(
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      res.status(500).json({ error: 'Server missing Supabase configuration' })
      return
    }

    const session = await resolveSession(supabase, req)
    if (!session) {
      res.status(401).json({ error: 'Unauthorised' })
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
    const message = String(body.message ?? '').trim()
    const chatId = String(body.chatId ?? '').trim()

    if (!message) {
      res.status(400).json({ error: 'message is required' })
      return
    }

    const supabaseUrl = getMainSupabaseUrl()
    const secret = getInternalEdgeSharedSecret()
    if (!supabaseUrl || !secret) {
      res.status(500).json({ error: 'Server missing edge function configuration' })
      return
    }

    const edgeRes = await fetch(`${supabaseUrl}/functions/v1/brand-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({
        chatId: chatId || `portal-test#${session.brandKey}#${Date.now()}`,
        senderHandle: `portal-test@${session.brandKey}`,
        brandKey: session.brandKey,
        message,
      }),
    })

    const raw = await edgeRes.text()
    if (!edgeRes.ok) {
      console.error('[brand-portal-chat] edge error:', edgeRes.status, raw)
      res.status(502).json({ error: 'Chatbot did not respond. Try again.' })
      return
    }

    const data = JSON.parse(raw)
    res.status(200).json({ text: data.text ?? '', brand: data.brand ?? '' })
  } catch (err) {
    console.error('[brand-portal-chat]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}
