// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Token decryption functions (same as sync function)
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

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
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
      .select('user_id, access_token_encrypted, account_id, last_sync_at')
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

        // Decrypt access token
        const accessToken = await decryptToken(connection.access_token_encrypted, encryptionKey)
        const accountId = connection.account_id

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
          const response = await fetch(nextUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          })

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
          
          const response = await fetch(
            `https://api.lightspeedapp.com/API/V3/Account/${accountId}/ItemShop.json?shopID=0&itemID=IN%2C%5B${itemIdsParam}%5D&limit=100`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
              },
            }
          )

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

        // Update products in database (in chunks of 15)
        const updates: any[] = []
        
        for (const [itemId, stock] of itemStockMap) {
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('id, qoh')
            .eq('user_id', connection.user_id)
            .eq('lightspeed_item_id', itemId)
            .single()

          if (product && product.qoh !== stock.qoh) {
            updates.push({
              id: product.id,
              qoh: stock.qoh,
              sellable: stock.sellable,
              last_synced_at: new Date().toISOString(),
            })
          }
        }

        console.log(`📝 ${updates.length} products need stock updates`)

        // Apply updates in chunks
        const CHUNK_SIZE = 15
        let updated = 0

        for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
          const chunk = updates.slice(i, i + CHUNK_SIZE)
          
          for (const update of chunk) {
            const { error } = await supabaseAdmin
              .from('products')
              .update({
                qoh: update.qoh,
                sellable: update.sellable,
                last_synced_at: update.last_synced_at,
              })
              .eq('id', update.id)

            if (!error) {
              updated++
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

