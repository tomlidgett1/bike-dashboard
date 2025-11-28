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

    // Process each item directly (no HTTP calls, avoids JWT issues)
    const results: any[] = []

    for (let i = 0; i < queueItems.length; i++) {
      const item = queueItems[i]
      console.log(`\n[${i + 1}/${queueItems.length}] Processing: "${item.product_name}"`)

      try {
        // Call OpenAI to discover images
        console.log(`🤖 [${i + 1}/${queueItems.length}] Calling AI for image discovery...`)
        const aiResult = await discoverProductImages(item.product_name, {
          upc: item.upc,
          category: item.category,
          manufacturer: item.manufacturer,
          maxImages: 5,
        })

        console.log(`✅ [${i + 1}/${queueItems.length}] AI found ${aiResult.images.length} images`)

        if (aiResult.images.length === 0) {
          console.log(`⚠️  [${i + 1}/${queueItems.length}] No images found`)
          
          await supabase.rpc('mark_discovery_complete', {
            p_queue_id: item.id,
            p_images_found: 0,
            p_images_downloaded: 0,
            p_openai_response: { reasoning: aiResult.reasoning },
            p_search_query: aiResult.searchQuery,
          })

          results.push({
            productName: item.product_name,
            success: true,
            imagesDownloaded: 0,
            noResults: true,
          })
          continue
        }

        // Download and upload each image
        const uploadedImages: any[] = []
        let primaryImageId: string | null = null

        for (let j = 0; j < aiResult.images.length; j++) {
          const imageInfo = aiResult.images[j]
          console.log(`📥 [${i + 1}/${queueItems.length}] Downloading image ${j + 1}/${aiResult.images.length}: ${imageInfo.url}`)

          try {
            // Download image
            const downloadResult = await downloadImage(imageInfo.url)

            if (!downloadResult.success || !downloadResult.blob) {
              console.error(`❌ Download failed: ${downloadResult.error}`)
              continue
            }

            // Validate image
            const validation = await validateImage(downloadResult.blob)
            if (!validation.valid) {
              console.error(`❌ Validation failed: ${validation.error}`)
              continue
            }

            console.log(`✓ Image valid: ${validation.mimeType}, ${(validation.fileSize! / 1024).toFixed(0)}KB`)

            // Generate storage path
            const filename = generateFilename(imageInfo.url, j)
            const storagePath = `canonical/${item.canonical_product_id}/original/${filename}`

            console.log(`📤 Uploading to: ${storagePath}`)

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('product-images')
              .upload(storagePath, downloadResult.blob, {
                cacheControl: '31536000',
                contentType: validation.mimeType,
                upsert: false,
              })

            if (uploadError) {
              console.error(`❌ Upload failed: ${uploadError.message}`)
              continue
            }

            console.log(`✅ Uploaded successfully`)

            // Create product_images record
            const { data: imageRecord, error: recordError } = await supabase
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

            if (recordError) {
              console.error(`❌ Failed to create image record: ${recordError.message}`)
              continue
            }

            console.log(`✅ Image record created: ${imageRecord.id}`)

            if (imageInfo.isPrimary) {
              primaryImageId = imageRecord.id
              console.log(`⭐ Marked as primary image`)
            }

            uploadedImages.push({
              id: imageRecord.id,
              url: imageInfo.url,
              storagePath,
              isPrimary: imageInfo.isPrimary,
            })
          } catch (error) {
            console.error(`❌ Error processing image ${j + 1}:`, error)
            continue
          }
        }

        console.log(`✅ [${i + 1}/${queueItems.length}] Success: ${uploadedImages.length} images uploaded`)

        // Update queue status
        await supabase.rpc('mark_discovery_complete', {
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

        results.push({
          productName: item.product_name,
          success: true,
          imagesDownloaded: uploadedImages.length,
        })
      } catch (error) {
        console.error(`❌ [${i + 1}/${queueItems.length}] Failed:`, error)

        // Mark as failed and handle retry logic
        await supabase.rpc('mark_discovery_failed', {
          p_queue_id: item.id,
          p_error_message: error instanceof Error ? error.message : 'Unknown error',
        })

        results.push({
          productName: item.product_name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Rate limit: Wait 2 seconds between items to avoid overwhelming APIs
      if (i < queueItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
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

