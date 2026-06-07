/** Decode Gmail API base64url-encoded MIME body parts. */
export function decodeGmailBase64Url(data: string): string {
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad) base64 += '='.repeat(4 - pad)
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function extractBodyTextFromPayload(payload: Record<string, unknown> | undefined): string {
  if (!payload) return ''

  const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : ''
  const body = payload.body as { data?: string } | undefined

  if (body?.data) {
    const decoded = decodeGmailBase64Url(body.data)
    if (mimeType.includes('text/html')) return stripHtmlToText(decoded)
    if (mimeType.includes('text/plain') || !mimeType) return decoded.trim()
  }

  const parts = payload.parts as Array<Record<string, unknown>> | undefined
  if (!parts?.length) return ''

  let htmlFallback = ''
  for (const part of parts) {
    const partMime = typeof part.mimeType === 'string' ? part.mimeType : ''
    const partBody = part.body as { data?: string } | undefined

    if (partMime === 'text/plain' && partBody?.data) {
      return decodeGmailBase64Url(partBody.data).trim()
    }

    if (partMime === 'text/html' && partBody?.data) {
      htmlFallback = decodeGmailBase64Url(partBody.data)
      continue
    }

    if (part.parts) {
      const nested = extractBodyTextFromPayload(part)
      if (nested) return nested
    }
  }

  return htmlFallback ? stripHtmlToText(htmlFallback) : ''
}

export function extractBodyTextFromMessage(raw: Record<string, unknown>): string {
  const direct = [
    raw.body_text,
    raw.bodyText,
    raw.text_plain,
    raw.textPlain,
    raw.messageText,
    raw.message_text,
  ]
  for (const value of direct) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const payload = raw.payload as Record<string, unknown> | undefined
  const fromPayload = extractBodyTextFromPayload(payload)
  if (fromPayload) return fromPayload

  const snippet = typeof raw.snippet === 'string' ? raw.snippet.trim() : ''
  return snippet
}

/** Questions that need message bodies, not just subjects/snippets. */
export function questionNeedsEmailBody(question: string | undefined): boolean {
  if (!question?.trim()) return false
  const q = question.toLowerCase()
  return /\b(issue|fault|defect|problem|warranty|what happened|what did|what was|what is|summar|summary|body|said|details|exact|why|broken|describe|explain|thread|reply|forward|content|complaint|recall|damage)\b/.test(q)
}
