import { Composio } from '@composio/core'
import { OpenAIResponsesProvider } from '@composio/openai'

let composioSingleton: Composio<OpenAIResponsesProvider> | null = null

let authConfigMapCache: Record<string, string> | null = null

function loadAuthConfigMap(): Record<string, string> {
  if (authConfigMapCache) return authConfigMapCache

  const merged: Record<string, string> = {}

  const rawJson = process.env.COMPOSIO_AUTH_CONFIGS?.trim()
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value !== 'string' || !value.trim()) continue
          merged[key.trim().toLowerCase().replace(/_/g, '')] = value.trim()
        }
      }
    } catch {
      console.warn('[composio] COMPOSIO_AUTH_CONFIGS must be a JSON object; ignoring')
    }
  }

  const prefix = 'COMPOSIO_AUTH_CONFIG_'
  for (const [key, value] of Object.entries(process.env)) {
    if (!value?.trim() || !key.startsWith(prefix)) continue
    if (key === 'COMPOSIO_AUTH_CONFIGS') continue
    const slug = key.slice(prefix.length).toLowerCase().replace(/_/g, '')
    if (slug.length > 0) merged[slug] = value.trim()
  }

  authConfigMapCache = merged
  return merged
}

export function authConfigsForToolkits(toolkits: string[]): Record<string, string> | undefined {
  const map = loadAuthConfigMap()
  if (toolkits.length === 0) {
    return Object.keys(map).length > 0 ? { ...map } : undefined
  }
  const out: Record<string, string> = {}
  for (const toolkit of toolkits) {
    const slug = toolkit.trim().toLowerCase().replace(/_/g, '')
    const id = map[slug]
    if (id) out[slug] = id
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function isComposioConfigured(): boolean {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) return false
  const lower = key.toLowerCase()
  return !(lower.startsWith('sk-') || lower.startsWith('sk_'))
}

export function getComposioApiKey(): string {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Composio is not configured. Set COMPOSIO_API_KEY.')
  }
  const lower = apiKey.toLowerCase()
  if (lower.startsWith('sk-') || lower.startsWith('sk_')) {
    throw new Error(
      'COMPOSIO_API_KEY looks like an OpenAI key. Use your Composio project API key (ak_…).',
    )
  }
  return apiKey
}

export function getComposioClient(): Composio<OpenAIResponsesProvider> {
  if (composioSingleton) return composioSingleton

  composioSingleton = new Composio({
    apiKey: getComposioApiKey(),
    baseURL: process.env.COMPOSIO_BASE_URL?.trim() || undefined,
    provider: new OpenAIResponsesProvider(),
  })

  return composioSingleton
}

export function getComposioUserId(authUserId: string): string {
  return `auth:${authUserId}`
}

function normaliseAbsoluteUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed.length || trimmed.startsWith('/')) return null
  let candidate = trimmed
  if (trimmed.startsWith('//')) candidate = `https:${trimmed}`
  else if (!/^https?:\/\//i.test(trimmed)) candidate = `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function resolveComposioCallbackUrl(): string {
  const keys = [
    'COMPOSIO_CALLBACK_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SITE_URL',
    'VERCEL_URL',
  ] as const

  for (const key of keys) {
    const raw = process.env[key]
    if (!raw) continue
    const url = normaliseAbsoluteUrl(raw)
    if (url) return url
  }

  return 'https://yellowjersey.store/settings/store/home'
}
