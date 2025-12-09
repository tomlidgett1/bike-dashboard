// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log('Function "download-image" initialized!')

// ============================================================
// Download Image & Upload to Cloudinary
// Downloads external images and uploads to Cloudinary CDN
// Creates 3 variants: thumbnail (100px), card (400px), detail (800px)
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Cloudinary credentials
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY')
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('❌ [DOWNLOAD IMAGE] Cloudinary credentials not configured')
    return new Response(
      JSON.stringify({ error: 'Cloudinary credentials not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { imageId, externalUrl, canonicalProductId, sortOrder } = await req.json()

    if (!imageId || !externalUrl || !canonicalProductId) {
      return new Response(
        JSON.stringify({ error: 'imageId, externalUrl, and canonicalProductId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`\n📥 [DOWNLOAD IMAGE] ========================================`)
    console.log(`📥 [DOWNLOAD IMAGE] Image ID: ${imageId}`)
    console.log(`📥 [DOWNLOAD IMAGE] URL: ${externalUrl}`)
    console.log(`📥 [DOWNLOAD IMAGE] Uploading to Cloudinary...`)
    console.log(`📥 [DOWNLOAD IMAGE] ========================================\n`)

    // Download image from external URL
    const imageResponse = await fetch(externalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BikeMarketplace/1.0; +https://bikemarketplace.com)',
      },
    })

    if (!imageResponse.ok) {
      console.error(`❌ [DOWNLOAD IMAGE] Download failed: ${imageResponse.status}`)
      return new Response(
        JSON.stringify({ error: 'Download failed', details: `HTTP ${imageResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const contentType = imageResponse.headers.get('content-type')
    if (!contentType || !contentType.startsWith('image/')) {
      console.error(`❌ [DOWNLOAD IMAGE] Invalid content type: ${contentType}`)
      return new Response(
        JSON.stringify({ error: 'Invalid content type', details: contentType }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert to base64 for Cloudinary upload
    const arrayBuffer = await imageResponse.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const fileSize = uint8Array.length

    // Validate file size
    if (fileSize > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'Image too large (>10MB)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (fileSize < 10 * 1024) {
      return new Response(
        JSON.stringify({ error: 'Image too small (likely a placeholder)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✓ [DOWNLOAD IMAGE] Downloaded ${(fileSize / 1024).toFixed(0)}KB, type: ${contentType}`)

    // Convert to base64
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    const base64 = btoa(binary)
    const mimeType = contentType || 'image/jpeg'
    const dataUri = `data:${mimeType};base64,${base64}`

    // Generate Cloudinary signature
    const timestamp = Math.floor(Date.now() / 1000)
    const publicId = `bike-marketplace/canonical/${canonicalProductId}/${timestamp}-${sortOrder || 0}`
    
    // Eager transformations: thumbnail (100px), mobile_card (200px), card (400px), gallery (1200px), detail (2000px)
    // Card variants use c_fill,g_center for predictable center cropping (no borders)
    // Gallery uses ar_4:3,c_pad with white background for full product display on detail pages
    const eagerTransforms = 'w_100,c_limit,q_auto:low,f_webp|w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp|w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp|w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp|w_2000,c_limit,q_auto:best,f_webp'
    
    const signatureString = `eager=${eagerTransforms}&eager_async=false&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
    const encoder = new TextEncoder()
    const data = encoder.encode(signatureString)
    const hashBuffer = await crypto.subtle.digest('SHA-1', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Upload to Cloudinary
    console.log(`📤 [DOWNLOAD IMAGE] Uploading to Cloudinary: ${publicId}`)
    
    const cloudinaryForm = new FormData()
    cloudinaryForm.append('file', dataUri)
    cloudinaryForm.append('api_key', apiKey)
    cloudinaryForm.append('timestamp', timestamp.toString())
    cloudinaryForm.append('signature', signature)
    cloudinaryForm.append('public_id', publicId)
    cloudinaryForm.append('eager', eagerTransforms)
    cloudinaryForm.append('eager_async', 'false')

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: cloudinaryForm,
      }
    )

    if (!cloudinaryResponse.ok) {
      const errorText = await cloudinaryResponse.text()
      console.error('❌ [DOWNLOAD IMAGE] Cloudinary upload failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Cloudinary upload failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cloudinaryResult = await cloudinaryResponse.json()
    console.log(`✅ [DOWNLOAD IMAGE] Uploaded to Cloudinary: ${cloudinaryResult.public_id}`)

    // Build optimised URLs
    const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`
    const thumbnailUrl = `${baseUrl}/w_100,c_limit,q_auto:low,f_webp/${cloudinaryResult.public_id}`
    const mobileCardUrl = `${baseUrl}/w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${cloudinaryResult.public_id}`
    const cardUrl = `${baseUrl}/w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${cloudinaryResult.public_id}`
    const galleryUrl = `${baseUrl}/w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp/${cloudinaryResult.public_id}`
    const detailUrl = `${baseUrl}/w_2000,c_limit,q_auto:best,f_webp/${cloudinaryResult.public_id}`

    // Update product_images record with Cloudinary URLs
    const { error: updateError } = await supabase
      .from('product_images')
      .update({
        cloudinary_url: cloudinaryResult.secure_url,
        cloudinary_public_id: cloudinaryResult.public_id,
        thumbnail_url: thumbnailUrl,
        mobile_card_url: mobileCardUrl,
        card_url: cardUrl,
        gallery_url: galleryUrl,
        detail_url: detailUrl,
        is_downloaded: true,
        width: cloudinaryResult.width || 800,
        height: cloudinaryResult.height || 800,
        file_size: fileSize,
        mime_type: mimeType,
      })
      .eq('id', imageId)

    if (updateError) {
      console.error(`❌ [DOWNLOAD IMAGE] Failed to update record: ${updateError.message}`)
      return new Response(
        JSON.stringify({ error: 'Failed to update record', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ [DOWNLOAD IMAGE] Record updated with Cloudinary URLs`)

    // Pre-warm CDN cache
    console.log(`🔥 [DOWNLOAD IMAGE] Pre-warming CDN cache...`)
    fetch(cardUrl).catch(() => {})
    fetch(mobileCardUrl).catch(() => {})
    fetch(thumbnailUrl).catch(() => {})

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Image uploaded to Cloudinary successfully',
        data: {
          imageId,
          cloudinaryUrl: cloudinaryResult.secure_url,
          thumbnailUrl,
          mobileCardUrl,
          cardUrl,
          detailUrl,
          publicId: cloudinaryResult.public_id,
          fileSize,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`❌ [DOWNLOAD IMAGE] Unexpected error:`, error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Image download failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
