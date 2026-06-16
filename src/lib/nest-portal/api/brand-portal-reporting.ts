import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pickServerEnv } from '../lib/server-env'

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const key = pickServerEnv([
    'SUPABASE_SECRET_KEY',
    'NEW_SUPABASE_SECRET_KEY',
  ])
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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

function normaliseToE164(input: string): string | null {
  const s0 = input.trim().replace(/[\s().-]/g, '')
  if (!s0 || s0.includes('@')) return null
  let digits = s0.startsWith('+') ? s0.slice(1).replace(/\D/g, '') : s0.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  if (digits.startsWith('0')) digits = '61' + digits.slice(1)
  if (digits.startsWith('61') && digits.length >= 11 && digits.length <= 15) return `+${digits}`
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null
}

function normaliseRecipientList(raw: unknown, max = 12): string[] {
  const lines: string[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) lines.push(String(item ?? ''))
  } else if (typeof raw === 'string') {
    for (const part of raw.split(/[\n,;]+/)) lines.push(part)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const next = normaliseToE164(line)
    if (!next || seen.has(next)) continue
    seen.add(next)
    out.push(next)
    if (out.length >= max) break
  }
  return out
}

async function parseBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (!req.body) return {}
  if (typeof req.body === 'string') return JSON.parse(req.body) as Record<string, unknown>
  return req.body as Record<string, unknown>
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      res.status(500).json({ error: 'Server missing Supabase credentials.' })
      return
    }

    const session = await resolveSession(supabase, req)
    if (!session) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('nest_brand_reporting_automation_runs')
        .select('*')
        .eq('brand_key', session.brandKey)
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) {
        res.status(500).json({ error: error.message })
        return
      }
      res.status(200).json({ runs: data ?? [] })
      return
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      if (body.action !== 'manual_send') {
        res.status(400).json({ error: 'Unknown action' })
        return
      }
      const presetKey = typeof body.presetKey === 'string' ? body.presetKey.trim() : ''
      const recipientMobileE164s = normaliseRecipientList(body.recipientMobileE164s)
      if (!presetKey) {
        res.status(400).json({ error: 'presetKey is required' })
        return
      }

      const { data: cfgRow } = await supabase
        .from('nest_brand_chat_config')
        .select('reporting_automations')
        .eq('brand_key', session.brandKey)
        .maybeSingle()
      const automations = cfgRow?.reporting_automations
      const scheduleRow =
        automations && typeof automations === 'object'
          ? (automations as Record<string, unknown>)[presetKey]
          : undefined
      const schedule =
        scheduleRow && typeof scheduleRow === 'object' ? (scheduleRow as Record<string, unknown>) : {}
      const deliveryMode = schedule.delivery_mode === 'group' ? 'group' : 'dm'
      const linkedGroupId =
        typeof schedule.linq_group_chat_id === 'string' ? schedule.linq_group_chat_id.trim() : ''

      if (recipientMobileE164s.length === 0) {
        if (!(deliveryMode === 'group' && linkedGroupId)) {
          res.status(400).json({ error: 'Select at least one mobile number' })
          return
        }
      } else if (deliveryMode === 'group' && !linkedGroupId && recipientMobileE164s.length < 2) {
        res.status(400).json({ error: 'Group delivery needs at least two phone numbers before the first send.' })
        return
      }

      const supabaseUrl = pickServerEnv([
        'SUPABASE_URL',
        'VITE_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_URL',
        'PUBLIC_SUPABASE_URL',
      ])
      const edgeAuth = pickServerEnv([
        'INTERNAL_EDGE_SHARED_SECRET',
        'NEST_INTERNAL_EDGE_SHARED_SECRET',
        'SUPABASE_SECRET_KEY',
        'NEW_SUPABASE_SECRET_KEY',
      ])
      if (!supabaseUrl || !edgeAuth) {
        res.status(500).json({ error: 'Server missing edge function credentials.' })
        return
      }

      const edgeRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/brand-reporting-automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': edgeAuth,
        },
        body: JSON.stringify({
          mode: 'manual',
          brandKey: session.brandKey,
          presetKey,
          recipientMobileE164s,
          triggeredBy: 'brand_portal',
        }),
      })
      const payload = await edgeRes.json().catch(() => ({})) as Record<string, unknown>
      if (!edgeRes.ok) {
        res.status(edgeRes.status).json({
          error: typeof payload.error === 'string' ? payload.error : 'Manual send failed',
        })
        return
      }
      res.status(200).json(payload)
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[brand-portal-reporting]', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}
