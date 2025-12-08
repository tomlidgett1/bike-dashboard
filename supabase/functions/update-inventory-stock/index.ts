// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Token encryption/decryption functions
function decryptToken(encryptedToken: string, keyHex: string): Promise<string> {
  const parts = encryptedToken.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }

  const [ivHex, authTagHex, encrypted] = parts
  const key = hexToBytes(keyHex)
  const iv = hexToBytes(ivHex)
  const authTag = hexToBytes(authTagHex)
  const ciphertext = hexToBytes(encrypted)

  return crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  ).then(async (importedKey) => {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      importedKey,
      new Uint8Array([...ciphertext, ...authTag])
    )

    return new TextDecoder().decode(decrypted)
  })
}

async function encryptToken(token: string, keyHex: string): Promise<string> {
  const key = hexToBytes(keyHex)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  const importedKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
    },
    importedKey,
    new TextEncoder().encode(token)
  )
  
  const encryptedArray = new Uint8Array(encrypted)
  const ciphertext = encryptedArray.slice(0, -16)
  const authTag = encryptedArray.slice(-16)
  
  return `${bytesToHex(iv)}:${bytesToHex(authTag)}:${bytesToHex(ciphertext)}`
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Token refresh function
async function refreshAccessToken(
  userId: string,
  refreshToken: string,
  supabaseAdmin: any,
  encryptionKey: string
): Promise<string | null> {
  try {
    const clientId = Deno.env.get('LIGHTSPEED_CLIENT_ID')
    const clientSecret = Deno.env.get('LIGHTSPEED_CLIENT_SECRET')
    
    if (!clientId || !clientSecret) {
      console.error('Missing Lightspeed credentials')
      return null
    }
    
    console.log('🔄 Refreshing access token...')
    
    const response = await fetch('https://cloud.lightspeedapp.com/auth/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    
    if (!response.ok) {
      console.error(`❌ Token refresh failed: ${response.status}`)
      await supabaseAdmin
        .from('lightspeed_connections')
        .update({ 
          status: 'error',
          last_error: 'Token refresh failed'
        })
        .eq('user_id', userId)
      return null
    }
    
    const tokenData = await response.json()
    
    // Encrypt and store new tokens
    const encryptedAccessToken = await encryptToken(tokenData.access_token, encryptionKey)
    const encryptedRefreshToken = await encryptToken(tokenData.refresh_token, encryptionKey)
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    
    await supabaseAdmin
      .from('lightspeed_connections')
      .update({
        access_token_encrypted: encryptedAccessToken,
        refresh_token_encrypted: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        last_token_refresh_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    
    console.log('✅ Token refreshed successfully')
    return tokenData.access_token
  } catch (error) {
    console.error('❌ Error refreshing token:', error)
    return null
  }
}

console.log('Function "update-inventory-stock" up and running!')

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')!

    console.log('🔄 Starting scheduled inventory stock update...')

    // Get all active Lightspeed connections
    const { data: connections, error: connError } = await supabaseAdmin
      .from('lightspeed_connections')
      .select('user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, account_id, last_sync_at')
      .eq('status', 'connected')

    if (connError || !connections || connections.length === 0) {
      console.log('❌ No active connections found')
      return new Response(
        JSON.stringify({ message: 'No active connections' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Found ${connections.length} active connections`)

    let totalUpdated = 0

    // Process each user's inventory
    for (const connection of connections) {
      try {
        console.log(`\n👤 Processing user: ${connection.user_id}`)

        // Decrypt tokens
        let accessToken = await decryptToken(connection.access_token_encrypted, encryptionKey)
        const accountId = connection.account_id
        
        // Check if token is expired or about to expire (within 5 minutes)
        const tokenExpiresAt = new Date(connection.token_expires_at)
        const now = new Date()
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
        
        if (tokenExpiresAt <= fiveMinutesFromNow) {
          console.log('⏰ Token expired or expiring soon, refreshing...')
          const refreshToken = await decryptToken(connection.refresh_token_encrypted, encryptionKey)
          const newAccessToken = await refreshAccessToken(connection.user_id, refreshToken, supabaseAdmin, encryptionKey)
          
          if (newAccessToken) {
            accessToken = newAccessToken
          } else {
            console.error('❌ Failed to refresh token, skipping user')
            continue
          }
        }

        // Get enabled categories for this user
        const { data: categoryPrefs, error: catError } = await supabaseAdmin
          .from('lightspeed_category_sync_preferences')
          .select('category_id')
          .eq('user_id', connection.user_id)
          .eq('is_enabled', true)

        if (catError) {
          console.error(`❌ Error fetching category preferences:`, catError)
          continue
        }

        if (!categoryPrefs || categoryPrefs.length === 0) {
          console.log('ℹ️ No enabled categories found for this user, skipping')
          continue
        }

        const enabledCategoryIds = categoryPrefs.map(p => p.category_id)
        console.log(`✅ Found ${enabledCategoryIds.length} enabled categories`)

        // Get timestamp for changes since last sync (or last 15 minutes)
        const lastSyncTime = connection.last_sync_at 
          ? new Date(connection.last_sync_at)
          : new Date(Date.now() - 15 * 60 * 1000)
        
        const sinceTimestamp = lastSyncTime.toISOString().split('.')[0] + 'Z'
        
        console.log(`⏰ Checking inventory logs since: ${sinceTimestamp}`)

        // Fetch inventory logs for changes since last sync
        let inventoryLogs: any[] = []
        let nextUrl: string | null = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/InventoryLog.json?createTime=%3E%2C${encodeURIComponent(sinceTimestamp)}&limit=100`
        
        while (nextUrl && inventoryLogs.length < 1000) { // Safety limit
          let response = await fetch(nextUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          })

          // If 401, try refreshing token once and retry
          if (response.status === 401) {
            console.log('🔄 Got 401, attempting token refresh...')
            const refreshToken = await decryptToken(connection.refresh_token_encrypted, encryptionKey)
            const newAccessToken = await refreshAccessToken(connection.user_id, refreshToken, supabaseAdmin, encryptionKey)
            
            if (newAccessToken) {
              accessToken = newAccessToken
              // Retry the request with new token
              response = await fetch(nextUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                },
              })
            }
          }

          if (!response.ok) {
            console.error(`❌ Failed to fetch inventory logs: ${response.status}`)
            break
          }

          const data = await response.json()
          const logs = Array.isArray(data.InventoryLog) ? data.InventoryLog : data.InventoryLog ? [data.InventoryLog] : []
          
          inventoryLogs.push(...logs)
          console.log(`📊 Fetched ${logs.length} inventory logs (total: ${inventoryLogs.length})`)

          nextUrl = data['@attributes']?.next || null
          
          if (nextUrl) {
            await new Promise(resolve => setTimeout(resolve, 200)) // Rate limiting
          }
        }

        console.log(`✅ Total inventory logs fetched: ${inventoryLogs.length}`)

        if (inventoryLogs.length === 0) {
          console.log('ℹ️ No inventory changes detected')
          continue
        }

        // Group logs by itemID and calculate net changes
        const itemChanges = new Map<string, number>()
        
        inventoryLogs.forEach(log => {
          const itemId = log.itemID
          const qohChange = parseInt(log.qohChange || '0')
          const currentChange = itemChanges.get(itemId) || 0
          itemChanges.set(itemId, currentChange + qohChange)
        })

        console.log(`📦 ${itemChanges.size} unique items had stock changes`)

        // Fetch current ItemShop data for changed items
        const changedItemIds = Array.from(itemChanges.keys())
        const itemStockMap = new Map<string, { qoh: number; sellable: number }>()

        // Fetch ItemShops in batches
        for (let i = 0; i < changedItemIds.length; i += 100) {
          const batch = changedItemIds.slice(i, i + 100)
          const itemIdsParam = batch.join(',')
          
          let response = await fetch(
            `https://api.lightspeedapp.com/API/V3/Account/${accountId}/ItemShop.json?shopID=0&itemID=IN%2C%5B${itemIdsParam}%5D&limit=100`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
              },
            }
          )

          // If 401, try refreshing token once and retry
          if (response.status === 401) {
            console.log('🔄 Got 401 on ItemShop fetch, attempting token refresh...')
            const refreshToken = await decryptToken(connection.refresh_token_encrypted, encryptionKey)
            const newAccessToken = await refreshAccessToken(connection.user_id, refreshToken, supabaseAdmin, encryptionKey)
            
            if (newAccessToken) {
              accessToken = newAccessToken
              // Retry the request
              response = await fetch(
                `https://api.lightspeedapp.com/API/V3/Account/${accountId}/ItemShop.json?shopID=0&itemID=IN%2C%5B${itemIdsParam}%5D&limit=100`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                  },
                }
              )
            }
          }

          if (response.ok) {
            const data = await response.json()
            const itemShops = Array.isArray(data.ItemShop) ? data.ItemShop : data.ItemShop ? [data.ItemShop] : []
            
            itemShops.forEach((itemShop: any) => {
              itemStockMap.set(itemShop.itemID, {
                qoh: parseInt(itemShop.qoh || '0'),
                sellable: parseInt(itemShop.sellable || '0'),
              })
            })
          }

          await new Promise(resolve => setTimeout(resolve, 200))
        }

        console.log(`✅ Fetched current stock for ${itemStockMap.size} items`)

        // Update products in database (only for enabled categories)
        const updates: any[] = []
        
        for (const [itemId, stock] of itemStockMap) {
          const { data: product, error: productError } = await supabaseAdmin
            .from('products')
            .select('id, description, system_sku, custom_sku, qoh, is_active, lightspeed_item_id, lightspeed_category_id')
            .eq('user_id', connection.user_id)
            .eq('lightspeed_item_id', itemId)
            .single()

          if (productError) {
            console.log(`   ⚠️  Product not found for item ${itemId}:`, productError.message)
            continue
          }

          // Only update if product exists, stock changed, and category is enabled
          if (product && product.qoh !== stock.qoh) {
            // Check if this product's category is enabled for syncing
            if (!enabledCategoryIds.includes(product.lightspeed_category_id)) {
              console.log(`   ⏭️  Skipping product ${product.id} - category ${product.lightspeed_category_id} not enabled`)
              continue
            }

            updates.push({
              id: product.id,
              description: product.description,
              sku: product.system_sku || product.custom_sku,
              lightspeed_item_id: product.lightspeed_item_id,
              lightspeed_category_id: product.lightspeed_category_id,
              oldQoh: product.qoh,
              newQoh: stock.qoh,
              sellable: stock.sellable,
              oldIsActive: product.is_active,
              last_synced_at: new Date().toISOString(),
            })
          }
        }

        console.log(`📝 ${updates.length} products need stock updates`)

        // Apply updates in chunks and log changes
        const CHUNK_SIZE = 15
        let updated = 0

        for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
          const chunk = updates.slice(i, i + CHUNK_SIZE)
          
          for (const update of chunk) {
            const updateData: any = {
              qoh: update.newQoh,
              sellable: update.sellable,
              last_synced_at: update.last_synced_at,
            }
            
            let newIsActive = update.oldIsActive

            // Update is_active based on stock transitions
            if (update.oldQoh > 0 && update.newQoh === 0) {
              // Product went out of stock - deactivate
              updateData.is_active = false
              newIsActive = false
              console.log(`   📦 Product ${update.id}: Stock went from ${update.oldQoh} → 0, setting is_active = false`)
            } else if (update.oldQoh === 0 && update.newQoh > 0) {
              // Product came back in stock - activate
              updateData.is_active = true
              newIsActive = true
              console.log(`   📦 Product ${update.id}: Stock went from 0 → ${update.newQoh}, setting is_active = true`)
            }
            
            const { error: updateError } = await supabaseAdmin
              .from('products')
              .update(updateData)
              .eq('id', update.id)

            if (updateError) {
              console.error(`   ❌ Failed to update product ${update.id}:`, updateError.message)
              continue
            }

            updated++
            console.log(`   ✅ Updated product ${update.id}: ${update.oldQoh} → ${update.newQoh}`)
            
            // Log the stock change
            const { error: logError } = await supabaseAdmin
              .from('inventory_stock_update_logs')
              .insert({
                user_id: connection.user_id,
                product_id: update.id,
                product_name: update.description,
                product_sku: update.sku,
                lightspeed_item_id: update.lightspeed_item_id,
                lightspeed_category_id: update.lightspeed_category_id,
                old_qoh: update.oldQoh,
                new_qoh: update.newQoh,
                qoh_change: update.newQoh - update.oldQoh,
                old_sellable: update.sellable, // We don't track old sellable, so using current
                new_sellable: update.sellable,
                old_is_active: update.oldIsActive,
                new_is_active: newIsActive,
                sync_type: 'auto',
                sync_source: 'update-inventory-stock',
                metadata: {
                  batch_id: `${connection.user_id}-${new Date().toISOString()}`,
                  inventory_logs_count: inventoryLogs.length,
                }
              })

            if (logError) {
              console.error(`   ⚠️  Failed to log change for product ${update.id}:`, logError.message)
            }
          }

          await new Promise(resolve => setTimeout(resolve, 100))
        }

        console.log(`✅ Updated ${updated} products for user ${connection.user_id}`)
        totalUpdated += updated

        // Update last sync time
        await supabaseAdmin
          .from('lightspeed_connections')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('user_id', connection.user_id)

      } catch (error) {
        console.error(`❌ Error processing user ${connection.user_id}:`, error)
      }
    }

    console.log(`\n✅ Stock update complete: ${totalUpdated} products updated across ${connections.length} users`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Stock update complete',
        connectionsProcessed: connections.length,
        productsUpdated: totalUpdated,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('❌ Update error:', error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Update failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
