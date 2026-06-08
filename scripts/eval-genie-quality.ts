import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import OpenAI from 'openai'
import type { GenieOrchestrationDecision } from '../src/lib/genie/orchestration'
import { toolNameSetForRoute } from '../src/lib/genie/agent-runtime-policy'

interface StaticEvalCase {
  name: string
  user: string
  expected_route: GenieOrchestrationDecision['route']
  expected_plan: boolean
  required_tools: string[]
  forbidden_tools: string[]
  quality_requirements: string[]
}

interface TranscriptEvalCase {
  name: string
  user: string
  evidence?: string
  answer: string
  rubric: string[]
}

const staticCases: StaticEvalCase[] = [
  {
    name: 'customer workorder bottom bracket',
    user: 'What bottom bracket does Jackson Trotman need from his workorder?',
    expected_route: 'mixed',
    expected_plan: false,
    required_tools: [
      'resolve_customer_bike_context',
      'consult_cycling_compatibility_specialist',
    ],
    forbidden_tools: ['run_lightspeed_sql_query', 'list_lightspeed_workorders', 'search_lightspeed_inventory', 'search_web_images', 'search_gmail', 'propose_discount'],
    quality_requirements: [
      'Grounds the answer in customer-owned Lightspeed Serialized bike records, then workorder/sales evidence before public research.',
      'Requires official manufacturer or technical source confirmation before naming the bottom bracket.',
      'When multiple customer bikes remain plausible, gives a conditional answer for each plausible bike and asks one final disambiguation check.',
    ],
  },
  {
    name: 'known bike model compatibility',
    user: 'What bottom bracket does a Trek Madone Gen 8 need?',
    expected_route: 'web_research',
    expected_plan: false,
    required_tools: ['consult_cycling_compatibility_specialist'],
    forbidden_tools: ['run_lightspeed_sql_query', 'search_gmail'],
    quality_requirements: [
      'Uses public official sources because no private customer context is needed.',
      'Names confidence and caveats around exact model/build.',
    ],
  },
  {
    name: 'business profit analysis',
    user: 'How can we make more money this quarter?',
    expected_route: 'business_analysis',
    expected_plan: true,
    required_tools: ['record_lightspeed_plan', 'run_lightspeed_sql_query', 'get_lightspeed_stale_inventory_cash', 'consult_bike_store_analyst'],
    forbidden_tools: ['search_gmail', 'propose_discount'],
    quality_requirements: [
      'Runs multiple SQL lenses instead of generic advice.',
      'Ranks opportunities by commercial impact and ease.',
    ],
  },
  {
    name: 'fast greeting',
    user: 'Thanks',
    expected_route: 'casual_chat',
    expected_plan: false,
    required_tools: [],
    forbidden_tools: ['run_lightspeed_sql_query', 'search_web_images', 'search_gmail'],
    quality_requirements: [
      'Routes through the nano LLM router to casual_chat with no tools.',
    ],
  },
]

const root = process.cwd()
const agentRouteSource = readFileSync(resolve(root, 'src/app/api/genie/agent/route.ts'), 'utf8')

