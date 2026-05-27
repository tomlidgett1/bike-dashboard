// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { cloudinaryUploadAuthHeader } from '../_shared/cloudinary-auth.ts'
import { buildCloudinaryUrls, CLOUDINARY_EAGER_TRANSFORMS } from '../_shared/cloudinary-transforms.ts'

console.log('Function "download-image" initialized!')

// ============================================================
// Download Image & Upload to Cloudinary
// Downloads external images and uploads to Cloudinary CDN
// Creates standard marketplace variants from the shared Cloudinary transform map.
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Cloudinary credentials
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')?.trim()
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY')?.trim()
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')?.trim()

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

    const timestamp = Math.floor(Date.now() / 1000)
    const publicId = `bike-marketplace/canonical/${canonicalProductId}/${timestamp}-${sortOrder || 0}`
    
    console.log(`📤 [DOWNLOAD IMAGE] Uploading to Cloudinary: ${publicId}`)
    
    const cloudinaryForm = new FormData()
    cloudinaryForm.append('file', dataUri)
    cloudinaryForm.append('public_id', publicId)
    cloudinaryForm.append('eager', CLOUDINARY_EAGER_TRANSFORMS)
    cloudinaryForm.append('eager_async', 'false')

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        headers: { Authorization: cloudinaryUploadAuthHeader(apiKey, apiSecret) },
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

    const urls = buildCloudinaryUrls(cloudName, cloudinaryResult.public_id)
    const thumbnailUrl = urls.thumbnailUrl
    const mobileCardUrl = urls.mobileCardUrl
    const cardUrl = urls.cardUrl
    const galleryUrl = urls.galleryUrl
    const detailUrl = urls.detailUrl

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
