import { z } from 'zod'

export const GenieOrchestrationDecisionSchema = z.object({
  route: z.enum([
    'casual_chat',
    'lightspeed_sql',
    'storefront_action',
    'web_research',
    'business_analysis',
    'mixed',
    'unsupported',
  ]),
  needs_plan: z.boolean(),
  /**
   * LLM-decided fast paths (lightspeed_sql only). The executor prefetches the
   * named data directly and streams a grounded answer, skipping generic agent
   * exploration. 'none' for everything else.
   */
  direct_path: z.enum(['customer_profile', 'customer_bikes', 'sales_summary', 'none']),
  /** Entity for the direct path: customer name/id, or the verbatim period phrase for sales_summary. */
  entity_query: z.string().max(160).nullable(),
  reason: z.string().max(300),
})

export type GenieOrchestrationDecision = z.infer<typeof GenieOrchestrationDecisionSchema>

export interface GenieMessage {
  role: 'user' | 'assistant'
  content: string
}

export function latestUserText(messages: GenieMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === 'user') return messages[index]?.content ?? ''
  }
  return ''
}
