// ============================================================
// AI Auto-Approve Queue Processor
// ============================================================
// Batch processes products from ai_image_discovery_queue using GPT-4o Vision
// to automatically select and approve the best images without manual QA
//
// DATABASE TABLES USED:
// ============================================================
//
// 1. ai_image_discovery_queue
//    - Tracks products needing image discovery
//    - Columns:
//      * id: UUID primary key
//      * canonical_product_id: UUID reference to canonical_products table
//      * product_name: TEXT - product name for search
//      * upc: TEXT - product UPC (can be null or temp)
//      * category: TEXT - product category
//      * manufacturer: TEXT - manufacturer name
//      * status: TEXT - 'pending', 'processing', 'completed', 'failed', 'no_results'
//      * priority: INTEGER - processing priority (10=real UPC, 5=temp UPC)
//      * attempts: INTEGER - number of processing attempts
//      * max_attempts: INTEGER - max retries (default 3)
//      * search_query: TEXT - AI search query used
//      * openai_response: JSONB - AI response data
//      * images_found: INTEGER - number of images discovered
//      * images_downloaded: INTEGER - number of images saved
//      * error_message: TEXT - last error if failed
//      * last_error_at: TIMESTAMPTZ - when last error occurred
//      * created_at, started_at, completed_at, updated_at: TIMESTAMPTZ
//
// 2. canonical_products
//    - Master product database
//    - Columns used:
//      * id: UUID primary key
//      * normalized_name: TEXT - standardized product name
//      * upc: TEXT - UPC code
//      * category: TEXT - product category
//      * manufacturer: TEXT - manufacturer
//
// 3. product_images
//    - Stores product images
//    - Columns:
//      * id: UUID primary key
//      * canonical_product_id: UUID reference to canonical_products
//      * external_url: TEXT - external image URL (before download)
//      * storage_path: TEXT (nullable) - path in Supabase storage after download
//      * is_downloaded: BOOLEAN - false until downloaded to storage
//      * is_primary: BOOLEAN - true for main product image
//      * sort_order: INTEGER - display order
//      * approval_status: TEXT - 'pending', 'approved', 'rejected'
//         NOTE: This processor saves images as 'approved' (AI-approved)
//      * variants: JSONB - image size variants (populated after download)
//      * formats: JSONB - image format variants (webp, avif, etc)
//      * width, height: INTEGER - image dimensions
//      * file_size: INTEGER - file size in bytes
//      * mime_type: TEXT - image MIME type
//      * uploaded_by: UUID (nullable) - user who uploaded
//      * created_at, updated_at: TIMESTAMPTZ
//
// DATABASE FUNCTIONS USED:
// ============================================================
//
// 1. get_next_ai_discovery_items(p_limit INTEGER)
//    - Returns next batch of pending queue items
//    - Atomically updates status to 'processing'
//    - Uses FOR UPDATE SKIP LOCKED for concurrency
//    - Returns: id, canonical_product_id, product_name, upc, category, manufacturer, attempts
//
// 2. mark_discovery_complete(p_queue_id UUID, p_images_found INTEGER, 
//                             p_images_downloaded INTEGER, p_openai_response JSONB, 
//                             p_search_query TEXT)
//    - Marks queue item as completed or no_results
//    - Updates images_found, images_downloaded
//    - Stores AI response and search query
//    - Sets completed_at timestamp
//
// 3. mark_discovery_failed(p_queue_id UUID, p_error_message TEXT)
//    - Increments attempts counter
//    - Sets status to 'failed' if max_attempts reached, otherwise 'pending' for retry
//    - Stores error message and last_error_at timestamp
//
// PROCESSING FLOW:
// ============================================================
// 1. Get next 10 pending items from queue (get_next_ai_discovery_items)
// 2. For each item (in batches of 3 parallel):
//    a. Call Serper API to find 20 candidate images
//    b. Download top 10 images and convert to base64
//    c. Send to GPT-4o Vision API for intelligent selection
//    d. AI selects best 2-5 images and identifies primary
//    e. Save ONLY selected images to product_images with approval_status='approved'
//    f. Set is_primary=true for the AI-selected primary image
//    g. Trigger background downloads for approved images
//    h. Mark queue item as complete (mark_discovery_complete)
// 3. If any step fails:
//    - Call mark_discovery_failed to track error
//    - Will retry up to 3 times with exponential backoff
// 4. Return summary of processed items
//
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { discoverProductImages } from '../_shared/openai-client.ts'
import { selectProductImagesWithAI } from '../_shared/openai-vision-selector.ts'
import { uploadToCloudinary } from '../_shared/cloudinary-uploader.ts'

