import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pickServerEnv } from '../lib/server-env'
import {
  buildElevenLabsPatchBody,
  detailElevenLabsAgent,
  isElevenLabsBackgroundMusicPreset,
  resolveElevenLabsBackgroundMusicVolume,
  summariseElevenLabsAgent,
  summariseElevenLabsVoice,
  type PortalElevenLabsAgentPatch,
} from '../lib/elevenlabs-portal'
import { syncPhoneAgentKnowledge } from '../lib/brand-knowledge-service'

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'

function getSupabaseAdmin(): SupabaseClient | null {
  const url = pickServerEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const key = pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getElevenLabsApiKey(): string | null {
  return (
    pickServerEnv(['ELEVENLABS_API_KEY', 'NEST_ELEVENLABS_API_KEY']) ?? null
  )
}

function elevenLabsHeaders(apiKey: string): Record<string, string> {
  return {
    'xi-api-key': apiKey,
    Accept: 'application/json',
  }
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

function formatElevenLabsErrorDetail(
  data: Record<string, unknown>,
  text: string,
): string {
  const detail = data.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim().slice(0, 500)
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const message = (detail as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message.trim()
    return JSON.stringify(detail).slice(0, 500)
  }
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim()
  return text.slice(0, 300)
}

async function elevenLabsFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; text: string }> {
  const response = await fetch(`${ELEVENLABS_API}${path}`, {
    ...init,
    headers: {
      ...elevenLabsHeaders(apiKey),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  const text = await response.text()
  let data: Record<string, unknown> = {}
  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = { raw: text }
    }
  }
  return { ok: response.ok, status: response.status, data, text }
}

function parseAgentPatch(body: Record<string, unknown>): PortalElevenLabsAgentPatch {
  const patch: PortalElevenLabsAgentPatch = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.systemPrompt === 'string') patch.systemPrompt = body.systemPrompt
  if (typeof body.firstMessage === 'string') patch.firstMessage = body.firstMessage
  if (typeof body.language === 'string') patch.language = body.language.trim()
  if (typeof body.llm === 'string') patch.llm = body.llm.trim()
  if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
    patch.temperature = body.temperature
  }
  if (typeof body.voiceId === 'string') patch.voiceId = body.voiceId.trim()
  if (typeof body.ttsModelId === 'string') patch.ttsModelId = body.ttsModelId.trim()
  if (typeof body.stability === 'number' && Number.isFinite(body.stability)) {
    patch.stability = body.stability
  }
  if (typeof body.speed === 'number' && Number.isFinite(body.speed)) patch.speed = body.speed
  if (typeof body.similarityBoost === 'number' && Number.isFinite(body.similarityBoost)) {
    patch.similarityBoost = body.similarityBoost
  }
  if (
    typeof body.optimizeStreamingLatency === 'number' &&
    Number.isFinite(body.optimizeStreamingLatency)
  ) {
    patch.optimizeStreamingLatency = body.optimizeStreamingLatency
  }
  if (typeof body.agentOutputAudioFormat === 'string') {
    patch.agentOutputAudioFormat = body.agentOutputAudioFormat.trim()
  }
  if (Array.isArray(body.tools)) {
    const tools = body.tools
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
      )
      .map((entry) => ({ ...entry }))
    patch.tools = tools
  }
  if (body.backgroundMusic && typeof body.backgroundMusic === 'object' && !Array.isArray(body.backgroundMusic)) {
    const bm = body.backgroundMusic as Record<string, unknown>
    const presetRaw = typeof bm.preset === 'string' ? bm.preset.trim() : ''
    patch.backgroundMusic = {
      enabled: bm.enabled === true,
      preset: isElevenLabsBackgroundMusicPreset(presetRaw) ? presetRaw : 'office1',
      volume: resolveElevenLabsBackgroundMusicVolume(
        typeof bm.volume === 'number' ? bm.volume : null,
      ),
      crossfadeLoop: bm.crossfadeLoop === true,
    }
  }
  return patch
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(500).json({ error: 'Server database is not configured' })
  }

  const session = await resolvePortalSession(supabase, req)
  if (!session) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const apiKey = getElevenLabsApiKey()
  if (!apiKey) {
    return res.status(503).json({
      error: 'ElevenLabs is not configured on the server',
      detail: 'Set ELEVENLABS_API_KEY in the website/Vercel environment.',
    })
  }

  try {
    if (req.method === 'GET') {
      const agentId = typeof req.query.agentId === 'string' ? req.query.agentId.trim() : ''
      const voicesOnly = req.query.voices === '1' || req.query.voices === 'true'
      const signedUrlOnly =
        req.query.signedUrl === '1' || req.query.signedUrl === 'true'

      if (signedUrlOnly) {
        if (!agentId) {
          return res.status(400).json({ error: 'agentId query parameter is required' })
        }
        const qs = new URLSearchParams({ agent_id: agentId })
        const upstream = await elevenLabsFetch(
          apiKey,
          `/convai/conversation/get-signed-url?${qs.toString()}`,
        )
        if (!upstream.ok) {
          return res.status(upstream.status).json({
            error: 'Could not create ElevenLabs test session',
            detail: formatElevenLabsErrorDetail(upstream.data, upstream.text),
          })
        }
        const signedUrl =
          typeof upstream.data.signed_url === 'string' ? upstream.data.signed_url : ''
        if (!signedUrl) {
          return res.status(502).json({ error: 'ElevenLabs returned no signed URL' })
        }
        return res.status(200).json({ signedUrl, agentId })
      }

      if (voicesOnly) {
        const upstream = await elevenLabsFetch(apiKey, '/voices')
        if (!upstream.ok) {
          return res.status(upstream.status).json({
            error: 'Could not load ElevenLabs voices',
            detail: formatElevenLabsErrorDetail(upstream.data, upstream.text),
          })
        }
        const rows = Array.isArray(upstream.data.voices) ? upstream.data.voices : []
        return res.status(200).json({
          voices: rows
            .map((row) => summariseElevenLabsVoice(row as Record<string, unknown>))
            .filter((v) => v.voiceId),
        })
      }

      if (agentId) {
        const upstream = await elevenLabsFetch(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`)
        if (!upstream.ok) {
          return res.status(upstream.status).json({
            error: 'Could not load ElevenLabs agent',
            detail: formatElevenLabsErrorDetail(upstream.data, upstream.text),
          })
        }
        return res.status(200).json({ agent: detailElevenLabsAgent(upstream.data) })
      }

      const search =
        typeof req.query.search === 'string' ? req.query.search.trim() : ''
      const qs = new URLSearchParams({ page_size: '100', sort_by: 'name', sort_direction: 'asc' })
      if (search) qs.set('search', search)
      const upstream = await elevenLabsFetch(apiKey, `/convai/agents?${qs.toString()}`)
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: 'Could not list ElevenLabs agents',
          detail: formatElevenLabsErrorDetail(upstream.data, upstream.text),
        })
      }
      const rows = Array.isArray(upstream.data.agents) ? upstream.data.agents : []
      const agents = rows
        .map((row) => summariseElevenLabsAgent(row as Record<string, unknown>))
        .filter((a) => a.agentId)
        .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'))
      return res.status(200).json({ agents, brandKey: session.brandKey })
    }

    if (req.method === 'POST') {
      const agentId = typeof req.query.agentId === 'string' ? req.query.agentId.trim() : ''
      if (!agentId) {
        return res.status(400).json({ error: 'agentId query parameter is required' })
      }
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
      if (body.action !== 'link') {
        return res.status(400).json({ error: 'Unsupported action' })
      }

      await supabase
        .from('nest_brand_chat_config')
        .upsert(
          {
            brand_key: session.brandKey,
            elevenlabs_voice_agent_id: agentId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'brand_key' },
        )

      await syncPhoneAgentKnowledge(supabase, session.brandKey)
      return res.status(200).json({ ok: true, agentId, brandKey: session.brandKey })
    }

    if (req.method === 'PATCH') {
      const agentId = typeof req.query.agentId === 'string' ? req.query.agentId.trim() : ''
      if (!agentId) {
        return res.status(400).json({ error: 'agentId query parameter is required' })
      }
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
      const patch = parseAgentPatch(body)
      const patchBody = buildElevenLabsPatchBody(patch)
      if (Object.keys(patchBody).length === 0) {
        return res.status(400).json({ error: 'No supported fields to update' })
      }

      const upstream = await elevenLabsFetch(
        apiKey,
        `/convai/agents/${encodeURIComponent(agentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        },
      )
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: 'Could not update ElevenLabs agent',
          detail: formatElevenLabsErrorDetail(upstream.data, upstream.text),
        })
      }

      await supabase
        .from('nest_brand_chat_config')
        .upsert(
          {
            brand_key: session.brandKey,
            elevenlabs_voice_agent_id: agentId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'brand_key' },
        )

      if (patch.systemPrompt !== undefined) {
        await syncPhoneAgentKnowledge(supabase, session.brandKey)
      }

      return res.status(200).json({ agent: detailElevenLabsAgent(upstream.data) })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[brand-portal-elevenlabs]', err)
    return res.status(500).json({
      error: 'ElevenLabs request failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
