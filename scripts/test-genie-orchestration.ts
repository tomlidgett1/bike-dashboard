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
import { compactGenieProgressText, liveGenieProgressPreview } from '../src/lib/genie/progress-text'
import { renderGenieMarkdown } from '../src/lib/genie/render-markdown'
import { summarizeGenieAgentRuns } from '../src/lib/genie/telemetry'

const root = process.cwd()
const agentRouteSource = readFileSync(join(root, 'src/app/api/genie/agent/route.ts'), 'utf8')
const orchestrationSource = readFileSync(join(root, 'src/lib/genie/orchestration.ts'), 'utf8')
const agentRuntimePolicySource = readFileSync(join(root, 'src/lib/genie/agent-runtime-policy.ts'), 'utf8')
const storeProductPreviewSource = readFileSync(join(root, 'src/lib/genie/store-product-previews.ts'), 'utf8')
const lightspeedClientSource = readFileSync(join(root, 'src/lib/services/lightspeed/lightspeed-client.ts'), 'utf8')
const lightspeedTypesSource = readFileSync(join(root, 'src/lib/services/lightspeed/types.ts'), 'utf8')
const workorderQuerySource = readFileSync(join(root, 'src/lib/services/lightspeed/workorder-queries.ts'), 'utf8')
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
  /new Agent\(\{\s*name: 'Yellow Jersey Orchestrator'[\s\S]*?model: ORCHESTRATOR_MODEL/,
  'orchestrator agent must remain available for ambiguous routing',
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
  'agent route must not bypass the LLM router with deterministic fast paths',
)
assert.match(
  agentRouteSource,
  /routerInvoked = true[\s\S]*?orchestrationSource = 'model'[\s\S]*?await createGenieOrchestrationDecision/,
  'agent route must invoke the model router for every non-empty request',
)
assert.equal(
  /applyGmailPlanningPolicy/.test(agentRouteSource),
  false,
  'agent route must not mutate LLM router decisions with a post-router Gmail policy',
)
assert.match(
  agentRouteSource,
  /router_invoked: routerInvoked/,
  'router invocation must be logged',
)
assert.match(
  agentRouteSource,
  /router_model: ORCHESTRATOR_MODEL/,
  'router model must be logged as the nano orchestrator model',
)
assert.match(
  agentRouteSource,
  /This is the production routing gate\. There is no deterministic router before you\./,
  'router instructions must state that the LLM owns route selection',
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
assert.match(
  agentRuntimePolicySource,
  /export function needsGmailTools/,
  'storefront routes must not always expose Gmail tools',
)
assert.match(
  agentRuntimePolicySource,
  /if \(needsGmailTools\(latestUserMessage\)\) add\(GMAIL_TOOL_NAMES\)/,
  'Gmail tools should be route-selected only for Gmail/email intents',
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
  /buildSystemPrompt\(storeName, executionPlan, orchestration\.route, latestUserMessage\)/,
  'executor prompt must receive the route and latest message for route-specific prompt pruning',
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
  /searchContextSize: 'low'/,
  'web search should use low context by default for latency-sensitive Genie execution',
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
  homeV2ChatSource,
  /event\.event === "customer_profile"/,
  'Home v2 Genie must handle streamed customer profile cards',
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
  /renderGenieMarkdown\(content\)/,
  'Home v2 Genie must use the shared Markdown renderer for assistant answers',
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
assert.match(
  agentRouteSource,
  /function extractCustomerProfileQuery\(text: string\): string \| null/,
  'broad customer profile requests must have a deterministic query extractor',
)
assert.match(
  agentRouteSource,
  /function customerProfileAnswer\(profile: GenieCustomerProfilePayload\): string/,
  'direct customer profile requests must produce a useful textual summary',
)
assert.match(
  agentRouteSource,
  /const customerProfileQuery = extractCustomerProfileQuery\(latestUserMessage\)/,
  'broad customer profile fast path must inspect the latest user request before generic agent execution',
)
assert.match(
  agentRouteSource,
  /direct_path: 'customer_profile'/,
  'broad customer profile fast path must log direct customer profile execution',
)
assert.match(
  agentRouteSource,
  /function extractCustomerBikeOwnershipQuery/,
  'customer bike ownership questions must have a deterministic extractor',
)
assert.match(
  agentRouteSource,
  /function cleanCustomerBikeOwnershipQueryCandidate/,
  'customer bike ownership extraction must reject pronoun-only fragments such as "he currently"',
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
  /function resolveCustomerBikeOwnershipLookup\(messages: Message\[\], latestUserMessage: string\)/,
  'direct customer-bike fast path must use conversation-aware lookup resolution',
)
assert.match(
  agentRouteSource,
  /const customerBikeLookup = resolveCustomerBikeOwnershipLookup\(messages, latestUserMessage\)/,
  'direct customer-bike fast path must not inspect only the latest user text',
)
assert.equal(
  /const customerBikeLookupQuery = extractCustomerBikeOwnershipQuery\(latestUserMessage\)/.test(agentRouteSource),
  false,
  'direct customer-bike fast path must not bypass conversation context with latest-message-only extraction',
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
  agentRouteSource,
  /function resolveDirectSalesSummaryLookup/,
  'single-day sales summary questions must have a narrow direct fast path',
)
assert.match(
  agentRouteSource,
  /const directSalesSummaryLookup = resolveDirectSalesSummaryLookup\(latestUserMessage\)/,
  'direct sales summaries must execute after LLM routing but before generic agent exploration',
)
assert.match(
  agentRouteSource,
  /direct_path: 'direct_sales_summary'/,
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
  /const scope = args\.scope \?\? \(likelyCustomerQuery \? 'all' : 'open'\)/,
  'bare customer workorder queries must default to all history, not open-only',
)
assert.match(
  agentRouteSource,
  /const customerLookupQuery = originalQuery \? workorderCustomerLookupQuery\(originalQuery\) : null/,
  'list_lightspeed_workorders must derive a cleaned customer lookup query before deciding scope',
)
assert.match(
  agentRouteSource,
  /resolveCustomerForProfile\(userId, \{ query: customerLookupQuery \}, emit\)/,
  'bare customer workorder queries must resolve the customer before listing workorders',
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
  /max_pages_per_status: args\.max_pages_per_status \?\? \(query \? 1 : undefined\)/,
  'unresolved text workorder fallbacks must be page-bounded for latency',
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
      needs_plan: false,
      reason: 'Standard customer-bike compatibility flow: resolve private bike context, then check public technical evidence.',
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
    name: 'business analysis',
    message: 'How can we make more money this quarter?',
    route: 'business_analysis',
    needs_plan: true,
  },
  {
    name: 'direct carousel',
    message: 'Make a Summer Sale carousel for all Clif bars',
    route: 'storefront_action',
    needs_plan: false,
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

function assertToolPolicy(args: {
  name: string
  route: GenieOrchestrationDecision['route']
  message: string
  includes: string[]
  excludes: string[]
  hostedWeb: boolean
  parallel: boolean
  concurrency: number
}) {
  const toolNames = toolNameSetForRoute(args.route, args.message)
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
    includes: ['get_gmail_connection_status', 'search_gmail', 'propose_gmail_email', 'verify_question_answered'],
    excludes: ['run_lightspeed_sql_query', 'search_web_images'],
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
    concurrency: 2,
  },
  {
    name: 'web research',
    route: 'web_research',
    message: 'What bottom bracket does a Trek Madone Gen 8 need?',
    includes: ['search_web_images', 'verify_question_answered', 'consult_cycling_compatibility_specialist'],
    excludes: ['run_lightspeed_sql_query', 'get_store_carousels', 'search_gmail'],
    hostedWeb: true,
    parallel: true,
    concurrency: 2,
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
    includes: ['run_lightspeed_sql_query', 'get_product_costs', 'search_store_products', 'search_web_images'],
    excludes: ['search_gmail', 'propose_discount'],
    hostedWeb: true,
    parallel: false,
    concurrency: 1,
  },
  {
    name: 'mixed proposal plus research',
    route: 'mixed',
    message: 'Stage a 20% discount and compare competitor pricing',
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
    excludes: ['search_gmail', 'propose_discount', 'search_web_images'],
    hostedWeb: false,
    parallel: true,
    concurrency: 3,
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
  telemetry_summary_checks: 1,
  schema_fixtures: decisionFixtures.length,
  planner_cases: decisionFixtures.filter(fixture => fixture.decision.needs_plan).length,
  no_planner_cases: decisionFixtures.filter(fixture => !fixture.decision.needs_plan).length,
  structured_context_checks: 8,
}, null, 2))
