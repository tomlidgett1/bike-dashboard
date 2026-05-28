/**
 * Lightspeed Sync SSE Proxy
 *
 * POST /api/lightspeed/sync-sse
 *
 * Proxies the Supabase edge function SSE stream through Next.js so the browser
 * receives real-time progress events without Supabase's API gateway buffering them.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return new Response(JSON.stringify({ error: 'No session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()

    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-from-cache`

    const upstream = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ ...body, sse: true }),
    })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => 'Sync request failed')
      return new Response(JSON.stringify({ error: errText }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!upstream.body) {
      return new Response(JSON.stringify({ error: 'No stream from edge function' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Pipe the upstream SSE stream directly to the client.
    // Next.js routes this through Node.js HTTP chunked transfer, which streams
    // progressively — no gateway buffering between browser and this server.
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('[sync-sse proxy] Error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
