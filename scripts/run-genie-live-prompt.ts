/**
 * Live Genie smoke test — streams one prompt through executeGenieAgent.
 * Run: npx tsx --env-file=.env.local scripts/run-genie-live-prompt.ts "your prompt"
 */
import { createClient } from '@supabase/supabase-js'
import { executeGenieAgent } from '../src/lib/genie/agent/execute'

const USER_ID = '3acef09d-8b28-46e8-a0c3-45ce59c61972'
const PROMPT =
  process.argv.slice(2).join(' ').trim() ||
  'run a business analysis on how we have performed YTD compared to YTD last year same time period'

const TIMEOUT_MS = 12 * 60 * 1000

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('business_name, bicycle_store, account_type')
    .eq('user_id', USER_ID)
    .single()

  if (profileError || !profile) {
    throw new Error(`Store profile not found for ${USER_ID}: ${profileError?.message ?? 'missing row'}`)
  }

  console.log(`Store: ${profile.business_name ?? profile.bicycle_store ?? 'unknown'}`)
  console.log(`Prompt: ${PROMPT}`)
  console.log('---')

  let content = ''
  const statusLines: string[] = []
  let sawSynthesisStatus = false
  let sawRoutingFraming = false
  let chartCount = 0
  let tableCount = 0
  const startedAt = Date.now()

  const controller = new AbortController()
  const timer = setTimeout(() => {
    console.error('\n[timeout] Aborting after 12 minutes')
    controller.abort()
  }, TIMEOUT_MS)

  try {
    await executeGenieAgent({
      supabase,
      userId: USER_ID,
      storeName: profile.business_name || profile.bicycle_store || 'your store',
      messages: [{ role: 'user', content: PROMPT }],
      conversationId: null,
      composioSessionIds: {},
      signal: controller.signal,
      emit: (data) => {
        const event = data as Record<string, unknown>
        if (event.event === 'status') {
          const line = `[${String(event.phase ?? 'status')}] ${String(event.text ?? '')}`
          statusLines.push(line)
          if (/synthesising executive summary/i.test(line)) sawSynthesisStatus = true
          if (/i'll treat this as/i.test(line)) sawRoutingFraming = true
          process.stdout.write(`\n${line}`)
        }
        if (event.event === 'chart') chartCount += 1
        if (event.event === 'table') tableCount += 1
        if (event.event === 'text_delta' && typeof event.text === 'string') {
          content += event.text
          process.stdout.write('.')
        }
        if (event.event === 'error') {
          console.error(`\n[error] ${String(event.message ?? 'unknown')}`)
        }
      },
    })
  } finally {
    clearTimeout(timer)
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
  console.log('\n---')
  console.log(
    JSON.stringify(
      {
        elapsed_sec: elapsedSec,
        answer_chars: content.length,
        status_events: statusLines.length,
        charts: chartCount,
        tables: tableCount,
        saw_routing_framing: sawRoutingFraming,
        saw_synthesis_status: sawSynthesisStatus,
        has_executive_summary: /executive summary/i.test(content),
        has_key_findings: /key findings/i.test(content),
        has_ranked_opportunities: /ranked opportunities/i.test(content),
        has_ytd_numbers: /\$[\d,]+|%\)/i.test(content),
        answer_preview: content.slice(0, 1200),
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
