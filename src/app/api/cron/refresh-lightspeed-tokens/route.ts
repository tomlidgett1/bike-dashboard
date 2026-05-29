// Vercel Cron: proactively refresh Lightspeed OAuth tokens before they expire.
// Runs every 20 minutes — tokens last 1800 s (30 min), so this keeps them fresh.
// Only refreshes tokens that are within the expiry buffer window to avoid excessive
// refresh calls (Lightspeed will rate-limit/block clients that over-refresh).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken } from '@/lib/services/lightspeed/token-manager'
import { getLightspeedCredentials, LIGHTSPEED_CONFIG } from '@/lib/services/lightspeed/config'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export async function GET(request: NextRequest) {
  return handleRefresh(request)
}

export async function POST(request: NextRequest) {
  return handleRefresh(request)
}

async function handleRefresh(request: NextRequest) {
  // Verify Vercel cron secret (set CRON_SECRET in env to secure this endpoint)
  const cronSecret = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const supabase = getServiceClient()
    const { clientId, clientSecret } = getLightspeedCredentials()

    // Find all connected accounts whose tokens expire within the next 10 minutes
    const refreshCutoff = new Date(
      Date.now() + LIGHTSPEED_CONFIG.TOKEN_EXPIRY_BUFFER_MS + 5 * 60 * 1000
    ).toISOString()

    const { data: connections, error } = await supabase
      .from('lightspeed_connections')
      .select('user_id, refresh_token_encrypted, account_id, account_name, token_expires_at')
      .eq('status', 'connected')
      .not('refresh_token_encrypted', 'is', null)
      .lt('token_expires_at', refreshCutoff)

    if (error) {
      console.error('[Lightspeed Cron] DB error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({ success: true, refreshed: 0, message: 'No tokens due for refresh' })
    }

    console.log(`[Lightspeed Cron] ${connections.length} token(s) due for refresh`)

    let successCount = 0
    let failCount = 0

    for (const conn of connections) {
      try {
        const refreshToken = decryptToken(conn.refresh_token_encrypted)

        const response = await fetch(LIGHTSPEED_CONFIG.TOKEN_URL, {
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
          const body = await response.json().catch(() => ({}))
          console.error(`[Lightspeed Cron] Refresh failed for ${conn.user_id}:`, response.status, body)

          const newStatus =
            response.status === 400 || body.error === 'invalid_grant' ? 'expired' : 'error'

          await supabase
            .from('lightspeed_connections')
            .update({
              status: newStatus,
              last_error: `Token refresh failed: ${body.error || response.status}`,
              last_error_at: new Date().toISOString(),
            })
            .eq('user_id', conn.user_id)

          failCount++
          continue
        }

        const tokenData = await response.json()
        const encryptedAccessToken = encryptToken(tokenData.access_token)
        const encryptedRefreshToken = encryptToken(tokenData.refresh_token)
        const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

        const { error: updateError } = await supabase
          .from('lightspeed_connections')
          .update({
            access_token_encrypted: encryptedAccessToken,
            refresh_token_encrypted: encryptedRefreshToken,
            token_expires_at: tokenExpiresAt,
            last_token_refresh_at: new Date().toISOString(),
            status: 'connected',
            last_error: null,
            last_error_at: null,
          })
          .eq('user_id', conn.user_id)

        if (updateError) {
          console.error(`[Lightspeed Cron] Store failed for ${conn.user_id}:`, updateError)
          failCount++
          continue
        }

        console.log(`[Lightspeed Cron] Refreshed token for ${conn.user_id}, expires ${tokenExpiresAt}`)
        successCount++

        // Brief pause to avoid hammering Lightspeed
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err) {
        console.error(`[Lightspeed Cron] Error for ${conn.user_id}:`, err)
        failCount++
      }
    }

    return NextResponse.json({
      success: true,
      refreshed: successCount,
      failed: failCount,
    })
  } catch (err) {
    console.error('[Lightspeed Cron] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
