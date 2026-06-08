import type { GenieOrchestrationDecision } from '@/lib/genie/orchestration'

export const COMMON_AGENT_TOOL_NAMES = [
  'record_answer_recheck',
  'verify_question_answered',
]

export const LIGHTSPEED_READ_TOOL_NAMES = [
  'record_lightspeed_recheck',
  'run_lightspeed_sql_query',
  'search_lightspeed_inventory',
  'get_lightspeed_stale_inventory_cash',
  'search_lightspeed_customers',
  'get_lightspeed_product_purchasers',
  'get_lightspeed_customer_profile',
  'get_lightspeed_customer_sales',
  'get_lightspeed_top_customers',
  'list_lightspeed_workorders',
  'get_lightspeed_workorder',
]

export const STOREFRONT_READ_TOOL_NAMES = [
  'get_store_carousels',
  'search_store_products',
  'list_active_discounts',
  'find_discount_candidates',
  'get_product_costs',
  'list_lightspeed_brands',
  'list_lightspeed_categories',
  'search_lightspeed_products',
  'search_lightspeed_inventory',
]

export const STOREFRONT_PROPOSAL_TOOL_NAMES = [
  'propose_carousel_layout',
  'propose_create_carousel',
  'propose_rename_carousel',
  'propose_discount',
  'propose_remove_discount',
  'propose_price_update',
  'propose_product_brand_category_update',
  'propose_lightspeed_category_create',
]

export const GMAIL_TOOL_NAMES = [
  'get_gmail_connection_status',
  'search_gmail',
  'read_gmail_messages',
  'propose_gmail_email',
]

export const WEB_RESEARCH_TOOL_NAMES = [
  'search_web_images',
]

export const CUSTOMER_BIKE_CONTEXT_TOOL_NAMES = [
  'resolve_customer_bike_context',
]

export const SPECIALIST_AGENT_TOOL_NAMES = [
  'consult_cycling_compatibility_specialist',
  'consult_bike_store_analyst',
]

function plannedToolsText(plannedToolNames: Iterable<string> | undefined): string {
  return Array.from(plannedToolNames ?? []).join(' ')
}

function planRequestsTool(plannedToolNames: Iterable<string> | undefined, pattern: RegExp): boolean {
  return pattern.test(plannedToolsText(plannedToolNames))
}

export function toolNameSetForRoute(
  route: GenieOrchestrationDecision['route'],
  plannedToolNames?: Iterable<string>,
): Set<string> {
  const names = new Set(COMMON_AGENT_TOOL_NAMES)
  const add = (toolNames: string[]) => {
    for (const toolName of toolNames) names.add(toolName)
  }
  const planRequestsGmail = planRequestsTool(plannedToolNames, /\bgmail\b|get_gmail_connection_status|search_gmail|read_gmail_messages|propose_gmail_email/i)
  const planRequestsLightspeed = planRequestsTool(plannedToolNames, /record_lightspeed|run_lightspeed|get_lightspeed|search_lightspeed|list_lightspeed|workorder|inventory|sales|customer_profile|product_purchasers|stale_inventory/i)
  const planRequestsStorefrontRead = planRequestsTool(plannedToolNames, /get_store|search_store|list_active_discounts|find_discount_candidates|get_product_costs|brands|categories|products/i)
  const planRequestsStorefrontProposal = planRequestsTool(plannedToolNames, /propose_carousel|propose_create_carousel|propose_rename_carousel|propose_discount|propose_remove_discount|propose_price_update|propose_product_brand_category_update|propose_lightspeed_category_create|\bcarousel\b|\bdiscount\b|\bprice\b|\bbrand\b|\bcategory\b/i)
  const planRequestsImageSearch = planRequestsTool(plannedToolNames, /search_web_images/i)
  const planRequestsBikeStoreSpecialist = planRequestsTool(plannedToolNames, /consult_bike_store_analyst/i)

  if (route === 'lightspeed_sql') {
    add(LIGHTSPEED_READ_TOOL_NAMES)
    if (planRequestsGmail) add(GMAIL_TOOL_NAMES)
    return names
  }

  if (route === 'storefront_action') {
    add(STOREFRONT_READ_TOOL_NAMES)
    add(STOREFRONT_PROPOSAL_TOOL_NAMES)
    if (planRequestsGmail) add(GMAIL_TOOL_NAMES)
    return names
  }

  if (route === 'web_research') {
    add(WEB_RESEARCH_TOOL_NAMES)
    add(['consult_cycling_compatibility_specialist'])
    if (planRequestsGmail) add(GMAIL_TOOL_NAMES)
    return names
  }

  if (route === 'business_analysis') {
    add(['record_lightspeed_plan'])
    add(LIGHTSPEED_READ_TOOL_NAMES)
    add(['find_discount_candidates', 'get_product_costs'])
    add(['consult_bike_store_analyst'])
    if (planRequestsGmail) add(GMAIL_TOOL_NAMES)
    return names
  }

  if (route === 'mixed') {
    add(CUSTOMER_BIKE_CONTEXT_TOOL_NAMES)
    add(['consult_cycling_compatibility_specialist'])
    if (planRequestsBikeStoreSpecialist) add(['consult_bike_store_analyst'])
    if (planRequestsLightspeed) {
      add(['record_lightspeed_plan'])
      add(LIGHTSPEED_READ_TOOL_NAMES)
    }
    if (planRequestsStorefrontRead) add(STOREFRONT_READ_TOOL_NAMES)
    if (planRequestsImageSearch) add(WEB_RESEARCH_TOOL_NAMES)
    if (planRequestsGmail) add(GMAIL_TOOL_NAMES)
    if (planRequestsStorefrontProposal) add(STOREFRONT_PROPOSAL_TOOL_NAMES)
    return names
  }

  if (planRequestsGmail) add(GMAIL_TOOL_NAMES)

  return names
}

export function shouldExposeHostedWebSearch(route: GenieOrchestrationDecision['route']): boolean {
  return route === 'web_research' || route === 'mixed'
}

export function canRunParallelTools(route: GenieOrchestrationDecision['route']): boolean {
  return route === 'lightspeed_sql' || route === 'business_analysis' || route === 'web_research'
}

export function maxToolConcurrencyForRoute(route: GenieOrchestrationDecision['route']): number {
  if (route === 'business_analysis') return 3
  if (route === 'lightspeed_sql' || route === 'web_research') return 2
  return 1
}
