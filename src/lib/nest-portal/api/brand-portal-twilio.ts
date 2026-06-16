import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pickServerEnv } from '../lib/server-env'
import {
  ensureBrandTwilioNumber,
  normaliseBrandTwilioPhoneState,
  searchAvailableTwilioNumbers,
  type BrandTwilioPhoneState,
} from '../lib/brand-portal-twilio-service'

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL'])
  const key = pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function supabaseConfigErrorMessage(): string {
  const hasUrl = Boolean(
    pickServerEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL']),
  )
  const hasKey = Boolean(pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY']))
  if (!hasUrl && !hasKey) {
    return 'Server missing Supabase URL and server secret key.'
  }
  if (!hasUrl) return 'Server missing Supabase URL.'
  return 'Server missing SUPABASE_SECRET_KEY.'
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

function twilioAccountConfig():
  | { accountSid: string; authToken?: string; apiKey?: string; apiSecret?: string; addressSid?: string; bundleSid?: string }
  | { error: string } {
  const accountSid = pickServerEnv(['TWILIO_ACCOUNT_SID', 'NEST_TWILIO_ACCOUNT_SID'])
  if (!accountSid) {
    return { error: 'Twilio is not configured (missing TWILIO_ACCOUNT_SID).' }
  }
  const authToken = pickServerEnv(['TWILIO_AUTH_TOKEN', 'NEST_TWILIO_AUTH_TOKEN'])
  const apiKey = pickServerEnv(['TWILIO_API_KEY', 'NEST_TWILIO_API_KEY'])
  const apiSecret = pickServerEnv(['TWILIO_API_SECRET', 'NEST_TWILIO_API_SECRET'])
  if (!authToken && !(apiKey && apiSecret)) {
    return {
      error:
        'Twilio credentials incomplete. Set TWILIO_AUTH_TOKEN, or TWILIO_API_KEY and TWILIO_API_SECRET.',
    }
  }
  const addressSid = pickServerEnv(['TWILIO_ADDRESS_SID', 'NEST_TWILIO_ADDRESS_SID'])
  const bundleSid = pickServerEnv(['TWILIO_BUNDLE_SID', 'NEST_TWILIO_BUNDLE_SID'])
  return {
    accountSid,
    authToken: authToken || undefined,
    apiKey: apiKey || undefined,
    apiSecret: apiSecret || undefined,
    addressSid: addressSid || undefined,
    bundleSid: bundleSid || undefined,
  }
}

async function persistTwilioForBrand(
  supabase: SupabaseClient,
  brandKey: string,
  patch: Partial<BrandTwilioPhoneState>,
): Promise<BrandTwilioPhoneState> {
  const { data: row, error } = await supabase
    .from('nest_brand_chat_config')
    .select(
      'twilio_phone_number_e164, twilio_phone_number_sid, twilio_phone_status, twilio_phone_purchased_at, twilio_phone_error',
    )
    .eq('brand_key', brandKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!row) throw new Error('Brand configuration was not found. Complete setup before choosing a number.')

  const merged = normaliseBrandTwilioPhoneState({
    ...(row as Record<string, unknown>),
    ...patch,
  })

  const { error: upErr } = await supabase
    .from('nest_brand_chat_config')
    .update({
      twilio_phone_number_e164: merged.twilio_phone_number_e164,
      twilio_phone_number_sid: merged.twilio_phone_number_sid,
      twilio_phone_status: merged.twilio_phone_status,
      twilio_phone_purchased_at: merged.twilio_phone_purchased_at,
      twilio_phone_error: merged.twilio_phone_error,
    })
    .eq('brand_key', brandKey)

  if (upErr) throw new Error(upErr.message)
  return merged
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await runBrandPortalTwilio(req, res)
  } catch (err) {
    console.error('[brand-portal-twilio]', err)
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error',
      })
    }
  }
}

async function runBrandPortalTwilio(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  const twilio = twilioAccountConfig()
  if ('error' in twilio) {
    res.status(503).json({ error: twilio.error })
    return
  }

  if (req.method === 'GET') {
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : ''
    if (action !== 'search') {
      res.status(400).json({ error: 'Missing action=search' })
      return
    }
    try {
      const numbers = await searchAvailableTwilioNumbers({
        accountSid: twilio.accountSid,
        authToken: twilio.authToken,
        apiKey: twilio.apiKey,
        apiSecret: twilio.apiSecret,
        addressSid: twilio.addressSid,
        bundleSid: twilio.bundleSid,
        limit: 24,
      })
      res.status(200).json({ numbers })
    } catch (e: unknown) {
      res.status(500).json({
        error: e instanceof Error ? e.message : 'Could not search Twilio numbers',
      })
    }
    return
  }

  if (req.method === 'POST') {
    let body: { phoneNumber?: string } = {}
    try {
      if (typeof req.body === 'string' && req.body.trim()) {
        body = JSON.parse(req.body) as { phoneNumber?: string }
      } else if (req.body && typeof req.body === 'object') {
        body = req.body as { phoneNumber?: string }
      }
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }

    // phoneNumber is optional — when absent, ensureBrandTwilioNumber auto-picks
    // the first available AU number. The /trade onboarding flow relies on this.
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''

    const { data: cfg, error: cfgErr } = await supabase
      .from('nest_brand_chat_config')
      .select(
        'business_display_name, twilio_phone_number_e164, twilio_phone_number_sid, twilio_phone_status, twilio_phone_purchased_at, twilio_phone_error',
      )
      .eq('brand_key', session.brandKey)
      .maybeSingle()

    if (cfgErr) {
      res.status(500).json({ error: cfgErr.message })
      return
    }
    if (!cfg) {
      res.status(400).json({ error: 'Brand configuration was not found. Complete setup before choosing a number.' })
      return
    }

    try {
      const result = await ensureBrandTwilioNumber({
        brandKey: session.brandKey,
        businessName:
          typeof cfg.business_display_name === 'string' ? cfg.business_display_name : undefined,
        existing: {
          twilio_phone_number_e164:
            typeof cfg.twilio_phone_number_e164 === 'string' ? cfg.twilio_phone_number_e164 : '',
          twilio_phone_number_sid:
            typeof cfg.twilio_phone_number_sid === 'string' ? cfg.twilio_phone_number_sid : '',
          twilio_phone_status:
            cfg.twilio_phone_status === 'active' || cfg.twilio_phone_status === 'error'
              ? cfg.twilio_phone_status
              : '',
          twilio_phone_purchased_at:
            typeof cfg.twilio_phone_purchased_at === 'string' ? cfg.twilio_phone_purchased_at : null,
          twilio_phone_error:
            typeof cfg.twilio_phone_error === 'string' ? cfg.twilio_phone_error : '',
        },
        accountSid: twilio.accountSid,
        authToken: twilio.authToken,
        apiKey: twilio.apiKey,
        apiSecret: twilio.apiSecret,
        addressSid: twilio.addressSid,
        bundleSid: twilio.bundleSid,
        phoneNumber,
        persist: (patch) => persistTwilioForBrand(supabase, session.brandKey, patch),
      })
      res.status(200).json({ kind: result.kind, twilio: result.state })
    } catch (e: unknown) {
      res.status(500).json({
        error: e instanceof Error ? e.message : 'Could not provision Twilio number',
      })
    }
    return
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS')
  res.status(405).json({ error: 'Method not allowed' })
}
