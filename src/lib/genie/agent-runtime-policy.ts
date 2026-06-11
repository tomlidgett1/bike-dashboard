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

const GMAIL_STATUS_TOOL_NAMES = [
  'get_gmail_connection_status',
]

const GMAIL_CONTEXT_TOOL_NAMES = [
  'search_gmail',
  'read_gmail_messages',
]

const GMAIL_ACTION_TOOL_NAMES = [
  'propose_gmail_email',
]

export const PURCHASE_ORDER_TOOL_NAMES = [
  'list_supplier_invoices',
  'extract_supplier_invoice',
  'propose_lightspeed_purchase_order',
]

export const XERO_TOOL_NAMES = [
  'get_xero_connection_status',
  'get_xero_financial_report',
  'list_xero_invoices',
  'list_xero_purchase_orders',
  'list_xero_bank_transactions',
  'list_xero_payments',
  'search_xero_contacts',
  'list_xero_accounts',
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

function addPlannedGmailTools(
  plannedToolNames: Iterable<string> | undefined,
  add: (toolNames: string[]) => void,
): void {
  const genericGmail = planRequestsTool(plannedToolNames, /\bgmail\b/i)
  const needsStatus = planRequestsTool(plannedToolNames, /get_gmail_connection_status/i)
  const needsSearch = planRequestsTool(plannedToolNames, /search_gmail/i)
  const needsRead = planRequestsTool(plannedToolNames, /read_gmail_messages/i)
  const needsAction = planRequestsTool(plannedToolNames, /propose_gmail_email/i)

  if (genericGmail && !needsStatus && !needsSearch && !needsRead && !needsAction) {
    add(GMAIL_TOOL_NAMES)
    return
  }

  if (needsStatus || needsSearch || needsRead || needsAction) add(GMAIL_STATUS_TOOL_NAMES)
  if (needsSearch || needsRead) add(GMAIL_CONTEXT_TOOL_NAMES)
  if (needsAction) add(GMAIL_ACTION_TOOL_NAMES)
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
  const planRequestsXero = planRequestsTool(plannedToolNames, /\bxero\b|profit_and_loss|balance_sheet|trial_balance|aged_payable|aged_receivable|purchase_order|bank_transaction|chart_of_accounts/i)
  const planRequestsBikeStoreSpecialist = planRequestsTool(plannedToolNames, /consult_bike_store_analyst/i)
  const planRequestsPurchaseOrder = planRequestsTool(plannedToolNames, /supplier_invoice|purchase_order|list_supplier_invoices|extract_supplier_invoice|propose_lightspeed_purchase_order|\binvoice\b/i)

  if (route === 'lightspeed_sql') {
    add(LIGHTSPEED_READ_TOOL_NAMES)
    add(XERO_TOOL_NAMES)
    add(PURCHASE_ORDER_TOOL_NAMES)
    if (planRequestsGmail) addPlannedGmailTools(plannedToolNames, add)
    return names
  }

  if (route === 'storefront_action') {
    add(STOREFRONT_READ_TOOL_NAMES)
    add(STOREFRONT_PROPOSAL_TOOL_NAMES)
    add(PURCHASE_ORDER_TOOL_NAMES)
    if (planRequestsLightspeed) {
      add(['record_lightspeed_plan'])
      add(LIGHTSPEED_READ_TOOL_NAMES)
    }
    if (planRequestsBikeStoreSpecialist) add(['consult_bike_store_analyst'])
    if (planRequestsXero) add(XERO_TOOL_NAMES)
    if (planRequestsGmail) addPlannedGmailTools(plannedToolNames, add)
    return names
  }

  if (route === 'web_research') {
    add(WEB_RESEARCH_TOOL_NAMES)
    add(['consult_cycling_compatibility_specialist'])
    if (planRequestsGmail) addPlannedGmailTools(plannedToolNames, add)
    return names
  }

  if (route === 'business_analysis') {
    add(['record_lightspeed_plan'])
    add(LIGHTSPEED_READ_TOOL_NAMES)
    add(XERO_TOOL_NAMES)
    if (planRequestsPurchaseOrder) add(PURCHASE_ORDER_TOOL_NAMES)
    add(['find_discount_candidates', 'get_product_costs'])
    add(['consult_bike_store_analyst'])
    if (planRequestsGmail) addPlannedGmailTools(plannedToolNames, add)
    return names
  }

  if (route === 'mixed') {
    add(CUSTOMER_BIKE_CONTEXT_TOOL_NAMES)
    add(['consult_cycling_compatibility_specialist'])
    if (planRequestsPurchaseOrder) add(PURCHASE_ORDER_TOOL_NAMES)
    if (planRequestsBikeStoreSpecialist) add(['consult_bike_store_analyst'])
    if (planRequestsXero) add(XERO_TOOL_NAMES)
    if (planRequestsLightspeed) {
      add(['record_lightspeed_plan'])
      add(LIGHTSPEED_READ_TOOL_NAMES)
    }
    if (planRequestsStorefrontRead) add(STOREFRONT_READ_TOOL_NAMES)
    if (planRequestsImageSearch) add(WEB_RESEARCH_TOOL_NAMES)
    if (planRequestsGmail) addPlannedGmailTools(plannedToolNames, add)
    if (planRequestsStorefrontProposal) add(STOREFRONT_PROPOSAL_TOOL_NAMES)
    return names
  }

  if (planRequestsGmail) addPlannedGmailTools(plannedToolNames, add)

  return names
}

export function shouldExposeHostedWebSearch(route: GenieOrchestrationDecision['route']): boolean {
  return route === 'web_research' || route === 'mixed'
}

export function canRunParallelTools(route: GenieOrchestrationDecision['route']): boolean {
  return route === 'lightspeed_sql' || route === 'business_analysis' || route === 'web_research'
}

export function maxToolConcurrencyForRoute(route: GenieOrchestrationDecision['route']): number {
  // Independent reads (Xero reports, SQL queries, web lookups) have no reason
  // to serialise. Higher concurrency cuts wall-clock time on analysis runs that
  // batch many data calls in a single turn.
  if (route === 'business_analysis') return 6
  if (route === 'lightspeed_sql' || route === 'web_research') return 4
  return 1
}
