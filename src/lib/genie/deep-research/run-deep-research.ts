// Deep Business Review: a long-running (~20-25 min) autonomous, multi-phase
// forensic investigation of the whole business. Instead of one agent turn, it
// runs a sequence of focused investigation phases (each a bounded agent run over
// the real Lightspeed / Xero / Deputy / web tools), accumulates a private
// "dossier" of findings, then a final synthesis pass writes a board-memo report.
//
// It reuses the normal Genie pipeline entirely: the tools self-emit their
// charts/tables/analysis_query/status through the injected `emit`, so visual
// evidence accumulates onto the assistant message and renders in the chat and in
// the PDF document view. Only the final synthesis text is streamed as the answer
// (`text_delta`); per-phase narratives are captured server-side, not shown raw.
import { Agent, user as userMessage } from '@openai/agents'
import { createGenieRunner } from '../agent/runtime'
import { buildAgentTools, visualPrefsForMessages, type Supa } from '../agent/tools'
import type { ComposioSessionIds, Message, RawModelDeltaEvent, StreamToolItem } from '../agent/context'
import type { GenieModelConfig } from '../agent/model-profiles'

export interface DeepResearchArgs {
  supabase: Supa
  userId: string
  storeName: string
  messages: Message[]
  composioSessionIds: ComposioSessionIds
  models: GenieModelConfig
  emit: (data: object) => void
  signal: AbortSignal
  requestId: string
}

type PhaseToolset = 'analysis' | 'market'

interface DeepResearchPhase {
  id: string
  title: string
  /** Short live-status label (kept under ~46 chars for the progress preview). */
  status: string
  toolset: PhaseToolset
  /** The investigator brief for this phase. */
  brief: string
}

