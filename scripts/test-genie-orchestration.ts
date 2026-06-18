import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GenieOrchestrationDecisionSchema,
  type GenieOrchestrationDecision,
} from '../src/lib/genie/orchestration'
import {
  canRunParallelTools,
  maxToolConcurrencyForRoute,
  shouldExposeHostedWebSearch,
  toolNameSetForRoute,
} from '../src/lib/genie/agent-runtime-policy'
import { userRequestsWebImages } from '../src/lib/genie/web-research-policy'
import { compactGenieProgressText, liveGenieDisplayStep, liveGenieProgressPreview, liveGenieSubCommentary } from '../src/lib/genie/progress-text'
import { appendGenieProgressStep } from '../src/lib/genie/genie-progress-steps'
import {
  buildBusinessAnalysisFallbackAnswer,
  buildBusinessAnalysisDossier,
  businessAnalysisDossierHasEvidence,
  businessAnalysisDossierHasSufficientEvidence,
} from '../src/lib/genie/agent/business-analysis-synthesis'
import { businessAnalysisPresentationContract } from '../src/lib/genie/agent/prompts'
import { renderGenieMarkdown } from '../src/lib/genie/render-markdown'
import { summarizeGenieAgentRuns } from '../src/lib/genie/telemetry'
import {
  buildDeepResearchFramingMessage,
  buildRoutingFramingMessage,
} from '../src/lib/genie/routing-framing'
import { mergeGenieJobSnapshots, ensureAssistantMessageForJob } from '../src/lib/genie/sync-genie-job-message'
import type { GenieJob } from '../src/lib/genie/genie-job-types'

const root = process.cwd()
// The agent was split from one 12.7k-line route file into lib modules; the
// concatenation preserves whole-architecture assertions across the split.
const agentModulePaths = [
  'src/app/api/genie/agent/route.ts',
  'src/lib/genie/agent/runtime.ts',
  'src/lib/genie/agent/prompts.ts',
  'src/lib/genie/agent/context.ts',
  'src/lib/genie/agent/orchestrator.ts',
  'src/lib/genie/agent/sql-constants.ts',
  'src/lib/genie/agent/direct-paths.ts',
  'src/lib/genie/agent/status.ts',
  'src/lib/genie/agent/tools.ts',
  'src/lib/genie/agent/execute.ts',
]
const agentRouteSource = agentModulePaths
  .map((modulePath) => readFileSync(join(root, modulePath), 'utf8'))
  .join('\n')
const executeModuleSource = readFileSync(join(root, 'src/lib/genie/agent/execute.ts'), 'utf8')
const orchestratorModuleSource = readFileSync(join(root, 'src/lib/genie/agent/orchestrator.ts'), 'utf8')
const promptsModuleSource = readFileSync(join(root, 'src/lib/genie/agent/prompts.ts'), 'utf8')
const directPathsModuleSource = readFileSync(join(root, 'src/lib/genie/agent/direct-paths.ts'), 'utf8')
const startBackgroundRouteSource = readFileSync(join(root, 'src/app/api/genie/agent/start-background/route.ts'), 'utf8')
const runGenieJobSource = readFileSync(join(root, 'src/lib/genie/run-genie-agent-background-job.ts'), 'utf8')
const genieJobsProviderSource = readFileSync(join(root, 'src/components/providers/genie-jobs-provider.tsx'), 'utf8')
const answerVerificationSource = readFileSync(join(root, 'src/lib/genie/answer-verification.ts'), 'utf8')
const orchestrationSource = readFileSync(join(root, 'src/lib/genie/orchestration.ts'), 'utf8')
const agentRuntimePolicySource = readFileSync(join(root, 'src/lib/genie/agent-runtime-policy.ts'), 'utf8')
const storeProductPreviewSource = readFileSync(join(root, 'src/lib/genie/store-product-previews.ts'), 'utf8')
const lightspeedClientSource = readFileSync(join(root, 'src/lib/services/lightspeed/lightspeed-client.ts'), 'utf8')
const lightspeedTypesSource = readFileSync(join(root, 'src/lib/services/lightspeed/types.ts'), 'utf8')
const workorderQuerySource = readFileSync(join(root, 'src/lib/services/lightspeed/workorder-queries.ts'), 'utf8')
const lightspeedInstructionsSource = readFileSync(join(root, 'lightspeed.md'), 'utf8')
const homeV2ChatSource = readFileSync(join(root, 'src/app/settings/store/homev2/homev2-chat.tsx'), 'utf8')
const geniePanelSource = readFileSync(join(root, 'src/components/genie/genie-panel.tsx'), 'utf8')
const telemetrySource = readFileSync(join(root, 'src/lib/genie/telemetry.ts'), 'utf8')
const backgroundJobSource = readFileSync(join(root, 'src/lib/genie/background-jobs.ts'), 'utf8')
const backgroundRouteSource = readFileSync(join(root, 'src/app/api/genie/background/route.ts'), 'utf8')
const backgroundIdRouteSource = readFileSync(join(root, 'src/app/api/genie/background/[id]/route.ts'), 'utf8')
const telemetryMigrationSource = readFileSync(join(root, 'supabase/migrations/20260608150000_add_genie_agent_runs.sql'), 'utf8')
const backgroundMigrationSource = readFileSync(join(root, 'supabase/migrations/20260608151000_add_genie_background_jobs.sql'), 'utf8')
const salesSummaryIndexMigrationSource = readFileSync(join(root, 'supabase/migrations/20260608162000_add_fast_genie_sales_summary_indexes.sql'), 'utf8')

