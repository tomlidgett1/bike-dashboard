// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { discoverProductImages } from '../_shared/openai-client.ts'
import { downloadImage, validateImage, generateFilename } from '../_shared/image-downloader.ts'

console.log('Function "process-image-discovery-queue" initialized!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log(`\n🔄 [QUEUE PROCESSOR] ========================================`)
    console.log(`🔄 [QUEUE PROCESSOR] Starting queue processing...`)
    console.log(`🔄 [QUEUE PROCESSOR] ========================================\n`)

    // Get next batch of items to process
    const { data: queueItems, error: queueError } = await supabase
      .rpc('get_next_ai_discovery_items', { p_limit: 10 })

    if (queueError) {
      console.error(`❌ [QUEUE PROCESSOR] Error fetching queue items:`, queueError)
      throw queueError
    }

    if (!queueItems || queueItems.length === 0) {
      console.log(`✓ [QUEUE PROCESSOR] No pending items in queue`)
      return new Response(
        JSON.stringify({ message: 'No items to process', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📋 [QUEUE PROCESSOR] Found ${queueItems.length} items to process`)

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
          console.log(`\n[${itemIndex}/${queueItems.length}] Processing: "${item.product_name}"`)

          try {
            // Call OpenAI to discover images
            console.log(`🤖 [${itemIndex}/${queueItems.length}] Calling AI for image discovery...`)
            const aiResult = await discoverProductImages(item.product_name, {
              upc: item.upc,
              category: item.category,
              manufacturer: item.manufacturer,
              maxImages: 5,
            })

            console.log(`✅ [${itemIndex}/${queueItems.length}] AI found ${aiResult.images.length} images`)

            if (aiResult.images.length === 0) {
              console.log(`⚠️  [${itemIndex}/${queueItems.length}] No images found`)
              
              const { error: completeError } = await supabase.rpc('mark_discovery_complete', {
                p_queue_id: item.id,
                p_images_found: 0,
                p_images_downloaded: 0,
                p_openai_response: { reasoning: aiResult.reasoning },
                p_search_query: aiResult.searchQuery,
              })

              if (completeError) {
                console.error(`⚠️ Failed to mark discovery complete: ${completeError.message}`)
              }

              return {
                productName: item.product_name,
                success: true,
                imagesDownloaded: 0,
                noResults: true,
              }
            }

            // Download and upload images IN PARALLEL for much faster processing
            console.log(`📥 [${itemIndex}/${queueItems.length}] Downloading ${aiResult.images.length} images in parallel...`)
            
            const imageUploadPromises = aiResult.images.map(async (imageInfo, j) => {
              try {
                // Download image
                const downloadResult = await downloadImage(imageInfo.url)

                if (!downloadResult || !downloadResult.success || !downloadResult.blob) {
                  console.error(`❌ Image ${j + 1} download failed: ${downloadResult?.error || 'Unknown error'}`)
                  return null
                }

                // Validate image
                const validation = await validateImage(downloadResult.blob)
                if (!validation || !validation.valid) {
                  console.error(`❌ Image ${j + 1} validation failed: ${validation?.error || 'Unknown error'}`)
                  return null
                }

                // Generate storage path
                const filename = generateFilename(imageInfo.url, j)
                const storagePath = `canonical/${item.canonical_product_id}/original/${filename}`

                // Upload to Supabase Storage
                const uploadResponse = await supabase.storage
                  .from('product-images')
                  .upload(storagePath, downloadResult.blob, {
                    cacheControl: '31536000',
                    contentType: validation.mimeType,
                    upsert: false,
                  })

                if (!uploadResponse || uploadResponse.error) {
                  console.error(`❌ Image ${j + 1} upload failed: ${uploadResponse?.error?.message || 'Unknown error'}`)
                  return null
                }

                // Create product_images record
                const imageRecordResponse = await supabase
                  .from('product_images')
                  .insert({
                    canonical_product_id: item.canonical_product_id,
                    storage_path: storagePath,
                    is_primary: imageInfo.isPrimary,
                    sort_order: imageInfo.rank,
                    variants: { original: storagePath },
                    formats: { jpeg: { original: storagePath } },
                    width: validation.width || 800,
                    height: validation.height || 800,
                    file_size: validation.fileSize,
                    mime_type: validation.mimeType,
                    uploaded_by: null,
                  })
                  .select('id')
                  .single()

                if (!imageRecordResponse || imageRecordResponse.error || !imageRecordResponse.data) {
                  console.error(`❌ Image ${j + 1} record creation failed`)
                  return null
                }

                console.log(`✅ Image ${j + 1} uploaded: ${imageRecordResponse.data.id}`)

                return {
                  id: imageRecordResponse.data.id,
                  url: imageInfo.url,
                  storagePath,
                  isPrimary: imageInfo.isPrimary,
                }
              } catch (error) {
                console.error(`❌ Error processing image ${j + 1}:`, error)
                return null
              }
            })

            // Wait for all images to upload in parallel
            const imageResults = await Promise.all(imageUploadPromises)
            const uploadedImages = imageResults.filter(img => img !== null)
            const primaryImageId = uploadedImages.find(img => img.isPrimary)?.id || null

            console.log(`✅ [${itemIndex}/${queueItems.length}] Success: ${uploadedImages.length}/${aiResult.images.length} images uploaded`)

            // Update queue status
            const { error: completeError } = await supabase.rpc('mark_discovery_complete', {
              p_queue_id: item.id,
              p_images_found: aiResult.images.length,
              p_images_downloaded: uploadedImages.length,
              p_openai_response: {
                reasoning: aiResult.reasoning,
                uploadedImages,
                primaryImageId,
              },
              p_search_query: aiResult.searchQuery,
            })

            if (completeError) {
              console.error(`⚠️ Failed to mark discovery complete: ${completeError.message}`)
            }

            return {
              productName: item.product_name,
              success: true,
              imagesDownloaded: uploadedImages.length,
            }
          } catch (error) {
            console.error(`❌ [${itemIndex}/${queueItems.length}] Failed:`, error)

            // Mark as failed and handle retry logic
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

      // Small delay between batches (not between individual items)
      if (i + PARALLEL_ITEMS < queueItems.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    console.log(`\n📊 [QUEUE PROCESSOR] ========================================`)
    console.log(`📊 [QUEUE PROCESSOR] Batch Summary:`)
    console.log(`📊 [QUEUE PROCESSOR]   - Total processed: ${results.length}`)
    console.log(`📊 [QUEUE PROCESSOR]   - Successful: ${successful}`)
    console.log(`📊 [QUEUE PROCESSOR]   - Failed: ${failed}`)
    console.log(`📊 [QUEUE PROCESSOR] ========================================\n`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} items`,
        data: {
          processed: results.length,
          successful,
          failed,
          results,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`❌ [QUEUE PROCESSOR] Unexpected error:`, error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Queue processing failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

