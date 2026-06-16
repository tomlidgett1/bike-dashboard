// Vercel Cron: proactively refresh Lightspeed OAuth tokens before they expire.
// Runs every 20 minutes (see vercel.json). This is the SINGLE proactive refresher —
// the duplicate Supabase pg_cron job was removed (migration
// 20260617120000_fix_lightspeed_token_refresh_single_refresher.sql) because Lightspeed
// refresh tokens are single-use and rotating: two refreshers redeeming the same token
// made Lightspeed revoke the family and forced stores to reconnect.
//
// We refresh any connection whose token expires within REFRESH_WINDOW_MS. That window
// is wider than the cron interval so every token is refreshed at least one tick before
// it expires (a 10-min window with a 20-min interval could miss a 30-min token).
//
// The actual refresh + storage + race handling lives in refreshAccessToken(), which
// serialises refreshes per connection so this cron can never collide with an on-demand
// refresh (401 handler / pre-expiry check) triggered by a live request.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshAccessToken } from '@/lib/services/lightspeed/token-manager'

const REFRESH_WINDOW_MS = 25 * 60 * 1000 // cron interval (20m) + 5m safety buffer

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

    // Find connected accounts whose tokens expire within the refresh window.
    const refreshCutoff = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString()

    const { data: connections, error } = await supabase
      .from('lightspeed_connections')
      .select('user_id, token_expires_at')
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
        // Single serialised refresh path (handles rotation, locking and race recovery).
        const result = await refreshAccessToken(conn.user_id)
        if (result) {
          successCount++
        } else {
          // null = transient failure or connection marked expired/error inside the call.
          failCount++
        }
      } catch (err) {
        console.error(`[Lightspeed Cron] Error for ${conn.user_id}:`, err)
        failCount++
      }

      // Brief pause to avoid hammering Lightspeed across many connections.
      await sleep(200)
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
