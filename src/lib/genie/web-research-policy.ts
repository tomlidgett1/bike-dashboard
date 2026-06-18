import type { GenieOrchestrationDecision } from '@/lib/genie/orchestration'

/** True when the user is asking to see photos — not for factual / standings / news questions. */
export function userRequestsWebImages(message: string): boolean {
  const text = message.trim()
  if (!text) return false

  if (
    /\b(standings?|classification|leader|leads?|results?|winner|podium|gc\b|mountains?|sprint|stage\s+\d|tour de|giro|vuelta|worlds?\b|championship)\b/i.test(
      text,
    )
  ) {
    return false
  }

  return /\b(what does .+ look like|show me.{0,32}(picture|photo|image|pic)|\b(photos?|pictures?|images?) of\b|what .+ look like)\b/i.test(
    text,
  )
}

export function webSearchContextSizeForRoute(
  route: GenieOrchestrationDecision['route'],
): 'low' | 'medium' | 'high' {
  if (route === 'web_research') return 'high'
  return 'low'
}

export function shouldExposeWebImageSearch(
  route: GenieOrchestrationDecision['route'],
  latestUserMessage: string,
  plannedToolNames?: Iterable<string>,
): boolean {
  const planned = Array.from(plannedToolNames ?? []).join(' ')
  if (/search_web_images/i.test(planned)) return true
  if (route !== 'web_research' && route !== 'mixed') return false
  return userRequestsWebImages(latestUserMessage)
}
