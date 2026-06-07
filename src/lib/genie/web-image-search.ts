export interface GenieWebImagePreview {
  id: string
  title: string
  image_url: string
  thumbnail_url: string | null
  source_url: string | null
  domain: string | null
}

interface SerperImageHit {
  title?: string
  imageUrl?: string
  thumbnailUrl?: string
  link?: string
  domain?: string
}

interface EdgeImageResult {
  id?: string
  url?: string
  thumbnailUrl?: string
  title?: string
  domain?: string
  source?: string
}

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 8

function normaliseLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function mapHitsToPreviews(
  hits: Array<{
    imageUrl: string
    title?: string
    thumbnailUrl?: string | null
    link?: string | null
    domain?: string | null
    id?: string
  }>,
  query: string,
  limit: number,
): GenieWebImagePreview[] {
  return hits
    .filter(hit => hit.imageUrl.startsWith('http'))
    .slice(0, limit)
    .map((hit, index) => ({
      id: hit.id ?? `web-${index}-${hit.imageUrl.slice(-24)}`,
      title: (hit.title ?? query).trim() || query,
      image_url: hit.imageUrl,
      thumbnail_url:
        typeof hit.thumbnailUrl === 'string' && hit.thumbnailUrl.startsWith('http')
          ? hit.thumbnailUrl
          : null,
      source_url:
        typeof hit.link === 'string' && hit.link.startsWith('http') ? hit.link : null,
      domain: typeof hit.domain === 'string' ? hit.domain : null,
    }))
}

async function searchWebImagesDirectSerper(
  query: string,
  limit: number,
  apiKey: string,
): Promise<GenieWebImagePreview[]> {
  const response = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: Math.min(20, limit * 3),
      gl: 'au',
    }),
  })

  if (!response.ok) return []

  const data = (await response.json()) as { images?: SerperImageHit[] }
  return mapHitsToPreviews(
    (data.images ?? []).map((hit, index) => ({
      id: `web-${index}-${String(hit.imageUrl ?? '').slice(-24)}`,
      imageUrl: String(hit.imageUrl ?? ''),
      title: hit.title,
      thumbnailUrl: hit.thumbnailUrl ?? null,
      link: hit.link ?? null,
      domain: hit.domain ?? null,
    })),
    query,
    limit,
  )
}

async function searchWebImagesViaEdgeFunction(
  query: string,
  limit: number,
): Promise<GenieWebImagePreview[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceKey) return []

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/search-product-images`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ searchQuery: query }),
    },
  )

  if (!response.ok) return []

  const data = (await response.json()) as {
    success?: boolean
    results?: EdgeImageResult[]
  }

  if (!data.success || !Array.isArray(data.results)) return []

  return mapHitsToPreviews(
    data.results.map((result, index) => ({
      id: result.id ?? `web-${index}-${String(result.url ?? '').slice(-24)}`,
      imageUrl: String(result.url ?? ''),
      title: result.title,
      thumbnailUrl: result.thumbnailUrl ?? null,
      link: null,
      domain: result.domain ?? null,
    })),
    query,
    limit,
  )
}

export function extractVisualImageSearchQuery(message: string): string | null {
  const text = message.trim()
  if (!text) return null

  const analyticsOnly =
    /\b(sales|revenue|margin|stock on hand|qoh|discount|chart|table|report|trend|total|how many|top \d+|work order|carousel|profit)\b/i
  const visualCue = /\b(look like|picture|photo|image|what does|show me what|show me a|show me the)\b/i
  if (analyticsOnly.test(text) && !visualCue.test(text)) return null

  const patterns: RegExp[] = [
    /what does (.+?) look like/i,
    /how does (.+?) look/i,
    /(?:show me|find|see) (?:some |a |the )?(?:picture|photo|image)s?(?:\s+of)?\s+(.+)/i,
    /(?:picture|photo|image)s?(?:\s+of)\s+(.+)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const subject = match?.[1]?.trim().replace(/[?.!]+$/, '')
    if (subject && subject.length >= 3) return subject
  }

  if (visualCue.test(text) && text.length <= 140) {
    return text.replace(/^(please |can you |could you )/i, '').trim()
  }

  return null
}

export async function searchWebImages(
  rawQuery: string,
  options?: { limit?: number },
): Promise<{ query: string; images: GenieWebImagePreview[]; message?: string }> {
  const query = rawQuery.trim()
  if (!query) {
    return { query: '', images: [], message: 'No search query provided.' }
  }

  const limit = normaliseLimit(options?.limit)

  try {
    const directKey = process.env.SERPER_API_KEY?.trim()
    let images = directKey
      ? await searchWebImagesDirectSerper(query, limit, directKey)
      : []

    if (images.length === 0) {
      images = await searchWebImagesViaEdgeFunction(query, limit)
    }

    return {
      query,
      images,
      message: images.length === 0 ? 'No matching images found.' : undefined,
    }
  } catch {
    return {
      query,
      images: [],
      message: 'Image search temporarily unavailable.',
    }
  }
}

export async function maybeSearchWebImagesForUserMessage(
  userMessage: string,
  options?: { limit?: number },
): Promise<{ query: string; images: GenieWebImagePreview[] } | null> {
  const query = extractVisualImageSearchQuery(userMessage)
  if (!query) return null

  const result = await searchWebImages(query, options)
  if (result.images.length === 0) return null

  return { query: result.query, images: result.images }
}
