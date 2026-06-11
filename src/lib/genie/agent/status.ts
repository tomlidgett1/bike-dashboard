// Genie agent progress status text per tool/route.

import fs from 'fs'
import path from 'path'

import {
  type GenieOrchestrationDecision,
} from '@/lib/genie/orchestration'

import { SMART_AGENT_MAX_TURNS, STRATEGIC_AGENT_MAX_TURNS } from './runtime'

function statusForTool(toolName: string): { phase: string; text: string } {
  if (toolName === 'web_search' || toolName === 'web_search_preview' || toolName === 'web_search_call') return { phase: 'web_search', text: 'Searching web' }
  if (toolName === 'search_web_images') return { phase: 'image_search', text: 'Finding images' }
  if (toolName === 'resolve_customer_bike_context') return { phase: 'customer_context', text: 'Resolving customer bike context' }
  if (toolName === 'consult_cycling_compatibility_specialist') return { phase: 'specialist', text: 'Checking fitment with mechanic specialist' }
  if (toolName === 'consult_bike_store_analyst') return { phase: 'specialist', text: 'Reviewing analysis with store specialist' }
  if (toolName === 'record_lightspeed_plan') return { phase: 'planning', text: 'Planning lookup' }
  if (toolName === 'record_lightspeed_recheck') return { phase: 'rechecking', text: 'Alternate query' }
  if (toolName === 'run_lightspeed_sql_query') return { phase: 'lightspeed_sales', text: 'Running SQL' }
  if (toolName === 'get_lightspeed_sales_summary') return { phase: 'lightspeed_sales', text: 'Sales totals' }
  if (toolName === 'get_lightspeed_sales_list') return { phase: 'lightspeed_sales', text: 'Sale list' }
  if (toolName === 'get_lightspeed_sales_timeseries') return { phase: 'lightspeed_sales', text: 'Sales chart' }
  if (toolName === 'get_lightspeed_top_sold_products') return { phase: 'lightspeed_sales', text: 'Top products' }
  if (toolName === 'get_lightspeed_sold_product_timeseries') return { phase: 'lightspeed_sales', text: 'Product trend' }
  if (toolName === 'search_lightspeed_inventory') return { phase: 'lightspeed_inventory', text: 'Searching stock' }
  if (toolName === 'get_lightspeed_stale_inventory_cash') return { phase: 'lightspeed_inventory', text: 'Stale stock value' }
  if (toolName === 'search_lightspeed_customers') return { phase: 'lightspeed_customers', text: 'Finding customers' }
  if (toolName === 'get_lightspeed_product_purchasers') return { phase: 'lightspeed_customers', text: 'Finding buyers' }
  if (toolName === 'get_lightspeed_customer_profile') return { phase: 'lightspeed_customers', text: 'Customer profile' }
  if (toolName === 'get_lightspeed_customer_sales') return { phase: 'lightspeed_customers', text: 'Customer sales' }
  if (toolName === 'get_lightspeed_top_customers') return { phase: 'lightspeed_customers', text: 'Top customers' }
  if (toolName === 'get_xero_connection_status') return { phase: 'xero', text: 'Checking Xero' }
  if (toolName === 'get_xero_financial_report') return { phase: 'xero', text: 'Xero financial report' }
  if (toolName === 'list_xero_invoices') return { phase: 'xero', text: 'Xero invoices' }
  if (toolName === 'list_xero_purchase_orders') return { phase: 'xero', text: 'Xero purchase orders' }
  if (toolName === 'list_xero_bank_transactions') return { phase: 'xero', text: 'Xero bank transactions' }
  if (toolName === 'list_xero_payments') return { phase: 'xero', text: 'Xero payments' }
  if (toolName === 'search_xero_contacts') return { phase: 'xero', text: 'Xero contacts' }
  if (toolName === 'list_xero_accounts') return { phase: 'xero', text: 'Xero chart of accounts' }
  if (toolName === 'get_store_carousels') return { phase: 'tool', text: 'Carousels' }
  if (toolName === 'search_store_products') return { phase: 'tool', text: 'Products' }
  if (toolName === 'list_active_discounts') return { phase: 'tool', text: 'Discounts' }
  if (toolName === 'find_discount_candidates') return { phase: 'lightspeed_inventory', text: 'Discount candidates' }
  if (toolName === 'get_product_costs') return { phase: 'tool', text: 'Costs' }
  if (toolName === 'list_lightspeed_brands') return { phase: 'lightspeed_inventory', text: 'Brands' }
  if (toolName === 'list_lightspeed_categories') return { phase: 'lightspeed_inventory', text: 'Categories' }
  if (toolName === 'search_lightspeed_products') return { phase: 'lightspeed_inventory', text: 'Products' }
  if (toolName === 'list_lightspeed_workorders') return { phase: 'lightspeed_workorders', text: 'Work orders' }
  if (toolName === 'get_lightspeed_workorder') return { phase: 'lightspeed_workorders', text: 'Work order' }
  if (toolName === 'propose_product_brand_category_update') return { phase: 'tool', text: 'Preparing Lightspeed edits' }
  if (toolName === 'propose_lightspeed_category_create') return { phase: 'tool', text: 'Preparing Lightspeed category' }
  if (toolName === 'verify_question_answered') return { phase: 'thinking', text: 'Checking answer' }
  if (toolName === 'record_answer_recheck') return { phase: 'rechecking', text: 'Alternate query' }
  if (toolName === 'search_gmail') return { phase: 'gmail', text: 'Searching Gmail' }
  if (toolName === 'read_gmail_messages') return { phase: 'gmail', text: 'Reading email content' }
  if (toolName === 'propose_gmail_email') return { phase: 'gmail', text: 'Preparing Gmail action' }
  if (toolName === 'get_gmail_connection_status') return { phase: 'gmail', text: 'Checking Gmail' }
  if (toolName.startsWith('propose_')) return { phase: 'tool', text: 'Preparing changes' }
  return { phase: 'tool', text: `Running ${toolName.replaceAll('_', ' ')}` }
}

