// Setup type definitions
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { matchProductsBulk } from '../_shared/canonical-matching.ts'

console.log('Function "sync-from-cache" running!')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
  
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json()
  const categoryIds: string[] = body.categoryIds || []
  const itemIds: string[] = body.itemIds || []
  const useSSE = body.sse === true

  console.log(`🔄 [SYNC FROM CACHE] User: ${user.id}`)
  console.log(`📋 [SYNC FROM CACHE] Categories: ${categoryIds.length}, Items: ${itemIds.length}`)

  async function runSync(sendProgress: (data: any) => void) {
    const startTime = Date.now()

    await sendProgress({ phase: 'init', message: 'Starting sync from cached data...', progress: 0 })

    // Step 1: Fetch products from products_all_ls (already have the data!)
    console.log(`📦 [SYNC FROM CACHE] Fetching from products_all_ls table...`)
    
    let query = supabaseAdmin
      .from('products_all_ls')
      .select('*')
      .eq('user_id', user.id)

    if (categoryIds.length > 0) {
      query = query.in('category_id', categoryIds)
    } else if (itemIds.length > 0) {
      query = query.in('lightspeed_item_id', itemIds)
    }

    const { data: cachedProducts, error: fetchError } = await query

    if (fetchError || !cachedProducts || cachedProducts.length === 0) {
      console.error(`❌ [SYNC FROM CACHE] No products found:`, fetchError)
      throw new Error('No products found to sync')
    }

    console.log(`✅ [SYNC FROM CACHE] Found ${cachedProducts.length} products in cache`)

    await sendProgress({ 
      phase: 'prepare', 
      message: `Preparing ${cachedProducts.length} products for marketplace...`, 
      progress: 20,
      details: { productsFound: cachedProducts.length }
    })

    // Step 2: Transform cached products to products table format
    const productsToInsert = cachedProducts.map(product => ({
      user_id: user.id,
      lightspeed_item_id: product.lightspeed_item_id,
      lightspeed_category_id: product.category_id,
      lightspeed_account_id: product.lightspeed_account_id,
      system_sku: product.system_sku,
      description: product.description || 'Untitled',
      model_year: product.model_year,
      upc: product.upc,
      manufacturer_id: product.manufacturer_id,
      price: 0, // Will be fetched from Lightspeed if needed
      default_cost: 0,
      avg_cost: 0,
      qoh: product.total_qoh,
      sellable: product.total_sellable,
      reorder_point: 0,
      reorder_level: 0,
      images: [],
      primary_image_url: null,
      last_synced_at: new Date().toISOString(),
      is_active: true,
      is_archived: false,
    }))

    console.log(`📦 [SYNC FROM CACHE] Prepared ${productsToInsert.length} products`)

    await sendProgress({ 
      phase: 'matching', 
      message: `Matching ${productsToInsert.length} products to canonical catalog...`, 
      progress: 40,
      details: { productsToMatch: productsToInsert.length }
    })

    // Step 3: Match to canonical products
    const matchResults = await matchProductsBulk(supabaseAdmin, productsToInsert.map(p => ({
      upc: p.upc,
      systemSku: p.system_sku,
      description: p.description,
      modelYear: p.model_year,
      manufacturerId: p.manufacturer_id,
    })))

    console.log(`📊 [SYNC FROM CACHE] Match results:`, matchResults?.length || 0, 'results received')

    // Attach canonical IDs (with safety checks)
    if (matchResults && Array.isArray(matchResults)) {
      productsToInsert.forEach((product, idx) => {
        if (matchResults[idx] && matchResults[idx].canonicalProductId) {
          (product as any).canonical_product_id = matchResults[idx].canonicalProductId
        }
      })

      const matchedCount = matchResults.filter(r => r && r.canonicalProductId).length
      console.log(`✅ [SYNC FROM CACHE] Matched to ${matchedCount} canonical products`)
    } else {
      console.warn(`⚠️ [SYNC FROM CACHE] Match results not in expected format, continuing without canonical matches`)
    }

    await sendProgress({ 
      phase: 'insert', 
      message: 'Inserting products into marketplace database...', 
      progress: 60,
      details: { productsReady: productsToInsert.length }
    })

    // Step 4: Batch insert products
    const CHUNK_SIZE = 100
    let inserted = 0
    const chunks: any[][] = []
    
    for (let i = 0; i < productsToInsert.length; i += CHUNK_SIZE) {
      chunks.push(productsToInsert.slice(i, i + CHUNK_SIZE))
    }
    
    console.log(`💾 [SYNC FROM CACHE] Inserting ${chunks.length} chunks...`)
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      const { error: insertError } = await supabaseAdmin
        .from('products')
        .upsert(chunk, { onConflict: 'user_id,lightspeed_item_id' })
      
      if (insertError) {
        console.error(`❌ [SYNC FROM CACHE] Chunk ${i + 1} error:`, insertError)
      } else {
        inserted += chunk.length
        console.log(`✅ [SYNC FROM CACHE] Chunk ${i + 1}/${chunks.length}: ${inserted}/${productsToInsert.length}`)
      }
      
      await sendProgress({ 
        phase: 'insert', 
        message: `Saved ${inserted}/${productsToInsert.length} products...`, 
        progress: 60 + ((inserted / productsToInsert.length) * 35),
        details: { inserted, total: productsToInsert.length }
      })
    }

    // Step 5: Update category preferences
    console.log(`🔧 [SYNC FROM CACHE] Updating category preferences...`)
    
    const uniqueCategoryIds = [...new Set(cachedProducts.map(p => p.category_id).filter(Boolean))]
    
    for (const catId of uniqueCategoryIds) {
      const catProducts = cachedProducts.filter(p => p.category_id === catId)
      
      await supabaseAdmin
        .from('lightspeed_category_sync_preferences')
        .upsert({
          user_id: user.id,
          category_id: catId,
          category_name: `Category ${catId}`, // Simple name for now
          is_enabled: true,
          last_synced_at: new Date().toISOString(),
          product_count: catProducts.length,
        }, {
          onConflict: 'user_id,category_id',
        })
    }

    await sendProgress({ 
      phase: 'complete', 
      message: `Successfully synced ${inserted} products to marketplace!`, 
      progress: 100,
      details: { 
        itemsSynced: inserted,
        itemsWithStock: cachedProducts.length,
        totalItemsInCategories: cachedProducts.length,
        categoriesSynced: uniqueCategoryIds.length,
        duration: Date.now() - startTime
      }
    })

    return {
      itemsSynced: inserted,
      itemsWithStock: cachedProducts.length,
      totalItemsInCategories: cachedProducts.length,
      categoriesSynced: uniqueCategoryIds.length,
    }
  }

  // SSE Response
  if (useSSE) {
    const encoder = new TextEncoder()
    
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const result = await runSync(sendProgress)
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify(result)}\n\n`))
          controller.close()
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  // Regular JSON response
  try {
    const result = await runSync(() => {})
    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Sync failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

