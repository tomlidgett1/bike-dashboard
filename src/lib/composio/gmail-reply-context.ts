/** Reply/compose intent, correspondent extraction, and sent-mail query helpers. */

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\w\s@.+-]/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface GmailCorrespondentHint {
  name?: string
  email?: string
}

export function isReplyOrComposeQuestion(question: string | undefined): boolean {
  if (!question?.trim()) return false
  const q = normalise(question)
  return (
    /\b(respond|reply|write back|get back to|follow up|follow-up|draft|compose|send|email them|message them)\b/.test(q)
    || (/\b(re:|fwd:|forward)\b/.test(q) && /\b(to|about|regarding)\b/.test(q))
  )
}

export function extractCorrespondentHint(question: string): GmailCorrespondentHint {
  const emailMatch = question.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i)
  if (emailMatch) return { email: emailMatch[1].toLowerCase() }

  const nameCapture = /([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?)/

  const patterns = [
    new RegExp(`\\b(?:respond|reply|write back|get back to|follow up with|email|message|contact|write to)\\s+(?:to\\s+)?${nameCapture.source}`, 'i'),
    new RegExp(`\\b(?:respond|reply)\\s+(?:to\\s+)?${nameCapture.source}`, 'i'),
    new RegExp(`\\bto\\s+${nameCapture.source}\\s+(?:about|re:|regarding|on)\\b`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = question.match(pattern)
    if (match?.[1]) {
      const raw = match[1].trim()
      const name = raw
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ')
      if (name.length >= 2) return { name }
    }
  }

  return {}
}

export function buildCorrespondenceQuery(hint: GmailCorrespondentHint): string | null {
  if (hint.email) {
    return `(from:${hint.email} OR to:${hint.email})`
  }
  if (hint.name) {
    const escaped = hint.name.replace(/"/g, '')
    return `(from:"${escaped}" OR to:"${escaped}" OR subject:"${escaped}")`
  }
  return null
}

export function buildSentContextQuery(hint: GmailCorrespondentHint): string | null {
  if (hint.email) {
    return `in:sent (to:${hint.email} OR ${hint.email})`
  }
  if (hint.name) {
    const escaped = hint.name.replace(/"/g, '')
    return `in:sent ("${escaped}" OR to:"${escaped}")`
  }
  return null
}

/** When the agent omits query, infer a useful Gmail search from the user question. */
export function buildImplicitGmailQuery(userQuestion: string | undefined): string | null {
  if (!userQuestion?.trim()) return null
  const hint = extractCorrespondentHint(userQuestion)
  const correspondence = buildCorrespondenceQuery(hint)
  if (correspondence) return correspondence
  if (isReplyOrComposeQuestion(userQuestion)) return 'in:anywhere newer_than:2y'
  return null
}

export interface GmailSuggestedSearchPass {
  purpose: string
  query: string
  scan_depth: 'quick' | 'full'
  sort_order: 'newest' | 'oldest'
}

/** Recommended follow-up searches for the agent (also used to auto-merge sent context). */
export function buildReplySearchPlan(userQuestion: string | undefined): GmailSuggestedSearchPass[] {
  if (!userQuestion?.trim() || !isReplyOrComposeQuestion(userQuestion)) return []

  const hint = extractCorrespondentHint(userQuestion)
  const passes: GmailSuggestedSearchPass[] = []

  const threadQuery = buildCorrespondenceQuery(hint)
  if (threadQuery) {
    passes.push({
      purpose: 'Incoming and outbound thread with this person (inbox + anywhere)',
      query: threadQuery,
      scan_depth: 'quick',
      sort_order: 'newest',
    })
  }

  const sentQuery = buildSentContextQuery(hint)
  if (sentQuery) {
    passes.push({
      purpose: 'Prior sent mail to this person — tone, promises, and what we already said',
      query: sentQuery,
      scan_depth: 'quick',
      sort_order: 'newest',
    })
  }

  if (hint.name && threadQuery) {
    passes.push({
      purpose: 'Broader name match if the person uses a different email address',
      query: `"${hint.name.replace(/"/g, '')}" newer_than:2y`,
      scan_depth: 'quick',
      sort_order: 'newest',
    })
  }

  return passes
}

export function questionNeedsSentContext(question: string | undefined): boolean {
  if (!question?.trim()) return false
  if (isReplyOrComposeQuestion(question)) return true
  const q = normalise(question)
  return /\b(what did we (say|write|send)|our last (email|message)|tone|follow up|correspondence|conversation with)\b/.test(q)
}
