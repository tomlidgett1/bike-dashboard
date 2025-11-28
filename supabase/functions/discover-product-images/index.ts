// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { discoverProductImages } from '../_shared/openai-client.ts'
import { downloadImage, validateImage, blobToFile, generateFilename } from '../_shared/image-downloader.ts'

console.log('Function "discover-product-images" initialized!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { canonicalProductId } = await req.json()

    if (!canonicalProductId) {
      return new Response(
        JSON.stringify({ error: 'canonical_product_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`\n🚀 [AI DISCOVERY] ========================================`)
    console.log(`🚀 [AI DISCOVERY] Starting for canonical product: ${canonicalProductId}`)
    console.log(`🚀 [AI DISCOVERY] ========================================\n`)

    // Get canonical product details
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('*')
      .eq('id', canonicalProductId)
      .single()

    if (canonicalError || !canonical) {
      console.error(`❌ [AI DISCOVERY] Canonical product not found: ${canonicalError?.message}`)
      return new Response(
        JSON.stringify({ error: 'Canonical product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📦 [AI DISCOVERY] Product: "${canonical.normalized_name}"`)
    console.log(`📦 [AI DISCOVERY] UPC: ${canonical.upc || 'none'}`)
    console.log(`📦 [AI DISCOVERY] Category: ${canonical.category || 'none'}`)
    console.log(`📦 [AI DISCOVERY] Manufacturer: ${canonical.manufacturer || 'none'}`)

    // Check if images already exist
    const { data: existingImages, error: imagesError } = await supabase
      .from('product_images')
      .select('id')
      .eq('canonical_product_id', canonicalProductId)
      .limit(1)

    if (existingImages && existingImages.length > 0) {
      console.log(`⚠️  [AI DISCOVERY] Product already has images, skipping`)
      return new Response(
        JSON.stringify({ message: 'Product already has images', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call OpenAI to discover images
    console.log(`\n🤖 [AI DISCOVERY] Calling OpenAI API...`)
    const aiResult = await discoverProductImages(canonical.normalized_name, {
      upc: canonical.upc,
      category: canonical.category,
      manufacturer: canonical.manufacturer,
      maxImages: 5,
    })

    console.log(`✅ [AI DISCOVERY] OpenAI returned ${aiResult.images.length} image URLs`)
    console.log(`💡 [AI DISCOVERY] Reasoning: ${aiResult.reasoning}`)

    if (aiResult.images.length === 0) {
      console.log(`⚠️  [AI DISCOVERY] No images found, marking as no_results`)
      return new Response(
        JSON.stringify({ message: 'No images found', images: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download and upload each image
    const uploadedImages: any[] = []
    let primaryImageId: string | null = null

    for (let i = 0; i < aiResult.images.length; i++) {
      const imageInfo = aiResult.images[i]!
      console.log(`\n📥 [AI DISCOVERY] Processing image ${i + 1}/${aiResult.images.length}`)
      console.log(`📥 [AI DISCOVERY] URL: ${imageInfo.url}`)
      console.log(`📥 [AI DISCOVERY] Description: ${imageInfo.description}`)
      console.log(`📥 [AI DISCOVERY] Is Primary: ${imageInfo.isPrimary}`)

      try {
        // Download image
        const downloadResult = await downloadImage(imageInfo.url)

        if (!downloadResult.success || !downloadResult.blob) {
          console.error(`❌ [AI DISCOVERY] Download failed: ${downloadResult.error}`)
          continue
        }

        // Validate image
        const validation = await validateImage(downloadResult.blob)
        if (!validation.valid) {
          console.error(`❌ [AI DISCOVERY] Validation failed: ${validation.error}`)
          continue
        }

        console.log(`✓ [AI DISCOVERY] Image valid: ${validation.mimeType}, ${(validation.fileSize! / 1024).toFixed(0)}KB`)

        // Generate storage path
        const filename = generateFilename(imageInfo.url, i)
        const storagePath = `canonical/${canonicalProductId}/original/${filename}`

        console.log(`📤 [AI DISCOVERY] Uploading to: ${storagePath}`)

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(storagePath, downloadResult.blob, {
            cacheControl: '31536000',
            contentType: validation.mimeType,
            upsert: false,
          })

        if (uploadError) {
          console.error(`❌ [AI DISCOVERY] Upload failed: ${uploadError.message}`)
          continue
        }

        console.log(`✅ [AI DISCOVERY] Uploaded successfully`)

        // Create product_images record
        const { data: imageRecord, error: recordError } = await supabase
          .from('product_images')
          .insert({
            canonical_product_id: canonicalProductId,
            storage_path: storagePath,
            is_primary: imageInfo.isPrimary,
            sort_order: imageInfo.rank,
            variants: { original: storagePath }, // Will be expanded later with size variants
            formats: { jpeg: { original: storagePath } },
            width: validation.width || 800,
            height: validation.height || 800,
            file_size: validation.fileSize,
            mime_type: validation.mimeType,
            uploaded_by: null, // AI-uploaded
          })
          .select('id')
          .single()

        if (recordError) {
          console.error(`❌ [AI DISCOVERY] Failed to create image record: ${recordError.message}`)
          continue
        }

        console.log(`✅ [AI DISCOVERY] Image record created: ${imageRecord.id}`)

        if (imageInfo.isPrimary) {
          primaryImageId = imageRecord.id
          console.log(`⭐ [AI DISCOVERY] Marked as primary image`)
        }

        uploadedImages.push({
          id: imageRecord.id,
          url: imageInfo.url,
          storagePath,
          isPrimary: imageInfo.isPrimary,
        })
      } catch (error) {
        console.error(`❌ [AI DISCOVERY] Error processing image ${i + 1}:`, error)
        continue
      }
    }

    console.log(`\n📈 [AI DISCOVERY] ========================================`)
    console.log(`📈 [AI DISCOVERY] Summary:`)
    console.log(`📈 [AI DISCOVERY]   - Images found by AI: ${aiResult.images.length}`)
    console.log(`📈 [AI DISCOVERY]   - Images downloaded: ${uploadedImages.length}`)
    console.log(`📈 [AI DISCOVERY]   - Primary image set: ${primaryImageId ? 'Yes' : 'No'}`)
    console.log(`📈 [AI DISCOVERY] ========================================\n`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully discovered and uploaded ${uploadedImages.length} images`,
        data: {
          imagesFound: aiResult.images.length,
          imagesDownloaded: uploadedImages.length,
          primaryImageId,
          uploadedImages,
          reasoning: aiResult.reasoning,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`❌ [AI DISCOVERY] Unexpected error:`, error)
    
    return new Response(
      JSON.stringify({ 
        error: 'AI image discovery failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

