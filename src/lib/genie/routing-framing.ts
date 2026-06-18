import type { GenieOrchestrationDecision } from '@/lib/genie/orchestration'
import { inferStoreWorkflowLabel } from '@/lib/genie/agent/status'

function clipPhrase(value: string | null | undefined, max = 56): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

function directPathFraming(
  directPath: GenieOrchestrationDecision['direct_path'],
  entityQuery: string | null,
): string | null {
  const entity = clipPhrase(entityQuery)
  if (directPath === 'customer_profile' && entity) {
    return `I'll treat this as a customer profile question for ${entity}.`
  }
  if (directPath === 'customer_bikes' && entity) {
    return `I'll treat this as a question about which bikes ${entity} owns.`
  }
  if (directPath === 'sales_summary' && entity) {
    return `I'll treat this as a sales summary question for ${entity}.`
  }
  if (directPath === 'sales_summary') {
    return "I'll treat this as a sales summary question."
  }
  if (directPath === 'customer_profile') {
    return "I'll treat this as a customer profile question."
  }
  if (directPath === 'customer_bikes') {
    return "I'll treat this as a customer bike ownership question."
  }
  return null
}

function routeFraming(
  route: GenieOrchestrationDecision['route'],
  userMessage: string,
): string {
  if (route === 'storefront_action') {
    return "I'll treat this as a storefront update — I'll look up your current setup and stage any changes for you to approve."
  }
  if (route === 'web_research') {
    return "I'll treat this as a research question and check official sources."
  }
  if (route === 'business_analysis') {
    return "I'll treat this as a business performance question — I'll analyse your store data and rank what matters most."
  }
  if (route === 'mixed') {
    return "I'll treat this as a question that needs your store data and additional research."
  }
  if (route === 'unsupported') {
    return "I'll treat this as something outside my store tools — I'll explain what I can help with instead."
  }
  if (route === 'lightspeed_sql') {
    const label = inferStoreWorkflowLabel(undefined, userMessage)
    return `I'll treat this as a ${label} question.`
  }
  return "I'll treat this as a store data question."
}

export function buildDeepResearchFramingMessage(): string {
  return "I'll treat this as a full Deep Business Review — a forensic pass across finance, sales, inventory, customers, staffing, suppliers, and market trends."
}

export function buildRoutingFramingMessage(args: {
  orchestration: GenieOrchestrationDecision
  userMessage: string
}): string | null {
  const { orchestration, userMessage } = args

  if (orchestration.route === 'casual_chat') return null

  const direct = orchestration.direct_path !== 'none'
    ? directPathFraming(orchestration.direct_path, orchestration.entity_query)
    : null
  return direct ?? routeFraming(orchestration.route, userMessage)
}
