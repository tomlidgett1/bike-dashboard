import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isComposioConfigured } from '../src/lib/composio/client'
import { extractEmailTimestampMs, inferGmailCardMode } from '../src/lib/composio/gmail'
import { buildContactAnalysis, parseFromField } from '../src/lib/composio/gmail-contact-analysis'
import {
  decodeGmailBase64Url,
  extractBodyTextFromPayload,
  questionNeedsEmailBody,
} from '../src/lib/composio/gmail-message-body'
import {
  buildImplicitGmailQuery,
  buildReplySearchPlan,
  extractCorrespondentHint,
  isReplyOrComposeQuestion,
  questionNeedsSentContext,
} from '../src/lib/composio/gmail-reply-context'
import { buildGmailAnswerReadiness, verifyQuestionAnswered } from '../src/lib/genie/answer-verification'
import type { GmailEmailPreview, GmailEmailsPayload } from '../src/lib/types/genie-agent'

const root = process.cwd()
const agentRouteSource = readFileSync(join(root, 'src/app/api/genie/agent/route.ts'), 'utf8')
const homeV2ChatSource = readFileSync(join(root, 'src/app/settings/store/homev2/homev2-chat.tsx'), 'utf8')
const applyRouteSource = readFileSync(join(root, 'src/app/api/genie/agent/apply/route.ts'), 'utf8')
const toolkitSource = readFileSync(join(root, 'src/lib/composio/toolkit.ts'), 'utf8')
const sessionSource = readFileSync(join(root, 'src/lib/composio/session.ts'), 'utf8')
const gmailSource = readFileSync(join(root, 'src/lib/composio/gmail.ts'), 'utf8')
const composioStatusSource = readFileSync(join(root, 'src/app/api/composio/status/route.ts'), 'utf8')
const homeV2GmailSuggestionsSource = readFileSync(join(root, 'src/app/api/store/homev2-gmail-suggestions/route.ts'), 'utf8')
const gmailConnectCardSource = readFileSync(join(root, 'src/components/genie/gmail-connect-card.tsx'), 'utf8')
const gmailEmailActionCardSource = readFileSync(join(root, 'src/components/genie/gmail-email-action-card.tsx'), 'utf8')
const geniePanelSource = readFileSync(join(root, 'src/components/genie/genie-panel.tsx'), 'utf8')

// ── Reply/search helpers ─────────────────────────────────────────────────────

const replyTaskCases = [
  'respond to Joel',
  'respond to tom about the quote',
  'reply to Sarah',
  'write back to mike',
  'follow up with Anna',
]

for (const message of replyTaskCases) {
  assert.equal(isReplyOrComposeQuestion(message), true, `should detect reply/compose question: ${message}`)
}

assert.deepEqual(extractCorrespondentHint('respond to tom'), { name: 'Tom' })
assert.deepEqual(extractCorrespondentHint('reply to Joel Pearson'), { name: 'Joel Pearson' })
assert.deepEqual(extractCorrespondentHint('respond to joel@apollobikes.com'), { email: 'joel@apollobikes.com' })

const implicitQuery = buildImplicitGmailQuery('respond to Joel')
assert.ok(implicitQuery?.includes('Joel'), 'implicit query should target correspondent')
assert.ok(questionNeedsSentContext('respond to Joel'), 'reply should need sent context')

const replyPlan = buildReplySearchPlan('respond to Joel')
assert.ok(replyPlan.some((pass) => pass.query.includes('in:sent')), 'reply plan must include sent pass')

const replyReadiness = buildGmailAnswerReadiness(
  'respond to Joel',
  {
    title: 'test',
    query: 'from:"Joel"',
    emails: [],
    correspondent_hint: { name: 'Joel' },
    includes_sent_context: false,
    suggested_reply_passes: buildReplySearchPlan('respond to Joel'),
    scan_stats: { total_matched: 2, pages_scanned: 1, scan_mode: 'quick', capped: false, oldest_date_ms: null, newest_date_ms: null, oldest_date_label: null, newest_date_label: null },
  },
  { scan_depth: 'quick', sort_order: 'newest' },
)
assert.equal(replyReadiness?.ready_to_answer, false, 'reply without sent context should not be ready')

