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
    const { canonicalProductId, customSearchQuery } = await req.json()

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
    console.log(`📦 [AI DISCOVERY] UPC: ${canonical.upc || 'NONE - NO UPC IN DATABASE'}`)
    console.log(`📦 [AI DISCOVERY] Category: ${canonical.category || 'none'}`)
    console.log(`📦 [AI DISCOVERY] Manufacturer: ${canonical.manufacturer || 'none'}`)

    // Determine which product name to use for search
    const searchQuery = customSearchQuery || canonical.normalized_name
    
    // Log exactly what we're passing to the search function
    console.log(`\n📋 [AI DISCOVERY] Passing to discoverProductImages:`)
    console.log(`   - searchQuery: "${searchQuery}"${customSearchQuery ? ' (CUSTOM)' : ''}`)
    console.log(`   - productName: "${canonical.normalized_name}"`)
    console.log(`   - upc: "${canonical.upc}"`)
    console.log(`   - category: "${canonical.category}"`)
    console.log(`   - manufacturer: "${canonical.manufacturer}"`)

    // Note: We allow re-discovery even if images exist (for QA workflow)
    // Images will be created as 'pending' for admin review

    // Call OpenAI to discover images
    console.log(`\n🤖 [AI DISCOVERY] Calling discoverProductImages function...`)
    const aiResult = await discoverProductImages(searchQuery, {
      upc: canonical.upc,
      category: canonical.category,
      manufacturer: canonical.manufacturer,
      maxImages: 15,
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

    // Save URLs without downloading for fast QA workflow
    const savedImages: any[] = []
    let primaryImageId: string | null = null

    console.log(`💾 [AI DISCOVERY] Saving ${aiResult.images.length} image URLs (no download yet)...`)

    for (let i = 0; i < aiResult.images.length; i++) {
      const imageInfo = aiResult.images[i]!
      console.log(`\n💾 [AI DISCOVERY] Saving image ${i + 1}/${aiResult.images.length}`)
      console.log(`💾 [AI DISCOVERY] URL: ${imageInfo.url}`)
      console.log(`💾 [AI DISCOVERY] Is Primary: ${imageInfo.isPrimary}`)

      try {
        // Create product_images record with external URL only (no download)
        const { data: imageRecord, error: recordError } = await supabase
          .from('product_images')
          .insert({
            canonical_product_id: canonicalProductId,
            external_url: imageInfo.url, // Store external URL
            storage_path: null, // No storage path yet
            is_downloaded: false, // Mark as not downloaded
            is_primary: imageInfo.isPrimary,
            sort_order: imageInfo.rank,
            variants: {},
            formats: {},
            width: 800, // Default dimensions
            height: 800,
            file_size: 0,
            mime_type: 'image/jpeg',
            uploaded_by: null,
            approval_status: 'pending', // Requires admin approval before showing on marketplace
          })
          .select('id')
          .single()

        if (recordError) {
          console.error(`❌ [AI DISCOVERY] Failed to create image record: ${recordError.message}`)
          continue
        }

        console.log(`✅ [AI DISCOVERY] Image URL saved: ${imageRecord.id}`)

        if (imageInfo.isPrimary) {
          primaryImageId = imageRecord.id
          console.log(`⭐ [AI DISCOVERY] Marked as primary image`)
        }

        savedImages.push({
          id: imageRecord.id,
          url: imageInfo.url,
          storagePath: null,
          isPrimary: imageInfo.isPrimary,
        })
      } catch (error) {
        console.error(`❌ [AI DISCOVERY] Error saving image ${i + 1}:`, error)
        continue
      }
    }

    console.log(`\n📈 [AI DISCOVERY] ========================================`)
    console.log(`📈 [AI DISCOVERY] Summary:`)
    console.log(`📈 [AI DISCOVERY]   - Images found by AI: ${aiResult.images.length}`)
    console.log(`📈 [AI DISCOVERY]   - Image URLs saved: ${savedImages.length}`)
    console.log(`📈 [AI DISCOVERY]   - Primary image set: ${primaryImageId ? 'Yes' : 'No'}`)
    console.log(`📈 [AI DISCOVERY] ========================================\n`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully saved ${savedImages.length} image URLs (ready for QA)`,
        data: {
          imagesFound: aiResult.images.length,
          imagesSaved: savedImages.length,
          primaryImageId,
          savedImages,
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

