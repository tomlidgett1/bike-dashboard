import { NextRequest, NextResponse } from 'next/server'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import { banSenderEmail } from '@/lib/customer-inquiries/banned-senders'
import { recordInquiryEvent } from '@/lib/customer-inquiries/events'
import { mapCustomerInquiryRow } from '@/lib/customer-inquiries/sync'
import { serializeInquiryDetail } from '@/lib/customer-inquiries/serialize'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
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
      return NextResponse.json({ error: 'Sent inquiries cannot be banned.' }, { status: 409 })
    }

    await banSenderEmail(auth.supabase, {
      userId: auth.user.id,
      senderEmail: inquiry.sender_email,
      inquiryId: inquiry.id,
      note: inquiry.subject || null,
    })

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await auth.supabase
      .from('store_customer_inquiries')
      .update({
        status: 'ignored',
        ignored_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('*')
      .maybeSingle()

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Could not update inquiry.' }, { status: 500 })
    }

    await recordInquiryEvent(auth.supabase, {
      inquiryId: id,
      userId: auth.user.id,
      eventType: 'sender_banned',
      payload: { sender_email: inquiry.sender_email },
    })

    return NextResponse.json({
      message: `${inquiry.sender_email} will no longer appear as a customer enquiry.`,
      inquiry: serializeInquiryDetail(mapCustomerInquiryRow(updated as Record<string, unknown>)),
    })
  } catch (error) {
    console.error('[customer-inquiries/id/ban] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not ban sender.' },
      { status: 500 },
    )
  }
}
