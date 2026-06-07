import type { GmailEmailPreview, GmailSenderSummary } from '@/lib/types/genie-agent'

export type GmailSenderRoleHint = 'sales' | 'support' | 'automated' | 'unknown'

export interface GmailContactCandidate {
  from: string
  display_name: string | null
  email_address: string | null
  role_hint: GmailSenderRoleHint
  first_seen_ms: number | null
  first_seen_label: string | null
  email_count: number
  sample_subjects: string[]
  sales_signal_score: number
}

export interface GmailContactAnalysis {
  earliest_likely_sales_contact: GmailContactCandidate | null
  earliest_any_contact: GmailContactCandidate | null
  likely_sales_contacts: GmailContactCandidate[]
  support_or_automated_senders: GmailContactCandidate[]
  analysis_notes: string[]
}

const SUPPORT_LOCAL_PARTS = new Set([
  'warranty',
  'support',
  'help',
  'helpdesk',
  'service',
  'customerservice',
  'customer-service',
  'care',
  'returns',
])

const AUTOMATED_LOCAL_PARTS = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'notifications',
  'notification',
  'mailer-daemon',
  'postmaster',
  'bounce',
  'automated',
  'system',
])

const SALES_SUBJECT_KEYWORDS = [
  'quote',
  'pricing',
  'price list',
  'pricelist',
  'order',
  'purchase',
  'purchase order',
  ' po ',
  'account',
  'rep',
  'representative',
  'dealer',
  'catalog',
  'catalogue',
  'stock',
  'allocation',
  'delivery',
  'invoice',
  'credit',
  'wholesale',
  'territory',
  'sales',
  'new season',
  'range review',
  'meeting',
  'intro',
  'introduction',
]

const PERSONAL_LOCAL_PART = /^[a-z][a-z0-9._-]*$/i

