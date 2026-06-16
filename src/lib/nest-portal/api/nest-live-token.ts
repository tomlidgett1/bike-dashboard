import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleGenAI, Modality } from '@google/genai'
import { pickServerEnv } from '../lib/server-env'
import { applyJsonSecurityHeaders, requireAuthenticatedUser } from './_shared/server-auth'
import {
  getNestLiveFunctionDeclarations,
  NEST_LIVE_SYSTEM_INSTRUCTION,
  NEST_LIVE_TOOL_NAMES,
} from '../src/lib/nest-live-tool-specs'

const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview'
const LIVE_VOICE = 'Zephyr'

type LiveProfileContext = {
  name: string | null
  handle: string | null
  timezone: string | null
}

function getGeminiApiKey(): string | null {
  return pickServerEnv([
    'GEMINI_API_KEY',
    'NEST_GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ]) ?? null
}

async function loadLiveProfileContext(
  supabase: SupabaseClient,
  authUserId: string,
  fallbackEmail?: string | null,
): Promise<LiveProfileContext> {
  const { data } = await supabase
    .from('user_profiles')
    .select('name, display_name, handle, timezone')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  const name =
    typeof data?.name === 'string' && data.name.trim()
      ? data.name.trim()
      : typeof data?.display_name === 'string' && data.display_name.trim()
        ? data.display_name.trim()
        : fallbackEmail ?? null

  return {
    name,
    handle: typeof data?.handle === 'string' && data.handle.trim() ? data.handle.trim() : null,
    timezone: typeof data?.timezone === 'string' && data.timezone.trim() ? data.timezone.trim() : null,
  }
}

function buildLiveSystemInstruction(profile: LiveProfileContext): string {
  const profileLines = [
    'SESSION PROFILE CONTEXT',
    `- User name: ${profile.name ?? 'unknown'}`,
    `- User handle: ${profile.handle ?? 'unknown'}`,
    `- User timezone: ${profile.timezone ?? 'unknown'}`,
    '- You can answer simple identity/session questions from this block directly. For connected data, still call standard_nest_agent.',
  ]

  return `${NEST_LIVE_SYSTEM_INSTRUCTION}\n\n${profileLines.join('\n')}`
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  applyJsonSecurityHeaders(res)

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authed = await requireAuthenticatedUser(req, res)
  if (!authed) return

  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    res.status(503).json({ error: 'Server missing Gemini configuration' })
    return
  }

  const now = Date.now()
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString()
  const newSessionExpireTime = new Date(now + 60 * 1000).toISOString()

  try {
    const profileContext = await loadLiveProfileContext(authed.supabase, authed.user.id, authed.user.email)
    const systemInstruction = buildLiveSystemInstruction(profileContext)

    // Gemini ephemeral tokens are Live-only and currently require v1alpha.
    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1alpha',
    })

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: LIVE_VOICE,
                },
              },
            },
            sessionResumption: {},
            contextWindowCompression: {
              triggerTokens: '104857',
              slidingWindow: { targetTokens: '52428' },
            },
            thinkingConfig: {
              thinkingBudget: -1,
              includeThoughts: false,
            },
            tools: [{ functionDeclarations: getNestLiveFunctionDeclarations() }],
            systemInstruction,
          },
        },
        httpOptions: {
          apiVersion: 'v1alpha',
        },
      },
    })

    if (!token?.name) {
      res.status(502).json({ error: 'Gemini token service returned an empty token' })
      return
    }

    res.status(200).json({
      token: token.name,
      expireTime,
      newSessionExpireTime,
      model: LIVE_MODEL,
      voiceName: LIVE_VOICE,
      allowedTools: NEST_LIVE_TOOL_NAMES,
      profile: profileContext,
      systemInstruction,
    })
  } catch (error) {
    console.error('[nest-live-token]', error)
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to create Gemini Live token',
    })
  }
}
