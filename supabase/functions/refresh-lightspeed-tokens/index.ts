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

console.log('Function "refresh-lightspeed-tokens" up and running!')

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
    const clientId = Deno.env.get('LIGHTSPEED_CLIENT_ID')!
    const clientSecret = Deno.env.get('LIGHTSPEED_CLIENT_SECRET')!

    console.log('🔄 Starting scheduled token refresh...')

    // Get all connected Lightspeed accounts
    const { data: connections, error: connError } = await supabaseAdmin
      .from('lightspeed_connections')
      .select('user_id, refresh_token_encrypted, account_id, account_name')
      .eq('status', 'connected')
      .not('refresh_token_encrypted', 'is', null)

    if (connError) {
      console.error('❌ Error fetching connections:', connError)
      throw connError
    }

    if (!connections || connections.length === 0) {
      console.log('ℹ️ No active connections found to refresh')
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No connections to refresh',
          refreshed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Found ${connections.length} connections to refresh`)

    let successCount = 0
    let failCount = 0
    const errors: Array<{ userId: string; error: string }> = []

    // Refresh each connection's tokens
    for (const connection of connections) {
      try {
        console.log(`\n🔄 Refreshing tokens for user: ${connection.user_id}`)

        // Decrypt refresh token
        const refreshToken = await decryptToken(connection.refresh_token_encrypted, encryptionKey)

        // Request new tokens
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
          const errorData = await response.json().catch(() => ({}))
          console.error(`❌ Token refresh failed for user ${connection.user_id}:`, response.status, errorData)
          
          // If refresh token is invalid, mark connection as expired
          if (response.status === 400 || errorData.error === 'invalid_grant') {
            await supabaseAdmin
              .from('lightspeed_connections')
              .update({ 
                status: 'expired',
                last_error: 'Refresh token invalid or expired. Please reconnect.',
                last_token_refresh_at: new Date().toISOString(),
              })
              .eq('user_id', connection.user_id)
            
            errors.push({ 
              userId: connection.user_id, 
              error: 'Refresh token expired' 
            })
          } else {
            await supabaseAdmin
              .from('lightspeed_connections')
              .update({ 
                status: 'error',
                last_error: `Token refresh failed: ${errorData.error || response.status}`,
                last_token_refresh_at: new Date().toISOString(),
              })
              .eq('user_id', connection.user_id)
            
            errors.push({ 
              userId: connection.user_id, 
              error: errorData.error || `HTTP ${response.status}` 
            })
          }
          
          failCount++
          continue
        }

        const tokenData = await response.json()

        // Encrypt new tokens
        const encryptedAccessToken = await encryptToken(tokenData.access_token, encryptionKey)
        const encryptedRefreshToken = await encryptToken(tokenData.refresh_token, encryptionKey)
        const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

        // Store new tokens
        const { error: updateError } = await supabaseAdmin
          .from('lightspeed_connections')
          .update({
            access_token_encrypted: encryptedAccessToken,
            refresh_token_encrypted: encryptedRefreshToken,
            token_expires_at: tokenExpiresAt,
            last_token_refresh_at: new Date().toISOString(),
            status: 'connected',
            last_error: null,
          })
          .eq('user_id', connection.user_id)

        if (updateError) {
          console.error(`❌ Failed to store tokens for user ${connection.user_id}:`, updateError)
          errors.push({ 
            userId: connection.user_id, 
            error: 'Failed to store tokens' 
          })
          failCount++
          continue
        }

        console.log(`✅ Successfully refreshed tokens for user ${connection.user_id}`)
        console.log(`   New token expires at: ${tokenExpiresAt}`)
        successCount++

        // Rate limiting - wait 200ms between requests
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (error) {
        console.error(`❌ Error refreshing tokens for user ${connection.user_id}:`, error)
        errors.push({ 
          userId: connection.user_id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })
        failCount++
      }
    }

    console.log(`\n✅ Token refresh complete:`)
    console.log(`   Successfully refreshed: ${successCount}`)
    console.log(`   Failed: ${failCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Token refresh complete',
        refreshed: successCount,
        failed: failCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('❌ Token refresh error:', error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Token refresh failed',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
