// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { matchProductsBulk } from '../_shared/canonical-matching.ts'

// Token decryption
function decryptToken(encryptedToken: string, keyHex: string): Promise<string> {
  const parts = encryptedToken.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted token format')

  const [ivHex, authTagHex, encrypted] = parts
  const key = hexToBytes(keyHex)
  const iv = hexToBytes(ivHex)
  const authTag = hexToBytes(authTagHex)
  const ciphertext = hexToBytes(encrypted)

  return crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt'])
    .then(async (importedKey) => {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv, tagLength: 128 },
        importedKey,
        new Uint8Array([...ciphertext, ...authTag])
      )
      return new TextDecoder().decode(decrypted)
    })
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

console.log('Function "sync-lightspeed-inventory" running!')

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
  const syncAll = categoryIds.length === 0 && itemIds.length === 0

  console.log(`🔄 [SYNC START] User: ${user.id}`)
  console.log(`📋 [SYNC START] Categories: ${categoryIds.length > 0 ? categoryIds.join(', ') : 'none'}`)
  console.log(`📋 [SYNC START] Items: ${itemIds.length} item IDs provided`)
  console.log(`📋 [SYNC START] Sync All: ${syncAll}, SSE: ${useSSE}`)

  // Main sync logic as a function to reuse
  async function runSync(sendProgress: (data: any) => void) {
    const startTime = Date.now()
    
    // Create active sync record
    const { data: activeSync, error: syncError } = await supabaseAdmin
      .from('active_syncs')
      .upsert({
        user_id: user.id,
        status: 'running',
        phase: 'init',
        message: 'Starting sync...',
        progress: 0,
        category_ids: categoryIds,
        started_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single()
    
    // Wrap sendProgress to also update database
    const originalSendProgress = sendProgress
    const wrappedSendProgress = async (data: any) => {
      // Check if sync was cancelled
      const { data: currentSync } = await supabaseAdmin
        .from('active_syncs')
        .select('status')
        .eq('user_id', user.id)
        .single()
      
      if (currentSync?.status === 'cancelled') {
        throw new Error('Sync cancelled by user')
      }
      
      // Send to SSE stream
      originalSendProgress(data)
      
      // Update database
      await supabaseAdmin
        .from('active_syncs')
        .update({
          status: data.phase === 'complete' ? 'completed' : data.phase === 'error' ? 'failed' : 'running',
          phase: data.phase,
          message: data.message,
          progress: data.progress,
          items_with_stock: data.details?.itemsWithStock || data.details?.itemsToSync,
          items_synced: data.details?.itemsSynced || data.details?.inserted,
          updated_at: new Date().toISOString(),
          ...((data.phase === 'complete' || data.phase === 'error') ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('user_id', user.id)
    }
    
    sendProgress = wrappedSendProgress
    
    await sendProgress({ phase: 'init', message: 'Starting sync...', progress: 0 })

    // Get connection and decrypt token
    const { data: connection } = await supabaseAdmin
      .from('lightspeed_connections')
      .select('access_token_encrypted, account_id')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .single()

    if (!connection) throw new Error('No active connection')

    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')!
    const accessToken = await decryptToken(connection.access_token_encrypted, encryptionKey)
    let accountId = connection.account_id

    console.log(`🔑 [AUTH] Access token decrypted: ${accessToken ? 'Yes' : 'No'}`)
    console.log(`🏢 [ACCOUNT] Account ID from DB: ${accountId || 'NULL - will fetch from API'}`)

    // If accountId is missing, fetch it from Lightspeed API
    if (!accountId) {
      console.log(`🏢 [ACCOUNT] Fetching account ID from Lightspeed API...`)
      const accountRes = await fetch(`https://api.lightspeedapp.com/API/V3/Account.json`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      })
      
      if (accountRes.ok) {
        const accountData = await accountRes.json()
        accountId = accountData.Account?.accountID
        
        // Update connection with account ID
        if (accountId) {
          await supabaseAdmin
            .from('lightspeed_connections')
            .update({ account_id: accountId, account_name: accountData.Account?.name })
            .eq('user_id', user.id)
          
          console.log(`✅ [ACCOUNT] Fetched and saved account ID: ${accountId}`)
        }
      } else {
        throw new Error('Failed to fetch account ID from Lightspeed')
      }
    }

    if (!accountId) {
      throw new Error('Account ID is required but could not be determined')
    }

    console.log(`✅ [ACCOUNT] Using account ID: ${accountId}`)

    await sendProgress({ 
      phase: 'fetch_inventory', 
      message: 'Connecting to Lightspeed API...', 
      progress: 5,
      details: { accountId }
    })
    
    await sendProgress({ 
      phase: 'fetch_inventory', 
      message: 'Fetching current stock levels from Lightspeed...', 
      progress: 10 
    })

    // Fetch inventory and categories in parallel
    const fetchPromises: Promise<any>[] = []
    let inventoryProgress = 0
    let itemsProgress = 0

    // Fetch inventory with stock > 0
    fetchPromises.push(
      (async () => {
        const inventoryMap = new Map<string, any>()
        let nextUrl: string | null = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/ItemShop.json?shopID=0&qoh=%3E%2C0&limit=100`
        let page = 0
        
        while (nextUrl) {
          const res = await fetch(nextUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
          })
          if (res.status === 429) {
            await new Promise(r => setTimeout(r, 5000))
            continue
          }
          if (!res.ok) break
          
          const data = await res.json()
          const itemShops = Array.isArray(data.ItemShop) ? data.ItemShop : data.ItemShop ? [data.ItemShop] : []
          
          itemShops.forEach((is: any) => {
            const qoh = parseInt(is.qoh || '0')
            if (qoh > 0) {
              if (inventoryMap.has(is.itemID)) {
                const existing = inventoryMap.get(is.itemID)
                existing.qoh = (parseInt(existing.qoh) + qoh).toString()
              } else {
                inventoryMap.set(is.itemID, {
                  qoh: is.qoh,
                  sellable: is.sellable || '0',
                  reorderPoint: is.reorderPoint || '0',
                  reorderLevel: is.reorderLevel || '0',
                })
              }
            }
          })
          
          page++
          if (page % 10 === 0) {
            inventoryProgress = Math.min(inventoryMap.size / 50, 20)
            sendProgress({ 
              phase: 'fetch_inventory', 
              message: `Found ${inventoryMap.size} items with stock...`, 
              progress: 10 + inventoryProgress,
              details: { itemsWithStock: inventoryMap.size }
            })
          }
          
          nextUrl = data['@attributes']?.next || null
          // Minimal delay to avoid rate limits
          await new Promise(r => setTimeout(r, 10))
        }
        return { type: 'inventory', data: inventoryMap }
      })()
    )

    // Fetch items from categories
    if (itemIds.length > 0) {
      // Fetch specific items by ID using IN operator
      console.log(`📦 [FETCH] Fetching ${itemIds.length} specific items by ID`)
      
      fetchPromises.push(
        (async () => {
          const allItems: any[] = []
          const batchSize = 100
          
          for (let i = 0; i < itemIds.length; i += batchSize) {
            const batch = itemIds.slice(i, i + batchSize)
            console.log(`📦 [FETCH ITEMS] Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(itemIds.length/batchSize)}: ${batch.length} items`)
            console.log(`📦 [FETCH ITEMS] Item IDs: ${batch.join(', ')}`)
            
            const url = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?itemID=IN,[${batch.join(',')}]&archived=false`
            
            console.log(`📦 [FETCH ITEMS] URL: ${url}`)
            
            const res = await fetch(url, {
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
            })
            
            if (res.status === 429) {
              await new Promise(r => setTimeout(r, 5000))
              i -= batchSize // Retry this batch
              continue
            }
            
            if (!res.ok) {
              const errorBody = await res.text()
              console.error(`❌ [FETCH ITEMS] Batch failed: ${res.status}`)
              console.error(`❌ [FETCH ITEMS] Error response: ${errorBody}`)
              continue
            }
            
            const data = await res.json()
            const items = Array.isArray(data.Item) ? data.Item : data.Item ? [data.Item] : []
            allItems.push(...items)
            
            console.log(`✅ [FETCH ITEMS] Batch ${Math.floor(i/batchSize) + 1}: Got ${items.length} items`)
            
            await sendProgress({ 
              phase: 'fetch_items', 
              message: `Fetched ${allItems.length}/${itemIds.length} items...`, 
              progress: 20 + (allItems.length / itemIds.length) * 30,
              details: { itemsFetched: allItems.length, totalItems: itemIds.length }
            })
            
            await new Promise(r => setTimeout(r, 200))
          }
          
          console.log(`✅ [FETCH ITEMS] Total items fetched: ${allItems.length}`)
          return { type: 'items', data: allItems }
        })()
      )
    } else if (syncAll) {
      fetchPromises.push(
        (async () => {
          const allItems: any[] = []
          let nextUrl: string | null = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?archived=false&limit=100`
          let page = 0
          
          while (nextUrl) {
            const res = await fetch(nextUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
            })
            if (res.status === 429) {
              await new Promise(r => setTimeout(r, 5000))
              continue
            }
            if (!res.ok) break
            
            const data = await res.json()
            const items = Array.isArray(data.Item) ? data.Item : data.Item ? [data.Item] : []
            allItems.push(...items)
            
            page++
            if (page % 10 === 0) {
              sendProgress({ 
                phase: 'fetch_items', 
                message: `Fetched ${allItems.length} items...`, 
                progress: 30 + Math.min(allItems.length / 100, 20),
                details: { itemsFetched: allItems.length }
              })
            }
            
            nextUrl = data['@attributes']?.next || null
            // Minimal delay to avoid rate limits
            await new Promise(r => setTimeout(r, 10))
          }
          return { type: 'items', data: allItems }
        })()
      )
    } else {
      categoryIds.forEach((categoryId, idx) => {
        fetchPromises.push(
          (async () => {
            const categoryItems: any[] = []
            let nextUrl: string | null
            
            if (categoryId === '__UNCATEGORIZED__') {
              nextUrl = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?categoryID=0&archived=false&limit=100`
            } else {
              nextUrl = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?categoryID=${categoryId}&archived=false&limit=100`
            }
            
            while (nextUrl) {
              const res = await fetch(nextUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
              })
              if (res.status === 429) {
                await new Promise(r => setTimeout(r, 5000))
                continue
              }
              if (!res.ok) break
              
              const data = await res.json()
              const items = Array.isArray(data.Item) ? data.Item : data.Item ? [data.Item] : []
              
              if (categoryId === '__UNCATEGORIZED__') {
                const uncategorized = items.filter((item: any) => 
                  !item.categoryID || item.categoryID === '0' || item.categoryID === 0
                )
                categoryItems.push(...uncategorized)
              } else {
                categoryItems.push(...items)
              }
              
              nextUrl = data['@attributes']?.next || null
              // Minimal delay to avoid rate limits
              await new Promise(r => setTimeout(r, 10))
            }
            
            sendProgress({ 
              phase: 'fetch_category', 
              message: `Category ${idx + 1}/${categoryIds.length}: ${categoryItems.length} items`, 
              progress: 30 + ((idx + 1) / categoryIds.length) * 20,
              details: { categoryId, itemCount: categoryItems.length }
            })
            
            return { type: 'category', categoryId, data: categoryItems }
          })()
        )
      })
    }

    await sendProgress({ 
      phase: 'fetch_items', 
      message: `Fetching products from ${categoryIds.length > 0 ? categoryIds.length + ' categories' : 'Lightspeed'}...`, 
      progress: 25,
      details: { categoryCount: categoryIds.length, itemCount: itemIds.length }
    })

    // Wait for all parallel fetches
    const results = await Promise.all(fetchPromises)

    let allItems: any[] = []
    let inventoryMap = new Map<string, any>()

    results.forEach(result => {
      if (result.type === 'items') {
        allItems = result.data
      } else if (result.type === 'category') {
        allItems.push(...result.data)
      } else if (result.type === 'inventory') {
        inventoryMap = result.data
      }
    })

    await sendProgress({ 
      phase: 'filter', 
      message: `Filtering ${allItems.length} items by stock availability...`, 
      progress: 55,
      details: { totalItems: allItems.length, itemsWithStock: inventoryMap.size, itemsFiltered: allItems.length - inventoryMap.size }
    })

    // Filter items to only those with stock
    const itemsToSync = allItems.filter(item => inventoryMap.has(item.itemID))
    
    if (itemsToSync.length === 0) {
      await sendProgress({ phase: 'complete', message: 'No items with stock found', progress: 100 })
      return {
        totalItemsInCategories: allItems.length,
        itemsWithStock: 0,
        itemsSynced: 0,
        categoriesSynced: syncAll ? 'all' : categoryIds.length,
      }
    }

    // Attach inventory data
    itemsToSync.forEach(item => {
      item._inventory = inventoryMap.get(item.itemID)
    })

    await sendProgress({ 
      phase: 'fetch_categories', 
      message: `Fetching category information for ${itemsToSync.length} products...`, 
      progress: 60,
      details: { itemsToSync: itemsToSync.length, categoriesCount: categoryMap.size }
    })

    // Fetch categories for enrichment
    const categoriesRes = await fetch(
      `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Category.json?archived=false&limit=100`,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
    )

    const categoriesData = await categoriesRes.json()
    const categories = Array.isArray(categoriesData.Category) ? categoriesData.Category : []
    const categoryMap = new Map(categories.map((c: any) => [c.categoryID, { name: c.name, fullPath: c.fullPathName }]))

    await sendProgress({ 
      phase: 'prepare', 
      message: `Preparing ${itemsToSync.length} products for sync...`, 
      progress: 65 
    })

    // Prepare products
    const productsToInsert = itemsToSync.map(item => {
      const inventory = item._inventory
      const category = categoryMap.get(item.categoryID)
      const prices = item.Prices?.ItemPrice ? (Array.isArray(item.Prices.ItemPrice) ? item.Prices.ItemPrice : [item.Prices.ItemPrice]) : []
      const price = prices.find((p: any) => p.useType === 'Default')?.amount || '0'
      const images = item.Images?.Image ? (Array.isArray(item.Images.Image)
        ? item.Images.Image.map((img: any) => ({ url: img.baseImageURL, publicId: img.publicID }))
        : [{ url: item.Images.Image.baseImageURL, publicId: item.Images.Image.publicID }]) : []

      return {
        user_id: user.id,
        lightspeed_item_id: item.itemID,
        lightspeed_category_id: item.categoryID || null,
        lightspeed_account_id: accountId,
        system_sku: item.systemSku || null,
        custom_sku: item.customSku || null,
        description: item.description || 'Untitled',
        category_name: category?.name || null,
        full_category_path: category?.fullPath || null,
        price: parseFloat(price),
        default_cost: parseFloat(item.defaultCost || '0'),
        avg_cost: parseFloat(item.avgCost || '0'),
        qoh: parseInt(inventory?.qoh || '0'),
        sellable: parseInt(inventory?.sellable || '0'),
        reorder_point: parseInt(inventory?.reorderPoint || '0'),
        reorder_level: parseInt(inventory?.reorderLevel || '0'),
        model_year: item.modelYear || null,
        upc: item.upc || null,
        manufacturer_id: item.manufacturerID || null,
        images: images,
        primary_image_url: images[0]?.url || null,
        lightspeed_updated_at: item.timeStamp,
        last_synced_at: new Date().toISOString(),
        is_active: true,
        is_archived: false,
      }
    })

    await sendProgress({ 
      phase: 'matching', 
      message: `Matching ${productsToInsert.length} products to canonical catalog...`, 
      progress: 70,
      details: { productsToMatch: productsToInsert.length }
    })

    // CRITICAL: First, check which products already have canonical matches
    const existingLightspeedIds = productsToInsert.map(p => p.lightspeed_item_id).filter(Boolean)
    const { data: existingProducts } = await supabaseAdmin
      .from('products')
      .select('lightspeed_item_id, canonical_product_id')
      .eq('user_id', user.id)
      .in('lightspeed_item_id', existingLightspeedIds)
      .not('canonical_product_id', 'is', null)

    // Create map of lightspeed_item_id -> canonical_product_id for existing matches
    const existingMatches = new Map<string, string>()
    if (existingProducts) {
      existingProducts.forEach((p: any) => {
        if (p.canonical_product_id) {
          existingMatches.set(p.lightspeed_item_id, p.canonical_product_id)
        }
      })
    }

    console.log(`✅ [MATCHING] Preserving ${existingMatches.size} existing canonical matches`)

    // Only match NEW products (without existing canonical_product_id)
    const productsNeedingMatch = productsToInsert
      .map((p, index) => ({ ...p, originalIndex: index }))
      .filter(p => !existingMatches.has(p.lightspeed_item_id))

    console.log(`🔍 [MATCHING] Need to match ${productsNeedingMatch.length} new products`)

    let canonicalMap = new Map<number, string>()

    // Only run matching for products that need it
    if (productsNeedingMatch.length > 0) {
      canonicalMap = await matchProductsBulk(supabaseAdmin, productsNeedingMatch.map(p => ({
        user_id: p.user_id,
        upc: p.upc,
        description: p.description,
        category_name: p.category_name,
        manufacturer_name: p.manufacturer_id || null,
      })))

      // Map the results back to original indexes
      canonicalMap.forEach((canonicalId, matchIndex) => {
        const originalIndex = productsNeedingMatch[matchIndex]?.originalIndex
        if (originalIndex !== undefined) {
          canonicalMap.set(originalIndex, canonicalId)
        }
      })
    }

    // Add canonical_product_id to each product (preserve existing or use new match)
    productsToInsert.forEach((product, index) => {
      // First check if this product already has a canonical match
      if (product.lightspeed_item_id && existingMatches.has(product.lightspeed_item_id)) {
        product.canonical_product_id = existingMatches.get(product.lightspeed_item_id)
      } 
      // Otherwise use newly matched ID
      else {
        const canonicalId = canonicalMap.get(index)
        if (canonicalId) {
          product.canonical_product_id = canonicalId
        }
      }
    })

    const matchedCount = productsToInsert.filter(p => p.canonical_product_id).length
    console.log(`✅ [MATCHING] Final result: ${matchedCount}/${productsToInsert.length} products have canonical matches`)

    await sendProgress({ 
      phase: 'insert', 
      message: `Saving products to database...`, 
      progress: 75 
    })

    // Insert in parallel batches for much faster processing
    const CHUNK_SIZE = 100 // Larger chunks for faster processing
    const PARALLEL_BATCHES = 5 // Number of chunks to process in parallel
    
    let inserted = 0
    const chunks: any[][] = []
    
    // Split into chunks
    for (let i = 0; i < productsToInsert.length; i += CHUNK_SIZE) {
      chunks.push(productsToInsert.slice(i, i + CHUNK_SIZE))
    }
    
    // Process chunks in parallel batches
    for (let i = 0; i < chunks.length; i += PARALLEL_BATCHES) {
      const batch = chunks.slice(i, i + PARALLEL_BATCHES)
      
      // Insert all chunks in this batch in parallel
      await Promise.all(
        batch.map(chunk => 
          supabaseAdmin.from('products').upsert(chunk, { onConflict: 'user_id,lightspeed_item_id' })
        )
      )
      
      inserted += batch.reduce((sum, chunk) => sum + chunk.length, 0)
      
      const progress = 75 + ((i + batch.length) / chunks.length) * 25
      
      await sendProgress({ 
        phase: 'insert', 
        message: `Saved ${inserted}/${productsToInsert.length} products...`, 
        progress: Math.min(progress, 99),
        details: { inserted, total: productsToInsert.length }
      })
    }

    // Update connection and category preferences in parallel
    const finalUpdates: Promise<any>[] = [
      supabaseAdmin.from('lightspeed_connections').update({ last_sync_at: new Date().toISOString() }).eq('user_id', user.id)
    ]

    // Update category sync preferences in parallel
    if (!syncAll && categoryIds.length > 0) {
      categoryIds.forEach(categoryId => {
        let categoryProducts: any[]
        
        if (categoryId === '__UNCATEGORIZED__') {
          categoryProducts = productsToInsert.filter(p => 
            !p.lightspeed_category_id || 
            p.lightspeed_category_id === '0' || 
            p.lightspeed_category_id === 0
          )
        } else {
          categoryProducts = productsToInsert.filter(p => p.lightspeed_category_id === categoryId)
        }
        
        // Get category name from categoryMap
        const categoryInfo = categoryMap.get(categoryId)
        
        finalUpdates.push(
          supabaseAdmin
            .from('lightspeed_category_sync_preferences')
            .upsert({
              user_id: user.id,
              category_id: categoryId,
              category_name: categoryInfo?.name || `Category ${categoryId}`,
              is_enabled: true, // CRITICAL: Enable auto-updates for this category
              last_synced_at: new Date().toISOString(),
              product_count: categoryProducts.length,
            }, {
              onConflict: 'user_id,category_id',
            })
        )
      })
    }
    
    // Execute all final updates in parallel
    await Promise.all(finalUpdates)

    const duration = Date.now() - startTime

    // Ensure final progress is sent
    console.log(`✅ Sending complete message: ${inserted} products synced`)
    
    await sendProgress({ 
      phase: 'complete', 
      message: `Sync complete! ${inserted} products synced.`, 
      progress: 100,
      details: { 
        totalItemsInCategories: allItems.length,
        itemsWithStock: itemsToSync.length,
        itemsSynced: inserted,
        inserted: inserted,
        total: productsToInsert.length,
        categoriesSynced: syncAll ? 'all' : categoryIds.length,
        durationMs: duration
      }
    })
    
    // Small delay to ensure message is sent
    await new Promise(r => setTimeout(r, 100))

    return {
      totalItemsInCategories: allItems.length,
      itemsWithStock: itemsToSync.length,
      itemsSynced: inserted,
      categoriesSynced: syncAll ? 'all' : categoryIds.length,
      durationMs: duration
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
          sendProgress({ phase: 'done', result })
          controller.close()
        } catch (error) {
          // Update database on error
          await supabaseAdmin
            .from('active_syncs')
            .update({
              status: error instanceof Error && error.message.includes('cancelled') ? 'cancelled' : 'failed',
              message: error instanceof Error ? error.message : 'Sync failed',
              completed_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
          
          sendProgress({ 
            phase: 'error', 
            error: error instanceof Error ? error.message : 'Sync failed' 
          })
          controller.close()
        }
      }
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
    const result = await runSync((data) => console.log(JSON.stringify(data)))
    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Sync failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
