/**
 * Sync All Lightspeed Products Edge Function
 * 
 * Fetches ALL items with positive stock from Lightspeed and stores them
 * in the products_all_ls table for analysis and reporting.
 * 
 * This function:
 * 1. Queries ItemShops with qoh>0 (paginates through all pages)
 * 2. Fetches item details using IN operator (batches of 100)
 * 3. Stores all products with stock in products_all_ls table
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const LIGHTSPEED_CONFIG = {
  API_BASE_URL: 'https://api.lightspeedapp.com/API/V3',
  TOKEN_URL: 'https://cloud.lightspeedapp.com/auth/oauth/token',
  MAX_RETRIES: 3,
  RATE_LIMIT_DELAY: 200, // ms between requests
}

Deno.serve(async (req) => {
  try {
    // Parse request body
    const { userId } = await req.json()
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Sync All LS Products] Starting sync for user: ${userId}`)

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user's Lightspeed connection and decrypt tokens
    const { data: connection, error: connError } = await supabase
      .from('lightspeed_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .single()

    if (connError || !connection) {
      console.error('[Sync All LS Products] No connection found:', connError)
      return new Response(
        JSON.stringify({ error: 'No active Lightspeed connection found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Decrypt access token
    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')!
    const accessToken = await decryptToken(connection.access_token_encrypted, encryptionKey)

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt access token' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get account ID from connection
    const accountId = connection.account_id
    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Account ID not found in connection' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Sync All LS Products] Account ID: ${accountId}`)

    // Generate sync batch ID
    const syncBatchId = crypto.randomUUID()

    // Step 1: Fetch ALL ItemShops with stock
    console.log('[Sync All LS Products] Step 1: Fetching all ItemShops with stock...')
    const allItemShops: any[] = []
    let currentUrl = `${LIGHTSPEED_CONFIG.API_BASE_URL}/Account/${accountId}/ItemShop.json?qoh=%3E,0&limit=100`
    let pageCount = 0
    const maxPages = 100

    while (currentUrl && pageCount < maxPages) {
      pageCount++
      console.log(`[Sync All LS Products] Fetching ItemShops page ${pageCount}...`)

      const response = await fetch(currentUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`ItemShop query failed: ${response.status} - ${error}`)
      }

      const data = await response.json()
      const itemShops = Array.isArray(data.ItemShop) ? data.ItemShop : (data.ItemShop ? [data.ItemShop] : [])
      
      allItemShops.push(...itemShops)
      console.log(`[Sync All LS Products] Page ${pageCount}: ${itemShops.length} records, total: ${allItemShops.length}`)

      // Check for next page
      currentUrl = data['@attributes']?.next || null
      if (!currentUrl || currentUrl === '') break

      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, LIGHTSPEED_CONFIG.RATE_LIMIT_DELAY))
    }

    console.log(`[Sync All LS Products] Step 1 complete: ${allItemShops.length} ItemShop records`)

    // Step 2: Extract unique item IDs
    const uniqueItemIds = [...new Set(allItemShops.map((shop: any) => shop.itemID))]
    console.log(`[Sync All LS Products] Step 2: Found ${uniqueItemIds.length} unique items`)

    // Step 3: Fetch item details in batches
    console.log('[Sync All LS Products] Step 3: Fetching item details...')
    const itemDetailsMap = new Map()
    const batchSize = 100

    for (let i = 0; i < uniqueItemIds.length; i += batchSize) {
      const batch = uniqueItemIds.slice(i, i + batchSize)
      const batchNum = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(uniqueItemIds.length / batchSize)
      
      console.log(`[Sync All LS Products] Fetching items batch ${batchNum}/${totalBatches} (${batch.length} items)`)

      // Note: load_relations with IN operator causes issues, fetch relations separately if needed
      const itemUrl = `${LIGHTSPEED_CONFIG.API_BASE_URL}/Account/${accountId}/Item.json?itemID=IN,[${batch.join(',')}]`
      
      const response = await fetch(itemUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        console.error(`[Sync All LS Products] Batch ${batchNum} failed: ${response.status}`)
        continue // Skip failed batches
      }

      const data = await response.json()
      const items = Array.isArray(data.Item) ? data.Item : (data.Item ? [data.Item] : [])
      
      // Log first item to see what data we're getting
      if (batchNum === 1 && items.length > 0) {
        const sampleItem = items[0]
        console.log(`[Sync All LS Products] Sample item structure:`, {
          itemID: sampleItem.itemID,
          hasImages: !!sampleItem.Images,
          hasPrices: !!sampleItem.Prices,
          imageCount: sampleItem.Images?.Image ? (Array.isArray(sampleItem.Images.Image) ? sampleItem.Images.Image.length : 1) : 0,
          priceCount: sampleItem.Prices?.ItemPrice ? (Array.isArray(sampleItem.Prices.ItemPrice) ? sampleItem.Prices.ItemPrice.length : 1) : 0,
        })
      }
      
      items.forEach((item: any) => {
        itemDetailsMap.set(item.itemID, item)
      })

      // Rate limit delay
      if (i + batchSize < uniqueItemIds.length) {
        await new Promise(resolve => setTimeout(resolve, LIGHTSPEED_CONFIG.RATE_LIMIT_DELAY))
      }
    }

    console.log(`[Sync All LS Products] Step 3 complete: ${itemDetailsMap.size} item details fetched`)

    // Step 4: Build products data and insert into database
    console.log('[Sync All LS Products] Step 4: Building product records...')
    
    // Group ItemShops by itemID
    const itemShopsGrouped = new Map()
    allItemShops.forEach((shop: any) => {
      if (!itemShopsGrouped.has(shop.itemID)) {
        itemShopsGrouped.set(shop.itemID, [])
      }
      itemShopsGrouped.get(shop.itemID).push(shop)
    })

    const productsToInsert = []

    for (const [itemId, shops] of itemShopsGrouped.entries()) {
      const itemDetails = itemDetailsMap.get(itemId)
      if (!itemDetails) continue

      // Find shopID:0 (total across all locations)
      const totalShop = shops.find((s: any) => s.shopID === '0')
      
      // Extract prices from Lightspeed Prices.ItemPrice array
      let price = 0
      let defaultCost = 0
      let avgCost = 0
      
      if (itemDetails.Prices && itemDetails.Prices.ItemPrice) {
        const prices = Array.isArray(itemDetails.Prices.ItemPrice) 
          ? itemDetails.Prices.ItemPrice 
          : [itemDetails.Prices.ItemPrice]
        
        // Find default price (useType='Default' or first price)
        const defaultPrice = prices.find((p: any) => p.useType === 'Default') || prices[0]
        if (defaultPrice && defaultPrice.amount) {
          price = parseFloat(defaultPrice.amount)
        }
      }
      
      // Extract costs
      if (itemDetails.defaultCost) {
        defaultCost = parseFloat(itemDetails.defaultCost)
      }
      if (itemDetails.avgCost) {
        avgCost = parseFloat(itemDetails.avgCost)
      }
      
      // Extract images from Lightspeed Images.Image array
      let images: any[] = []
      let primaryImageUrl: string | null = null
      
      if (itemDetails.Images && itemDetails.Images.Image) {
        const imageData = Array.isArray(itemDetails.Images.Image)
          ? itemDetails.Images.Image
          : [itemDetails.Images.Image]
        
        images = imageData.map((img: any) => ({
          url: img.baseImageURL,
          publicId: img.publicID,
          filename: img.filename,
        }))
        
        primaryImageUrl = images[0]?.url || null
      } else {
        // Log if no images found
        if (itemId === itemDetailsMap.keys().next().value) {
          console.log(`⚠️ [Sync All LS Products] First item has no Images data. Item structure:`, Object.keys(itemDetails))
        }
      }
      
      productsToInsert.push({
        user_id: userId,
        lightspeed_item_id: itemId,
        lightspeed_account_id: accountId,
        system_sku: itemDetails.systemSku || null,
        description: itemDetails.description || null,
        model_year: itemDetails.modelYear || null,
        upc: itemDetails.upc || null,
        category_id: itemDetails.categoryID || null,
        manufacturer_id: itemDetails.manufacturerID || null,
        price: price,
        default_cost: defaultCost,
        avg_cost: avgCost,
        images: images,
        primary_image_url: primaryImageUrl,
        stock_data: shops, // Store all shop records
        total_qoh: totalShop ? parseInt(totalShop.qoh) : 0,
        total_sellable: totalShop ? parseInt(totalShop.sellable) : 0,
        sync_batch_id: syncBatchId,
        last_synced_at: new Date().toISOString(),
      })
    }

    console.log(`[Sync All LS Products] Step 4: Prepared ${productsToInsert.length} products for insert`)

    // Step 5: Clear old data and insert new
    console.log('[Sync All LS Products] Step 5: Clearing old data...')
    const { error: deleteError } = await supabase
      .from('products_all_ls')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[Sync All LS Products] Delete error:', deleteError)
    }

    console.log('[Sync All LS Products] Step 5: Inserting new data...')
    
    // Insert in batches of 500
    const insertBatchSize = 500
    let insertedCount = 0

    for (let i = 0; i < productsToInsert.length; i += insertBatchSize) {
      const batch = productsToInsert.slice(i, i + insertBatchSize)
      
      const { error: insertError } = await supabase
        .from('products_all_ls')
        .insert(batch)

      if (insertError) {
        console.error(`[Sync All LS Products] Insert batch ${Math.floor(i/insertBatchSize) + 1} error:`, insertError)
      } else {
        insertedCount += batch.length
        console.log(`[Sync All LS Products] Inserted batch ${Math.floor(i/insertBatchSize) + 1}: ${batch.length} records`)
      }
    }

    console.log(`[Sync All LS Products] Complete: ${insertedCount} products synced`)

    return new Response(
      JSON.stringify({
        success: true,
        syncBatchId,
        pagesQueried: pageCount,
        totalRecords: allItemShops.length,
        uniqueItems: uniqueItemIds.length,
        itemsWithDetails: itemDetailsMap.size,
        productsInserted: insertedCount,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Sync All LS Products] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================================
// Helper Functions
// ============================================================

/**
 * Decrypt token using AES-256-GCM
 */
async function decryptToken(encryptedToken: string, encryptionKeyHex: string): Promise<string> {
  const parts = encryptedToken.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }

  const [ivHex, authTagHex, encrypted] = parts
  const iv = hexToBytes(ivHex)
  const authTag = hexToBytes(authTagHex)
  const key = hexToBytes(encryptionKeyHex)

  const encryptedData = hexToBytes(encrypted)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
      additionalData: new Uint8Array(0),
    },
    cryptoKey,
    new Uint8Array([...encryptedData, ...authTag])
  )

  return new TextDecoder().decode(decryptedBuffer)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

