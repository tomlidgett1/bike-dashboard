/**
 * Send the tradie their welcome iMessage once the bot is live.
 *
 * Called from `/trade` after:
 *   1. brand-onboard-questionnaire has finished the prompt generation, and
 *   2. their Twilio number has been provisioned.
 *
 * We message the tradie's own mobile number via Linq Blue V3 (partner iMessage/SMS/RCS)
 * so they get a congrats-your-bot-is-live text that tells them:
 *   - the Twilio number their customers should call
 *   - a deep link they can tap to chat their own bot
 */

import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pickServerEnv } from '../lib/server-env'
import { getLinqFromNumber } from '@/lib/nest/linq-sender'

const LINQ_BASE_URL =
  pickServerEnv(['LINQ_API_BASE_URL']) || 'https://api.linqapp.com/api/partner/v3'

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const key = pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
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

function normaliseToE164(input: string): string | null {
  const trimmed = input.trim().replace(/[\s().-]/g, '')
  if (!trimmed) return null
  let digits = trimmed.startsWith('+') ? trimmed.slice(1).replace(/\D/g, '') : trimmed.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  if (digits.startsWith('0')) digits = '61' + digits.slice(1)
  if (!digits.startsWith('61') && digits.length === 9) digits = '61' + digits
  return `+${digits}`
}

function getLinqFrom(): string | null {
  return getLinqFromNumber()
}

async function linqCreateChat(
  from: string,
  to: string[],
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = pickServerEnv(['LINQ_API_TOKEN'])
  if (!token) return { ok: false, error: 'LINQ_API_TOKEN is not configured' }

  const res = await fetch(`${LINQ_BASE_URL}/chats`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      message: { parts: [{ type: 'text', value: text }] },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `Linq ${res.status}: ${body.slice(0, 200)}` }
  }
  return { ok: true }
}

function buildWelcomeText(params: {
  businessName: string
  ownerFirstName?: string
  twilioNumber?: string
  tryLink?: string
}): string {
  const hey = params.ownerFirstName ? `Hey ${params.ownerFirstName}` : `Hey there`
  const lines = [
    `${hey} — your Nest bot for ${params.businessName} is live. 👷‍♂️`,
    '',
  ]
  if (params.twilioNumber) {
    lines.push(
      `This is your new business number: ${params.twilioNumber}. When customers call it and you miss the call, we'll text them back and answer their questions on your behalf.`,
      '',
    )
  }
  if (params.tryLink) {
    lines.push(
      `Try it yourself by chatting with your bot here: ${params.tryLink}`,
      '',
    )
  }
  lines.push(`Reply to this message any time if you want to tweak what the bot says.`)
  return lines.join('\n')
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
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(503).json({ error: 'Server missing Supabase configuration' })
    return
  }

  const session = await resolvePortalSession(supabase, req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  let body: { ownerMobile?: string; ownerFirstName?: string } = {}
  try {
    if (typeof req.body === 'string' && req.body.trim()) {
      body = JSON.parse(req.body) as { ownerMobile?: string; ownerFirstName?: string }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body as { ownerMobile?: string; ownerFirstName?: string }
    }
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }

  const ownerMobile = typeof body.ownerMobile === 'string' ? body.ownerMobile.trim() : ''
  const to = normaliseToE164(ownerMobile)
  if (!to) {
    res.status(400).json({ error: 'Invalid owner mobile number' })
    return
  }

  const from = getLinqFrom()
  if (!from) {
    res.status(503).json({ error: 'Linq US sender is not configured (set LINQ_VOICE_FROM to a +1 number)' })
    return
  }

  const { data: cfg, error: cfgErr } = await supabase
    .from('nest_brand_chat_config')
    .select('business_display_name, twilio_phone_number_e164')
    .eq('brand_key', session.brandKey)
    .maybeSingle()

  if (cfgErr) {
    res.status(500).json({ error: cfgErr.message })
    return
  }

  const businessName =
    (cfg?.business_display_name as string | undefined) || session.brandKey
  const twilioNumber = (cfg?.twilio_phone_number_e164 as string | undefined) || undefined
  const publicOrigin =
    pickServerEnv(['PUBLIC_SITE_ORIGIN', 'VERCEL_PROJECT_PRODUCTION_URL']) || 'nest.expert'
  const tryLink = publicOrigin.startsWith('http')
    ? `${publicOrigin.replace(/\/$/, '')}/try/${session.brandKey}`
    : `https://${publicOrigin.replace(/^https?:\/\//, '').replace(/\/$/, '')}/try/${session.brandKey}`

  const text = buildWelcomeText({
    businessName,
    ownerFirstName: body.ownerFirstName?.trim() || undefined,
    twilioNumber,
    tryLink,
  })

  const result = await linqCreateChat(from, [to], text)
  if (!result.ok) {
    res.status(502).json({ error: result.error || 'Linq failed' })
    return
  }

  res.status(200).json({ ok: true, sentTo: to, tryLink })
}
