// YouTube video search using Serper API — uses SERPER_API_KEY from Supabase secrets.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from '../_shared/cors.ts'

interface SerperVideoHit {
  title?: string
  link?: string
  imageUrl?: string
  duration?: string
  channel?: string
}

console.log('Function "search-youtube-videos" initialized!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { searchQuery, limit: rawLimit } = await req.json() as {
      searchQuery?: string
      limit?: number
    }

    if (!searchQuery?.trim()) {
      return new Response(
        JSON.stringify({ error: 'searchQuery required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY')

    if (!SERPER_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Serper API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const limit = Math.min(2, Math.max(1, Math.floor(rawLimit ?? 2)))
    const searchQueryTrimmed = searchQuery.trim()

    const response = await fetch('https://google.serper.dev/videos', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: searchQueryTrimmed,
        num: Math.min(10, limit * 4),
        gl: 'au',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [YOUTUBE SEARCH] Serper API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Video search failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await response.json() as { videos?: SerperVideoHit[] }
    const videos = (data.videos ?? []).slice(0, limit).map((hit, index) => ({
      id: `video-${index}-${String(hit.link ?? '').slice(-12)}`,
      title: hit.title ?? 'YouTube video',
      link: hit.link ?? null,
      channel: hit.channel ?? null,
      duration: hit.duration ?? null,
      thumbnailUrl: hit.imageUrl ?? null,
    }))

    return new Response(
      JSON.stringify({
        success: true,
        query: searchQueryTrimmed,
        results: videos,
        total: videos.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('❌ [YOUTUBE SEARCH] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
