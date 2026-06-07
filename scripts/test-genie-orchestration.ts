import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GenieOrchestrationDecisionSchema,
  type GenieOrchestrationDecision,
} from '../src/lib/genie/orchestration'

const root = process.cwd()
const agentRouteSource = readFileSync(join(root, 'src/app/api/genie/agent/route.ts'), 'utf8')
const orchestrationSource = readFileSync(join(root, 'src/lib/genie/orchestration.ts'), 'utf8')
const workorderQuerySource = readFileSync(join(root, 'src/lib/services/lightspeed/workorder-queries.ts'), 'utf8')
const homeV2ChatSource = readFileSync(join(root, 'src/app/settings/store/homev2/homev2-chat.tsx'), 'utf8')
const geniePanelSource = readFileSync(join(root, 'src/components/genie/genie-panel.tsx'), 'utf8')

const forbiddenDeterministicRoutingTokens = [
  'fallbackOrchestrationDecision',
  'normalizeGenieOrchestrationDecision',
  'shouldUseModelOrchestrator',
  'deterministicRoute',
  'getRouteSignals',
  'shouldUsePlannerForRoute',
  'using fallback router',
  'fallback router',
]

for (const token of forbiddenDeterministicRoutingTokens) {
  assert.equal(
    orchestrationSource.includes(token),
    false,
    `orchestration module must not contain deterministic routing token: ${token}`,
  )
  assert.equal(
    agentRouteSource.includes(token),
    false,
    `agent route must not contain deterministic routing token: ${token}`,
  )
}

assert.match(
  agentRouteSource,
  /const ORCHESTRATOR_MODEL = 'gpt-5\.4-nano'/,
  'router must use gpt-5.4-nano',
)
assert.match(
  agentRouteSource,
  /const PLANNER_MODEL = 'gpt-5\.5'/,
  'planner must use gpt-5.5',
)
assert.match(
  agentRouteSource,
  /effort: args\.route === 'business_analysis' \? 'medium' : 'low'/,
  'planner should reserve medium reasoning for broad business analysis and use low latency for other planned routes',
)
assert.match(
  agentRouteSource,
  /new Agent\(\{\s*name: 'Yellow Jersey Orchestrator'[\s\S]*?model: ORCHESTRATOR_MODEL/,
  'orchestrator agent must be the routing gate',
)
assert.match(
  agentRouteSource,
  /name: 'Yellow Jersey Orchestrator'[\s\S]*?reasoning: \{ effort: 'none'/,
  'router must use supported no-reasoning mode for low-latency schema classification',
)
assert.match(
  agentRouteSource,
  /GenieOrchestrationDecisionSchema\.safeParse\(result\.finalOutput\)/,
  'router output must be schema-validated',
)
assert.match(
  agentRouteSource,
  /throw new Error\('LLM router returned an invalid orchestration decision\.'\)/,
  'invalid router output must fail instead of falling back to deterministic routing',
)
assert.match(
  agentRouteSource,
  /router_invoked: true/,
  'router invocation must be logged',
)
assert.match(
  agentRouteSource,
  /searchContextSize: 'low'/,
  'web search should use low context by default for latency-sensitive Genie execution',
)
assert.match(
  agentRouteSource,
  /customer-specific bike fitment or compatibility questions/,
  'agent instructions must explicitly ground named-customer bike fitment questions in sales/work-order history before web research',
)
assert.match(
  agentRouteSource,
  /What bottom bracket does Jackson Trotman need on this bike\?/,
  'router examples must cover named-customer fitment plus internet compatibility routing',
)
assert.match(
  agentRouteSource,
  /Context first: every request may be a continuation/,
  'executor must inspect recent conversation context before re-running tools',
)
assert.match(
  agentRouteSource,
  /Continuation rule:/,
  'router instructions must explicitly route short follow-ups with conversation context',
)
assert.match(
  agentRouteSource,
  /Private structured context from previous Genie tool results/,
  'agent input must include private structured tool context for follow-up reasoning',
)
assert.match(
  homeV2ChatSource,
  /workorders: message\.workorders/,
  'Home v2 Genie requests must preserve workorder card payloads in conversation history',
)
assert.match(
  geniePanelSource,
  /workorders: m\.workorders/,
  'Floating Genie requests must preserve workorder card payloads in conversation history',
)
assert.match(
  workorderQuerySource,
  /tokens\.every\(token => haystack\.includes\(token\)\)/,
  'workorder query matching must support tokenized customer plus topic queries',
)
assert.match(
  workorderQuerySource,
  /options\.limit \?\? \(options\.query \? 8 : dueOn \? 30 : 40\)/,
  'named workorder searches should default to a small enrichment limit for latency',
)
assert.equal(
  /CONCAT_WS\('; /.test(agentRouteSource),
  false,
  'SQL helpers must not include semicolons inside string literals because the SQL executor rejects all semicolons',
)

const decisionFixtures: Array<{ name: string; decision: GenieOrchestrationDecision }> = [
  {
    name: 'general chat',
    decision: { route: 'casual_chat', needs_plan: false, reason: 'Casual greeting/capability chat.' },
  },
  {
    name: 'internet search',
    decision: { route: 'web_research', needs_plan: false, reason: 'Needs current public web facts.' },
  },
  {
    name: 'inventory search',
    decision: { route: 'lightspeed_sql', needs_plan: false, reason: 'Direct Lightspeed inventory lookup.' },
  },
  {
    name: 'hard SQL',
    decision: { route: 'lightspeed_sql', needs_plan: true, reason: 'Complex multi-pass Lightspeed analysis.' },
  },
  {
    name: 'deep bike-store analysis',
    decision: { route: 'business_analysis', needs_plan: true, reason: 'Broad profitability strategy analysis.' },
  },
  {
    name: 'SQL plus internet',
    decision: { route: 'mixed', needs_plan: true, reason: 'Needs private store data plus public market research.' },
  },
  {
    name: 'customer bike fitment plus internet compatibility',
    decision: {
      route: 'mixed',
      needs_plan: true,
      reason: 'Needs private customer sales/work-order history to identify the bike plus public compatibility research.',
    },
  },
  {
    name: 'discount candidates plus internet competitor pricing',
    decision: {
      route: 'mixed',
      needs_plan: true,
      reason: 'Needs private discount-candidate analysis plus public competitor pricing research.',
    },
  },
  {
    name: 'Lightspeed brand/category write-back',
    decision: { route: 'storefront_action', needs_plan: false, reason: 'Direct approval-staged Lightspeed catalogue edit.' },
  },
  {
    name: 'open work orders',
    decision: { route: 'lightspeed_sql', needs_plan: false, reason: 'Direct live Lightspeed work order lookup.' },
  },
  {
    name: 'complex homepage campaign',
    decision: { route: 'storefront_action', needs_plan: true, reason: 'Broad multi-step merchandising campaign.' },
  },
]

for (const fixture of decisionFixtures) {
  assert.deepEqual(
    GenieOrchestrationDecisionSchema.parse(fixture.decision),
    fixture.decision,
    `${fixture.name}: decision fixture must match router schema`,
  )
}

console.log(JSON.stringify({
  router_model: 'gpt-5.4-nano',
  deterministic_routing_tokens: 0,
  schema_fixtures: decisionFixtures.length,
  planner_cases: decisionFixtures.filter(fixture => fixture.decision.needs_plan).length,
  no_planner_cases: decisionFixtures.filter(fixture => !fixture.decision.needs_plan).length,
  structured_context_checks: 8,
}, null, 2))
