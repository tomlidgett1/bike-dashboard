import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Note templates for workorder dictation. A template is free text describing
 * the shape the mechanic wants their notes in, e.g.
 *
 *   WORK DONE:
 *   - ...
 *   PARTS FITTED:
 *   - ...
 *
 * RLS also scopes rows to the owner; the explicit user_id filters are belt
 * and braces.
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('workorder_note_templates')
    .select('id, name, template, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[workorders/templates] list failed:', error)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = String(body?.name ?? '').trim()
  const template = String(body?.template ?? '').trim()
  const id = body?.id ? String(body.id) : null

  if (!name || !template) {
    return NextResponse.json({ error: 'Name and template are required' }, { status: 400 })
  }
  if (name.length > 80 || template.length > 4000) {
    return NextResponse.json({ error: 'Template is too long' }, { status: 400 })
  }

  if (id) {
    const { data, error } = await supabase
      .from('workorder_note_templates')
      .update({ name, template, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, template, created_at')
      .single()
    if (error) {
      console.error('[workorders/templates] update failed:', error)
      return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
    }
    return NextResponse.json({ template: data })
  }

  const { data, error } = await supabase
    .from('workorder_note_templates')
    .insert({ user_id: user.id, name, template })
    .select('id, name, template, created_at')
    .single()

  if (error) {
    console.error('[workorders/templates] create failed:', error)
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 })
  }
  return NextResponse.json({ template: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Template id is required' }, { status: 400 })

  const { error } = await supabase
    .from('workorder_note_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[workorders/templates] delete failed:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