// Eight investigation phases consolidate the operator's 13 review dimensions.
// `analysis` phases get Lightspeed SQL + Xero + Deputy + cost/discount + analyst;
// `market` gets hosted web search + cycling research tools.
const PHASES: DeepResearchPhase[] = [
  {
    id: 'map',
    title: 'Data sources & timeframe',
    status: 'Mapping data sources & timeframe',
    toolset: 'analysis',
    brief: `Establish the evidence base. Probe what data actually exists and how far back it goes:
- Lightspeed sales/lines: earliest and latest complete_time, row counts, obvious gaps.
- Xero financials: which reports return data (P&L, balance sheet, aged payables/receivables) and for which periods.
- Deputy: whether timesheet/roster data is present and for what range.
For each source state the time range, granularity (daily/monthly), and reliability. Flag anything missing or untrustworthy as UNKNOWN. Keep tool calls lean — this is reconnaissance, not deep analysis.`,
  },
  {
    id: 'financial',
    title: 'Financial evolution',
    status: 'Analysing financial evolution',
    toolset: 'analysis',
    brief: `Forensically analyse the financial trajectory over the longest reliable period. Quantify everything with numbers and % changes:
- Revenue, gross profit, gross margin %, net profit over time (month-by-month or quarter-by-quarter). Use Xero P&L AND Lightspeed sales — reconcile if they differ.
- Operating expenses, payroll, supplier spend, and how each is trending vs revenue.
- Cash flow signals, accounts payable / receivable ageing, any liquidity pressure.
- Seasonality and any inflection points (when did the trajectory change, and by how much).
Distinguish whether profit is genuinely improving or being propped up by temporary mix/timing effects. Build at least one trend chart via SQL.`,
  },
  {
    id: 'sales_products',
    title: 'Sales & product evolution',
    status: 'Analysing sales & product mix',
    toolset: 'analysis',
    brief: `Break sales down structurally, not just headline revenue. Quantify with category/brand/SKU names and numbers:
- Sales and gross profit by category, brand, and top SKUs over time. Which categories are quietly declining even if total revenue looks stable?
- Price-band and margin-band mix. Which products sell often but destroy margin? Which are quiet margin heroes?
- Discount levels over time — are discounts rising, and are they tactical or margin-destructive?
- Is revenue growth (if any) driven by more customers, higher AOV, price increases, or product mix? Decompose it.
Identify winners, losers, hidden margin drains, and emerging opportunities. Chart category/brand trends where useful.`,
  },
  {
    id: 'inventory',
    title: 'Inventory & stock health',
    status: 'Analysing inventory & stock health',
    toolset: 'analysis',
    brief: `Diagnose inventory quality and cash efficiency. Quantify $ tied up and ageing:
- Stock-on-hand value, ageing buckets, and how much cash is locked in slow/dead stock (no sales in 90/180/365 days).
- Sell-through and stock-turn by category/brand. Which brands tie up cash without enough sell-through?
- Stockouts / understocking on fast movers vs overstocking on slow movers.
Identify specific dead-stock candidates for liquidation (name them, with $ value) and fast movers at risk of stockout.`,
  },
  {
    id: 'customers',
    title: 'Customer behaviour',
    status: 'Analysing customer behaviour',
    toolset: 'analysis',
    brief: `Analyse customer structure and demand. Quantify segments:
- New vs repeat vs lapsed customers over time; share of revenue from repeat and high-value customers.
- Purchase frequency, average basket size, and how they're trending.
- Service vs product behaviour (workshop/labour vs retail) — is the business becoming more service-led?
- Concentration risk: how dependent is revenue on a small number of customers?
Where customer-communication / enquiry / website-demand data is not available as a tool, say so explicitly as UNKNOWN and note what data would be needed.`,
  },
  {
    id: 'staffing',
    title: 'Staffing & labour efficiency',
    status: 'Analysing staffing & labour',
    toolset: 'analysis',
    brief: `Analyse labour productivity by combining Deputy (hours/wages) with Lightspeed (sales/GP). Quantify:
- Wage cost over time, in $ and as % of revenue and gross profit. Is staff cost rising faster than useful output?
- Sales per labour hour and gross profit per labour hour, trended.
- Roster coverage vs demand: are peak trading periods properly staffed and quiet periods overstaffed? Overtime?
If Deputy data is missing or thin, state that clearly as UNKNOWN and analyse payroll from Xero instead, noting the limitation.`,
  },
  {
    id: 'suppliers',
    title: 'Supplier & brand performance',
    status: 'Analysing suppliers & brands',
    toolset: 'analysis',
    brief: `Analyse supplier and brand economics and risk. Quantify spend and concentration:
- Supplier concentration: what share of purchasing/spend sits with the top few suppliers? Dependency risk.
- Margin quality by supplier/brand — who delivers sell-through AND margin vs who is just historically familiar.
- Aged payables pressure by supplier (Xero) and any reliability/availability signals visible in the data.
Distinguish strategically valuable suppliers from low-value ones the business keeps out of habit.`,
  },
  {
    id: 'market',
    title: 'Market & external trends',
    status: 'Researching market & demand trends',
    toolset: 'market',
    brief: `Use external web research to place the business in its market context. Be specific and cite what you find:
- Cycling and e-bike demand trends, seasonality, and any recent shifts in the relevant market/region.
- Competitor and pricing signals where discoverable; brand popularity movements.
- Macro retail / local demand conditions that could explain internal performance.
Conclude whether the business's performance is most likely driven by internal execution vs external demand shifts. Clearly tag external claims as STRONGLY SUGGESTED or PLAUSIBLE rather than proven, since they're not from the store's own data.`,
  },
]

interface RawType {
  type?: string
  event?: { type?: string; delta?: string }
  delta?: string
}

function readRawDelta(raw: RawModelDeltaEvent): { rawType: string; delta: string } {
  const r = raw as unknown as RawType
  const rawType = r.type ?? r.event?.type ?? ''
  const delta = typeof r.delta === 'string' ? r.delta : typeof r.event?.delta === 'string' ? r.event.delta : ''
  return { rawType, delta }
}

const OUTPUT_TEXT_TYPES = new Set(['output_text_delta', 'response.output_text.delta'])
const REASONING_TYPES = new Set(['response.reasoning_summary_text.delta'])

