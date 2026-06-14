import { NextRequest, NextResponse } from 'next/server'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import { recordInquiryEvent } from '@/lib/customer-inquiries/events'
import { mapCustomerInquiryRow } from '@/lib/customer-inquiries/sync'
import { serializeInquiryDetail } from '@/lib/customer-inquiries/serialize'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function loadOwnedInquiry(auth: Awaited<ReturnType<typeof requireStoreUser>>, id: string) {
  if ('error' in auth) return { error: auth.error }

  const { data, error } = await auth.supabase
    .from('store_customer_inquiries')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) {
    return {
      error: NextResponse.json({ error: 'Could not load inquiry.' }, { status: 500 }),
    }
  }

  if (!data) {
    return { error: NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 }) }
  }

  return { inquiry: mapCustomerInquiryRow(data as Record<string, unknown>) }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireStoreUser()
    const { id } = await context.params
    const loaded = await loadOwnedInquiry(auth, id)
    if ('error' in loaded) return loaded.error

    return NextResponse.json({ inquiry: serializeInquiryDetail(loaded.inquiry) })
  } catch (error) {
    console.error('[customer-inquiries/id] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load inquiry.' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const { id } = await context.params
    const loaded = await loadOwnedInquiry(auth, id)
    if ('error' in loaded) return loaded.error

    const body = (await request.json()) as {
      draft_body?: string
      status?: string
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof body.draft_body === 'string') {
      updates.draft_body = body.draft_body.trim()
      if (loaded.inquiry.status === 'draft_ready' || loaded.inquiry.status === 'error') {
        updates.status = 'draft_ready'
      }
    }

    if (body.status === 'ignored') {
      if (loaded.inquiry.status === 'sent') {
        return NextResponse.json({ error: 'Sent inquiries cannot be ignored.' }, { status: 409 })
      }
      updates.status = 'ignored'
      updates.ignored_at = new Date().toISOString()
    }

    const { data, error } = await auth.supabase
      .from('store_customer_inquiries')
      .update(updates)
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('*')
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Could not update inquiry.' }, { status: 500 })
    }

    if (typeof body.draft_body === 'string') {
      await recordInquiryEvent(auth.supabase, {
        inquiryId: id,
        userId: auth.user.id,
        eventType: 'draft_edited',
        payload: { length: body.draft_body.trim().length },
      })
    }

    if (body.status === 'ignored') {
      await recordInquiryEvent(auth.supabase, {
        inquiryId: id,
        userId: auth.user.id,
        eventType: 'ignored',
      })
    }

    return NextResponse.json({
      inquiry: serializeInquiryDetail(mapCustomerInquiryRow(data as Record<string, unknown>)),
    })
  } catch (error) {
    console.error('[customer-inquiries/id] PATCH failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update inquiry.' },
      { status: 500 },
    )
  }
}
