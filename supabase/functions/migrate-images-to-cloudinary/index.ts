// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log('Function "migrate-images-to-cloudinary" initialized!')

// ============================================================
// Migrate Images to Cloudinary
// Batch migrates existing images from Supabase Storage to Cloudinary
// Creates 3 variants: thumbnail (100px), card (400px), detail (800px)
// ============================================================

const BATCH_SIZE = 10
const MIN_IMAGE_SIZE = 5 * 1024 // 5KB minimum (lowered from 10KB)

// Realistic browser headers to avoid 403 blocks
const BROWSER_HEADERS_LIST = [
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  },
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Accept': 'image/webp,image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  },
  {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Accept': 'image/avif,image/webp,*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
  },
]

// Helper to download external image with retries and different headers
async function downloadExternalImage(url: string): Promise<{ data: Uint8Array; mimeType: string } | { error: string }> {
  const maxRetries = BROWSER_HEADERS_LIST.length
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const headers = BROWSER_HEADERS_LIST[attempt]
    
    // Add referer based on the URL's origin
    const urlObj = new URL(url)
    const headersWithReferer = {
      ...headers,
      'Referer': `${urlObj.origin}/`,
      'Origin': urlObj.origin,
    }
    
    try {
      console.log(`📥 [MIGRATE] Attempt ${attempt + 1}/${maxRetries} with ${headers['User-Agent'].substring(0, 30)}...`)
      
      const response = await fetch(url, {
        headers: headersWithReferer,
        redirect: 'follow',
      })

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        const data = new Uint8Array(arrayBuffer)
        const mimeType = response.headers.get('content-type') || 'image/jpeg'
        return { data, mimeType }
      }

      // If 403 or 401, try next header set
      if (response.status === 403 || response.status === 401) {
        console.log(`⚠️ [MIGRATE] Got ${response.status}, trying different headers...`)
        continue
      }

      // For other errors, don't retry
      return { error: `HTTP ${response.status}` }
      
    } catch (fetchError) {
      console.log(`⚠️ [MIGRATE] Fetch error on attempt ${attempt + 1}:`, fetchError)
      if (attempt === maxRetries - 1) {
        return { error: fetchError instanceof Error ? fetchError.message : 'Network error' }
      }
    }
    
    // Small delay between retries
    await new Promise(r => setTimeout(r, 500))
  }
  
  return { error: 'All download attempts failed (403 Forbidden)' }
}