assert.match(
  orchestrationSource,
  /export const GenieOrchestrationDecisionSchema/,
  'orchestration module must expose the structured router schema',
)
assert.equal(
  /deterministicOrchestrationDecision/.test(orchestrationSource),
  false,
  'orchestration module must not contain a deterministic router',
)
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
  /new Agent\(\{\s*name: 'Yellow Jersey Orchestrator'[\s\S]*?model: models\.orchestrator/,
  'orchestrator agent must remain available for ambiguous routing via the configured model profile',
)
assert.match(
  agentRouteSource,
  /tracingDisabled: !isGenieTracingEnabled\(\)/,
  'agent runner tracing must be enabled by default and only disabled by explicit env flag',
)
assert.equal(
  /tracingDisabled: true/.test(agentRouteSource),
  false,
  'Genie tracing must not remain globally hard-disabled',
)
assert.match(
  agentRouteSource,
  /traceIncludeSensitiveData: false/,
  'tracing must avoid sensitive prompt/tool payloads',
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
  'invalid router output must fail instead of falling back to local routing',
)
assert.equal(
  /deterministicOrchestrationDecision/.test(agentRouteSource),
  false,
  'agent route must not use the removed broad deterministic orchestration helper',
)
assert.doesNotMatch(
  executeModuleSource,
  /resolveObviousLightspeedDirectPath|directPathOverride|orchestrationSource = 'deterministic'/,
  'executor must not bypass the model router with deterministic routing',
)
assert.match(
  executeModuleSource,
  /await createGenieOrchestrationDecision\(/,
  'every turn must go through the LLM router',
)
assert.equal(
  /applyGmailPlanningPolicy/.test(agentRouteSource),
  false,
  'agent route must not mutate LLM router decisions with a post-router Gmail policy',
)
assert.doesNotMatch(
  agentRouteSource,
  /isGmailTaskIntent|isGmailConnectIntent|isGmailAddAccountIntent/,
  'agent route must not use deterministic Gmail intent helpers',
)
assert.doesNotMatch(
  agentRuntimePolicySource,
  /needsGmailTools|gmail-intent|latestUserMessage/,
  'runtime tool policy must not inspect message text for Gmail intent',
)
assert.match(
  agentRouteSource,
  /toolNameSetForRoute\(route, executionPlan\?\.primary_tools \?\? \[\]\)|toolNameSetForRoute\(orchestration\.route, executionPlan\?\.primary_tools \?\? \[\]\)/,
  'Gmail tool exposure must come from LLM planner tool names',
)
assert.match(
  agentRouteSource,
  /router_invoked: routerInvoked/,
  'router invocation must be logged',
)
assert.match(
  agentRouteSource,
  /router_model: models\.orchestrator/,
  'router model must be logged from the configured model profile',
)
assert.match(
  agentRouteSource,
  /You are the only hidden router for the Yellow Jersey Store Agent/,
  'router instructions must describe a model-only routing gate',
)
assert.doesNotMatch(
  agentRouteSource,
  /deterministic fast-path bypass/i,
  'router instructions must not describe deterministic pre-routing',
)
assert.match(
  agentRouteSource,
  /SQL mirror first for many-row reporting, totals, rankings, trends, sales history/,
  'router/planner/executor instructions must include the SQL-vs-live Lightspeed data-source doctrine',
)
assert.match(
  agentRouteSource,
  /Supabase PostgreSQL 17/,
  'agent SQL instructions must identify Supabase as PostgreSQL 17',
)
assert.match(
  agentRouteSource,
  /DATE_FORMAT\(\)|STR_TO_DATE\(\)|IFNULL\(\)|CURDATE\(\)|DATE_SUB\(\)/,
  'agent SQL instructions must explicitly reject common MySQL functions',
)
assert.match(
  lightspeedInstructionsSource,
  /SQL vs Live API Decision Rule/,
  'loaded Lightspeed instructions must include the SQL-vs-live API decision rule',
)
assert.match(
  lightspeedInstructionsSource,
  /The reporting database is Supabase PostgreSQL 17/,
  'loaded Lightspeed instructions must specify the PostgreSQL dialect',
)
assert.match(
  agentRouteSource,
  /Use PostgreSQL SQL, not MySQL functions/,
  'SQL validator must reject MySQL-only functions with a PostgreSQL-specific error',
)
assert.match(
  agentRouteSource,
  /toolNameSetForRoute/,
  'executor tools must be selected by route to reduce prompt/tool latency',
)
assert.match(
  agentRouteSource,
  /resolve_customer_bike_context/,
  'customer-specific workorder compatibility must have a first-class grounding tool',
)
assert.match(
  lightspeedClientSource,
  /getCustomerSerialized[\s\S]*Serialized\.json\$\{queryString\}/,
  'Lightspeed client must fetch customer-owned bikes from Serialized.json?customerID',
)
assert.match(
  lightspeedClientSource,
  /getSerializedBike/,
  'Lightspeed client must fetch a workorder-linked Serialized bike by serializedID',
)
assert.match(
  lightspeedTypesSource,
  /export interface LightspeedCustomerBike/,
  'customer-owned Serialized rows must have a typed bike mapping',
)
assert.match(
  workorderQuerySource,
  /serialized_id/,
  'Genie workorder details must retain workorder.serializedID for bike lookup',
)
assert.match(
  workorderQuerySource,
  /customerID: customerId/,
  'Genie workorder lookup must support direct Lightspeed Workorder.json?customerID enrichment',
)
assert.match(
  workorderQuerySource,
  /include_archived\?: boolean/,
  'Genie workorder lookup must expose archived historical workorders for customer history',
)
assert.match(
  workorderQuerySource,
  /client\.getRecentWorkorders\(\{ \.\.\.customerWorkorderParams, archived: 'true' \}/,
  'customerID workorder history must fetch archived Lightspeed workorders when requested',
)
assert.match(
  workorderQuerySource,
  /const byId = new Map<string, LightspeedWorkorderWithRelations>\(\)[\s\S]*byId\.set\(String\(workorder\.workorderID\), workorder\)/,
  'live and archived customer workorder batches must be deduped by workorderID',
)
assert.match(
  agentRouteSource,
  /fetchCustomerSerializedBikeEvidence/,
  'customer bike grounding must read live Serialized records before relying on inference',
)
assert.match(
  agentRouteSource,
  /customer_id: effectiveCustomerId/,
  'customer bike grounding must fetch workorders directly by resolved customerID',
)
assert.match(
  agentRouteSource,
  /Serialized\.description is usually the strongest owned-bike indication/,
  'agent instructions must teach that Serialized descriptions are strong but not exclusive bike evidence',
)
assert.match(
  agentRouteSource,
  /consult_cycling_compatibility_specialist/,
  'bike fitment routes must expose a cycling compatibility specialist tool',
)
assert.match(
  agentRouteSource,
  /\.asTool\(\{/,
  'specialist agents must be implemented with Agent.asTool so the main agent remains in control',
)
assert.doesNotMatch(
  agentRuntimePolicySource,
  /export function needsGmailTools/,
  'runtime policy must not expose deterministic Gmail intent helpers',
)
assert.match(
  agentRuntimePolicySource,
  /planRequestsGmail/,
  'Gmail tools must be selected from planner tool names, not message regexes',
)
assert.match(
  agentRouteSource,
  /executorModelForRoute/,
  'strategic routes must be able to use a stronger executor model than fast direct routes',
)
assert.match(
  agentRouteSource,
  /first_text_ms/,
  'latency instrumentation must log first text timing',
)
assert.match(
  telemetrySource,
  /persistGenieAgentRun/,
  'Genie runs must be persisted for production latency analysis',
)
assert.match(
  telemetryMigrationSource,
  /CREATE TABLE IF NOT EXISTS public\.genie_agent_runs/,
  'Genie telemetry migration must create genie_agent_runs',
)
assert.match(
  telemetryMigrationSource,
  /first_text_ms/,
  'Genie telemetry table must store first text latency',
)
assert.match(
  agentRouteSource,
  /await persistGenieAgentRun/,
  'agent route must persist telemetry at request completion',
)
assert.match(
  agentRouteSource,
  /statusForRoute/,
  'progress stream must show which workflow was selected',
)
assert.match(
  agentRouteSource,
  /statusAfterTool/,
  'progress stream must show when each tool result is ready',
)
assert.equal(
  /Preparing answer/.test(agentRouteSource),
  false,
  'tool outputs should not collapse back to generic Preparing answer status',
)
assert.match(
  agentRouteSource,
  /maxToolConcurrencyForRoute/,
  'read-only routes must allow bounded parallel tool execution',
)
assert.match(
  agentRouteSource,
  /buildSystemPrompt\(\s*storeName,\s*executionPlan,\s*orchestration\.route,\s*runtime\.fastAnswerPrompt,\s*learnedPlaybook,\s*useBusinessAnalysisSynthesis/,
  'executor prompt must receive synthesis mode for business analysis formatting',
)
assert.match(
  executeModuleSource,
  /runBusinessAnalysisSynthesis/,
  'business analysis must run a dedicated synthesis pass after investigation',
)
assert.match(
  promptsModuleSource,
  /BUSINESS ANALYSIS INVESTIGATION MODE/,
  'business analysis investigator prompt must defer final formatting to synthesis',
)
assert.match(
  promptsModuleSource,
  /MANDATORY: call the planned data tools/,
  'business analysis investigator contract must require tool execution before synthesis',
)
assert.match(
  promptsModuleSource,
  /category_path ILIKE '%light%' matches the broad parent "Electronics & Lights"/,
  'planner and executor prompts must warn that bike-light analysis cannot use broad parent category_path matching',
)
assert.match(
  promptsModuleSource,
  /Do not include verify_question_answered because business_analysis runs in investigation\/synthesis mode/,
  'business analysis plans must not ask the investigator to verify an answer it is not meant to write',
)
assert.match(
  promptsModuleSource,
  /WEB RESEARCH QUALITY BAR/,
  'web research work rules must require iterative hosted web_search for live facts',
)
assert.match(
  executeModuleSource,
  /businessAnalysisDossierHasEvidence/,
  'business analysis must retry investigation when the dossier has no evidence',
)
assert.match(
  executeModuleSource,
  /runBusinessAnalysisRecoveryPasses/,
  'business analysis must have deterministic recovery passes when model investigation stops early',
)
assert.match(
  agentRouteSource,
  /business_analysis_recovery_passes/,
  'deterministic recovery passes should emit debug telemetry',
)
assert.match(
  agentRouteSource,
  /ACTIVE ROUTE: \$\{route\}/,
  'executor prompt must explicitly declare the active route',
)
assert.match(
  agentRouteSource,
  /const lightspeedInstructions = includeLightspeedSql/,
  'Lightspeed SQL doctrine must be included only on routes that need it',
)
assert.match(
  agentRouteSource,
  /const gmailPlaybook = includeGmail \?/,
  'Gmail playbook must be included only on Gmail routes',
)
assert.match(
  agentRouteSource,
  /FINAL ANSWER CONTRACT/,
  'executor prompt must include route-specific final answer formatting guidance',
)
assert.equal(
  /maybeSearchWebImagesForUserMessage/.test(agentRouteSource),
  false,
  'image search should not run before routing because it duplicates executor image tools',
)
assert.match(
  agentRouteSource,
  /webSearchContextSizeForRoute/,
  'web search context size must vary by route for quality on web_research',
)
assert.equal(
  userRequestsWebImages('What does a Trek Madone Gen 8 look like?'),
  true,
  'visual web questions should allow image search tools',
)
assert.equal(
  userRequestsWebImages('Who leads the points classification in the Tour de Suisse?'),
  false,
  'race standings questions must not trigger image search tools',
)
assert.match(
  executeModuleSource,
  /function executorToolChoice/,
  'executor tool choice must be centralised for forced first-tool runs',
)
assert.match(
  executeModuleSource,
  /if \(route === 'web_research'\) return 'web_search'/,
  'web_research must force OpenAI hosted web_search before answering',
)
assert.match(
  executeModuleSource,
  /if \(route === 'business_analysis' && planned\)/,
  'planned business analysis must force an initial data-tool call',
)
assert.match(
  executeModuleSource,
  /run_lightspeed_sql_query'\)\) return 'run_lightspeed_sql_query'/,
  'planned business analysis should start with Lightspeed SQL when available',
)
assert.match(
  agentRouteSource,
  /For customer-specific bike fitment or compatibility questions, plan this exact grounded diagnostic workflow/,
  'agent instructions must explicitly ground named-customer bike fitment questions in sales/work-order history before web research',
)
assert.match(
  agentRouteSource,
  /official manufacturer manuals, technical PDFs, service docs, standards bodies, or supplier technical pages/,
  'customer bike fitment planning must prefer official compatibility sources',
)
assert.match(
  agentRouteSource,
  /Official compatibility evidence/,
  'final answer contract must separate official compatibility evidence from private bike evidence',
)
assert.match(
  agentRouteSource,
  /include a compact conditional answer for each plausible bike/,
  'customer bike fitment answers must provide conditional answers for multiple plausible bikes',
)
assert.match(
  agentRouteSource,
  /answer each plausible bike separately and ask one final clarification/,
  'customer bike context tool must tell the executor to answer all plausible bike options before clarifying',
)
assert.equal(
  /resolve the customer by name with search_lightspeed_customers/.test(agentRouteSource),
  false,
  'planner must not refer to deprecated customer tools that are filtered out before execution',
)
assert.match(
  agentRouteSource,
  /What bottom bracket does Jackson Trotman need from his workorder\?/,
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
  homeV2ChatSource,
  /customerProfile: message\.customerProfile/,
  'Home v2 Genie requests must preserve customer profile payloads in conversation history',
)
assert.match(
  geniePanelSource,
  /workorders: m\.workorders/,
  'Floating Genie requests must preserve workorder card payloads in conversation history',
)
assert.match(
  geniePanelSource,
  /customerProfile: m\.customerProfile/,
  'Floating Genie requests must preserve customer profile payloads in conversation history',
)
assert.match(
  genieJobsProviderSource,
  /applyGenieSseEvent\(event, assistant\)/,
  'Live job streaming must apply SSE events (incl. customer profile cards) via the shared accumulator',
)
assert.match(
  homeV2ChatSource,
  /mergeGenieJobIntoAssistantMessage/,
  'Home v2 Genie must merge live job state (incl. customer profile cards) into assistant messages',
)
assert.match(
  geniePanelSource,
  /parsed\.event === 'customer_profile'/,
  'Floating Genie must handle streamed customer profile cards',
)
assert.match(
  homeV2ChatSource,
  /LightspeedCustomerProfileCard profile=\{message\.customerProfile\}/,
  'Home v2 Genie must render customer profile cards',
)
assert.match(
  geniePanelSource,
  /LightspeedCustomerProfileCard profile=\{message\.customerProfile\}/,
  'Floating Genie must render customer profile cards',
)
assert.match(
  homeV2ChatSource,
  /useTypewriter\(normalized/,
  'Home v2 Genie must stream assistant answers through the typewriter over normalized content',
)
assert.match(
  homeV2ChatSource,
  /renderGenieMarkdown\(/,
  'Home v2 Genie must render assistant answers through the shared Markdown renderer',
)
assert.match(
  agentRouteSource,
  /function shouldAutoEmitInventoryProductCards/,
  'inventory availability questions must auto-enable product cards',
)
assert.match(
  agentRouteSource,
  /product_links: productLinksFromPreviews\(inventoryProductPreviews\)/,
  'SQL inventory answers must return product links for inline answer links',
)
assert.match(
  agentRouteSource,
  /product_cards_emitted: inventoryProductPreviews\.length > 0/,
  'SQL inventory answers must report whether product cards were streamed',
)
assert.match(
  agentRouteSource,
  /product_links: productLinksFromPreviews\(previews\)/,
  'inventory search answers must return product links',
)
assert.match(
  storeProductPreviewSource,
  /lightspeed_item_id\?: string \| null/,
  'product cards must retain the source Lightspeed item ID for link enrichment',
)
assert.match(
  storeProductPreviewSource,
  /requireApprovedImage\?: boolean/,
  'inventory product card previews must support an approved-image-only mode',
)
assert.match(
  storeProductPreviewSource,
  /\.eq\('approval_status', 'approved'\)/,
  'inventory product card previews must resolve approved product images, not Lightspeed mirror placeholders',
)
assert.match(
  agentRouteSource,
  /const cardMatches = args\.matches\.filter/,
  'inventory availability cards must filter candidates before streaming cards',
)
assert.match(
  agentRouteSource,
  /requireApprovedImage: true/,
  'inventory availability cards must require approved images',
)
assert.match(
  agentRouteSource,
  /preview\.in_stock === true && Boolean\(preview\.image\)/,
  'inventory availability cards must only stream in-stock previews with images',
)
assert.match(
  agentRouteSource,
  /GENIE_PRODUCT_CARD_SCAN_LIMIT = 20/,
  'inventory availability cards should scan enough candidates to find approved-image matches while still capping emitted cards',
)
assert.match(
  geniePanelSource,
  /href=\{product\.product_url\}/,
  'Floating Genie product cards must use the emitted product URL',
)
assert.equal(
  /href=\{`\/marketplace\/product\/\$\{product\.id\}`\}/.test(geniePanelSource),
  false,
  'Floating Genie product cards must not fake marketplace links from Lightspeed item IDs',
)
assert.match(
  homeV2ChatSource,
  /tool_done: "Result"/,
  'Home v2 progress timeline must label tool-completion events',
)
assert.match(
  homeV2ChatSource,
  /customer_context: "Customer bike"/,
  'Home v2 progress timeline must label customer bike diagnostics',
)
assert.match(
  homeV2ChatSource,
  /agent-text-shimmer_2\.2s_linear_infinite/,
  'Home v2 shimmer should be active enough for visible progress',
)
assert.equal(
  /step\.phase !== "responding"/.test(homeV2ChatSource),
  false,
  'Home v2 progress shimmer must keep answer-writing steps visible',
)
assert.match(
  geniePanelSource,
  /renderGenieMarkdown\(message\.content/,
  'Floating Genie must use the shared Markdown renderer for assistant answers',
)
assert.match(
  geniePanelSource,
  /tool_done: 'Result'/,
  'Floating Genie progress timeline must label tool-completion events',
)
assert.match(
  geniePanelSource,
  /customer_context: 'Customer bike'/,
  'Floating Genie progress timeline must label customer bike diagnostics',
)
assert.match(
  workorderQuerySource,
  /tokens\.every\(token => haystack\.includes\(token\)\)/,
  'workorder query matching must support tokenized customer plus topic queries',
)
assert.match(
  workorderQuerySource,
  /detail\.internal_note/,
  'workorder query matching must include internal notes',
)
assert.match(
  agentRouteSource,
  /function fullWorkorderForAgent/,
  'workorder tools must return full detail rows to the agent',
)
assert.match(
  agentRouteSource,
  /internal_note: row\.internal_note/,
  'workorder tool output must include internal notes',
)
assert.match(
  agentRouteSource,
  /workorders: result\.workorders\.map\(fullWorkorderForAgent\)/,
  'list_lightspeed_workorders must not collapse full notes into a thin summary',
)
assert.match(
  agentRouteSource,
  /workorder: fullWorkorderForAgent\(workorder\)/,
  'get_lightspeed_workorder must return full workorder evidence',
)
assert.match(
  agentRouteSource,
  /event: 'customer_profile'/,
  'customer profile tool must stream a first-class profile card',
)
assert.match(
  agentRouteSource,
  /function buildLightspeedCustomerProfile/,
  'customer profile requests must use a dedicated profile builder',
)
// ── Direct paths are 100% LLM-routed: the router's structured decision owns the
// fast-path gate; deterministic code only prefetches data and parses dates. ──
assert.match(
  orchestrationSource,
  /direct_path: z\.enum\(\['customer_profile', 'customer_bikes', 'sales_summary', 'none'\]\)/,
  'router schema must own the direct-path decision',
)
assert.match(
  orchestrationSource,
  /entity_query: z\.string\(\)\.max\(160\)\.nullable\(\)/,
  'router schema must carry the direct-path entity',
)
assert.match(
  promptsModuleSource,
  /Direct-path doctrine/,
  'router prompt must teach the direct-path doctrine',
)
assert.match(
  executeModuleSource,
  /orchestration\.route === 'lightspeed_sql' \? orchestration\.direct_path : 'none'/,
  'executor must gate direct paths on the LLM router decision only',
)
assert.doesNotMatch(
  agentRouteSource,
  /extractCustomerProfileQuery|resolveCustomerBikeOwnershipLookup|extractCustomerBikeOwnershipQuery/,
  'regex direct-path extractors must not exist — routing is 100% LLM',
)
assert.match(
  executeModuleSource,
  /buildRoutingFramingMessage\(/,
  'executor must build routing framing for the routing_done status line',
)
assert.match(
  executeModuleSource,
  /phase: 'routing_done',\s*\n\s*text: routingFraming/,
  'routing framing must be emitted as routing_done status for the progress shimmer',
)
assert.doesNotMatch(
  executeModuleSource,
  /routing_framing/,
  'routing framing must not use a separate SSE event',
)
assert.match(
  executeModuleSource,
  /streamGroundedDirectAnswer/,
  'direct paths must stream a grounded model answer instead of a canned template',
)
assert.match(
  agentRouteSource,
  /function customerProfileAnswer\(profile: GenieCustomerProfilePayload\): string/,
  'direct customer profile requests must keep a deterministic fallback summary',
)
assert.match(
  agentRouteSource,
  /function latestCustomerReferenceFromMessages\(messages: Message\[\]\)/,
  'customer bike follow-ups must be able to resolve the referenced customer from previous structured messages',
)
assert.match(
  agentRouteSource,
  /profile\?\.status === 'resolved' && profile\.customer\?\.customer_id/,
  'follow-up customer context must prefer the most recent resolved customer profile',
)
assert.match(
  agentRouteSource,
  /message\.workorders\?\.workorders\.find/,
  'follow-up customer context must fall back to previous workorder cards when no profile card is present',
)
assert.match(
  agentRouteSource,
  /direct_customer_profile/,
  'customer bike ownership questions must bypass generic agent exploration',
)
assert.match(
  agentRouteSource,
  /sales_row_limit: 20_000/,
  'direct customer bike lookups must use a bounded sales row cap for latency',
)
assert.match(
  directPathsModuleSource,
  /function resolveDirectSalesSummaryPeriod/,
  'router-provided period phrases must be parsed deterministically into date ranges',
)
assert.match(
  executeModuleSource,
  /resolveDirectSalesSummaryPeriod\(entityQuery\)/,
  'direct sales summaries must parse the router entity_query period',
)
assert.match(
  executeModuleSource,
  /'direct_sales_summary'/,
  'direct sales summary path must be logged for latency analysis',
)
assert.match(
  agentRouteSource,
  /toolCallNames\.direct_sales_summary = 1/,
  'direct sales summary runs must be visible in telemetry tool counts',
)
assert.match(
  agentRouteSource,
  /DIRECT_SALES_SUMMARY_LINE_LIMIT = 10_000/,
  'direct sales summaries must use a bounded line cap',
)
assert.match(
  agentRouteSource,
  /\.gte\('complete_time', startUtc\)[\s\S]*?\.lt\('complete_time', endExclusiveUtc\)/,
  'direct sales summaries must use indexed UTC date bounds instead of generic SQL date casts',
)
assert.match(
  salesSummaryIndexMigrationSource,
  /lightspeed_sales_report_lines_user_complete_sale_cover_idx[\s\S]*customer_id[\s\S]*item_id[\s\S]*INCLUDE/,
  'sales summary migration must add a covering date/sale index for fast Genie summaries',
)
assert.match(
  salesSummaryIndexMigrationSource,
  /lightspeed_sales_report_lines_user_customer_complete_cover_idx/,
  'sales summary migration must add a customer/date covering index for customer profile and history speed',
)
assert.match(
  salesSummaryIndexMigrationSource,
  /lightspeed_sales_report_lines_user_item_complete_cover_idx/,
  'sales summary migration must add an item/date covering index for product sales and purchaser speed',
)
assert.match(
  agentRouteSource,
  /fetchCustomerSerializedBikeEvidence\(userId, customerId\)/,
  'customer profiles must include live customer-owned Serialized bike records',
)
assert.match(
  agentRouteSource,
  /make\/model not returned by Serialized API/,
  'workorder serialized IDs must still be surfaced when the Serialized detail fetch is incomplete',
)
assert.match(
  agentRouteSource,
  /listGenieWorkorders\(userId,[\s\S]*customer_id: customerId/,
  'customer profiles must fetch work orders directly by customerID',
)
assert.match(
  agentRouteSource,
  /include_archived: true/,
  'customer profiles must consider archived historical work orders',
)
assert.match(
  agentRouteSource,
  /inferredBikeProfilesFromHistory/,
  'customer profiles must include inferred bike evidence without treating it as the only source',
)
assert.match(
  agentRouteSource,
  /topCustomerItems/,
  'customer profiles must summarize top purchased items',
)
assert.match(
  agentRouteSource,
  /For customer bike ownership\/profile\/history requests/,
  'agent instructions must route customer bike ownership and profile requests to the profile tool',
)
assert.match(
  agentRuntimePolicySource,
  /'get_lightspeed_customer_profile'/,
  'Lightspeed routes must expose the customer profile tool',
)
assert.match(
  agentRouteSource,
  /The executor must inspect note, internal_note, warranty, labour line notes, item descriptions, item notes, serialized_id, sale_id, customer details, status, and dates before answering/,
  'planner must require complete workorder evidence review',
)
assert.match(
  agentRouteSource,
  /function workorderCustomerLookupQuery\(query: string\): string \| null/,
  'workorder searches must extract customer lookup text from phrased requests',
)
assert.match(
  agentRouteSource,
  /const lookupText = stripped \|\| clean[\s\S]*return tokens\.length >= 2 && tokens\.length <= 5 \? lookupText : null/,
  'customer workorder lookup extraction must strip generic command words before resolving names',
)
assert.match(
  agentRouteSource,
  /function shouldResolveWorkorderCustomerQuery\(query: string\)/,
  'bare customer-name workorder searches must have a deterministic customer resolver guard',
)
assert.match(
  agentRouteSource,
  /customer_id: z\.string\(\)\.optional\(\)\.describe\('Exact Lightspeed customer ID/,
  'list_lightspeed_workorders must expose exact customer_id to avoid slow name-scanned history lookups',
)
assert.match(
  agentRouteSource,
  /const scope = args\.scope \?\? \(noteSearch \|\| likelyCustomerQuery \? 'all' : 'open'\)/,
  'bare customer and note-style workorder queries must default to all history, not open-only',
)
assert.match(
  agentRouteSource,
  /const customerLookupQuery =[\s\S]*!noteSearch \? workorderCustomerLookupQuery\(originalQuery\) : null/,
  'list_lightspeed_workorders must derive a cleaned customer lookup query before deciding scope',
)
assert.match(
  agentRouteSource,
  /looksLikeWorkorderNoteSearch/,
  'issue/note workorder searches must skip customer-name resolution',
)
assert.match(
  agentRouteSource,
  /note_search: noteSearch/,
  'note-style workorder searches must use the note_search fetch path',
)
assert.match(
  promptsModuleSource,
  /Do not call search_lightspeed_customers or get_lightspeed_customer_profile for those searches/,
  'executor instructions must route note/issue workorder searches away from customer lookup',
)
assert.match(
  agentRouteSource,
  /if \(looksLikeWorkorderNoteSearch\(clean\)\) return null/,
  'issue/note phrases such as cracked frame must not be treated as customer names',
)
assert.match(
  agentRouteSource,
  /query = undefined/,
  'resolved customerID workorder queries must clear text filtering to avoid slow recent-scan misses',
)
assert.match(
  agentRouteSource,
  /query = customerLookupQuery/,
  'unresolved phrased customer workorder lookups must fall back to the cleaned customer text',
)
assert.match(
  agentRouteSource,
  /const includeArchived = args\.include_archived \?\? \(Boolean\(customerId\) && scope !== 'open'\)/,
  'resolved customer history workorder queries must include archived jobs unless explicitly scoped open',
)
assert.match(
  agentRouteSource,
  /max_pages_per_status: args\.max_pages_per_status \?\? \(noteSearch \? 6 : query \? 1 : undefined\)/,
  'note-style workorder searches must scan more pages; other text fallbacks stay page-bounded',
)
assert.match(
  workorderQuerySource,
  /options\.note_search/,
  'workorder query service must support note_search scanning mode',
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
assert.match(
  backgroundMigrationSource,
  /CREATE TABLE IF NOT EXISTS public\.genie_background_jobs/,
  'background workflow must have durable job storage',
)
assert.match(
  backgroundJobSource,
  /background: true/,
  'background workflow must use OpenAI Responses background mode',
)
assert.match(
  backgroundRouteSource,
  /startGenieBackgroundResponse/,
  'background job route must start background analysis responses',
)
assert.match(
  backgroundIdRouteSource,
  /retrieveGenieBackgroundResponse/,
  'background job detail route must refresh background response state',
)

// ── Streaming architecture: live SSE + durable job fallback, no HTTP loopback ─
assert.match(
  runGenieJobSource,
  /executeGenieAgent\(\{/,
  'background jobs must run the agent in-process',
)
assert.doesNotMatch(
  runGenieJobSource,
  /fetch\(`\$\{params\.origin\}/,
  'background jobs must not loopback-fetch the agent route over HTTP',
)
assert.doesNotMatch(
  runGenieJobSource,
  /cookieHeader/,
  'background jobs must not forward cookies — auth happens once in the request',
)
assert.match(
  startBackgroundRouteSource,
  /text\/event-stream/,
  'start-background must stream live agent events as SSE',
)
assert.match(
  startBackgroundRouteSource,
  /after\(\(\) => runPromise\)/,
  'the agent run must survive client disconnects via after()',
)
assert.match(
  startBackgroundRouteSource,
  /deduplicated: true/,
  'duplicate sends with the same client assistant id must reuse the in-flight job',
)
assert.match(
  genieJobsProviderSource,
  /readSSE\(body, /,
  'jobs provider must consume the live SSE stream',
)
assert.match(
  genieJobsProviderSource,
  /liveJobIdsRef/,
  'polling must not clobber live-streamed job state',
)
assert.match(
  backgroundRouteSource,
  /STALE_ACTIVE_JOB_MS/,
  'stale running jobs must be failed on read so the UI never spins forever',
)

// ── Latency: planner streams reasoning; prompts keep static prefixes cacheable ─
assert.match(
  orchestratorModuleSource,
  /stream: true,\s*maxTurns: 1/,
  'planner must stream so planning is not dead air',
)
assert.match(
  orchestratorModuleSource,
  /toRouterInputMessages\(args\.messages\)/,
  'router input must be trimmed for nano-model latency',
)
assert.match(
  promptsModuleSource,
  /ORCHESTRATOR_STATIC_INSTRUCTIONS/,
  'router prompt must keep its static doctrine as a cacheable prefix',
)
assert.match(
  promptsModuleSource,
  /STORE CONTEXT\n- Store: "\$\{storeName\}"/,
  'executor prompt must keep dynamic store/date content in a tail section',
)
assert.match(
  promptsModuleSource,
  /PLANNING CONTEXT\n- Store: "\$\{storeName\}"/,
  'planner prompt must keep dynamic store/date content in a tail section',
)

// ── Verification: no scenario-overfit rules; judged on high-stakes routes ─────
assert.doesNotMatch(
  answerVerificationSource,
  /apollo/i,
  'answer verification must not hardcode vendor-specific scenarios',
)
assert.match(
  answerVerificationSource,
  /verifyQuestionAnsweredWithJudge/,
  'high-stakes answers must support an LLM judge pass',
)
assert.match(
  agentRouteSource,
  /route === 'business_analysis' \|\| \(route === 'mixed' && executionPlan != null\)/,
  'the LLM judge must be gated to high-stakes routes only',
)

// ── Time budget: long runs are told to wrap up before the platform kills them ─
assert.match(
  executeModuleSource,
  /applyTimeBudgetToTools\(agentTools, requestStartedAt, RUN_TIME_BUDGET_MS, runtime\.fastAnswerPrompt\)/,
  'tool results must carry wrap-up directives when the run nears its time budget',
)

const decisionFixtures: Array<{ name: string; decision: GenieOrchestrationDecision }> = [
  {
    name: 'general chat',
    decision: { route: 'casual_chat', needs_plan: false, direct_path: 'none', entity_query: null, reason: 'Casual greeting/capability chat.' },
  },
  {
    name: 'internet search',
    decision: { route: 'web_research', needs_plan: false, direct_path: 'none', entity_query: null, reason: 'Needs current public web facts.' },
  },
  {
    name: 'inventory search',
    decision: { route: 'lightspeed_sql', needs_plan: false, direct_path: 'none', entity_query: null, reason: 'Direct Lightspeed inventory lookup.' },
  },
  {
    name: 'hard SQL',
    decision: { route: 'lightspeed_sql', needs_plan: true, direct_path: 'none', entity_query: null, reason: 'Complex multi-pass Lightspeed analysis.' },
  },
  {
    name: 'deep bike-store analysis',
    decision: { route: 'business_analysis', needs_plan: true, direct_path: 'none', entity_query: null, reason: 'Broad profitability strategy analysis.' },
  },
  {
    name: 'SQL plus internet',
    decision: { route: 'mixed', needs_plan: true, direct_path: 'none', entity_query: null, reason: 'Needs private store data plus public market research.' },
  },
  {
    name: 'customer bike fitment plus internet compatibility',
    decision: {
      route: 'mixed',
      needs_plan: false,
      direct_path: 'none',
      entity_query: null,
      reason: 'Standard customer-bike compatibility flow: resolve private bike context, then check public technical evidence.',
    },
  },
  {
    name: 'discount candidates plus internet competitor pricing',
    decision: {
      route: 'mixed',
      needs_plan: true,
      direct_path: 'none',
      entity_query: null,
      reason: 'Needs private discount-candidate analysis plus public competitor pricing research.',
    },
  },
  {
    name: 'Lightspeed brand/category write-back',
    decision: { route: 'storefront_action', needs_plan: false, direct_path: 'none', entity_query: null, reason: 'Direct approval-staged Lightspeed catalogue edit.' },
  },
  {
    name: 'open work orders',
    decision: { route: 'lightspeed_sql', needs_plan: false, direct_path: 'none', entity_query: null, reason: 'Direct live Lightspeed work order lookup.' },
  },
  {
    name: 'direct customer profile',
    decision: { route: 'lightspeed_sql', needs_plan: false, direct_path: 'customer_profile', entity_query: 'Jack Lloyd', reason: 'Broad single-customer profile request.' },
  },
  {
    name: 'direct customer bikes follow-up',
    decision: { route: 'lightspeed_sql', needs_plan: false, direct_path: 'customer_bikes', entity_query: 'Sarah Down', reason: 'Bike ownership for previously-referenced customer.' },
  },
  {
    name: 'direct sales summary',
    decision: { route: 'lightspeed_sql', needs_plan: false, direct_path: 'sales_summary', entity_query: 'yesterday', reason: 'Simple single-period sales total.' },
  },
  {
    name: 'complex homepage campaign',
    decision: { route: 'storefront_action', needs_plan: true, direct_path: 'none', entity_query: null, reason: 'Broad multi-step merchandising campaign.' },
  },
]

for (const fixture of decisionFixtures) {
  assert.deepEqual(
    GenieOrchestrationDecisionSchema.parse(fixture.decision),
    fixture.decision,
    `${fixture.name}: decision fixture must match router schema`,
  )
}

const routerPromptFixtures: Array<{
  name: string
  message: string
  route: GenieOrchestrationDecision['route']
  needs_plan: boolean
}> = [
  {
    name: 'simple thanks',
    message: 'Thanks',
    route: 'casual_chat',
    needs_plan: false,
  },
  {
    name: 'gmail connect',
    message: 'Connect my Gmail',
    route: 'storefront_action',
    needs_plan: true,
  },
  {
    name: 'direct work orders',
    message: 'show me all workorders for Jack Lloyd',
    route: 'lightspeed_sql',
    needs_plan: false,
  },
  {
    name: 'customer profile',
    message: 'what do we know about Sarah Down?',
    route: 'lightspeed_sql',
    needs_plan: false,
  },
  {
    name: 'tell me about explicit customer',
    message: 'tell me about customer Jack Lloyd',
    route: 'lightspeed_sql',
    needs_plan: false,
  },
  {
    name: 'bare customer shorthand',
    message: 'customer Jack Lloyd',
    route: 'lightspeed_sql',
    needs_plan: false,
  },
  {
    name: 'tell me about named customer',
    message: 'tell me about Jack Lloyd',
    route: 'lightspeed_sql',
    needs_plan: false,
  },
  {
    name: 'customer bike ownership',
    message: 'what bikes does Sarah Down have',
    route: 'lightspeed_sql',
    needs_plan: false,
  },
  {
    name: 'customer fitment',
    message: 'What bottom bracket does Jackson Trotman need from his workorder?',
    route: 'mixed',
    needs_plan: false,
  },
  {
    name: 'customer BB shorthand fitment',
    message: 'what BB does Jack Lloyd need on his bike',
    route: 'mixed',
    needs_plan: false,
  },
  {
    name: 'known bike model fitment',
    message: 'What bottom bracket does a Trek Madone Gen 8 need?',
    route: 'web_research',
    needs_plan: false,
  },
  {
    name: 'pro race standings',
    message: 'Who leads the points classification in the Tour de Suisse?',
    route: 'web_research',
    needs_plan: false,
  },
  {
    name: 'business analysis',
    message: 'How can we make more money this quarter?',
    route: 'business_analysis',
    needs_plan: true,
  },
  {
    name: 'business report email',
    message: 'Send an email of business performance for the last 30 days to tom@example.com',
    route: 'mixed',
    needs_plan: true,
  },
  {
    name: 'direct carousel',
    message: 'Make a Summer Sale carousel for all Clif bars',
    route: 'storefront_action',
    needs_plan: false,
  },
  {
    name: 'supplier warranty email',
    message: 'Email Apollo warranty and tell them we have a faulty Trace 30 frame',
    route: 'storefront_action',
    needs_plan: true,
  },
  {
    name: 'external visual',
    message: 'What does a Trek Madone Gen 8 look like?',
    route: 'web_research',
    needs_plan: false,
  },
  {
    name: 'capability question',
    message: 'What can you do?',
    route: 'casual_chat',
    needs_plan: false,
  },
]

for (const fixture of routerPromptFixtures) {
  assert.match(
    agentRouteSource,
    new RegExp(`${fixture.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*${fixture.route}.*needs_plan=${fixture.needs_plan}`, 's'),
    `${fixture.name}: router prompt example must specify route and planner flag`,
  )
}

assert.match(agentRouteSource, /Business report email/, 'router must classify store-data email tasks as mixed')
assert.match(agentRouteSource, /do NOT plan search_gmail/, 'planner must not search Gmail before new store-data emails')
assert.doesNotMatch(agentRouteSource, /Use before ANY email answer/, 'Gmail search must not be described as mandatory for every email task')

function assertToolPolicy(args: {
  name: string
  route: GenieOrchestrationDecision['route']
  message: string
  plannedTools?: string[]
  includes: string[]
  excludes: string[]
  hostedWeb: boolean
  parallel: boolean
  concurrency: number
}) {
  const toolNames = toolNameSetForRoute(args.route, args.plannedTools ?? [])
  if (userRequestsWebImages(args.message) && (args.route === 'web_research' || args.route === 'mixed')) {
    toolNames.add('search_web_images')
  }
  for (const toolName of args.includes) {
    assert.equal(toolNames.has(toolName), true, `${args.name}: should include ${toolName}`)
  }
  for (const toolName of args.excludes) {
    assert.equal(toolNames.has(toolName), false, `${args.name}: should exclude ${toolName}`)
  }
  assert.equal(shouldExposeHostedWebSearch(args.route), args.hostedWeb, `${args.name}: hosted web policy`)
  assert.equal(canRunParallelTools(args.route), args.parallel, `${args.name}: parallel tool policy`)
  assert.equal(maxToolConcurrencyForRoute(args.route), args.concurrency, `${args.name}: tool concurrency`)
}

const toolPolicyFixtures: Array<Parameters<typeof assertToolPolicy>[0]> = [
  {
    name: 'direct carousel action',
    route: 'storefront_action',
    message: 'Make a Summer Sale carousel for Clif bars',
    includes: ['get_store_carousels', 'search_store_products', 'propose_create_carousel', 'verify_question_answered'],
    excludes: ['search_gmail', 'run_lightspeed_sql_query', 'search_web_images'],
    hostedWeb: false,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'gmail connect action',
    route: 'storefront_action',
    message: 'Connect my Gmail',
    plannedTools: ['get_gmail_connection_status', 'search_gmail', 'propose_gmail_email'],
    includes: ['get_gmail_connection_status', 'search_gmail', 'propose_gmail_email', 'verify_question_answered'],
    excludes: ['run_lightspeed_sql_query', 'search_web_images'],
    hostedWeb: false,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'store data email',
    route: 'storefront_action',
    message: 'send an email of business performance for last 30 days to tom@lidgett.net must be detailed',
    plannedTools: ['run_lightspeed_sql_query', 'get_gmail_connection_status', 'propose_gmail_email', 'verify_question_answered'],
    includes: ['record_lightspeed_plan', 'run_lightspeed_sql_query', 'get_gmail_connection_status', 'propose_gmail_email', 'verify_question_answered'],
    excludes: ['search_gmail', 'read_gmail_messages', 'search_web_images'],
    hostedWeb: false,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'lightspeed reporting',
    route: 'lightspeed_sql',
    message: 'Show top customers this year',
    includes: ['run_lightspeed_sql_query', 'search_lightspeed_inventory', 'get_lightspeed_customer_profile', 'list_lightspeed_workorders', 'verify_question_answered'],
    excludes: ['get_store_carousels', 'search_gmail', 'search_web_images'],
    hostedWeb: false,
    parallel: true,
    concurrency: 6,
  },
  {
    name: 'web research',
    route: 'web_research',
    message: 'What bottom bracket does a Trek Madone Gen 8 need?',
    includes: ['web_search', 'verify_question_answered', 'consult_cycling_compatibility_specialist'],
    excludes: ['search_web_images', 'run_lightspeed_sql_query', 'get_store_carousels', 'search_gmail'],
    hostedWeb: true,
    parallel: true,
    concurrency: 4,
  },
  {
    name: 'web research visual',
    route: 'web_research',
    message: 'What does a Trek Madone Gen 8 look like?',
    includes: ['search_web_images', 'verify_question_answered', 'consult_cycling_compatibility_specialist'],
    excludes: ['run_lightspeed_sql_query', 'search_gmail'],
    hostedWeb: true,
    parallel: true,
    concurrency: 4,
  },
  {
    name: 'web research race standings',
    route: 'web_research',
    message: 'Who leads the points classification in the Tour de Suisse?',
    includes: ['web_search', 'verify_question_answered', 'consult_cycling_compatibility_specialist'],
    excludes: ['search_web_images', 'run_lightspeed_sql_query', 'search_gmail'],
    hostedWeb: true,
    parallel: true,
    concurrency: 4,
  },
  {
    name: 'customer workorder compatibility research',
    route: 'mixed',
    message: 'What bottom bracket does Jackson Trotman need from his workorder?',
    includes: ['resolve_customer_bike_context', 'consult_cycling_compatibility_specialist', 'verify_question_answered'],
    excludes: ['run_lightspeed_sql_query', 'search_lightspeed_inventory', 'list_lightspeed_workorders', 'search_web_images', 'search_gmail', 'propose_discount'],
    hostedWeb: true,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'mixed pricing research',
    route: 'mixed',
    message: 'How does our pricing compare to competitors?',
    plannedTools: ['run_lightspeed_sql_query', 'get_product_costs', 'search_store_products', 'search_web_images'],
    includes: ['run_lightspeed_sql_query', 'get_product_costs', 'search_store_products', 'search_web_images'],
    excludes: ['search_gmail', 'propose_discount'],
    hostedWeb: true,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'mixed store data email',
    route: 'mixed',
    message: 'Send an email of business performance for the last 30 days to tom@example.com',
    plannedTools: ['run_lightspeed_sql_query', 'get_gmail_connection_status', 'propose_gmail_email', 'verify_question_answered'],
    includes: ['record_lightspeed_plan', 'run_lightspeed_sql_query', 'get_gmail_connection_status', 'propose_gmail_email', 'verify_question_answered'],
    excludes: ['search_gmail', 'read_gmail_messages'],
    hostedWeb: true,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'mixed proposal plus research',
    route: 'mixed',
    message: 'Stage a 20% discount and compare competitor pricing',
    plannedTools: ['run_lightspeed_sql_query', 'search_web_images', 'propose_discount', 'propose_price_update'],
    includes: ['run_lightspeed_sql_query', 'search_web_images', 'propose_discount', 'propose_price_update'],
    excludes: ['search_gmail'],
    hostedWeb: true,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'business analysis',
    route: 'business_analysis',
    message: 'How can we make more money?',
    includes: ['record_lightspeed_plan', 'run_lightspeed_sql_query', 'get_lightspeed_stale_inventory_cash', 'consult_bike_store_analyst'],
    excludes: ['verify_question_answered', 'search_gmail', 'propose_discount', 'search_web_images'],
    hostedWeb: false,
    parallel: true,
    concurrency: 6,
  },
]

for (const fixture of toolPolicyFixtures) {
  assertToolPolicy(fixture)
}

const renderedHeading = renderGenieMarkdown('### Key Findings\n\nBody')
assert.equal(
  (renderedHeading.match(/<h3/g) ?? []).length,
  1,
  'Markdown headings should render exactly once',
)
assert.match(
  renderedHeading,
  /<h3 class=/,
  'Markdown headings should use semantic heading markup',
)

const renderedUnsafe = renderGenieMarkdown('<script>alert("x")</script> **safe**')
assert.equal(
  renderedUnsafe.includes('<script>'),
  false,
  'Markdown renderer must escape raw HTML',
)
assert.match(
  renderedUnsafe,
  /&lt;script&gt;alert/,
  'Markdown renderer must preserve escaped text visibly',
)
assert.match(
  renderedUnsafe,
  /<strong>safe<\/strong>/,
  'Markdown renderer must still support bold text after escaping',
)

const renderedLink = renderGenieMarkdown('[Shimano](https://bike.shimano.com/example)')
assert.match(
  renderedLink,
  /<a class="[^"]+" href="https:\/\/bike\.shimano\.com\/example" target="_blank" rel="noreferrer">Shimano<\/a>/,
  'Home Markdown renderer should turn safe Markdown links into anchors',
)
const renderedProductLink = renderGenieMarkdown('[Orbea Alma](/marketplace/product/product-123)')
assert.match(
  renderedProductLink,
  /href="\/marketplace\/product\/product-123"/,
  'Home Markdown renderer should turn internal product links into anchors',
)
const renderedTextLink = renderGenieMarkdown('[Shimano](https://bike.shimano.com/example) https://example.com', {
  compact: true,
  linkMode: 'text',
})
assert.equal(
  renderedTextLink.includes('href='),
  false,
  'Text-link mode should not emit anchors',
)
assert.equal(
  renderedTextLink.includes('https://example.com'),
  false,
  'Text-link mode should strip bare URLs',
)
assert.match(
  renderedTextLink,
  /Shimano/,
  'Text-link mode should preserve Markdown link labels',
)

const renderedTable = renderGenieMarkdown([
  '| Product | Recommendation |',
  '| --- | --- |',
  '| Trek Madone | Keep premium position and verify exact build before compatibility advice |',
].join('\n'))
assert.match(
  renderedTable,
  /rounded-md/,
  'Markdown tables should use compact rounded corners',
)
assert.match(
  renderedTable,
  /whitespace-normal break-words/,
  'Markdown table cells should wrap long answer text',
)
assert.equal(
  renderedTable.includes('rounded-2xl'),
  false,
  'Markdown tables should avoid oversized card-like rounding',
)

const renderedTakeaway = renderGenieMarkdown(
  '> Biggest opportunity: $207.2k of Lightspeed stock at cost is stale/no sale in 180+ days — most heavily in bikes.',
)
assert.match(
  renderedTakeaway,
  /rounded-md border border-gray-200 bg-white/,
  'Takeaway blockquotes should use a clean white card without accent borders',
)
assert.equal(
  renderedTakeaway.includes('border-primary'),
  false,
  'Takeaway blockquotes should not use primary accent borders',
)
assert.match(
  renderedTakeaway,
  /<span class="font-semibold text-gray-900">Biggest opportunity:<\/span>/,
  'Takeaway blockquotes should emphasise the label before the colon',
)

const renderedOrderedList = renderGenieMarkdown([
  '## Recommended Actions',
  '1. First action',
  '',
  '1. Second action',
  '',
  '1. Third action',
].join('\n'))
assert.equal(
  (renderedOrderedList.match(/<ol/g) ?? []).length,
  1,
  'Ordered lists should stay open across blank lines between items',
)
assert.equal(
  (renderedOrderedList.match(/<li/g) ?? []).length,
  3,
  'Ordered lists should render every item inside one list',
)

const renderedOrderedListWithContinuations = renderGenieMarkdown([
  '## Next actions, ranked',
  '1. **Stop discounting by default.**',
  '',
  'It sold 41 units and made $1,232.64 GP, but carried a 39.16% discount rate.',
  '',
  '1. **Investigate June margin immediately.**',
  '',
  'June sold $883.52, 12 units, but only 14.19% margin with $0 discount.',
  '',
  '1. **Clear no-sale stock first.**',
  '',
  'MagicShine SEEMEE DV CAM and KNOG BIG Cobber Twinpack are the biggest idle-cost lines.',
].join('\n'))
assert.equal(
  (renderedOrderedListWithContinuations.match(/<ol/g) ?? []).length,
  1,
  'Ordered lists with continuation paragraphs should stay in one list',
)
assert.equal(
  (renderedOrderedListWithContinuations.match(/<li/g) ?? []).length,
  3,
  'Ordered lists with continuation paragraphs should render every ranked item',
)

const progressFixtures: Array<{ phase: string; input: string; compact: string; live: string }> = [
  {
    phase: 'context',
    input: 'Reading conversation context',
    compact: 'Reading context',
    live: 'Reading context',
  },
  {
    phase: 'routing',
    input: 'Choosing the best workflow',
    compact: 'Choosing workflow',
    live: 'Choosing workflow',
  },
  {
    phase: 'routing_done',
    input: 'Workflow selected: Store data plus research',
    compact: 'Workflow: Store data plus research',
    live: 'Workflow: Store data plus research',
  },
  {
    phase: 'setup',
    input: 'Preparing 8 route tools',
    compact: 'Preparing tools',
    live: 'Preparing tools',
  },
  {
    phase: 'tool_done',
    input: 'SQL result ready',
    compact: 'SQL result ready',
    live: 'SQL result ready',
  },
  {
    phase: 'lightspeed_customers',
    input: 'Resolving customer profile for "Sarah Down"',
    compact: 'Resolving: Sarah Down',
    live: 'Resolving: Sarah Down',
  },
  {
    phase: 'lightspeed_workorders',
    input: 'Searching work order notes for "cracked frame"',
    compact: 'Notes: cracked frame',
    live: 'Notes: cracked frame',
  },
  {
    phase: 'lightspeed_customers',
    input: 'Reading sales, bikes, and workshop history for Sarah Down',
    compact: 'History: Sarah Down',
    live: 'History: Sarah Down',
  },
  {
    phase: 'responding',
    input: 'Writing the final answer',
    compact: 'Writing answer',
    live: 'Writing answer',
  },
  {
    phase: 'customer_context',
    input: 'Finding customer context for "Jackson Trotman"',
    compact: 'Customer: Jackson Trotman',
    live: 'Customer: Jackson Trotman',
  },
  {
    phase: 'customer_context',
    input: 'Reading customer bike records',
    compact: 'Reading bike records',
    live: 'Reading bike records',
  },
  {
    phase: 'customer_context',
    input: 'Reading workorder bike records',
    compact: 'Workorder bike links',
    live: 'Workorder bike links',
  },
  {
    phase: 'specialist',
    input: 'Checking fitment with mechanic specialist',
    compact: 'Mechanic review',
    live: 'Mechanic review',
  },
]

for (const fixture of progressFixtures) {
  assert.equal(compactGenieProgressText(fixture.input, fixture.phase), fixture.compact, `${fixture.phase}: compact progress`)
  assert.equal(liveGenieProgressPreview(fixture.input, fixture.phase), fixture.live, `${fixture.phase}: live progress`)
}

assert.equal(
  buildRoutingFramingMessage({
    orchestration: {
      route: 'business_analysis',
      needs_plan: true,
      direct_path: 'none',
      entity_query: null,
      reason: 'Broad commercial review across multiple lenses.',
    },
    userMessage: 'How can we make more money this quarter?',
  }),
  "I'll treat this as a business performance question — I'll analyse your store data and rank what matters most.",
  'business analysis framing should stay user-facing and omit router internals',
)

assert.equal(
  buildRoutingFramingMessage({
    orchestration: {
      route: 'lightspeed_sql',
      needs_plan: false,
      direct_path: 'sales_summary',
      entity_query: 'last month',
      reason: 'Deterministic fast path for a simple sales summary period.',
    },
    userMessage: 'Any sales last month?',
  }),
  "I'll treat this as a sales summary question for last month.",
  'direct sales summary framing should name the period',
)

assert.equal(
  buildRoutingFramingMessage({
    orchestration: {
      route: 'casual_chat',
      needs_plan: false,
      direct_path: 'none',
      entity_query: null,
      reason: 'Short acknowledgement.',
    },
    userMessage: 'Thanks',
  }),
  null,
  'casual chat should not show routing framing',
)

assert.equal(
  buildDeepResearchFramingMessage(),
  "I'll treat this as a full Deep Business Review — a forensic pass across finance, sales, inventory, customers, staffing, suppliers, and market trends.",
  'deep research framing should describe the long-running review',
)

assert.equal(
  liveGenieProgressPreview(
    "I'll treat this as a store lookup question.",
    'routing_done',
  ),
  "I'll treat this as a store lookup question.",
  'routing framing should appear in the live progress shimmer',
)

const framingSteps = [
  { phase: 'routing', text: 'Choosing workflow' },
  {
    phase: 'routing_done',
    text: "I'll treat this as a store lookup question.",
    sourceText: "I'll treat this as a store lookup question.",
  },
  { phase: 'setup', text: 'Preparing tools' },
]
assert.equal(
  liveGenieDisplayStep(framingSteps)?.text,
  'Preparing tools',
  'live shimmer should always show the latest progress step',
)
assert.equal(
  liveGenieDisplayStep([
    ...framingSteps,
    { phase: 'lightspeed_sales', text: 'SQL: Compare gross sales Jun 1-18 vs prior year' },
  ])?.text,
  'SQL: Compare gross sales Jun 1-18 vs prior year',
  'live shimmer should advance to the newest tool status',
)

assert.equal(
  liveGenieSubCommentary(
    {
      phase: 'lightspeed_sales',
      text: 'Running SQL',
      sourceText: 'Running SQL report: Compare gross sales Jun 1-18 vs prior year',
      kind: 'status',
    },
    { mainLabel: 'Running SQL' },
  ),
  'Compare gross sales Jun 1-18 vs prior year',
  'sub commentary should surface SQL report purpose',
)

assert.equal(
  liveGenieSubCommentary(
    {
      phase: 'routing_done',
      text: "I'll treat this as a business analysis question.",
      sourceText: "I'll treat this as a business analysis question.",
      kind: 'status',
    },
    {
      mainLabel: "I'll treat this as a business analysis question.",
      analysisPlan: { user_intent: 'Compare light category performance year to date' },
    },
  ),
  'Compare light category performance year to date',
  'sub commentary should show planner intent after routing framing',
)

assert.equal(
  liveGenieSubCommentary(undefined, {
    analysisQueries: [
      {
        purpose: 'Classify active inventory into light-related vs non-light categories',
        status: 'running',
      },
    ],
  }),
  'Classify active inventory into light-related vs non-light categories',
  'sub commentary should prefer the active analysis query purpose',
)

assert.equal(
  liveGenieSubCommentary(
    {
      phase: 'routing_done',
      text: "I'll treat this as a store lookup question.",
      sourceText: "I'll treat this as a store lookup question.",
      kind: 'status',
    },
    { mainLabel: "I'll treat this as a store lookup question." },
  ),
  null,
  'sub commentary should stay hidden when there is no extra detail',
)

const appended = appendGenieProgressStep(undefined, 'routing_done', "I'll treat this as a sales summary question.")
assert.equal(appended.length, 1)
assert.equal(
  appendGenieProgressStep(appended, 'routing_done', "I'll treat this as a sales summary question.").length,
  1,
  'duplicate routing status lines should not be appended twice',
)

const businessDossier = buildBusinessAnalysisDossier({
  storeName: 'Yellow Jersey',
  userQuestion: 'How is the business performing vs last year?',
  analysisQueries: [
    {
      id: 'q1',
      tool_name: 'run_lightspeed_sql_query',
      purpose: 'Compare gross sales Jun 1-18 vs prior year',
      sql: 'select 1',
      status: 'ok',
      at: new Date().toISOString(),
      row_count: 2,
    },
  ],
  tables: [
    {
      title: 'Period comparison',
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'current', label: 'Current' }],
      rows: [{ metric: 'Gross sales', current: '$15,779.89' }],
    },
  ],
})
assert.match(
  businessDossier,
  /Compare gross sales Jun 1-18 vs prior year/,
  'business analysis dossier must include executed query purposes',
)
assert.doesNotMatch(
  businessDossier,
  /sql: select 1/,
  'successful query SQL should not be included in the synthesis dossier',
)
assert.match(
  businessAnalysisPresentationContract(),
  /not bound to a fixed section template/,
  'business analysis presentation contract should let the synthesiser choose format',
)
assert.match(
  businessAnalysisPresentationContract(),
  /commercial answer/,
  'business analysis presentation contract should still require a clear commercial answer',
)
assert.equal(
  businessAnalysisDossierHasEvidence({
    storeName: 'Test Store',
    userQuestion: 'How are we tracking?',
    analysisQueries: [{ id: '1', tool_name: 'run_lightspeed_sql_query', purpose: 'Sales', sql: 'select 1', status: 'ok', at: new Date().toISOString(), row_count: 3 }],
  }),
  true,
  'business analysis dossier must count successful SQL queries as evidence',
)

const businessFallbackAnswer = buildBusinessAnalysisFallbackAnswer({
  storeName: 'Yellow Jersey',
  userQuestion: 'Analyse bike light sales',
  analysisPlan: {
    source: 'planner',
    user_intent: 'Deep Lightspeed analysis of bike light sales performance',
    execution_steps: ['Run SQL pass 1', 'Run SQL pass 2', 'Run SQL pass 3'],
    answer_success_criteria: ['Summarise sales', 'Identify top products', 'Warn about data quality'],
  },
  analysisQueries: [
    {
      id: 'overall',
      tool_name: 'run_lightspeed_sql_query',
      purpose: 'Overall bike light sales performance',
      sql: 'select * from sales',
      status: 'ok',
      at: new Date().toISOString(),
      row_count: 1,
      result_preview: JSON.stringify([
        {
          period: '2025-06-18 to 2026-06-18',
          net_sales: 27905.48,
          units_sold: 287,
          gross_profit: 11553.58,
          gross_margin_pct: 41.4,
          discount_dollars: 2338.97,
          discount_rate_pct: 7.73,
          current_sellable_units: 324,
          current_stock_value_at_cost: 11441.45,
        },
      ]),
    },
    {
      id: 'products',
      tool_name: 'run_lightspeed_sql_query',
      purpose: 'Top-selling bike light products',
      sql: 'select * from products',
      status: 'ok',
      at: new Date().toISOString(),
      row_count: 2,
      result_preview: JSON.stringify([
        {
          product: 'F24 IZALCO MAX 9.8 - Large 56 White/LightGrey',
          net_sales: 6818.17,
          units_sold: 1,
          gross_margin_pct: 23.09,
        },
        {
          product: 'LUNAR Supernova Twinpack',
          net_sales: 1553.18,
          units_sold: 41,
          gross_margin_pct: 79.36,
          sellable: 29,
        },
      ]),
    },
  ],
})
assert.match(
  businessFallbackAnswer,
  /\$27,905 net sales/,
  'fallback answer should summarise collected sales evidence',
)
assert.match(
  businessFallbackAnswer,
  /Data quality warning/,
  'fallback answer should warn when broad light matching catches false positives',
)
assert.match(
  readFileSync(join(root, 'src/lib/genie/agent/business-analysis-synthesis.ts'), 'utf8'),
  /retrying settled synthesis from collected evidence/,
  'business analysis synthesis should retry non-streamed before deterministic fallback',
)
assert.equal(
  businessAnalysisDossierHasEvidence({
    storeName: 'Test Store',
    userQuestion: 'How are we tracking?',
    analysisPlan: {
      user_intent: 'Compare periods',
      date_range_label: 'YTD',
      sql_strategy_summary: 'Compare sales',
      execution_steps: ['Run SQL'],
      answer_success_criteria: ['Show sales'],
      primary_tools: ['run_lightspeed_sql_query'],
    },
  }),
  false,
  'business analysis dossier must not treat plan-only input as evidence',
)
assert.equal(
  businessAnalysisDossierHasSufficientEvidence({
    storeName: 'Test Store',
    userQuestion: 'Analyse lights performance',
    analysisPlan: {
      user_intent: 'Deep analysis of lights sales performance and margin opportunities',
      date_range_label: '2025-06-18 -> 2026-06-18',
      sql_strategy_summary: 'Classify lights, then analyse sales, ranking, discount, margin, and inventory opportunities',
      execution_steps: [
        'Identify light-related sales and inventory universe',
        'Run sales trend query',
        'Run item ranking query',
        'Run weak-performer query',
      ],
      answer_success_criteria: [
        'Quantify sales and units',
        'Name best sellers',
        'Recommend discount candidates',
      ],
      primary_tools: ['run_lightspeed_sql_query'],
    },
    analysisQueries: [
      {
        id: 'setup-only',
        tool_name: 'run_lightspeed_sql_query',
        purpose: 'Identify light-related sales and inventory universe',
        sql: 'select 1',
        status: 'ok',
        at: new Date().toISOString(),
        row_count: 80,
      },
    ],
  }),
  false,
  'broad business analysis must not treat a single setup/classification query as sufficient evidence',
)
assert.equal(
  businessAnalysisDossierHasSufficientEvidence({
    storeName: 'Test Store',
    userQuestion: 'Analyse lights performance',
    analysisPlan: {
      user_intent: 'Deep analysis of lights sales performance and margin opportunities',
      date_range_label: '2025-06-18 -> 2026-06-18',
      sql_strategy_summary: 'Classify lights, then analyse sales, ranking, discount, margin, and inventory opportunities',
      execution_steps: [
        'Identify light-related sales and inventory universe',
        'Run current inventory universe query',
        'Run weak-performer query',
      ],
      answer_success_criteria: [
        'Quantify sales and units',
        'Name best sellers',
        'Recommend discount candidates',
      ],
      primary_tools: ['run_lightspeed_sql_query'],
    },
    analysisQueries: [
      {
        id: 'setup',
        tool_name: 'run_lightspeed_sql_query',
        purpose: 'Identify light-related sales and inventory universe',
        sql: 'select 1',
        status: 'ok',
        at: new Date().toISOString(),
        row_count: 80,
      },
      {
        id: 'weak-inventory',
        tool_name: 'run_lightspeed_sql_query',
        purpose: 'Current bike light inventory universe and stock snapshot',
        sql: 'select 1',
        status: 'ok',
        at: new Date().toISOString(),
        row_count: 80,
      },
    ],
  }),
  false,
  'broad business analysis must not treat setup plus weak inventory-only evidence as sufficient',
)
assert.equal(
  businessAnalysisDossierHasSufficientEvidence({
    storeName: 'Test Store',
    userQuestion: 'Analyse lights performance',
    analysisPlan: {
      user_intent: 'Deep analysis of lights sales performance and margin opportunities',
      date_range_label: '2025-06-18 -> 2026-06-18',
      sql_strategy_summary: 'Analyse sales, ranking, discount, margin, and inventory opportunities',
      execution_steps: ['Run sales trend query', 'Run item ranking query', 'Run weak-performer query'],
      answer_success_criteria: ['Quantify sales and units', 'Name best sellers', 'Recommend discount candidates'],
      primary_tools: ['run_lightspeed_sql_query'],
    },
    analysisQueries: [
      {
        id: 'sales',
        tool_name: 'run_lightspeed_sql_query',
        purpose: 'Sales trend for light products',
        sql: 'select 1',
        status: 'ok',
        at: new Date().toISOString(),
        row_count: 12,
      },
      {
        id: 'ranking',
        tool_name: 'run_lightspeed_sql_query',
        purpose: 'Item ranking for light products',
        sql: 'select 1',
        status: 'ok',
        at: new Date().toISOString(),
        row_count: 20,
      },
    ],
  }),
  true,
  'broad business analysis can synthesize after multiple successful evidence passes',
)

const resumeJob: GenieJob = {
  id: 'job-resume-1',
  status: 'running',
  prompt: 'Run a business analysis',
  message: 'Checking sales',
  progressPhase: 'lightspeed_sales',
  errorMessage: null,
  conversationId: 'conv-resume-1',
  metadata: { client_assistant_id: 'assistant-resume-1', source: 'homev2' },
  result: { assistantMessage: { role: 'assistant', content: 'Partial answer' } },
  updatedAt: new Date().toISOString(),
  completedAt: null,
}
const resumedMessages = ensureAssistantMessageForJob(
  [{ id: 'user-1', role: 'user', content: 'Run a business analysis' }],
  resumeJob,
)
assert.equal(
  resumedMessages.length,
  2,
  'resuming a running job should insert the assistant placeholder when missing',
)
assert.equal(
  resumedMessages[1]?.id,
  'assistant-resume-1',
  'resumed assistant placeholder must keep the background job assistant id',
)

const streamFinishedJob: GenieJob = {
  id: 'job-1',
  status: 'completed',
  prompt: 'sales',
  message: 'Complete',
  progressPhase: 'done',
  errorMessage: null,
  conversationId: null,
  metadata: {},
  result: { assistantMessage: { role: 'assistant', content: 'Full sales comparison answer.' } },
  updatedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
}
const staleRunningPoll: GenieJob = {
  ...streamFinishedJob,
  status: 'running',
  message: 'SQL result ready',
  progressPhase: 'tool_done',
  completedAt: null,
  result: { assistantMessage: { role: 'assistant', content: 'Yep' } },
}
assert.equal(
  mergeGenieJobSnapshots(streamFinishedJob, staleRunningPoll).status,
  'completed',
  'polled running snapshots must not downgrade a locally finished stream job',
)
assert.equal(
  mergeGenieJobSnapshots(streamFinishedJob, staleRunningPoll).result?.assistantMessage?.content,
  'Full sales comparison answer.',
  'polled running snapshots must not replace richer streamed answer text',
)

const telemetrySummary = summarizeGenieAgentRuns([
  { status: 'completed', first_text_ms: 900, total_ms: 4_000 },
  { status: 'completed', first_text_ms: 1_100, total_ms: 5_000 },
  { status: 'error', first_text_ms: null, total_ms: 8_000 },
])
assert.deepEqual(
  telemetrySummary,
  {
    sample_count: 3,
    completed_count: 2,
    error_count: 1,
    avg_total_ms: 5667,
    p50_total_ms: 5000,
    p90_total_ms: 8000,
    avg_first_text_ms: 1000,
    p50_first_text_ms: 900,
    p90_first_text_ms: 1100,
  },
  'telemetry latency summary should calculate counts and percentiles',
)

console.log(JSON.stringify({
  router_model: 'gpt-5.4-nano',
  router_prompt_fixtures: routerPromptFixtures.length,
  tool_policy_fixtures: toolPolicyFixtures.length,
  markdown_renderer_checks: 13,
  progress_status_checks: progressFixtures.length * 2,
  routing_framing_checks: 4,
  job_snapshot_merge_checks: 2,
  telemetry_summary_checks: 1,
  schema_fixtures: decisionFixtures.length,
  planner_cases: decisionFixtures.filter(fixture => fixture.decision.needs_plan).length,
  no_planner_cases: decisionFixtures.filter(fixture => !fixture.decision.needs_plan).length,
  structured_context_checks: 8,
}, null, 2))
