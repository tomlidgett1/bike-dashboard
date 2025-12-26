// Simple image search using Serper API (Google Images)
// Returns results without saving - for admin to select which to add

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from '../_shared/cors.ts'

interface SerperImageResult {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  thumbnailUrl: string;
  source: string;
  domain: string;
  link: string;
  position: number;
}

console.log('Function "search-product-images" initialized!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { searchQuery } = await req.json()

    if (!searchQuery) {
      return new Response(
        JSON.stringify({ error: 'searchQuery required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY')
    
    if (!SERPER_API_KEY) {
      console.error('❌ SERPER_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Serper API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🔍 [SEARCH] Searching for: "${searchQuery}"`)

    // Call Serper API
    // Note: tbs filters - isz:l = large, isz:m = medium
    // Adding 'product' to help find product images vs lifestyle photos
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 50, // Request more to have better selection after filtering
        gl: 'au', // Australia for local relevance
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [SEARCH] Serper API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Image search failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const images: SerperImageResult[] = data.images || []

    console.log(`✅ [SEARCH] Found ${images.length} images`)

    // Filter and format results - no size filter, just remove bad domains
    const results = images
      .filter((img) => {
        // Filter out social media and user-generated content sites
        const badDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'pinterest.com', 'tiktok.com', 'reddit.com', 'imgur.com']
        if (badDomains.some((d) => img.domain.includes(d))) return false
        return true
      })
      // Sort by image size (larger = better quality)
      .sort((a, b) => (b.imageWidth * b.imageHeight) - (a.imageWidth * a.imageHeight))
      .slice(0, 20) // Limit to 20 results
      .map((img, index) => {
        console.log(`[SEARCH] Result ${index + 1}: ${img.imageWidth}x${img.imageHeight} (${(img.imageWidth * img.imageHeight / 1000000).toFixed(1)}MP) from ${img.domain}`)
        return {
          id: `search-${index}`,
          url: img.imageUrl,
          thumbnailUrl: img.thumbnailUrl,
          title: img.title,
          source: img.source,
          domain: img.domain,
          width: img.imageWidth,
          height: img.imageHeight,
        }
      })

    return new Response(
      JSON.stringify({
        success: true,
        query: searchQuery,
        results,
        total: results.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ [SEARCH] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

