import { NextRequest, NextResponse } from 'next/server'
import {
  executeGmailSendEmail,
  getGmailConnection,
  isComposioConfigured,
} from '@/lib/composio/gmail'
import { gmailReplySubject } from '@/lib/composio/gmail-response-suggestions'
import { requireStoreUser } from '@/lib/customer-inquiries/auth'
import { recordInquiryEvent } from '@/lib/customer-inquiries/events'
import { mapCustomerInquiryRow } from '@/lib/customer-inquiries/sync'
import { serializeInquiryDetail } from '@/lib/customer-inquiries/serialize'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireStoreUser()
    if ('error' in auth) return auth.error

    if (!isComposioConfigured()) {
      return NextResponse.json({ error: 'Gmail integration is not configured.' }, { status: 503 })
    }

    const { id } = await context.params
    const body = (await request.json()) as { draft_body?: string }
    const draftBody = String(body.draft_body ?? '').trim()

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
      return NextResponse.json({ error: 'This inquiry has already been sent.' }, { status: 409 })
    }

    if (inquiry.status === 'ignored') {
      return NextResponse.json({ error: 'Ignored inquiries cannot be sent.' }, { status: 409 })
    }

    const finalDraft = draftBody || inquiry.draft_body.trim()
    if (!finalDraft) {
      return NextResponse.json({ error: 'Draft body is required.' }, { status: 400 })
    }

    const connection =
      (inquiry.connected_account_id
        ? await getGmailConnection(auth.user.id, inquiry.connected_account_id)
        : null) ?? (await getGmailConnection(auth.user.id))

    if (!connection || connection.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Connect Gmail before sending replies.' }, { status: 409 })
    }

    const subject =
      inquiry.draft_subject?.trim() || gmailReplySubject(inquiry.subject)

    await executeGmailSendEmail(auth.user.id, {
      recipient_email: inquiry.sender_email,
      subject,
      body: finalDraft,
      connected_account_id: connection.id,
    })

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await auth.supabase
      .from('store_customer_inquiries')
      .update({
        status: 'sent',
        draft_body: finalDraft,
        draft_subject: subject,
        sent_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('*')
      .maybeSingle()

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Reply sent but inquiry status could not be saved.' }, { status: 500 })
    }

    await recordInquiryEvent(auth.supabase, {
      inquiryId: id,
      userId: auth.user.id,
      eventType: 'sent',
      payload: { recipient: inquiry.sender_email, subject },
    })

    return NextResponse.json({
      message: `Sent reply to ${inquiry.sender_email}.`,
      inquiry: serializeInquiryDetail(mapCustomerInquiryRow(updated as Record<string, unknown>)),
    })
  } catch (error) {
    console.error('[customer-inquiries/send] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not send reply.' },
      { status: 500 },
    )
  }
}
