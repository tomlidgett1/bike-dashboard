import { NextRequest, NextResponse } from 'next/server'
import {
  mapHiddenPickupSuggestionRow,
  pickupSuggestionToRow,
  type NestPickupSuggestion,
} from '@/lib/nest/pickup-suggestions'
import { createClient } from '@/lib/supabase/server'

async function requireStoreUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) } as const
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) {
    return {
      error: NextResponse.json({ error: 'Could not load store profile.' }, { status: 500 }),
    } as const
  }

  if (profile?.account_type !== 'bicycle_store' || profile?.bicycle_store !== true) {
    return { error: NextResponse.json({ error: 'Store access required.' }, { status: 403 }) } as const
  }

  return { supabase, user } as const
}

function parseSuggestion(value: unknown): NestPickupSuggestion | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const workorderId = String(row.workorderId ?? row.id ?? '').trim()
  if (!workorderId) return null

  return {
    id: workorderId,
    workorderId,
    customerId: String(row.customerId ?? '').trim(),
    customerName: String(row.customerName ?? '').trim(),
    mobile: typeof row.mobile === 'string' ? row.mobile.trim() || null : null,
    workSummary: String(row.workSummary ?? '').trim(),
    label: String(row.label ?? '').trim(),
    messageDraft: String(row.messageDraft ?? '').trim(),
    finishedAt: String(row.finishedAt ?? '').trim(),
    statusName: String(row.statusName ?? '').trim(),
    canSend: Boolean(row.canSend),
  }
}

export async function GET() {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const { data, error } = await auth.supabase
      .from('store_nest_hidden_pickup_suggestions')
      .select(
        'workorder_id, customer_id, customer_name, mobile, work_summary, label, message_draft, finished_at, status_name, can_send, hidden_at',
      )
      .eq('user_id', auth.user.id)
      .order('hidden_at', { ascending: false })

    if (error) {
      console.error('[nest-pickup-suggestions] GET failed:', error)
      return NextResponse.json({ error: 'Could not load hidden suggestions.' }, { status: 500 })
    }

    const suggestions = (data ?? []).map(mapHiddenPickupSuggestionRow)
    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('[nest-pickup-suggestions] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load hidden suggestions.' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const body = (await request.json()) as { action?: string; suggestion?: unknown; workorderId?: string }
    const action = String(body.action ?? '').trim()

    if (action === 'hide') {
      const suggestion = parseSuggestion(body.suggestion)
      if (!suggestion) {
        return NextResponse.json({ error: 'Invalid suggestion payload.' }, { status: 400 })
      }

      const { error } = await auth.supabase
        .from('store_nest_hidden_pickup_suggestions')
        .upsert(pickupSuggestionToRow(auth.user.id, suggestion), {
          onConflict: 'user_id,workorder_id',
        })

      if (error) {
        console.error('[nest-pickup-suggestions] hide failed:', error)
        return NextResponse.json({ error: 'Could not hide suggestion.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === 'restore') {
      const workorderId = String(body.workorderId ?? '').trim()
      if (!workorderId) {
        return NextResponse.json({ error: 'workorderId is required.' }, { status: 400 })
      }

      const { error } = await auth.supabase
        .from('store_nest_hidden_pickup_suggestions')
        .delete()
        .eq('user_id', auth.user.id)
        .eq('workorder_id', workorderId)

      if (error) {
        console.error('[nest-pickup-suggestions] restore failed:', error)
        return NextResponse.json({ error: 'Could not restore suggestion.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[nest-pickup-suggestions] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update suggestion.' },
      { status: 500 },
    )
  }
}