const builtInTranscriptCases: TranscriptEvalCase[] = [
  {
    name: 'customer bottom bracket answer shape',
    user: 'What bottom bracket does Jackson Trotman need from his workorder?',
    evidence: [
      'Private evidence: resolve_customer_bike_context found Jackson Trotman, Serialized customer bike 15788 says 2022 Trek Domane SL 5, workorder 1042 links to serializedID 15788, prior sale line says Trek Domane SL 5 Gen 3.',
      'Official evidence: Trek service manual for Domane SL Gen 3 states T47 internal threaded bottom bracket for 24 mm Shimano road crank builds.',
    ].join('\n'),
    answer: [
      '**Likely answer**',
      'Jackson most likely needs a **T47 internal threaded bottom bracket for a 24 mm Shimano road crank**, assuming the workorder bike is the 2022 Trek Domane SL 5 Gen 3 found in his history.',
      '',
      '**Bike evidence**',
      '- Lightspeed Serialized record 15788 lists Jackson’s bike as a 2022 Trek Domane SL 5.',
      '- Workorder 1042 links to serializedID 15788.',
      '- Prior sale history also shows Trek Domane SL 5 Gen 3.',
      '',
      '**Official compatibility evidence**',
      '- Trek technical/service documentation for Domane SL Gen 3 lists a T47 internal threaded BB standard. The Shimano build uses a 24 mm spindle interface.',
      '',
      '**Confidence / next check**',
      'High if the bike in the stand matches that Domane. Before ordering, verify the frame is Domane SL Gen 3 and the crank is Shimano 24 mm.',
    ].join('\n'),
    rubric: [
      'Uses the required sections: likely answer, bike evidence, official compatibility evidence, confidence / next check.',
      'Does not answer from web alone; it references private Serialized, workorder, and sales evidence.',
      'Names the standard only with official evidence and includes a shop-floor verification.',
    ],
  },
  {
    name: 'ambiguous customer bikes answer shape',
    user: 'What bottom bracket does Jack Lloyd need on his bike?',
    evidence: [
      'Private evidence: Jack Lloyd has likely bike candidates F24 Focus Izalco Max 9.8 Large 56 and Canyon Speedmax. Workorder notes do not prove which bike is currently in front of the mechanic.',
      'Official evidence: Focus Izalco Max uses a BB86/PF86 road press-fit shell. Canyon Speedmax evidence says the exact Speedmax generation/build must be confirmed before choosing the BB interface.',
    ].join('\n'),
    answer: [
      '**Likely answer**',
      '- If it is the **Focus Izalco Max 9.8**, work from a **BB86/PF86 press-fit road BB** and match the bearing kit to the crank spindle.',
      '- If it is the **Canyon Speedmax**, do not use the Izalco BB. Confirm the exact Speedmax generation/model first, then match that frame standard and crank spindle.',
      '',
      '**Bike evidence**',
      '- Jack has both Izalco Max and Canyon Speedmax candidates in the customer bike evidence.',
      '- The current workorder evidence does not prove which one is on the stand.',
      '',
      '**Official compatibility evidence**',
      '- Focus Izalco Max: official/spec evidence supports BB86/PF86 press-fit road.',
      '- Canyon Speedmax: exact generation/build still needs confirmation before ordering.',
      '',
      '**Confidence / next check**',
      'Medium for the Izalco direction, low for the Speedmax until the exact model/generation is confirmed. Check the bike in the stand and crank spindle before ordering.',
    ].join('\n'),
    rubric: [
      'Gives a conditional answer for both plausible bikes instead of only saying it cannot confirm.',
      'Clearly labels confidence and the missing verification for each option.',
      'Does not present one bike-specific BB as definitive for all bikes.',
    ],
  },
  {
    name: 'business analysis answer shape',
    user: 'How can we make more money this quarter?',
    evidence: [
      'SQL evidence: gross profit down 8%, service margin 71%, accessories attach rate low, $18k stock value in products with no sale in 180 days, top 20 customers drive 44% of revenue.',
    ].join('\n'),
    answer: [
      '**Executive Summary**',
      'The fastest profit lift is workshop attachment sales plus controlled stale-stock clearance, not a blanket discount.',
      '',
      '**Ranked Opportunities**',
      '| Rank | Action | Why |',
      '| --- | --- | --- |',
      '| 1 | Add service-to-accessory bundles | High-margin service traffic is already there |',
      '| 2 | Clear stale stock selectively | $18k cost tied up with no 180-day movement |',
      '| 3 | Target top customers | Top 20 customers drive 44% of revenue |',
      '',
      '**Data Period / Caveats**',
      'Uses the current quarter SQL snapshot supplied in the evidence.',
    ].join('\n'),
    rubric: [
      'Leads with commercial answer, not generic advice.',
      'Ranks opportunities and ties each to supplied numbers.',
      'Includes caveats/data period.',
    ],
  },
]

function runStaticEval() {
  assert.equal(
    agentRouteSource.includes('deterministicOrchestrationDecision'),
    false,
    'production routing must not use deterministic fast paths',
  )
  assert.match(
    agentRouteSource,
    /This is the production routing gate\. There is no deterministic router before you\./,
    'router prompt must explicitly own all route decisions',
  )

  for (const testCase of staticCases) {
    const tools = toolNameSetForRoute(testCase.expected_route)
    for (const toolName of testCase.required_tools) {
      assert.equal(tools.has(toolName), true, `${testCase.name}: should expose ${toolName}`)
    }
    for (const toolName of testCase.forbidden_tools) {
      assert.equal(tools.has(toolName), false, `${testCase.name}: should not expose ${toolName}`)
    }
    assert.ok(testCase.quality_requirements.length > 0, `${testCase.name}: quality requirements documented`)
  }
}

function loadTranscriptCases(): TranscriptEvalCase[] {
  const file = process.env.GENIE_EVAL_TRANSCRIPTS
  if (!file) return builtInTranscriptCases
  const path = resolve(file)
  if (!existsSync(path)) throw new Error(`GENIE_EVAL_TRANSCRIPTS not found: ${path}`)
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as TranscriptEvalCase)
}

async function runLiveTranscriptEval(cases: TranscriptEvalCase[]) {
  if (cases.length === 0) return { skipped: true, reason: 'no transcript cases' }
  if (process.env.GENIE_LIVE_EVAL !== '1') return { skipped: true, reason: 'GENIE_LIVE_EVAL is not 1' }
  if (!process.env.OPENAI_API_KEY) return { skipped: true, reason: 'OPENAI_API_KEY is missing' }

  const client = new OpenAI()
  const failures: string[] = []
  for (const testCase of cases) {
    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: [
        {
          role: 'system',
          content: 'You are grading a bicycle-store assistant answer. Return JSON only: {"pass": boolean, "reason": string}.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            user_question: testCase.user,
            supplied_evidence: testCase.evidence ?? null,
            assistant_answer: testCase.answer,
            rubric: testCase.rubric,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'genie_quality_grade',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['pass', 'reason'],
            properties: {
              pass: { type: 'boolean' },
              reason: { type: 'string' },
            },
          },
          strict: true,
        },
      },
    })

    const text = response.output_text ?? '{}'
    const grade = JSON.parse(text) as { pass: boolean; reason: string }
    if (!grade.pass) failures.push(`${testCase.name}: ${grade.reason}`)
  }

  assert.deepEqual(failures, [], 'live transcript quality eval failures')
  return { skipped: false, cases: cases.length }
}

async function main() {
  runStaticEval()
  const live = await runLiveTranscriptEval(loadTranscriptCases())
  console.log(JSON.stringify({
    static_cases: staticCases.length,
    live,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
