import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getComposioClient } from '@/lib/composio/client'
import { getOrCreateGmailComposioSession } from '@/lib/composio/session'

export interface GmailPdfAttachmentInput {
  filename: string
  mimeType?: string
  buffer: Buffer
}

async function uploadPdfForGmailSend(attachment: GmailPdfAttachmentInput): Promise<{
  name: string
  mimetype: string
  s3key: string
}> {
  const composio = getComposioClient()
  const tempDir = await mkdtemp(join(tmpdir(), 'genie-pdf-'))
  const safeName = attachment.filename.trim() || 'genie-report.pdf'
  const tempPath = join(tempDir, safeName.replace(/[^\w.-]/g, '_'))
  try {
    await writeFile(tempPath, attachment.buffer)
    const uploaded = await composio.files.upload({
      file: tempPath,
      toolSlug: 'GMAIL_SEND_EMAIL',
      toolkitSlug: 'gmail',
    })
    return {
      name: uploaded.name || safeName,
      mimetype: uploaded.mimetype || attachment.mimeType || 'application/pdf',
      s3key: uploaded.s3key,
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function executeGmailSendEmailWithPdfAttachment(
  userId: string,
  args: {
    recipient_email: string
    subject: string
    body: string
    cc?: string[]
    bcc?: string[]
    is_html?: boolean
    connected_account_id?: string
    composio_session_id?: string
    attachment: GmailPdfAttachmentInput
  },
): Promise<Record<string, unknown>> {
  const uploaded = await uploadPdfForGmailSend(args.attachment)
  const session = await getOrCreateGmailComposioSession({
    userId,
    sessionId: args.composio_session_id,
    connectedAccountIds: args.connected_account_id ? [args.connected_account_id] : undefined,
  })
  const result = await session.execute(
    'GMAIL_SEND_EMAIL',
    {
      recipient_email: args.recipient_email,
      subject: args.subject,
      body: args.body,
      ...(args.cc?.length ? { cc: args.cc } : {}),
      ...(args.bcc?.length ? { bcc: args.bcc } : {}),
      ...(args.is_html ? { is_html: true } : {}),
      attachment: uploaded,
    },
    args.connected_account_id,
  )
  return result
}

export async function executeGmailCreateDraftWithPdfAttachment(
  userId: string,
  args: {
    recipient_email: string
    subject: string
    body: string
    cc?: string[]
    bcc?: string[]
    is_html?: boolean
    connected_account_id?: string
    composio_session_id?: string
    attachment: GmailPdfAttachmentInput
  },
): Promise<Record<string, unknown>> {
  const uploaded = await uploadPdfForGmailSend(args.attachment)
  const session = await getOrCreateGmailComposioSession({
    userId,
    sessionId: args.composio_session_id,
    connectedAccountIds: args.connected_account_id ? [args.connected_account_id] : undefined,
  })
  const result = await session.execute(
    'GMAIL_CREATE_EMAIL_DRAFT',
    {
      recipient_email: args.recipient_email,
      subject: args.subject,
      body: args.body,
      ...(args.cc?.length ? { cc: args.cc } : {}),
      ...(args.bcc?.length ? { bcc: args.bcc } : {}),
      ...(args.is_html ? { is_html: true } : {}),
      attachment: uploaded,
    },
    args.connected_account_id,
  )
  return result
}
