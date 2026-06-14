import { NextRequest, NextResponse } from 'next/server'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import { mapCustomerInquiryRow, reviseInquiryDraft } from '@/lib/customer-inquiries/sync'
import { serializeInquiryDetail } from '@/lib/customer-inquiries/serialize'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const { id } = await context.params
    const body = (await request.json()) as {
      instruction?: string
      draft_body?: string
    }

    const instruction = body.instruction?.trim()
    const draftBody = body.draft_body?.trim()

    if (!instruction) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 })
    }

    if (!draftBody) {
      return NextResponse.json({ error: 'Draft body is required.' }, { status: 400 })
    }

    const { data, error } = await auth.supabase
      .from('store_customer_inquiries')
      .select('*')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Could not load inquiry.' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
    }

    const inquiry = mapCustomerInquiryRow(data as Record<string, unknown>)
    const updated = await reviseInquiryDraft(auth.supabase, inquiry, {
      instruction,
      draft_body: draftBody,
      storeName: auth.profile.business_name,
    })

    return NextResponse.json({ inquiry: serializeInquiryDetail(updated) })
  } catch (error) {
    console.error('[customer-inquiries/revise] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not revise draft.' },
      { status: 500 },
    )
  }
}
