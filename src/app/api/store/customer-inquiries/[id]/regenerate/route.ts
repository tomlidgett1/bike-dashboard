import { NextResponse } from 'next/server'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import { mapCustomerInquiryRow, regenerateInquiryDraft } from '@/lib/customer-inquiries/sync'
import { serializeInquiryDetail } from '@/lib/customer-inquiries/serialize'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    const { id } = await context.params

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

    if (inquiry.status === 'sent') {
      return NextResponse.json({ error: 'Sent inquiries cannot be regenerated.' }, { status: 409 })
    }

    const updated = await regenerateInquiryDraft(
      auth.supabase,
      inquiry,
      auth.profile.business_name,
    )

    return NextResponse.json({ inquiry: serializeInquiryDetail(updated) })
  } catch (error) {
    console.error('[customer-inquiries/regenerate] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not regenerate draft.' },
      { status: 500 },
    )
  }
}