interface MigrationResult {
  imageId: string
  success: boolean
  error?: string
}

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
    console.error('❌ [MIGRATE] Cloudinary credentials not configured')
    return new Response(
      JSON.stringify({ error: 'Cloudinary credentials not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = body.batchSize || BATCH_SIZE
    const migrateFromStorage = body.migrateFromStorage !== false // Default true
    const migrateFromExternal = body.migrateFromExternal === true // Default false (only approved)

    console.log(`\n🔄 [MIGRATE] ========================================`)
    console.log(`🔄 [MIGRATE] Starting Cloudinary migration`)
    console.log(`🔄 [MIGRATE] Batch size: ${batchSize}`)
    console.log(`🔄 [MIGRATE] Migrate from Storage: ${migrateFromStorage}`)
    console.log(`🔄 [MIGRATE] Migrate from External: ${migrateFromExternal}`)
    console.log(`🔄 [MIGRATE] ========================================\n`)

    // Find images that need migration
    // Priority: approved images with storage_path but no cloudinary_url
    // Skip images that have already failed multiple times
    const maxAttempts = body.maxAttempts || 3
    const skipFailed = body.skipFailed !== false // Default true - skip images that have failed before
    
    let query = supabase
      .from('product_images')
      .select('id, canonical_product_id, storage_path, external_url, sort_order, approval_status, migration_attempts, migration_error')
      .is('cloudinary_url', null)
      .limit(batchSize)

    if (skipFailed) {
      // Skip images that have hit max retry attempts
      query = query.or(`migration_attempts.is.null,migration_attempts.lt.${maxAttempts}`)
    }

    if (migrateFromStorage) {
      // Migrate images that have a storage_path (already in Supabase Storage)
      query = query.not('storage_path', 'is', null)
    } else if (migrateFromExternal) {
      // Migrate approved images with external_url
      query = query
        .not('external_url', 'is', null)
        .eq('approval_status', 'approved')
    }

    const { data: imagesToMigrate, error: queryError } = await query

    if (queryError) {
      console.error('❌ [MIGRATE] Query error:', queryError)
      return new Response(
        JSON.stringify({ error: 'Failed to query images', details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!imagesToMigrate || imagesToMigrate.length === 0) {
      console.log('✅ [MIGRATE] No images need migration')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No images need migration',
          migrated: 0,
          remaining: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📋 [MIGRATE] Found ${imagesToMigrate.length} images to migrate`)

    const results: MigrationResult[] = []

    for (const image of imagesToMigrate) {
      try {
        console.log(`\n📥 [MIGRATE] Processing image ${image.id}...`)

        let imageData: Uint8Array
        let mimeType = 'image/jpeg'

        if (image.storage_path) {
          // Download from Supabase Storage
          console.log(`📥 [MIGRATE] Downloading from Supabase Storage: ${image.storage_path}`)
          
          const { data: downloadData, error: downloadError } = await supabase.storage
            .from('product-images')
            .download(image.storage_path)

          if (downloadError || !downloadData) {
            console.error(`❌ [MIGRATE] Storage download failed:`, downloadError)
            results.push({ imageId: image.id, success: false, error: downloadError?.message || 'Download failed' })
            continue
          }

          const arrayBuffer = await downloadData.arrayBuffer()
          imageData = new Uint8Array(arrayBuffer)
          mimeType = downloadData.type || 'image/jpeg'
        } else if (image.external_url) {
          // Download from external URL with retries
          console.log(`📥 [MIGRATE] Downloading external: ${image.external_url}`)
          
          const downloadResult = await downloadExternalImage(image.external_url)
          
          if ('error' in downloadResult) {
            console.error(`❌ [MIGRATE] External download failed: ${downloadResult.error}`)
            
            // Mark as permanently failed to avoid retrying forever
            await supabase
              .from('product_images')
              .update({ 
                migration_error: downloadResult.error,
                migration_attempts: (image.migration_attempts || 0) + 1,
              })
              .eq('id', image.id)
            
            results.push({ imageId: image.id, success: false, error: `External download failed: ${downloadResult.error}` })
            continue
          }

          imageData = downloadResult.data
          mimeType = downloadResult.mimeType
        } else {
          console.error(`❌ [MIGRATE] No source URL for image ${image.id}`)
          results.push({ imageId: image.id, success: false, error: 'No source URL' })
          continue
        }

        const fileSize = imageData.length
        console.log(`✓ [MIGRATE] Downloaded ${(fileSize / 1024).toFixed(0)}KB (${mimeType})`)

        // Validate size
        if (fileSize < MIN_IMAGE_SIZE) {
          console.error(`❌ [MIGRATE] Image too small (${fileSize} bytes, min ${MIN_IMAGE_SIZE})`)
          
          // Mark as too small to skip in future
          await supabase
            .from('product_images')
            .update({ 
              migration_error: `Image too small: ${fileSize} bytes`,
              migration_attempts: (image.migration_attempts || 0) + 1,
            })
            .eq('id', image.id)
          
          results.push({ imageId: image.id, success: false, error: `Image too small (${fileSize} bytes)` })
          continue
        }

        if (fileSize > 10 * 1024 * 1024) {
          console.error(`❌ [MIGRATE] Image too large (${(fileSize / 1024 / 1024).toFixed(1)}MB)`)
          results.push({ imageId: image.id, success: false, error: 'Image too large' })
          continue
        }

        // Convert to base64
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < imageData.length; i += chunkSize) {
          const chunk = imageData.slice(i, i + chunkSize)
          binary += String.fromCharCode(...chunk)
        }
        const base64 = btoa(binary)
        const dataUri = `data:${mimeType};base64,${base64}`

        // Generate Cloudinary signature
        const timestamp = Math.floor(Date.now() / 1000)
        const publicId = `bike-marketplace/canonical/${image.canonical_product_id}/${timestamp}-${image.sort_order || 0}`
        
        // Variants: thumbnail (100px), mobile_card (200px), card (400px), detail (800px)
        // Card variants use ar_1:1,c_fill for square cropping (center gravity)
        const eagerTransforms = 'w_100,c_limit,q_auto:low,f_webp|w_200,ar_1:1,c_fill,q_auto:good,f_webp|w_400,ar_1:1,c_fill,q_auto:good,f_webp|w_800,c_limit,q_auto:best,f_webp'
        
        const signatureString = `eager=${eagerTransforms}&eager_async=false&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
        const encoder = new TextEncoder()
        const data = encoder.encode(signatureString)
        const hashBuffer = await crypto.subtle.digest('SHA-1', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        // Upload to Cloudinary
        console.log(`📤 [MIGRATE] Uploading to Cloudinary...`)
        
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
          console.error('❌ [MIGRATE] Cloudinary upload failed:', errorText)
          results.push({ imageId: image.id, success: false, error: 'Cloudinary upload failed' })
          continue
        }

        const cloudinaryResult = await cloudinaryResponse.json()
        console.log(`✅ [MIGRATE] Uploaded to Cloudinary: ${cloudinaryResult.public_id}`)

        // Build optimised URLs
        const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`
        const thumbnailUrl = `${baseUrl}/w_100,c_limit,q_auto:low,f_webp/${cloudinaryResult.public_id}`
        const mobileCardUrl = `${baseUrl}/w_200,ar_1:1,c_fill,q_auto:good,f_webp/${cloudinaryResult.public_id}`
        const cardUrl = `${baseUrl}/w_400,ar_1:1,c_fill,q_auto:good,f_webp/${cloudinaryResult.public_id}`
        const detailUrl = `${baseUrl}/w_800,c_limit,q_auto:best,f_webp/${cloudinaryResult.public_id}`

        // Update product_images record
        const { error: updateError } = await supabase
          .from('product_images')
          .update({
            cloudinary_url: cloudinaryResult.secure_url,
            cloudinary_public_id: cloudinaryResult.public_id,
            thumbnail_url: thumbnailUrl,
            mobile_card_url: mobileCardUrl,
            card_url: cardUrl,
            detail_url: detailUrl,
            is_downloaded: true,
            width: cloudinaryResult.width || 800,
            height: cloudinaryResult.height || 800,
            file_size: fileSize,
          })
          .eq('id', image.id)

        if (updateError) {
          console.error(`❌ [MIGRATE] Failed to update record:`, updateError)
          results.push({ imageId: image.id, success: false, error: updateError.message })
          continue
        }

        console.log(`✅ [MIGRATE] Image ${image.id} migrated successfully`)
        results.push({ imageId: image.id, success: true })

        // Pre-warm CDN
        fetch(cardUrl).catch(() => {})
        fetch(mobileCardUrl).catch(() => {})
        fetch(thumbnailUrl).catch(() => {})

      } catch (error) {
        console.error(`❌ [MIGRATE] Error processing image ${image.id}:`, error)
        results.push({ 
          imageId: image.id, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }

    // Get remaining count
    const { count: remainingCount } = await supabase
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .is('cloudinary_url', null)
      .not('storage_path', 'is', null)

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success)

    console.log(`\n📊 [MIGRATE] ========================================`)
    console.log(`📊 [MIGRATE] Migration Summary:`)
    console.log(`📊 [MIGRATE]   - Processed: ${results.length}`)
    console.log(`📊 [MIGRATE]   - Successful: ${successful}`)
    console.log(`📊 [MIGRATE]   - Failed: ${failed.length}`)
    console.log(`📊 [MIGRATE]   - Remaining: ${remainingCount || 0}`)
    console.log(`📊 [MIGRATE] ========================================\n`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migrated ${successful}/${results.length} images`,
        migrated: successful,
        failed: failed.length,
        remaining: remainingCount || 0,
        failures: failed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`❌ [MIGRATE] Unexpected error:`, error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Migration failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

