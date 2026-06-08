import { isGmailAddAccountIntent, isGmailConnectIntent } from '@/lib/composio/gmail-intent'
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

export function needsGmailTools(latestUserMessage: string): boolean {
  return /\b(gmail|email|emails|inbox|mailbox|reply|draft|send|composio)\b/i.test(latestUserMessage) ||
    isGmailConnectIntent(latestUserMessage) ||
    isGmailAddAccountIntent(latestUserMessage)
}

export function isBikeCompatibilityIntent(latestUserMessage: string): boolean {
  return /\b(bottom bracket|bb|bb shell|bb standard|brake pads?|disc pads?|tyre size|tire size|freehub|cassette|chainring|derailleur hanger|hanger|headset|seatpost|seat post|thru axle|through axle|rotor size|shock size|bearing|bearings|compatible|compatibility|fitment|what .* need(?:s)? for|what\s+bb\b.*\bneed(?:s)?)\b/i.test(latestUserMessage)
}

export function isCustomerBikeCompatibilityIntent(latestUserMessage: string): boolean {
  return isBikeCompatibilityIntent(latestUserMessage) &&
    /\b(customer|client|work ?order|service history|purchase history|previous sales?|sold to|bought from us|their bike|his bike|her bike|this bike|that bike|what .* need(?:s)?|for [A-Z][a-z]+ [A-Z][a-z]+)\b/i.test(latestUserMessage)
}

export function toolNameSetForRoute(
  route: GenieOrchestrationDecision['route'],
  latestUserMessage: string,
): Set<string> {
  const names = new Set(COMMON_AGENT_TOOL_NAMES)
  const add = (toolNames: string[]) => {
    for (const toolName of toolNames) names.add(toolName)
  }

  if (route === 'lightspeed_sql') {
    add(LIGHTSPEED_READ_TOOL_NAMES)
    return names
  }

  if (route === 'storefront_action') {
    add(STOREFRONT_READ_TOOL_NAMES)
    add(STOREFRONT_PROPOSAL_TOOL_NAMES)
    if (needsGmailTools(latestUserMessage)) add(GMAIL_TOOL_NAMES)
    return names
  }

  if (route === 'web_research') {
    add(WEB_RESEARCH_TOOL_NAMES)
    if (isBikeCompatibilityIntent(latestUserMessage)) add(['consult_cycling_compatibility_specialist'])
    return names
  }

  if (route === 'business_analysis') {
    add(['record_lightspeed_plan'])
    add(LIGHTSPEED_READ_TOOL_NAMES)
    add(['find_discount_candidates', 'get_product_costs'])
    add(['consult_bike_store_analyst'])
    return names
  }

  if (route === 'mixed') {
    if (isCustomerBikeCompatibilityIntent(latestUserMessage)) {
      add(CUSTOMER_BIKE_CONTEXT_TOOL_NAMES)
      add(['consult_cycling_compatibility_specialist'])
      return names
    }

    add(['record_lightspeed_plan'])
    add(LIGHTSPEED_READ_TOOL_NAMES)
    add(STOREFRONT_READ_TOOL_NAMES)
    add(WEB_RESEARCH_TOOL_NAMES)
    if (isCustomerBikeCompatibilityIntent(latestUserMessage)) add(CUSTOMER_BIKE_CONTEXT_TOOL_NAMES)
    if (isBikeCompatibilityIntent(latestUserMessage)) add(['consult_cycling_compatibility_specialist'])
    if (needsGmailTools(latestUserMessage)) add(GMAIL_TOOL_NAMES)
    if (/\b(stage|apply|create|rename|reorder|show|hide|discount|price|brand|category|carousel)\b/i.test(latestUserMessage)) {
      add(STOREFRONT_PROPOSAL_TOOL_NAMES)
    }
    return names
  }

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
