import type { GmailEmailsPayload, GmailSortOrder, GmailScanDepth } from '@/lib/types/genie-agent'
import { questionNeedsEmailBody } from '@/lib/composio/gmail-message-body'

export interface GmailAnswerReadiness {
  ready_to_answer: boolean
  gaps: string[]
  criteria_checked: string[]
}

export interface VerifyQuestionAnsweredInput {
  user_question: string
  draft_answer: string
  remaining_gaps: string[]
  /** Optional plan checks — each must appear satisfied in the draft or evidence cited. */
  success_criteria?: string[]
}

export interface VerifyQuestionAnsweredResult {
  ready: boolean
  status: 'ready' | 'not_ready'
  gaps: string[]
  instruction: string | null
}

function normaliseQuestion(text: string): string {
  return text.toLowerCase().replace(/[^\w\s@.+-]/g, ' ')
}

export function buildGmailAnswerReadiness(
  userQuestion: string | undefined,
  payload: GmailEmailsPayload,
  searchArgs: {
    sort_order?: GmailSortOrder
    scan_depth?: GmailScanDepth
  },
): GmailAnswerReadiness | null {
  if (!userQuestion?.trim()) return null

  const q = normaliseQuestion(userQuestion)
  const gaps: string[] = []
  const criteria_checked: string[] = []

  const wantsRep = /\b(rep|representative|account manager|sales contact)\b/.test(q)
  const wantsEarliest = /\b(first|earliest|oldest|original|initial)\b/.test(q)
  const wantsCount = /\b(how many|count|number of|total emails)\b/.test(q)
  const totalMatched = payload.scan_stats?.total_matched ?? payload.emails.length

  criteria_checked.push(`Matched emails: ${totalMatched}`)

  if (totalMatched === 0) {
    gaps.push('No emails matched this query — broaden the query or try an alternate search pass before answering.')
  }

  if (wantsCount && searchArgs.scan_depth !== 'full') {
    gaps.push('Volume/count questions need scan_depth full so scan_stats.total_matched covers all pages.')
  }

  if (wantsEarliest && searchArgs.scan_depth !== 'full') {
    gaps.push('Earliest/first questions need scan_depth full across the full matching history.')
  }

  if (wantsEarliest && searchArgs.sort_order !== 'oldest') {
    gaps.push('Earliest/first questions should use sort_order oldest after scanning.')
  }

  if (wantsRep) {
    criteria_checked.push('Rep/sales-contact question detected')
    const sales = payload.contact_analysis?.earliest_likely_sales_contact
    const earliest = payload.contact_analysis?.earliest_any_contact

    if (!sales) {
      gaps.push(
        'No likely sales/account contact identified — run exclude-support and sales-keyword search passes, then re-check contact_analysis.',
      )
    } else {
      criteria_checked.push(`Likely sales contact: ${sales.display_name ?? sales.from}`)
    }

    if (
      earliest
      && (earliest.role_hint === 'support' || earliest.role_hint === 'automated')
      && sales
      && earliest.email_address
      && sales.email_address
      && earliest.email_address !== sales.email_address
    ) {
      criteria_checked.push(
        `Earliest overall sender (${earliest.display_name ?? earliest.from}) is ${earliest.role_hint} — do not present as the rep`,
      )
    }
  }

  if (payload.scan_stats?.capped) {
    gaps.push('Scan hit the page cap — results may be incomplete; narrow the query or note uncertainty.')
  }

  if (questionNeedsEmailBody(userQuestion)) {
    criteria_checked.push('Body/content question detected')
    const bodies = payload.message_bodies ?? []
    const withText = bodies.filter((message) => message.body_text.trim().length > 80)
    if (withText.length === 0) {
      gaps.push(
        'Question needs email body content — call read_gmail_messages for the relevant message_ids from search results before answering.',
      )
    } else {
      criteria_checked.push(`Hydrated ${withText.length} message body/bodies for the agent`)
    }
  }

  return {
    ready_to_answer: gaps.length === 0,
    gaps,
    criteria_checked,
  }
}

