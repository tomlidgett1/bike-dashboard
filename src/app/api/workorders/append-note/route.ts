import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed/lightspeed-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/workorders/append-note
 *
 * Body: { workorderId, text }
 *
 * Appends `text` to the BOTTOM of the workorder's customer-facing note in
 * Lightspeed (PUT is a partial update, so only the note changes). The
 * existing note is fetched first and preserved — never replaced.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const workorderId = String(body?.workorderId ?? '').trim()
    const text = String(body?.text ?? '').trim()

    if (!workorderId || !text) {
      return NextResponse.json({ error: 'workorderId and text are required' }, { status: 400 })
    }
    if (text.length > 8000) {
      return NextResponse.json({ error: 'Note is too long' }, { status: 400 })
    }

    const client = createLightspeedClient(user.id)
    const workorder = await client.getWorkorder(workorderId)
    if (!workorder) {
      return NextResponse.json({ error: 'Workorder not found in Lightspeed' }, { status: 404 })
    }

    const existingNote = String(workorder.note ?? '').trim()
    const newNote = existingNote ? `${existingNote}\n\n${text}` : text

    const updated = await client.updateWorkorder(workorderId, { note: newNote })

    return NextResponse.json({ ok: true, note: String(updated.note ?? newNote) })
  } catch (error) {
    console.error('[workorders/append-note] failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to update workorder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