export async function runDeepResearchInvestigation(args: DeepResearchArgs): Promise<void> {
  const { supabase, userId, storeName, messages, composioSessionIds, models, emit, signal, requestId } = args

  const status = (phase: string, text: string) => emit({ event: 'status', phase, text })
  const reasoningGate = { awaitingContinuation: false }
  const visualPrefs = visualPrefsForMessages(messages)

  // Two tool sets cover every phase. business_analysis unconditionally exposes
  // Lightspeed SQL + Xero + Deputy + cost/discount + analyst; web_research
  // exposes hosted web search + cycling research tools.
  const analysisTools = buildAgentTools(
    supabase, userId, emit, visualPrefs,
    'Deep business review', 'business_analysis', null, composioSessionIds, models, 'default', reasoningGate,
  )
  const marketTools = buildAgentTools(
    supabase, userId, emit, visualPrefs,
    'Deep business review', 'web_research', null, composioSessionIds, models, 'default', reasoningGate,
  )

  const runner = createGenieRunner({
    requestId,
    userId,
    storeName,
    route: 'business_analysis',
    stage: 'deep-research',
    workflowName: 'Yellow Jersey Deep Business Review',
  })

  const startedAt = Date.now()
  const dossier: string[] = []
  const totalPhases = PHASES.length

  status('planning', `Starting deep business review — ${totalPhases} phases`)
  emit({
    event: 'reasoning_done',
    text: `Deep Business Review plan (~20-25 min):\n${PHASES.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}\nThen: synthesise a full board-memo report.`,
  })

  for (let i = 0; i < PHASES.length; i++) {
    if (signal.aborted) return
    const phase = PHASES[i]
    status(phase.toolset === 'market' ? 'web_search' : 'thinking', `Phase ${i + 1}/${totalPhases}: ${phase.status}`)

    const phaseTask = [
      `You are conducting phase ${i + 1} of ${totalPhases} of a forensic deep business review for "${storeName}".`,
      `PHASE: ${phase.title}`,
      '',
      phase.brief,
      '',
      'METHOD: Work a recursive loop — gather data, ask "what did I learn, why does it matter commercially, what could explain it, what is the next highest-value question", then answer that question with more data. Use multiple tool calls. Do not stop at the first number.',
      'EVIDENCE TAGS: Label every finding as one of [PROVEN] from data, [SUGGESTED] strongly implied by data, [PLAUSIBLE] not yet proven, or [UNKNOWN] data missing/unreliable. Quote real numbers, %, periods, category/brand/SKU/supplier names.',
      dossier.length
        ? `CONTEXT FROM EARLIER PHASES (do not repeat, build on it):\n${dossier.join('\n\n').slice(-6000)}`
        : '',
      '',
      'OUTPUT: A tight, evidence-dense findings brief for this phase only (~250-500 words). End with "OPEN QUESTIONS:" listing the 3-5 highest-value questions this phase raised for later phases or the final report. No preamble, no restating the task.',
    ].filter(Boolean).join('\n')

    const agent = new Agent({
      name: `Deep Review — ${phase.title}`,
      model: models.executor,
      instructions: `You are a ruthless, numerate forensic business analyst for a bike store. You interrogate data, quantify everything, and surface uncomfortable truths. You never pad. You distinguish proven from speculated.`,
      tools: phase.toolset === 'market' ? marketTools : analysisTools,
      modelSettings: {
        parallelToolCalls: true,
        store: false,
        reasoning: { effort: 'low', summary: 'auto' },
        text: { verbosity: 'low' },
      },
    })

    let phaseText = ''
    try {
      const stream = await runner.run(agent, [userMessage(phaseTask)], {
        stream: true,
        maxTurns: 20,
        signal,
        toolExecution: { maxFunctionToolConcurrency: 4 },
        toolNotFoundBehavior: 'return_error_to_model',
        reasoningItemIdPolicy: 'omit',
      })

      for await (const event of stream) {
        if (signal.aborted) break
        if (event.type === 'raw_model_stream_event') {
          const { rawType, delta } = readRawDelta(event.data as RawModelDeltaEvent)
          if (OUTPUT_TEXT_TYPES.has(rawType) && delta) {
            // Capture phase findings into the dossier — do NOT stream as the answer.
            phaseText += delta
          } else if (REASONING_TYPES.has(rawType) && delta) {
            emit({ event: 'reasoning_delta', text: delta })
          }
        } else if (event.type === 'run_item_stream_event') {
          const item = event.item as StreamToolItem
          const toolName = item.rawItem?.name || item.rawItem?.toolName || item.name
          if (event.name === 'tool_called' && toolName) {
            // The tools self-emit rich status/charts; this keeps the phase header live.
            status(phase.toolset === 'market' ? 'web_search' : 'thinking', `Phase ${i + 1}/${totalPhases}: ${phase.status}`)
          }
        }
      }
      await stream.completed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      phaseText = phaseText || `[UNKNOWN] Phase "${phase.title}" could not be completed: ${message}. Treat its dimension as not yet analysed.`
      emit({ event: 'reasoning_done', text: `Phase ${i + 1} (${phase.title}) hit a snag and was partially skipped: ${message}` })
    }

    const trimmed = phaseText.trim()
    dossier.push(`### Phase ${i + 1}: ${phase.title}\n${trimmed || '[UNKNOWN] No findings were produced for this phase.'}`)
    emit({ event: 'reasoning_done', text: `✓ Phase ${i + 1}/${totalPhases} complete: ${phase.title}` })
  }

  if (signal.aborted) return

  // ── Synthesis: stream the board-memo report as the actual answer ──────────
  status('responding', 'Synthesising the board-memo report')

  const elapsedMin = Math.round((Date.now() - startedAt) / 60000)
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' })

  const synthesisTask = [
    `You are the analyst who just ran an ${elapsedMin}-minute forensic deep review of "${storeName}". Below is your full investigation dossier across ${totalPhases} phases. Write the final board memo.`,
    '',
    '=== INVESTIGATION DOSSIER ===',
    dossier.join('\n\n'),
    '=== END DOSSIER ===',
    '',
    `Write a rigorous, direct, evidence-led board memo dated ${today}. It must read like a sharp internal operator wrote it, NOT a generic AI summary. Use specific numbers, %, periods, and names from the dossier. Never make a vague claim like "sales improved" without quantifying it. Do not hide bad news — if profit is propped up by temporary effects, growth is low quality, stock is stale, or labour is inefficient, say so plainly. Keep every claim tagged where it matters as [PROVEN] / [SUGGESTED] / [PLAUSIBLE] / [UNKNOWN].`,
    '',
    'STRUCTURE (use Markdown — "#" for the title, "##" for sections, real Markdown tables for all metric/finding/risk/action lists):',
    '# Deep Business Review — <store name>',
    '## 1. Executive Summary  (one page: is the business improving, deteriorating, masking weakness, or sitting on opportunity — with the 3-4 numbers that prove it)',
    '## 2. Business Timeline  (chronological narrative + key inflection points)',
    '## 3. Key Metrics  (a Markdown table: metric | latest | prior period | change | read)',
    '## 4. Financial Evolution',
    '## 5. Sales & Product Mix',
    '## 6. Inventory & Stock Health',
    '## 7. Customers',
    '## 8. Staffing & Labour Efficiency',
    '## 9. Suppliers & Brands',
    '## 10. Market & External Context',
    '## 11. Top 10 Findings  (numbered table with evidence)',
    '## 12. Top 10 Risks  (table: risk | severity | likelihood | evidence)',
    '## 13. Top 10 Opportunities  (table: opportunity | expected impact | effort | first step)',
    '## 14. Recommended Action Plan  (tables under: Do immediately / This week / This month / Investigate / Stop doing — each with why, evidence, impact, effort, risk, first step)',
    '## 15. Unanswered Questions & Missing Data',
    '## 16. Recommended Next Questions  (the 8-10 sharpest, most commercially valuable follow-up prompts the owner should ask next, specific and based on what was found)',
    '',
    'Be comprehensive and long where it earns its place. Prioritise cash, gross profit, sell-through, demand, labour productivity, and return on inventory over vanity metrics.',
  ].join('\n')

  const synthAgent = new Agent({
    name: 'Deep Review — Synthesis',
    model: models.strategicExecutor,
    instructions: 'You are a sharp, numerate retail CFO/operator writing an internal board memo. Direct, evidence-led, structured, no filler, no reassurance — the truth.',
    tools: [],
    modelSettings: {
      store: false,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'high' },
    },
  })

  let emittedAnswer = false
  try {
    const synthStream = await runner.run(synthAgent, [userMessage(synthesisTask)], {
      stream: true,
      maxTurns: 1,
      signal,
    })

    for await (const event of synthStream) {
      if (signal.aborted) break
      if (event.type === 'raw_model_stream_event') {
        const { rawType, delta } = readRawDelta(event.data as RawModelDeltaEvent)
        if (OUTPUT_TEXT_TYPES.has(rawType) && delta) {
          emittedAnswer = true
          emit({ event: 'text_delta', text: delta })
        } else if (REASONING_TYPES.has(rawType) && delta) {
          emit({ event: 'reasoning_delta', text: delta })
        }
      }
    }
    await synthStream.completed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emit({ event: 'reasoning_done', text: `Synthesis pass failed (${message}); returning the raw investigation dossier instead.` })
  }

  // Never throw away a 20-minute investigation: if the synthesis produced
  // nothing, fall back to the raw dossier under the report H1 so the user still
  // gets the findings (and the document/PDF view still renders).
  if (!emittedAnswer && !signal.aborted) {
    emit({
      event: 'text_delta',
      text: [
        `# Deep Business Review — ${storeName}`,
        '',
        '> The final synthesis pass could not complete, so here are the raw phase-by-phase findings from the investigation.',
        '',
        dossier.join('\n\n'),
      ].join('\n'),
    })
  }
}