function statusAfterTool(toolName: string): { phase: string; text: string } {
  if (toolName === 'run_lightspeed_sql_query') return { phase: 'tool_done', text: 'SQL result ready' }
  if (toolName === 'resolve_customer_bike_context') return { phase: 'tool_done', text: 'Customer bike evidence ready' }
  if (toolName === 'consult_cycling_compatibility_specialist') return { phase: 'tool_done', text: 'Mechanic specialist check ready' }
  if (toolName === 'consult_bike_store_analyst') return { phase: 'tool_done', text: 'Store analyst review ready' }
  if (toolName === 'search_lightspeed_inventory' || toolName === 'search_lightspeed_products') return { phase: 'tool_done', text: 'Stock result ready' }
  if (toolName === 'get_lightspeed_stale_inventory_cash' || toolName === 'find_discount_candidates') return { phase: 'tool_done', text: 'Inventory analysis ready' }
  if (toolName === 'get_lightspeed_customer_profile') return { phase: 'tool_done', text: 'Customer profile ready' }
  if (toolName === 'list_lightspeed_workorders' || toolName === 'get_lightspeed_workorder') return { phase: 'tool_done', text: 'Work order result ready' }
  if (toolName === 'search_gmail' || toolName === 'read_gmail_messages' || toolName === 'get_gmail_connection_status') return { phase: 'gmail_done', text: 'Gmail result ready' }
  if (toolName.startsWith('get_xero_') || toolName.startsWith('list_xero_') || toolName === 'search_xero_contacts') return { phase: 'xero_done', text: 'Xero result ready' }
  if (toolName === 'search_web_images' || toolName === 'web_search' || toolName === 'web_search_preview' || toolName === 'web_search_call') return { phase: 'web_search_done', text: 'Web result ready' }
  if (toolName === 'verify_question_answered') return { phase: 'responding', text: 'Checking whether the answer is complete' }
  if (toolName === 'record_answer_recheck' || toolName === 'record_lightspeed_recheck') return { phase: 'rechecking', text: 'Recheck strategy ready' }
  if (toolName.startsWith('propose_')) return { phase: 'tool_done', text: 'Proposal preview ready' }
  return { phase: 'tool_done', text: 'Tool result ready' }
}

function statusForRoute(route: GenieOrchestrationDecision['route']): string {
  if (route === 'lightspeed_sql') return 'Workflow selected: Lightspeed lookup'
  if (route === 'storefront_action') return 'Workflow selected: Storefront action'
  if (route === 'web_research') return 'Workflow selected: Web research'
  if (route === 'business_analysis') return 'Workflow selected: Business analysis'
  if (route === 'mixed') return 'Workflow selected: Store data plus research'
  if (route === 'casual_chat') return 'Workflow selected: Direct answer'
  if (route === 'unsupported') return 'Workflow selected: Redirect'
  return 'Workflow selected'
}

function statusForExecutionStart(route: GenieOrchestrationDecision['route'], toolCount: number): string {
  const suffix = toolCount > 0 ? ` with ${toolCount} tool${toolCount === 1 ? '' : 's'}` : ''
  if (route === 'lightspeed_sql') return `Starting Lightspeed lookup${suffix}`
  if (route === 'storefront_action') return `Starting storefront workflow${suffix}`
  if (route === 'web_research') return `Starting web research${suffix}`
  if (route === 'business_analysis') return `Starting business analysis${suffix}`
  if (route === 'mixed') return `Starting mixed workflow${suffix}`
  return `Starting store agent${suffix}`
}

function maxTurnsForRoute(route: GenieOrchestrationDecision['route'], planned: boolean): number {
  if (route === 'business_analysis') return STRATEGIC_AGENT_MAX_TURNS
  if (planned) return SMART_AGENT_MAX_TURNS
  if (route === 'web_research') return 8
  if (route === 'lightspeed_sql' || route === 'storefront_action') return 16
  if (route === 'mixed') return 24
  return 8
}

export { statusForTool, statusAfterTool, statusForRoute, statusForExecutionStart, maxTurnsForRoute }
