// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { downloadImage, validateImage, generateFilename } from '../_shared/image-downloader.ts'

console.log('Function "download-image" initialized!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
    console.log(`📥 [DOWNLOAD IMAGE] ========================================\n`)

    // Download image
    const downloadResult = await downloadImage(externalUrl)

    if (!downloadResult.success || !downloadResult.blob) {
      console.error(`❌ [DOWNLOAD IMAGE] Download failed: ${downloadResult.error}`)
      return new Response(
        JSON.stringify({ error: 'Download failed', details: downloadResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate image
    const validation = await validateImage(downloadResult.blob)
    if (!validation.valid) {
      console.error(`❌ [DOWNLOAD IMAGE] Validation failed: ${validation.error}`)
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validation.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✓ [DOWNLOAD IMAGE] Image valid: ${validation.mimeType}, ${(validation.fileSize! / 1024).toFixed(0)}KB`)

    // Generate storage path
    const filename = generateFilename(externalUrl, sortOrder || 0)
    const storagePath = `canonical/${canonicalProductId}/original/${filename}`

    console.log(`📤 [DOWNLOAD IMAGE] Uploading to: ${storagePath}`)

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(storagePath, downloadResult.blob, {
        cacheControl: '31536000',
        contentType: validation.mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error(`❌ [DOWNLOAD IMAGE] Upload failed: ${uploadError.message}`)
      return new Response(
        JSON.stringify({ error: 'Upload failed', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ [DOWNLOAD IMAGE] Uploaded successfully`)

    // Update product_images record
    const { error: updateError } = await supabase
      .from('product_images')
      .update({
        storage_path: storagePath,
        is_downloaded: true,
        variants: { original: storagePath },
        formats: { jpeg: { original: storagePath } },
        width: validation.width || 800,
        height: validation.height || 800,
        file_size: validation.fileSize,
        mime_type: validation.mimeType,
      })
      .eq('id', imageId)

    if (updateError) {
      console.error(`❌ [DOWNLOAD IMAGE] Failed to update record: ${updateError.message}`)
      return new Response(
        JSON.stringify({ error: 'Failed to update record', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ [DOWNLOAD IMAGE] Record updated with storage path`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Image downloaded successfully',
        data: {
          imageId,
          storagePath,
          fileSize: validation.fileSize,
          mimeType: validation.mimeType,
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

