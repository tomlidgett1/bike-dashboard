import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isGmailConnectIntent, isGmailAddAccountIntent, isGmailTaskIntent, applyGmailPlanningPolicy } from '../src/lib/composio/gmail-intent'
import { isComposioConfigured } from '../src/lib/composio/client'
import { extractEmailTimestampMs } from '../src/lib/composio/gmail'
import { buildContactAnalysis, parseFromField } from '../src/lib/composio/gmail-contact-analysis'
import {
  decodeGmailBase64Url,
  extractBodyTextFromPayload,
  questionNeedsEmailBody,
} from '../src/lib/composio/gmail-message-body'
import { buildGmailAnswerReadiness, verifyQuestionAnswered } from '../src/lib/genie/answer-verification'

const root = process.cwd()
const agentRouteSource = readFileSync(join(root, 'src/app/api/genie/agent/route.ts'), 'utf8')
const homeV2ChatSource = readFileSync(join(root, 'src/app/settings/store/homev2/homev2-chat.tsx'), 'utf8')
const applyRouteSource = readFileSync(join(root, 'src/app/api/genie/agent/apply/route.ts'), 'utf8')
const toolkitSource = readFileSync(join(root, 'src/lib/composio/toolkit.ts'), 'utf8')
const gmailSource = readFileSync(join(root, 'src/lib/composio/gmail.ts'), 'utf8')

// ── Intent detection ──────────────────────────────────────────────────────────

const connectCases = [
  'connect my composio gmnail',
  'connect my gmail',
  'link composio email',
  'set up gmail integration',
  'authorise google mail',
]

for (const message of connectCases) {
  assert.equal(isGmailConnectIntent(message), true, `should detect connect intent: ${message}`)
}

const addAccountCases = [
  'add another gmail account',
  'connect a second gmail',
  'add more mailboxes',
]

for (const message of addAccountCases) {
  assert.equal(isGmailAddAccountIntent(message), true, `should detect add account intent: ${message}`)
}

const nonConnectCases = [
  'send email to tom@example.com say hi',
  'search my inbox for invoices',
  'hello',
  'what can you do?',
]

for (const message of nonConnectCases) {
  assert.equal(isGmailConnectIntent(message), false, `should not detect connect intent: ${message}`)
}

const gmailTaskCases = [
  'who was our first apollo rep',
  'search my inbox for invoices',
  'connect my gmail',
  'send an email to tom@example.com',
  'how many emails from apollobikes.com',
]

for (const message of gmailTaskCases) {
  assert.equal(isGmailTaskIntent(message), true, `should detect gmail task: ${message}`)
}

assert.equal(isGmailTaskIntent('what were our sales last month'), false, 'lightspeed sales should not be gmail task')

const forced = applyGmailPlanningPolicy(
  { route: 'casual_chat', needs_plan: false, reason: 'greeting' },
  'who was our first apollo rep',
)
assert.equal(forced.needs_plan, true, 'gmail tasks must force needs_plan')
assert.equal(forced.route, 'storefront_action', 'gmail tasks must route to storefront_action')

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
assert.match(gmailSource, /buildSenderSummary/, 'gmail search must build sender rollups')
assert.match(gmailSource, /buildContactAnalysis|contact_analysis/, 'gmail search must include contact analysis')
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

assert.match(agentRouteSource, /verify_question_answered/, 'agent must expose answer verification tool')
assert.match(agentRouteSource, /Have we actually answered/, 'agent prompt must require answer check')
assert.match(agentRouteSource, /get_gmail_connection_status/, 'agent route must expose gmail status tool')
assert.match(agentRouteSource, /listGmailConnections/, 'agent route must support multiple gmail accounts')
assert.match(agentRouteSource, /connected_account_id/, 'search_gmail must accept optional mailbox filter')
assert.match(gmailSource, /listGmailConnections/, 'gmail module must list all connections')
assert.match(gmailSource, /mergeSearchPayloads/, 'gmail search must merge multi-mailbox results')
assert.match(toolkitSource, /allowMultiple/, 'composio connect link must allow multiple accounts')
assert.match(agentRouteSource, /gmail_connect/, 'agent route must emit gmail_connect SSE event')
assert.match(agentRouteSource, /needs_plan=true.*Gmail|Gmail.*needs_plan=true/i, 'orchestrator must require plan for gmail')

assert.match(homeV2ChatSource, /gmailEmails: message\.gmailEmails/, 'home page must round-trip gmail context')
assert.match(agentRouteSource, /compactGmailForContext/, 'agent must inject gmail private context')
assert.match(agentRouteSource, /add_account/, 'agent must emit gmail card for add-account flow')
assert.match(homeV2ChatSource, /gmail_connect/, 'home page must handle gmail_connect SSE event')
assert.match(homeV2ChatSource, /GmailEmailActionCard|GenieProposalCard/, 'home page must render gmail send approval cards')

assert.match(applyRouteSource, /gmail_email_action/, 'apply route must execute staged gmail sends')
assert.match(applyRouteSource, /executeGmailSendEmail/, 'apply route must call composio send tool')

// ── Live Composio smoke (optional) ────────────────────────────────────────────

async function main() {
  const liveResult: Record<string, unknown> = {
    configured: isComposioConfigured(),
    intent_cases: connectCases.length + nonConnectCases.length,
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
