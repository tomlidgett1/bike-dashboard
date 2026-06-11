// Gmail PDF attachment discovery + download via the Composio tool router.

import { getOrCreateGmailComposioSession, type GmailComposioSessionExecutor } from '@/lib/composio/session'
import { listGmailConnections } from '@/lib/composio/gmail'

export interface GmailPdfAttachmentRef {
  attachment_id: string
  filename: string
  size_bytes: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Walk a Gmail message payload tree and collect PDF attachment references. */
export function listPdfAttachmentsFromPayload(payload: unknown): GmailPdfAttachmentRef[] {
  const found: GmailPdfAttachmentRef[] = []

  const walk = (part: unknown) => {
    if (!isRecord(part)) return
    const filename = typeof part.filename === 'string' ? part.filename.trim() : ''
    const mimeType = typeof part.mimeType === 'string' ? part.mimeType.toLowerCase() : ''
    const body = isRecord(part.body) ? part.body : undefined
    const attachmentId =
      typeof body?.attachmentId === 'string'
        ? body.attachmentId
        : typeof body?.attachment_id === 'string'
          ? body.attachment_id
          : ''

    const looksPdf = mimeType === 'application/pdf'
      || (mimeType === 'application/octet-stream' && filename.toLowerCase().endsWith('.pdf'))
      || filename.toLowerCase().endsWith('.pdf')

    if (attachmentId && looksPdf) {
      found.push({
        attachment_id: attachmentId,
        filename: filename || 'attachment.pdf',
        size_bytes: typeof body?.size === 'number' ? body.size : null,
      })
    }

    const parts = Array.isArray(part.parts) ? part.parts : []
    for (const child of parts) walk(child)
  }

  walk(payload)
  return found
}

function unwrapToolResult(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) return {}
  const data = result.data
  if (isRecord(data)) return data
  return result
}

function findFileCandidate(data: Record<string, unknown>): { url?: string; base64?: string } {
  // Composio file responses vary: {file: {s3url|uri|...}}, {s3url}, {attachment_data}...
  const queue: Array<Record<string, unknown>> = [data]
  while (queue.length) {
    const node = queue.shift()!
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && value.length > 0) {
        const lowered = key.toLowerCase()
        if (/^https?:\/\//.test(value) && /(s3|url|uri|link)/.test(lowered)) {
          return { url: value }
        }
        if (/(base64|data|content)/.test(lowered) && value.length > 512 && /^[A-Za-z0-9+/_-]+=*$/.test(value.slice(0, 256))) {
          return { base64: value }
        }
      }
      if (isRecord(value)) queue.push(value)
    }
  }
  return {}
}

/**
 * Download a Gmail attachment as a Buffer. Tries GMAIL_GET_ATTACHMENT via the
 * Composio tool router and handles both S3-url and inline base64 result shapes.
 */
export async function downloadGmailPdfAttachment(
  userId: string,
  args: {
    message_id: string
    attachment_id: string
    filename: string
    connected_account_id?: string
    composio_session_id?: string
  },
): Promise<Buffer> {
  const connections = await listGmailConnections(userId)
  const session: GmailComposioSessionExecutor = await getOrCreateGmailComposioSession({
    userId,
    sessionId: args.composio_session_id,
    connectedAccountIds: args.connected_account_id
      ? [args.connected_account_id]
      : connections.map((connection) => connection.id),
  })

  const result = await session.execute('GMAIL_GET_ATTACHMENT', {
    message_id: args.message_id,
    attachment_id: args.attachment_id,
    file_name: args.filename,
  }, args.connected_account_id)

  const data = unwrapToolResult(result)
  const candidate = findFileCandidate(data)

  if (candidate.url) {
    const response = await fetch(candidate.url)
    if (!response.ok) {
      throw new Error(`Could not download attachment file (${response.status}).`)
    }
    return Buffer.from(await response.arrayBuffer())
  }

  if (candidate.base64) {
    let base64 = candidate.base64.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    if (pad) base64 += '='.repeat(4 - pad)
    return Buffer.from(base64, 'base64')
  }

  throw new Error('Gmail attachment download returned no file content.')
}