console.log('Function "process-ai-auto-approve-queue" initialized!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log(`\n🤖 [AI QUEUE PROCESSOR] ========================================`)
    console.log(`🤖 [AI QUEUE PROCESSOR] Starting AI auto-approve queue processing...`)
    console.log(`🤖 [AI QUEUE PROCESSOR] ========================================\n`)

    // Get next batch of items to process (calls get_next_ai_discovery_items)
    const { data: queueItems, error: queueError } = await supabase
      .rpc('get_next_ai_discovery_items', { p_limit: 10 })

    if (queueError) {
      console.error(`❌ [AI QUEUE PROCESSOR] Error fetching queue items:`, queueError)
      throw queueError
    }

    if (!queueItems || queueItems.length === 0) {
      console.log(`✓ [AI QUEUE PROCESSOR] No pending items in queue`)
      return new Response(
        JSON.stringify({ message: 'No items to process', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📋 [AI QUEUE PROCESSOR] Found ${queueItems.length} items to process`)

    // Process items in parallel for much faster execution
    const results: any[] = []
    const PARALLEL_ITEMS = 3 // Process 3 products simultaneously

    for (let i = 0; i < queueItems.length; i += PARALLEL_ITEMS) {
      const batch = queueItems.slice(i, i + PARALLEL_ITEMS)
      console.log(`\n⚡ Processing batch ${Math.floor(i / PARALLEL_ITEMS) + 1}/${Math.ceil(queueItems.length / PARALLEL_ITEMS)} (${batch.length} items)`)

      // Process this batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (item, batchIndex) => {
          const itemIndex = i + batchIndex + 1
          console.log(`\n[${itemIndex}/${queueItems.length}] 🤖 AI Auto-Approve: "${item.product_name}"`)

          try {
            // STEP 1: Discover candidate images using Serper
            console.log(`🔍 [${itemIndex}/${queueItems.length}] Step 1: Finding images with Serper...`)
            
            const aiResult = await discoverProductImages(item.product_name, {
              upc: item.upc,
              category: item.category,
              manufacturer: item.manufacturer,
              maxImages: 20, // Get more candidates for AI to choose from
            })

            console.log(`✅ [${itemIndex}/${queueItems.length}] Serper found ${aiResult.images.length} candidate images`)

            if (aiResult.images.length === 0) {
              console.log(`⚠️  [${itemIndex}/${queueItems.length}] No images found`)
              
              // Mark as no_results in queue (calls mark_discovery_complete)
              const { error: completeError } = await supabase.rpc('mark_discovery_complete', {
                p_queue_id: item.id,
                p_images_found: 0,
                p_images_downloaded: 0,
                p_openai_response: { reasoning: aiResult.reasoning, aiSelected: 0 },
                p_search_query: aiResult.searchQuery,
              })

              if (completeError) {
                console.error(`⚠️ Failed to mark discovery complete: ${completeError.message}`)
              }

              return {
                productName: item.product_name,
                success: true,
                imagesApproved: 0,
                noResults: true,
              }
            }

            // STEP 2: Use AI Vision to select best images
            console.log(`🤖 [${itemIndex}/${queueItems.length}] Step 2: AI analyzing images...`)
            
            const imageUrls = aiResult.images.map(img => img.url)
            let aiSelection
            
            try {
              aiSelection = await selectProductImagesWithAI(
                imageUrls,
                item.product_name,
                10 // Analyze top 10 images
              )
            } catch (aiError) {
              console.error(`❌ [${itemIndex}/${queueItems.length}] AI selection failed:`, aiError)
              
              // Mark as failed in queue (calls mark_discovery_failed)
              const { error: failError } = await supabase.rpc('mark_discovery_failed', {
                p_queue_id: item.id,
                p_error_message: `AI selection failed: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`,
              })

              if (failError) {
                console.error(`⚠️ Failed to mark as failed: ${failError.message}`)
              }

              return {
                productName: item.product_name,
                success: false,
                error: `AI selection failed: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`,
              }
            }

            console.log(`✅ [${itemIndex}/${queueItems.length}] AI selected ${aiSelection.selectedUrls.length} images`)
            console.log(`💡 [${itemIndex}/${queueItems.length}] AI reasoning: ${aiSelection.reasoning}`)

            // STEP 3: Save ONLY AI-selected images with 'approved' status
            console.log(`💾 [${itemIndex}/${queueItems.length}] Step 3: Saving ${aiSelection.selectedUrls.length} AI-approved images...`)

            const savedImages: any[] = []
            let primaryImageId: string | null = null

            for (let j = 0; j < aiSelection.selectedUrls.length; j++) {
              const imageUrl = aiSelection.selectedUrls[j]
              const isPrimary = imageUrl === aiSelection.primaryUrl

              try {
                // Insert into product_images table with approved status
                const { data: imageRecord, error: recordError } = await supabase
                  .from('product_images')
                  .insert({
                    canonical_product_id: item.canonical_product_id,
                    external_url: imageUrl,
                    storage_path: null, // Will be populated when downloaded
                    is_downloaded: false,
                    is_primary: isPrimary,
                    sort_order: j + 1,
                    variants: {},
                    formats: {},
                    width: 800,
                    height: 800,
                    file_size: 0,
                    mime_type: 'image/jpeg',
                    uploaded_by: null,
                    approval_status: 'approved', // AI-APPROVED - ready for marketplace
                  })
                  .select('id')
                  .single()

                if (recordError) {
                  console.error(`❌ Failed to create image record: ${recordError.message}`)
                  continue
                }

                console.log(`✅ Image ${j + 1} saved as APPROVED: ${imageRecord.id}${isPrimary ? ' (PRIMARY)' : ''}`)

                if (isPrimary) {
                  primaryImageId = imageRecord.id
                }

                savedImages.push({
                  id: imageRecord.id,
                  url: imageUrl,
                  isPrimary: isPrimary,
                })

                // STEP 4: Upload to Cloudinary directly
                console.log(`📥 [${itemIndex}/${queueItems.length}] Uploading image ${j + 1} to Cloudinary...`)
                
                const cloudinaryResult = await uploadToCloudinary(
                  imageUrl,
                  item.canonical_product_id,
                  j + 1
                )
                
                if (!cloudinaryResult.success) {
                  console.error(`❌ [${itemIndex}/${queueItems.length}] Cloudinary upload failed for image ${j + 1}: ${cloudinaryResult.error}`)
                } else {
                  console.log(`✅ [${itemIndex}/${queueItems.length}] Cloudinary upload complete for image ${j + 1}`)
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
                    console.error(`❌ [${itemIndex}/${queueItems.length}] Failed to update image record: ${updateError.message}`)
                  } else {
                    console.log(`✅ [${itemIndex}/${queueItems.length}] Image record updated with Cloudinary URLs`)
                  }
                }
              } catch (error) {
                console.error(`❌ Error saving image ${j + 1}:`, error)
                continue
              }
            }

            console.log(`✅ [${itemIndex}/${queueItems.length}] Success: ${savedImages.length}/${aiSelection.selectedUrls.length} images approved & saved`)

            // Update queue status to completed (calls mark_discovery_complete)
            const { error: completeError } = await supabase.rpc('mark_discovery_complete', {
              p_queue_id: item.id,
              p_images_found: aiResult.images.length,
              p_images_downloaded: savedImages.length,
              p_openai_response: {
                serperReasoning: aiResult.reasoning,
                aiReasoning: aiSelection.reasoning,
                savedImages,
                primaryImageId,
                aiSelected: aiSelection.selectedUrls.length,
              },
              p_search_query: aiResult.searchQuery,
            })

            if (completeError) {
              console.error(`⚠️ Failed to mark discovery complete: ${completeError.message}`)
            }

            return {
              productName: item.product_name,
              success: true,
              imagesApproved: savedImages.length,
            }
          } catch (error) {
            console.error(`❌ [${itemIndex}/${queueItems.length}] Failed:`, error)

            // Mark as failed and handle retry logic (calls mark_discovery_failed)
            try {
              const { error: failError } = await supabase.rpc('mark_discovery_failed', {
                p_queue_id: item.id,
                p_error_message: error instanceof Error ? error.message : 'Unknown error',
              })

              if (failError) {
                console.error(`⚠️ Failed to mark discovery as failed: ${failError.message}`)
              }
            } catch (rpcError) {
              console.error(`⚠️ RPC call failed:`, rpcError)
            }

            return {
              productName: item.product_name,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        })
      )

      results.push(...batchResults)

      // Small delay between batches
      if (i + PARALLEL_ITEMS < queueItems.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalApproved = results.reduce((sum, r) => sum + (r.imagesApproved || 0), 0)

    console.log(`\n📊 [AI QUEUE PROCESSOR] ========================================`)
    console.log(`📊 [AI QUEUE PROCESSOR] Batch Summary:`)
    console.log(`📊 [AI QUEUE PROCESSOR]   - Total processed: ${results.length}`)
    console.log(`📊 [AI QUEUE PROCESSOR]   - Successful: ${successful}`)
    console.log(`📊 [AI QUEUE PROCESSOR]   - Failed: ${failed}`)
    console.log(`📊 [AI QUEUE PROCESSOR]   - Total images approved: ${totalApproved}`)
    console.log(`📊 [AI QUEUE PROCESSOR] ========================================\n`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `AI auto-approved images for ${results.length} products`,
        data: {
          processed: results.length,
          successful,
          failed,
          totalImagesApproved: totalApproved,
          results,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`❌ [AI QUEUE PROCESSOR] Unexpected error:`, error)
    
    return new Response(
      JSON.stringify({ 
        error: 'AI queue processing failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