const replySearchOnly = verifyQuestionAnswered({
  user_question: 'respond to Joel',
  draft_answer: 'I found 3 emails from Joel in your inbox about the wheel quote.',
  remaining_gaps: [],
})
assert.equal(replySearchOnly.ready, false, 'search-only draft must fail respond verification')

// ── Composio Gmail timestamp parsing ─────────────────────────────────────────

const ts = extractEmailTimestampMs({
  messageTimestamp: '2026-05-02T02:14:53Z',
  messageId: 'abc',
})
assert.equal(typeof ts, 'number', 'messageTimestamp should parse to ms')
assert.equal(new Date(ts!).toISOString(), '2026-05-02T02:14:53.000Z')

assert.equal(
  extractEmailTimestampMs({ internalDate: '1714608893000' }),
  1714608893000,
  'numeric internalDate ms should parse',
)

assert.match(agentRouteSource, /sort_order/, 'search_gmail must support sort_order for temporal queries')
assert.match(agentRouteSource, /scan_depth/, 'search_gmail must support scan_depth for full-history scans')
assert.match(agentRouteSource, /GMAIL_SEARCH_PLAYBOOK|sender_summary/, 'agent must include gmail search playbook')
assert.match(gmailSource, /fetchAllGmailMatches/, 'gmail search must paginate for full scans')
assert.match(sessionSource, /getOrCreateGmailComposioSession/, 'gmail integration must create or reuse Composio sessions')
assert.match(sessionSource, /composio\.create\(composioUserId/, 'Composio Gmail flow must create tool-router sessions')
assert.match(sessionSource, /composio\.use\(args\.sessionId/, 'Composio Gmail flow must reuse persisted tool-router sessions')
assert.match(sessionSource, /session\.execute/, 'Gmail tools must execute through Composio sessions')
assert.match(sessionSource, /multiAccount/, 'Gmail sessions must support multiple connected accounts')
assert.match(sessionSource, /preload/, 'single-account Gmail sessions should preload the core Gmail tools')
assert.match(sessionSource, /connectedAccountId && accountIds\.length > 1/, 'Gmail session execution should pass account only when multi-account selection is active')
assert.doesNotMatch(gmailSource, /composio\.tools\.execute/, 'Gmail module must not bypass sessions with direct Composio execution')
assert.match(gmailSource, /buildSenderSummary/, 'gmail search must build sender rollups')
assert.match(gmailSource, /buildContactAnalysis|contact_analysis/, 'gmail search must include contact analysis')
assert.match(gmailSource, /requested connected account not found; searching all active Gmail accounts/, 'stale connected_account_id should fall back to active Gmail connections')
assert.match(agentRouteSource, /contact_analysis/, 'agent must expose contact_analysis from search_gmail')
assert.match(
  readFileSync(join(root, 'src/lib/composio/gmail-search-playbook.ts'), 'utf8'),
  /MULTIPLE|multi-pass|earliest_likely_sales_contact/i,
  'playbook must require multi-pass rep research',
)

// Contact analysis: warranty is not the sales rep when a named rep exists earlier in sales mail
const apolloLike = buildContactAnalysis([
  {
    message_id: '1',
    thread_id: null,
    subject: 'Warranty claim update',
    from: 'Blair Smith <warranty@apollobikes.com>',
    to: null,
    snippet: 'warranty case',
    internal_date_ms: Date.parse('2018-08-14T00:00:00Z'),
    date_label: '14 Aug 2018',
  },
  {
    message_id: '2',
    thread_id: null,
    subject: 'RE: Wheel Build Quote',
    from: 'Joel Pearson <Joel@apollobikes.com>',
    to: null,
    snippet: 'quote for dealer order',
    internal_date_ms: Date.parse('2019-01-16T00:00:00Z'),
    date_label: '16 Jan 2019',
  },
])
assert.ok(apolloLike?.earliest_likely_sales_contact?.display_name?.includes('Joel'), 'Joel should be likely sales contact')
assert.notEqual(
  apolloLike?.earliest_likely_sales_contact?.email_address,
  'warranty@apollobikes.com',
  'warranty inbox should not be chosen as first rep',
)
assert.equal(parseFromField('Joel Pearson <Joel@apollobikes.com>').email_address, 'joel@apollobikes.com')

const readiness = buildGmailAnswerReadiness(
  'who was our first apollo rep',
  {
    title: 'test',
    query: 'from:apollobikes.com',
    emails: apolloLike ? [] : [],
    contact_analysis: apolloLike ?? undefined,
    scan_stats: { total_matched: 2, pages_scanned: 1, scan_mode: 'full', capped: false, oldest_date_ms: null, newest_date_ms: null, oldest_date_label: null, newest_date_label: null },
  },
  { scan_depth: 'full', sort_order: 'oldest' },
)
assert.ok(readiness?.ready_to_answer, 'full rep scan with sales contact should be ready')

const warrantyOnly = verifyQuestionAnswered({
  user_question: 'who was our first apollo rep',
  draft_answer: 'Blair Smith — earliest Apollo email is from 14 August 2018 (warranty@apollobikes.com).',
  remaining_gaps: [],
})
assert.equal(warrantyOnly.ready, false, 'warranty-as-rep draft must fail verification')

const whoWithoutName = verifyQuestionAnswered({
  user_question: 'who was our first apollo rep',
  draft_answer: 'I searched Gmail and found several emails from apollobikes.com in your inbox.',
  remaining_gaps: [],
})
assert.equal(whoWithoutName.ready, false, 'search summary without a direct answer must fail')

assert.match(gmailSource, /readGmailMessages|GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID/, 'gmail must fetch full message bodies')
assert.match(agentRouteSource, /read_gmail_messages/, 'agent must expose read_gmail_messages tool')

assert.equal(
  questionNeedsEmailBody('what was that warranty issue we had with apollo recently'),
  true,
  'warranty issue questions need body content',
)

const plainBody = extractBodyTextFromPayload({
  mimeType: 'text/plain',
  body: { data: Buffer.from('Trace 20 crankset spindle failure under warranty claim').toString('base64url') },
})
assert.match(plainBody, /spindle failure/, 'should decode plain text MIME bodies')

assert.equal(decodeGmailBase64Url('VGVzdCBib2R5'), 'Test body', 'base64url decode')

const warrantyReadiness = buildGmailAnswerReadiness(
  'what was that warranty issue with apollo',
  {
    title: 'test',
    query: 'subject:crankset',
    emails: [],
    message_bodies: [],
    scan_stats: { total_matched: 4, pages_scanned: 1, scan_mode: 'quick', capped: false, oldest_date_ms: null, newest_date_ms: null, oldest_date_label: null, newest_date_label: null },
  },
  { scan_depth: 'quick', sort_order: 'newest' },
)
assert.equal(warrantyReadiness?.ready_to_answer, false, 'content question without bodies should not be ready')

const uiEmail: GmailEmailPreview = {
  message_id: 'ui-1',
  thread_id: 'thread-1',
  subject: 'Warranty claim update',
  from: 'Joel Pearson <joel@apollobikes.com>',
  to: 'sales@yellowjersey.test',
  snippet: 'Trace 20 crankset spindle failure under warranty claim',
  internal_date_ms: Date.parse('2026-06-01T00:00:00Z'),
  date_label: '1 Jun 2026',
  connected_account_id: 'acct_1',
  mailbox_label: 'sales@yellowjersey.test',
}

const uiPayload = (patch: Partial<GmailEmailsPayload> = {}): GmailEmailsPayload => ({
  title: 'Gmail search results',
  query: 'from:apollobikes.com',
  emails: [uiEmail],
  scan_stats: {
    total_matched: patch.emails?.length ?? 1,
    pages_scanned: 1,
    scan_mode: 'quick',
    capped: false,
    oldest_date_ms: uiEmail.internal_date_ms,
    newest_date_ms: uiEmail.internal_date_ms,
    oldest_date_label: uiEmail.date_label,
    newest_date_label: uiEmail.date_label,
  },
  ...patch,
})

assert.equal(
  inferGmailCardMode(
    'who was our first apollo rep',
    uiPayload({ contact_analysis: apolloLike ?? undefined }),
  ),
  'hidden',
  'gmail search cards are not shown in Genie UI',
)
assert.equal(
  inferGmailCardMode(
    'what was that warranty issue with apollo',
    uiPayload({
      message_bodies: [{ ...uiEmail, body_text: 'Trace 20 crankset spindle failure under warranty claim', body_truncated: false }],
    }),
  ),
  'hidden',
  'gmail search cards are not shown in Genie UI',
)
assert.equal(
  inferGmailCardMode(
    'respond to Joel about the warranty claim',
    uiPayload({
      includes_sent_context: true,
      message_bodies: [{ ...uiEmail, body_text: 'Prior sent pricing and warranty context', body_truncated: false }],
    }),
  ),
  'hidden',
  'gmail search cards are not shown in Genie UI',
)
assert.equal(
  inferGmailCardMode(
    'show me emails from Apollo',
    uiPayload(),
  ),
  'hidden',
  'gmail search cards are not shown in Genie UI',
)
assert.equal(
  inferGmailCardMode(
    'send an email of business performance for last 30 days to tom@lidgett.net must be detailed',
    uiPayload({
      emails: [],
      answer_readiness: {
        ready_to_answer: false,
        gaps: ['No emails matched this query — this was intermediate context.'],
        criteria_checked: ['Matched emails: 0'],
      },
    }),
  ),
  'hidden',
  'compose/report tasks should not render an empty Gmail search card',
)
assert.equal(
  inferGmailCardMode(
    'what was that warranty issue with apollo',
    uiPayload({
      message_bodies: [],
      answer_readiness: {
        ready_to_answer: false,
        gaps: ['Need full message bodies before answering.'],
        criteria_checked: ['message bodies'],
      },
    }),
  ),
  'hidden',
  'intermediate incomplete Gmail lookups should stay private instead of rendering poor UX cards',
)

assert.match(agentRouteSource, /verify_question_answered/, 'agent must expose answer verification tool')
assert.match(agentRouteSource, /Have we actually answered/, 'agent prompt must require answer check')
assert.match(agentRouteSource, /get_gmail_connection_status/, 'agent route must expose gmail status tool')
assert.match(agentRouteSource, /listGmailConnections/, 'agent route must support multiple gmail accounts')
assert.match(agentRouteSource, /connected_account_id/, 'search_gmail must accept optional mailbox filter')
assert.match(gmailSource, /listGmailConnections/, 'gmail module must list all connections')
assert.doesNotMatch(composioStatusSource, /mintGmailConnectLink/, 'read-only composio status must not mint OAuth links')
assert.doesNotMatch(homeV2GmailSuggestionsSource, /mintGmailConnectLink/, 'gmail suggestions status must not mint OAuth links')
assert.doesNotMatch(homeV2ChatSource, /api\/composio\/connect/, 'home chat mount must not create OAuth links before user click')
assert.match(gmailConnectCardSource, /api\/composio\/connect/, 'connect card must create OAuth links on click')
assert.match(gmailConnectCardSource, /waitForConnection/, 'connect card must confirm status before clearing')
assert.match(agentRouteSource, /shouldMintConnectLink/, 'agent gmail status must guard connect-link minting')
assert.match(gmailSource, /enrichWithSentContext|includes_sent_context/, 'gmail search must merge sent context for replies')
assert.match(gmailSource, /buildImplicitGmailQuery|resolveSearchQuery/, 'gmail search must infer query from user question')
assert.doesNotMatch(
  agentRouteSource,
  /isGmailTaskIntent|isGmailConnectIntent|isGmailAddAccountIntent|applyGmailPlanningPolicy/,
  'agent route must not use deterministic Gmail intent helpers',
)
assert.match(agentRouteSource, /suggested_reply_passes|includes_sent_context/, 'search_gmail must expose reply metadata')
assert.match(agentRouteSource, /respond to \{name\}|in:sent context/, 'agent planner must document respond workflow')
assert.match(toolkitSource, /allowMultiple/, 'composio connect link must allow multiple accounts')
assert.match(agentRouteSource, /gmail_connect/, 'agent route must emit gmail_connect SSE event')
assert.match(agentRouteSource, /needs_plan=true.*Gmail|Gmail.*needs_plan=true/i, 'orchestrator must require plan for gmail')
assert.match(gmailSource, /inferGmailCardMode/, 'gmail module must infer context-aware UI modes')
assert.match(gmailSource, /ui_summary/, 'gmail search payload must include a tailored UI summary')
assert.match(agentRouteSource, /buildVisibleGmailPayload/, 'agent must filter gmail cards before streaming')
assert.match(agentRouteSource, /ui_mode/, 'agent context must preserve gmail UI mode')
assert.match(agentRouteSource, /total: payload\.scan_stats\?\.total_matched/, 'search_gmail tool output total must use full matched count')
assert.doesNotMatch(homeV2ChatSource, /GmailEmailSearchCard/, 'home chat must not render gmail search cards')
assert.doesNotMatch(geniePanelSource, /GmailEmailSearchCard/, 'genie panel must not render gmail search cards')
assert.match(gmailEmailActionCardSource, /proposal\.body/, 'gmail action card must show the email body')
assert.match(gmailEmailActionCardSource, /whitespace-pre-wrap/, 'gmail action card must preserve email body formatting')
assert.match(gmailEmailActionCardSource, /recipient_email/, 'gmail action card must show the recipient')
assert.match(gmailEmailActionCardSource, /Subject/, 'gmail action card must show the subject')
assert.match(gmailEmailActionCardSource, /Deny/, 'gmail action card must keep a simple deny action')
assert.match(gmailEmailActionCardSource, /Allow/, 'gmail action card must keep a simple allow action')
assert.doesNotMatch(gmailEmailActionCardSource, /Details|Sharing data includes|Using tools comes with risks|composio\.dev/, 'gmail action card must not show the old verbose permission copy')

assert.match(homeV2ChatSource, /gmailEmails: message\.gmailEmails/, 'home page must round-trip gmail context')
assert.match(agentRouteSource, /compactGmailForContext/, 'agent must inject gmail private context')
assert.match(agentRouteSource, /add_account/, 'agent must emit gmail card for add-account flow')
assert.match(homeV2ChatSource, /gmail_connect/, 'home page must handle gmail_connect SSE event')
assert.match(homeV2ChatSource, /composio_session_ids/, 'home page must send persisted Composio session ids to Genie')
assert.match(homeV2ChatSource, /event\.event === "composio_session"/, 'home page must persist streamed Composio session ids')
assert.match(homeV2ChatSource, /composioSessionIds\?: Record<string, string>/, 'conversation history must store Composio session ids')
assert.match(homeV2ChatSource, /GmailEmailActionCard|GenieProposalCard/, 'home page must render gmail send approval cards')

assert.match(applyRouteSource, /gmail_email_action/, 'apply route must execute staged gmail sends')
assert.match(applyRouteSource, /executeGmailSendEmail/, 'apply route must call composio send tool')
assert.match(applyRouteSource, /composio_session_id/, 'apply route must execute Gmail approval through the stored Composio session')
assert.match(agentRouteSource, /event: 'composio_session'/, 'agent route must stream Composio session ids')
assert.match(agentRouteSource, /getOrCreateGmailComposioSession/, 'agent route must use Composio sessions for Gmail status/search/read flows')

// ── Live Composio smoke (optional) ────────────────────────────────────────────

async function main() {
  const liveResult: Record<string, unknown> = {
    configured: isComposioConfigured(),
    reply_helper_cases: replyTaskCases.length,
    wiring_checks: 10,
  }

  if (isComposioConfigured()) {
    const { Composio } = await import('@composio/core')
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY!.trim() })
    try {
      await composio.connectedAccounts.list({ userIds: ['auth:genie-test-user'] })
      liveResult.api_key_valid = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      liveResult.api_key_valid = false
      liveResult.api_error = message.slice(0, 240)
      console.error('\nComposio live smoke failed:', message.slice(0, 240))
      console.error('Update COMPOSIO_API_KEY in .env.local (and Vercel) with a valid ak_… key from composio.dev\n')
      process.exitCode = 1
    }
  } else {
    liveResult.api_key_valid = null
    liveResult.note = 'COMPOSIO_API_KEY not set — skipped live API smoke test'
  }

  console.log(JSON.stringify(liveResult, null, 2))
}

void main()