export function parseFromField(from: string): { display_name: string | null; email_address: string | null } {
  const angle = from.match(/^(.+?)\s*<([^>]+)>$/)
  if (angle) {
    const name = angle[1].replace(/^["']|["']$/g, '').trim()
    return {
      display_name: name || null,
      email_address: angle[2].trim().toLowerCase() || null,
    }
  }
  const trimmed = from.trim()
  if (trimmed.includes('@')) {
    return { display_name: null, email_address: trimmed.toLowerCase() }
  }
  return { display_name: trimmed || null, email_address: null }
}

function localPart(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at).toLowerCase() : null
}

function looksLikePersonalEmail(local: string | null, displayName: string | null): boolean {
  if (!local) return Boolean(displayName && displayName.includes(' '))
  if (SUPPORT_LOCAL_PARTS.has(local) || AUTOMATED_LOCAL_PARTS.has(local)) return false
  if (local.includes('.')) return true
  if (PERSONAL_LOCAL_PART.test(local) && local.length >= 3 && !/^(info|sales|orders|admin|team|office)$/.test(local)) {
    return true
  }
  return Boolean(displayName && /\s/.test(displayName.trim()))
}

function scoreSalesSignals(subjects: string[], snippets: string[]): number {
  const blob = [...subjects, ...snippets].join(' ').toLowerCase()
  let score = 0
  for (const keyword of SALES_SUBJECT_KEYWORDS) {
    if (blob.includes(keyword)) score += 2
  }
  return score
}

function classifyRole(
  email: string | null,
  displayName: string | null,
  salesScore: number,
): GmailSenderRoleHint {
  const local = localPart(email)
  if (local && AUTOMATED_LOCAL_PARTS.has(local)) return 'automated'
  if (local && SUPPORT_LOCAL_PARTS.has(local)) return 'support'
  if (local === 'info' || local === 'orders' || local === 'sales') {
    return salesScore >= 2 ? 'sales' : 'unknown'
  }
  if (looksLikePersonalEmail(local, displayName) && salesScore >= 2) return 'sales'
  if (looksLikePersonalEmail(local, displayName) && salesScore >= 0) return 'unknown'
  if (salesScore >= 4) return 'sales'
  return 'unknown'
}

interface SenderAggregate {
  from: string
  display_name: string | null
  email_address: string | null
  email_count: number
  first_seen_ms: number | null
  first_seen_label: string | null
  subjects: string[]
  snippets: string[]
}

function aggregateSenders(emails: GmailEmailPreview[]): SenderAggregate[] {
  const byFrom = new Map<string, SenderAggregate>()

  for (const email of emails) {
    const parsed = parseFromField(email.from)
    const existing = byFrom.get(email.from)
    const ms = email.internal_date_ms

    if (!existing) {
      byFrom.set(email.from, {
        from: email.from,
        display_name: parsed.display_name,
        email_address: parsed.email_address,
        email_count: 1,
        first_seen_ms: ms,
        first_seen_label: email.date_label,
        subjects: email.subject ? [email.subject] : [],
        snippets: email.snippet ? [email.snippet] : [],
      })
      continue
    }

    existing.email_count += 1
    if (email.subject && existing.subjects.length < 5) existing.subjects.push(email.subject)
    if (email.snippet && existing.snippets.length < 3) existing.snippets.push(email.snippet)
    if (ms != null && (existing.first_seen_ms == null || ms < existing.first_seen_ms)) {
      existing.first_seen_ms = ms
      existing.first_seen_label = email.date_label
    }
  }

  return [...byFrom.values()]
}

function toCandidate(row: SenderAggregate): GmailContactCandidate {
  const sales_signal_score = scoreSalesSignals(row.subjects, row.snippets)
  return {
    from: row.from,
    display_name: row.display_name,
    email_address: row.email_address,
    role_hint: classifyRole(row.email_address, row.display_name, sales_signal_score),
    first_seen_ms: row.first_seen_ms,
    first_seen_label: row.first_seen_label,
    email_count: row.email_count,
    sample_subjects: row.subjects.slice(0, 5),
    sales_signal_score,
  }
}

function sortByFirstSeen(candidates: GmailContactCandidate[]): GmailContactCandidate[] {
  return [...candidates].sort(
    (a, b) => (a.first_seen_ms ?? Number.MAX_SAFE_INTEGER) - (b.first_seen_ms ?? Number.MAX_SAFE_INTEGER),
  )
}

export function buildContactAnalysis(emails: GmailEmailPreview[]): GmailContactAnalysis | null {
  if (emails.length === 0) return null

  const candidates = aggregateSenders(emails).map(toCandidate)
  const byFirstSeen = sortByFirstSeen(candidates)

  const earliest_any_contact = byFirstSeen[0] ?? null

  const support_or_automated_senders = sortByFirstSeen(
    candidates.filter((c) => c.role_hint === 'support' || c.role_hint === 'automated'),
  )

  const likely_sales_contacts = sortByFirstSeen(
    candidates.filter((c) => {
      if (c.role_hint === 'sales') return true
      if (c.role_hint !== 'unknown') return false
      return looksLikePersonalEmail(localPart(c.email_address), c.display_name) && c.sales_signal_score >= 0
    }),
  )

  const earliest_likely_sales_contact =
    likely_sales_contacts.find((c) => c.role_hint === 'sales') ??
    likely_sales_contacts.find(
      (c) => c.role_hint === 'unknown' && c.sales_signal_score >= 2 && looksLikePersonalEmail(localPart(c.email_address), c.display_name),
    ) ??
    likely_sales_contacts[0] ??
    null

  const notes: string[] = []
  if (earliest_any_contact && earliest_likely_sales_contact && earliest_any_contact.from !== earliest_likely_sales_contact.from) {
    notes.push(
      `Earliest email overall is from ${earliest_any_contact.display_name ?? earliest_any_contact.from} (${earliest_any_contact.role_hint}) at ${earliest_any_contact.first_seen_label ?? 'unknown date'} — not necessarily a sales rep.`,
    )
  }
  if (earliest_likely_sales_contact) {
    notes.push(
      `Earliest likely sales/account contact: ${earliest_likely_sales_contact.display_name ?? earliest_likely_sales_contact.from} (${earliest_likely_sales_contact.first_seen_label ?? 'unknown date'}).`,
    )
  } else if (likely_sales_contacts.length === 0) {
    notes.push('No clear personal sales contacts found — try a follow-up search with sales keywords (quote, order, account, rep).')
  }

  return {
    earliest_likely_sales_contact,
    earliest_any_contact,
    likely_sales_contacts: likely_sales_contacts.slice(0, 15),
    support_or_automated_senders: support_or_automated_senders.slice(0, 10),
    analysis_notes: notes,
  }
}

/** Enrich sender summary rows with parsed identity (for agent tool output). */
export function enrichSenderSummary(
  summary: GmailSenderSummary[],
  emails: GmailEmailPreview[],
): Array<GmailSenderSummary & { display_name: string | null; email_address: string | null; role_hint: GmailSenderRoleHint; sample_subjects: string[] }> {
  const aggregates = new Map(aggregateSenders(emails).map((row) => [row.from, row]))

  return summary.map((row) => {
    const agg = aggregates.get(row.from)
    const parsed = parseFromField(row.from)
    const subjects = agg?.subjects ?? []
    const snippets = agg?.snippets ?? []
    const sales_signal_score = scoreSalesSignals(subjects, snippets)
    return {
      ...row,
      display_name: parsed.display_name,
      email_address: parsed.email_address,
      role_hint: classifyRole(parsed.email_address, parsed.display_name, sales_signal_score),
      sample_subjects: subjects.slice(0, 3),
    }
  })
}
