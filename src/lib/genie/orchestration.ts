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
