export interface GenieYoutubeVideoPreview {
  id: string
  video_id: string
  title: string
  channel: string | null
  thumbnail_url: string | null
  duration: string | null
  url: string
}

interface SerperVideoHit {
  title?: string
  link?: string
  snippet?: string
  imageUrl?: string
  duration?: string
  channel?: string
  source?: string
}

const DEFAULT_LIMIT = 2
const MAX_LIMIT = 2

function normaliseLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0]
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v')
        return id && /^[\w-]{11}$/.test(id) ? id : null
      }

      const embedMatch = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)
      if (embedMatch?.[1]) return embedMatch[1]
    }
  } catch {
    return null
  }

  return null
}

function mapHitsToVideos(hits: SerperVideoHit[], limit: number): GenieYoutubeVideoPreview[] {
  const seen = new Set<string>()
  const videos: GenieYoutubeVideoPreview[] = []

  for (const hit of hits) {
    const link = typeof hit.link === 'string' ? hit.link.trim() : ''
    if (!link) continue

    const videoId = extractYoutubeVideoId(link)
    if (!videoId || seen.has(videoId)) continue

    seen.add(videoId)
    videos.push({
      id: videoId,
      video_id: videoId,
      title: (hit.title ?? 'YouTube video').trim() || 'YouTube video',
      channel: typeof hit.channel === 'string' ? hit.channel.trim() || null : null,
      thumbnail_url:
        typeof hit.imageUrl === 'string' && hit.imageUrl.startsWith('http') ? hit.imageUrl : null,
      duration: typeof hit.duration === 'string' ? hit.duration.trim() || null : null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    })

    if (videos.length >= limit) break
  }

  return videos
}

async function searchYoutubeVideosDirectSerper(
  query: string,
  limit: number,
  apiKey: string,
): Promise<GenieYoutubeVideoPreview[]> {
  const response = await fetch('https://google.serper.dev/videos', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: Math.min(10, limit * 4),
      gl: 'au',
    }),
  })

  if (!response.ok) return []

  const data = (await response.json()) as { videos?: SerperVideoHit[] }
  return mapHitsToVideos(data.videos ?? [], limit)
}

async function searchYoutubeVideosViaEdgeFunction(
  query: string,
  limit: number,
): Promise<GenieYoutubeVideoPreview[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceKey) return []

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/search-youtube-videos`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ searchQuery: query, limit }),
    },
  )

  if (!response.ok) return []

  const data = (await response.json()) as {
    success?: boolean
    results?: Array<{
      id?: string
      title?: string
      link?: string | null
      channel?: string | null
      duration?: string | null
      thumbnailUrl?: string | null
    }>
  }

  if (!data.success || !Array.isArray(data.results)) return []

  return mapHitsToVideos(
    data.results.map((result) => ({
      title: result.title,
      link: result.link ?? undefined,
      channel: result.channel ?? undefined,
      duration: result.duration ?? undefined,
      imageUrl: result.thumbnailUrl ?? undefined,
    })),
    limit,
  )
}

export async function searchYoutubeVideos(
  rawQuery: string,
  options?: { limit?: number },
): Promise<{ query: string; videos: GenieYoutubeVideoPreview[]; message?: string }> {
  const query = rawQuery.trim()
  if (!query) {
    return { query: '', videos: [], message: 'No search query provided.' }
  }

  const limit = normaliseLimit(options?.limit)

  try {
    const directKey = process.env.SERPER_API_KEY?.trim()
    let videos = directKey
      ? await searchYoutubeVideosDirectSerper(query, limit, directKey)
      : []

    if (videos.length === 0) {
      videos = await searchYoutubeVideosViaEdgeFunction(query, limit)
    }

    return {
      query,
      videos,
      message: videos.length === 0 ? 'No matching YouTube videos found.' : undefined,
    }
  } catch {
    return {
      query,
      videos: [],
      message: 'Video search temporarily unavailable.',
    }
  }
}
