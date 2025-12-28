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

    // Call Serper API with optimized settings for product images
    // See: https://serper.dev/docs
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: `${searchQuery} product photo`,  // Add "product photo" for better results
        num: 100,  // Request more for better selection
        gl: 'au',  // Australia locale
        // tbs parameters for better image filtering:
        // - isz:l = large images only
        // - itp:photo = photo type (not clipart/drawings)
        tbs: 'isz:l,itp:photo',
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

    // Filter and format results
    const results = images
      .filter((img) => {
        // Filter out social media, user-generated content, and low-quality sources
        const badDomains = [
          'facebook.com', 'twitter.com', 'instagram.com', 'pinterest.com', 
          'tiktok.com', 'reddit.com', 'imgur.com', 'aliexpress.com', 
          'alibaba.com', 'wish.com', 'ebay.com', 'gumtree.com',
          'marketplace.', 'classified.', 'carousell.com'
        ]
        if (badDomains.some((d) => img.domain.includes(d))) return false
        
        // Require minimum image dimensions (at least 400x400)
        if (img.imageWidth < 400 || img.imageHeight < 400) return false
        
        return true
      })
      // Sort by preferred cycling retailers first, then by image size
      .sort((a, b) => {
        const preferredDomains = [
          'trekbikes.com', 'specialized.com', 'giant-bicycles.com', 'cannondale.com',
          'santacruzbicycles.com', 'bike-discount.de', 'bikeexchange.com', 
          'wiggle.com', 'chainreactioncycles.com', 'pushys.com.au', 'bicyclesonline.com.au',
          'canyon.com', 'scott-sports.com', 'norco.com', 'orbea.com', 'bmc-switzerland.com'
        ]
        const aPreferred = preferredDomains.some(d => a.domain.includes(d)) ? 1 : 0
        const bPreferred = preferredDomains.some(d => b.domain.includes(d)) ? 1 : 0
        
        // If one is from preferred domain and other isn't, prefer that one
        if (aPreferred !== bPreferred) return bPreferred - aPreferred
        
        // Otherwise sort by size (larger = better)
        return (b.imageWidth * b.imageHeight) - (a.imageWidth * a.imageHeight)
      })
      .slice(0, 30) // Return top 30 results
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