export function verifyQuestionAnswered(input: VerifyQuestionAnsweredInput): VerifyQuestionAnsweredResult {
  const gaps = input.remaining_gaps.map((gap) => gap.trim()).filter(Boolean)
  const q = normaliseQuestion(input.user_question)
  const draft = input.draft_answer.toLowerCase()
  const draftTrimmed = input.draft_answer.trim()

  if (gaps.length > 0) {
    return notReady(
      gaps,
      'Do not send this draft to the user. Run additional tool calls to close every gap, then call verify_question_answered again with an empty remaining_gaps array.',
    )
  }

  if (draftTrimmed.length < 12) {
    return notReady(
      ['Draft answer is empty or too short to address the user question.'],
      'Expand the draft with concrete evidence from tool results before verifying again.',
    )
  }

  const criteriaGaps = checkSuccessCriteria(input.success_criteria, draftTrimmed)
  if (criteriaGaps.length > 0) {
    return notReady(
      criteriaGaps,
      'Close each answer_success_criteria gap with tool evidence, then verify again.',
    )
  }

  const structuralGaps = checkQuestionStructure(q, draftTrimmed)
  if (structuralGaps.length > 0) {
    return notReady(structuralGaps, 'Revise the draft so it directly answers what was asked, then verify again.')
  }

  if (
    questionNeedsEmailBody(input.user_question)
    && /\b(not visible in the gmail|can't confirm|cannot confirm the)\b/i.test(draft)
  ) {
    return notReady(
      ['Draft admits missing email body content — read_gmail_messages and cite the fault/details from body_text.'],
      'Fetch full message bodies for the relevant message_ids, then verify again.',
    )
  }

  const wantsRep = /\b(rep|representative|account manager|sales contact|first contact)\b/.test(q)
  if (wantsRep) {
    const namesWarrantyAsAnswer =
      /\b(first|earliest|our)\s+(apollo\s+)?rep\b/.test(q)
      && /\bwarranty@|\bwarranty\b/.test(draft)
      && !/\bnot the rep\b|\bwarranty is not\b|\bsupport inbox\b|\blikely sales\b|\bsales contact\b/i.test(
        input.draft_answer,
      )

    if (namesWarrantyAsAnswer) {
      return notReady(
        [
          'The draft treats warranty/support mail as the sales rep. Identify earliest_likely_sales_contact and distinguish it from warranty/support.',
        ],
        'Run the planned Gmail sales-contact search passes and answer with the earliest likely sales rep, noting warranty separately if relevant.',
      )
    }
  }

  if (wantsRep && draftTrimmed.length < 40) {
    return notReady(
      ['Draft answer is too thin for a rep/contact question — include name, email, first-seen date, and evidence.'],
      'Expand the draft with contact_analysis evidence before verifying again.',
    )
  }

  if (
    (wantsEarliest(q) || wantsCount(q))
    && !/\d{4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(draft)
    && totalHintMissing(draft, q)
  ) {
    return notReady(
      ['Draft lacks a concrete date or count from tool evidence.'],
      'Cite first_seen_label, scan_stats.total_matched, or specific email dates before answering.',
    )
  }

  return {
    ready: true,
    status: 'ready',
    gaps: [],
    instruction: null,
  }
}

function notReady(gaps: string[], instruction: string): VerifyQuestionAnsweredResult {
  return {
    ready: false,
    status: 'not_ready',
    gaps,
    instruction,
  }
}

function checkSuccessCriteria(criteria: string[] | undefined, draft: string): string[] {
  if (!criteria?.length) return []
  const lower = draft.toLowerCase()
  const gaps: string[] = []
  for (const criterion of criteria) {
    const c = criterion.trim()
    if (!c) continue
    const tokens = c
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3 && !STOPWORDS.has(t))
    if (tokens.length === 0) continue
    const matched = tokens.filter((t) => lower.includes(t)).length / tokens.length
    if (matched < 0.35) {
      gaps.push(`Plan criterion not clearly addressed in draft: "${c}"`)
    }
  }
  return gaps
}

const STOPWORDS = new Set([
  'with',
  'from',
  'that',
  'this',
  'name',
  'date',
  'email',
  'likely',
  'earliest',
  'sales',
  'total',
  'matched',
  'full',
  'scan',
  'the',
  'and',
  'for',
])

function checkQuestionStructure(q: string, draft: string): string[] {
  const gaps: string[] = []
  const lower = draft.toLowerCase()

  if (/\b(who|which person|what name)\b/.test(q) && !looksLikeNamedAnswer(draft)) {
    gaps.push('Question asks who — draft must name a person or clearly state none was found.')
  }

  if (/\b(when|what date|how old|how long ago)\b/.test(q) && !/\d{4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(draft)) {
    gaps.push('Question asks when — draft must include a specific date or timeframe from evidence.')
  }

  if (wantsCount(q) && !/\d+/.test(draft)) {
    gaps.push('Question asks for a count — draft must include a number from tool evidence.')
  }

  if (
    /\b(first|earliest|oldest|latest|most recent|newest)\b/.test(q)
    && !looksLikeNamedAnswer(draft)
    && !/\d{4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(draft)
    && !/\bnone found|no (matching|relevant)|could not find|not found in\b/i.test(draft)
  ) {
    gaps.push('Question asks for a first/earliest/latest item — draft must identify it with date or state clearly that none was found.')
  }

  if (
    /\b(i found|here are (some|the) emails|search returned|results show)\b/i.test(draft)
    && !looksLikeDirectAnswer(q, lower)
  ) {
    gaps.push('Draft summarises search results without answering the user question — convert evidence into a direct answer.')
  }

  if (/\b(not visible in the gmail|can't confirm|cannot confirm)\b/i.test(draft)) {
    gaps.push('Draft admits missing email body content — read message bodies before answering.')
  }

  return gaps
}

function looksLikeNamedAnswer(draft: string): boolean {
  return (
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(draft)
    || /\bfrom:\s*\S+@\S+/i.test(draft)
    || /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/i.test(draft)
  )
}

function looksLikeDirectAnswer(q: string, lower: string): boolean {
  if (/\b(who|which|what)\b/.test(q)) {
    return looksLikeNamedAnswer(lower) || /\bis\b|\bwas\b|\bare\b|\bwere\b/.test(lower)
  }
  if (wantsCount(q)) return /\d+/.test(lower)
  if (wantsEarliest(q)) {
    return looksLikeNamedAnswer(lower) || /\d{4}/.test(lower)
  }
  return true
}

function wantsEarliest(q: string): boolean {
  return /\b(first|earliest|oldest|original|initial)\b/.test(q)
}

function wantsCount(q: string): boolean {
  return /\b(how many|count|number of|total emails)\b/.test(q)
}

function totalHintMissing(draft: string, q: string): boolean {
  if (!wantsCount(q)) return false
  return !/\d+/.test(draft)
}
