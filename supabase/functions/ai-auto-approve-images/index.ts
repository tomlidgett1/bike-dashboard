// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { discoverProductImages } from '../_shared/openai-client.ts'
import { selectProductImagesWithAI } from '../_shared/openai-vision-selector.ts'
import { uploadToCloudinary } from '../_shared/cloudinary-uploader.ts'

console.log('Function "ai-auto-approve-images" initialized!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { canonicalProductId } = await req.json()

    if (!canonicalProductId) {
      return new Response(
        JSON.stringify({ error: 'canonical_product_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`\n🤖 [AI AUTO-APPROVE] ========================================`)
    console.log(`🤖 [AI AUTO-APPROVE] Starting for canonical product: ${canonicalProductId}`)
    console.log(`🤖 [AI AUTO-APPROVE] ========================================\n`)

    // Get canonical product details
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('*')
      .eq('id', canonicalProductId)
      .single()

    if (canonicalError || !canonical) {
      console.error(`❌ [AI AUTO-APPROVE] Canonical product not found: ${canonicalError?.message}`)
      return new Response(
        JSON.stringify({ error: 'Canonical product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📦 [AI AUTO-APPROVE] Product: "${canonical.normalized_name}"`)
    console.log(`📦 [AI AUTO-APPROVE] UPC: ${canonical.upc || 'NONE'}`)
    console.log(`📦 [AI AUTO-APPROVE] Category: ${canonical.category || 'none'}`)
    console.log(`📦 [AI AUTO-APPROVE] Manufacturer: ${canonical.manufacturer || 'none'}`)

    // STEP 1: Discover images using Serper (existing logic)
    console.log(`\n🔍 [AI AUTO-APPROVE] Step 1: Discovering images with Serper...`)
    const searchQuery = canonical.normalized_name
    
    const aiResult = await discoverProductImages(searchQuery, {
      upc: canonical.upc,
      category: canonical.category,
      manufacturer: canonical.manufacturer,
      maxImages: 20, // Get more candidates for AI to choose from
    })

    console.log(`✅ [AI AUTO-APPROVE] Serper returned ${aiResult.images.length} candidate images`)

    if (aiResult.images.length === 0) {
      console.log(`⚠️  [AI AUTO-APPROVE] No images found, cannot proceed`)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No images found',
          message: 'No images found by Serper. Try manual discovery instead.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // STEP 2: Use AI Vision to select best images
    console.log(`\n🤖 [AI AUTO-APPROVE] Step 2: AI analyzing images to select best ones...`)
    
    const imageUrls = aiResult.images.map(img => img.url)
    
    let aiSelection
    try {
      aiSelection = await selectProductImagesWithAI(
        imageUrls,
        canonical.normalized_name,
        10 // Analyze top 10 images
      )
    } catch (error) {
      console.error(`❌ [AI AUTO-APPROVE] AI selection failed:`, error)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'AI selection failed',
          message: error instanceof Error ? error.message : 'AI analysis failed. Try manual discovery.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ [AI AUTO-APPROVE] AI selected ${aiSelection.selectedUrls.length} images`)
    console.log(`✅ [AI AUTO-APPROVE] Primary image: ${aiSelection.primaryUrl}`)
    console.log(`💡 [AI AUTO-APPROVE] Reasoning: ${aiSelection.reasoning}`)

    // STEP 3: Save ONLY the AI-selected images to database
    console.log(`\n💾 [AI AUTO-APPROVE] Step 3: Saving ${aiSelection.selectedUrls.length} AI-approved images...`)

    const savedImages: any[] = []
    let primaryImageId: string | null = null

    for (let i = 0; i < aiSelection.selectedUrls.length; i++) {
      const imageUrl = aiSelection.selectedUrls[i]
      const isPrimary = imageUrl === aiSelection.primaryUrl

      console.log(`\n💾 [AI AUTO-APPROVE] Saving image ${i + 1}/${aiSelection.selectedUrls.length}`)
      console.log(`💾 [AI AUTO-APPROVE] URL: ${imageUrl}`)
      console.log(`💾 [AI AUTO-APPROVE] Is Primary: ${isPrimary}`)

      try {
        // Create product_images record with APPROVED status
        const { data: imageRecord, error: recordError } = await supabase
          .from('product_images')
          .insert({
            canonical_product_id: canonicalProductId,
            external_url: imageUrl,
            storage_path: null, // Will be populated when downloaded
            is_downloaded: false,
            is_primary: isPrimary,
            sort_order: i + 1,
            variants: {},
            formats: {},
            width: 800,
            height: 800,
            file_size: 0,
            mime_type: 'image/jpeg',
            uploaded_by: null,
            approval_status: 'approved', // AI-approved, ready to show
          })
          .select('id')
          .single()

        if (recordError) {
          console.error(`❌ [AI AUTO-APPROVE] Failed to create image record: ${recordError.message}`)
          continue
        }

        console.log(`✅ [AI AUTO-APPROVE] Image saved: ${imageRecord.id}`)

        if (isPrimary) {
          primaryImageId = imageRecord.id
          console.log(`⭐ [AI AUTO-APPROVE] Marked as primary image`)
        }

        savedImages.push({
          id: imageRecord.id,
          url: imageUrl,
          isPrimary: isPrimary,
        })

        // STEP 4: Upload to Cloudinary directly
        console.log(`📥 [AI AUTO-APPROVE] Uploading image ${i + 1} to Cloudinary...`)
        
        const cloudinaryResult = await uploadToCloudinary(
          imageUrl,
          canonicalProductId,
          i + 1
        )
        
        if (!cloudinaryResult.success) {
          console.error(`❌ [AI AUTO-APPROVE] Cloudinary upload failed for image ${i + 1}: ${cloudinaryResult.error}`)
        } else {
          console.log(`✅ [AI AUTO-APPROVE] Cloudinary upload complete for image ${i + 1}`)
          console.log(`   Card URL: ${cloudinaryResult.cardUrl}`)
          
          // Update product_images record with all Cloudinary URLs
          const { error: updateError } = await supabase
            .from('product_images')
            .update({
              cloudinary_url: cloudinaryResult.cloudinaryUrl,
              cloudinary_public_id: cloudinaryResult.cloudinaryPublicId,
              thumbnail_url: cloudinaryResult.thumbnailUrl,
              mobile_card_url: cloudinaryResult.mobileCardUrl,
              card_url: cloudinaryResult.cardUrl,
              gallery_url: cloudinaryResult.galleryUrl,
              detail_url: cloudinaryResult.detailUrl,
              is_downloaded: true,
              width: cloudinaryResult.width,
              height: cloudinaryResult.height,
              file_size: cloudinaryResult.fileSize,
              mime_type: 'image/webp',
            })
            .eq('id', imageRecord.id)
          
          if (updateError) {
            console.error(`❌ [AI AUTO-APPROVE] Failed to update image record: ${updateError.message}`)
          } else {
            console.log(`✅ [AI AUTO-APPROVE] Image record updated with Cloudinary URLs`)
          }
        }
      } catch (error) {
        console.error(`❌ [AI AUTO-APPROVE] Error saving image ${i + 1}:`, error)
        continue
      }
    }

    console.log(`\n📈 [AI AUTO-APPROVE] ========================================`)
    console.log(`📈 [AI AUTO-APPROVE] Summary:`)
    console.log(`📈 [AI AUTO-APPROVE]   - Candidates from Serper: ${aiResult.images.length}`)
    console.log(`📈 [AI AUTO-APPROVE]   - AI selected: ${aiSelection.selectedUrls.length}`)
    console.log(`📈 [AI AUTO-APPROVE]   - Images saved: ${savedImages.length}`)
    console.log(`📈 [AI AUTO-APPROVE]   - Primary image set: ${primaryImageId ? 'Yes' : 'No'}`)
    console.log(`📈 [AI AUTO-APPROVE]   - Status: APPROVED (ready for marketplace)`)
    console.log(`📈 [AI AUTO-APPROVE] ========================================\n`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `AI successfully selected and approved ${savedImages.length} images`,
        data: {
          candidatesFound: aiResult.images.length,
          aiSelected: aiSelection.selectedUrls.length,
          imagesSaved: savedImages.length,
          primaryImageId,
          savedImages,
          aiReasoning: aiSelection.reasoning,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`❌ [AI AUTO-APPROVE] Unexpected error:`, error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'AI auto-approval failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

