/**
 * Genie Store Agent — streaming, READ + PROPOSE only.
 *
 * Authenticated to verified bicycle stores. Lets a store manage their storefront
 * conversationally: reorder/show/hide carousels, and apply percentage discounts.
 *
 * This endpoint NEVER mutates. Read tools fetch state; "propose_*" tools compute
 * an exact change and emit a `proposal` SSE event. The UI previews it and, on
 * Apply, POSTs the proposal to /api/genie/agent/apply which does the mutation.
 *
 * Thin SSE wrapper: the agent run itself lives in @/lib/genie/agent/execute and is
 * shared with the background-job path (no HTTP loopback).
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeGenieAgent } from '@/lib/genie/agent/execute'
import type { ComposioSessionIds, Message } from '@/lib/genie/agent/context'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json()
    const messages = Array.isArray(requestBody?.messages) ? requestBody.messages as Message[] : []
    const conversationId = typeof requestBody?.conversation_id === 'string'
      ? requestBody.conversation_id.trim()
      : null
    const composioSessionIds = (
      requestBody?.composio_session_ids &&
      typeof requestBody.composio_session_ids === 'object' &&
      !Array.isArray(requestBody.composio_session_ids)
    )
      ? requestBody.composio_session_ids as ComposioSessionIds
      : {}
    const supabase = await createClient()

    // ── Auth: verified bicycle store only ──────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Please log in.' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store, business_name')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return new Response(JSON.stringify({ error: 'Store agent is only available to verified bicycle stores.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }

    const storeName = profile.business_name || 'your store'
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false
        const emit = (data: object) => {
          if (streamClosed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch {
            streamClosed = true
          }
        }

        try {
          await executeGenieAgent({
            supabase,
            userId: user.id,
            storeName,
            messages,
            conversationId,
            composioSessionIds,
            emit,
            signal: request.signal,
          })
        } finally {
          if (!streamClosed) {
            streamClosed = true
            try {
              controller.close()
            } catch {
              // Client already disconnected.
            }
          }
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
