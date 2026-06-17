import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isComposioConfigured } from '@/lib/composio/client'
import { getGmailConnection } from '@/lib/composio/gmail'
import { executeGmailCreateDraftWithPdfAttachment, executeGmailSendEmailWithPdfAttachment } from '@/lib/composio/gmail-send-attachment'

export const dynamic = 'force-dynamic'

const MAX_PDF_BYTES = 20 * 1024 * 1024

function decodePdfBase64(value: string): Buffer {
  const trimmed = value.trim()
  const base64 = trimmed.includes(',') ? trimmed.split(',').pop() ?? '' : trimmed
  if (!base64) {
    throw new Error('PDF payload is empty.')
  }
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) {
    throw new Error('PDF payload is empty.')
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error('PDF is too large to email (max 20 MB).')
  }
  return buffer
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Store agent is only available to verified bicycle stores.' },
        { status: 403 },
      )
    }

    if (!isComposioConfigured()) {
      return NextResponse.json({ error: 'Gmail integration is not configured.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const recipient = typeof body?.recipient_email === 'string' ? body.recipient_email.trim() : ''
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const emailBody = typeof body?.body === 'string' ? body.body.trim() : ''
    const filename = typeof body?.filename === 'string' ? body.filename.trim() : 'genie-report.pdf'
    const pdfBase64 = typeof body?.pdf_base64 === 'string' ? body.pdf_base64 : ''
    const action = body?.action === 'draft' ? 'draft' as const : 'send' as const
    const connectedAccountId =
      typeof body?.connected_account_id === 'string' ? body.connected_account_id.trim() : undefined

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient email is required.' }, { status: 400 })
    }
    if (!subject && !emailBody) {
      return NextResponse.json({ error: 'At least a subject or body is required.' }, { status: 400 })
    }
    if (!pdfBase64) {
      return NextResponse.json({ error: 'PDF attachment is required.' }, { status: 400 })
    }

    const connection = await getGmailConnection(user.id, connectedAccountId)
    if (!connection || connection.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Gmail is not connected. Connect Gmail from the Home page first.' },
        { status: 409 },
      )
    }

    const pdfBuffer = decodePdfBase64(pdfBase64)
    const executeArgs = {
      recipient_email: recipient,
      subject,
      body: emailBody,
      connected_account_id: connection.id,
      attachment: {
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      },
    }

    const result = action === 'draft'
      ? await executeGmailCreateDraftWithPdfAttachment(user.id, executeArgs)
      : await executeGmailSendEmailWithPdfAttachment(user.id, executeArgs)

    return NextResponse.json({
      ok: true,
      action,
      message: action === 'draft'
        ? `Draft created for ${recipient} with the PDF attached.`
        : `PDF sent to ${recipient}.`,
      provider_result: result,
    })
  } catch (error) {
    console.error('[genie/send-report-pdf] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not send the PDF email.' },
      { status: 502 },
    )
  }
}
