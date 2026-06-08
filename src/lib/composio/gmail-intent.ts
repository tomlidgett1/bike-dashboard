import type { GenieOrchestrationDecision } from '@/lib/genie/orchestration'

/** Detect when the user wants to connect Gmail / Composio email from Genie chat. */
export function isGmailAddAccountIntent(message: string): boolean {
  const lower = message.toLowerCase().replace(/[^\w\s@.+-]/g, ' ')
  if (!/\b(add|another|second|extra|more|additional|extra|new)\b/.test(lower)) return false
  return /\b(gmail|google mail|mailbox|mailboxes|mail account|email account|inbox|composio)\b/.test(lower)
}

export function isGmailConnectIntent(message: string): boolean {
  if (isGmailAddAccountIntent(message)) return true
  const lower = message.toLowerCase().replace(/[^\w\s@.+-]/g, ' ')
  if (!/\b(connect|link|authorise|authorize|integrate|integration|setup|set up|sign in|log in|oauth)\b/.test(lower)) {
    return false
  }
  return (
    /\b(gmail|gmnail|google mail|composio)\b/.test(lower)
    || /\bcomposio\b[\s\S]{0,40}\b(email|mail|inbox)\b/.test(lower)
    || /\b(email|mail|inbox)\b[\s\S]{0,40}\bcomposio\b/.test(lower)
  )
}

/**
 * Any Gmail/inbox task — search, summarise, send, draft, connect, rep/contact research, reply/respond.
 * Used to force orchestration.needs_plan=true (except Lightspeed-only customer-email lookups).
 */
export function isGmailReplyOrComposeIntent(message: string): boolean {
  const lower = message.toLowerCase().replace(/[^\w\s@.+-]/g, ' ')
  if (/\b(respond|reply|write back|get back to|follow up|follow-up)\b/.test(lower)) return true
  if (/\b(draft|compose)\b/.test(lower) && /\b(to|for)\b/.test(lower)) return true
  if (/\b(send|email|message)\b/.test(lower) && /\bto\b/.test(lower)) {
    if (/\b(lightspeed|sms|text message|nest)\b/.test(lower) && !/\b(gmail|google mail|inbox|mail)\b/.test(lower)) {
      return false
    }
    return true
  }
  return false
}

export function isGmailTaskIntent(message: string): boolean {
  if (isGmailConnectIntent(message)) return true
  if (isGmailReplyOrComposeIntent(message)) return true

  const lower = message.toLowerCase().replace(/[^\w\s@.+-]/g, ' ')

  if (/\b(gmail|google mail|inbox|sent mail|sent items|mailbox)\b/.test(lower)) return true

  if (/\b(composio)\b/.test(lower) && /\b(email|mail|gmail|inbox)\b/.test(lower)) return true

  if (/\b(send|draft|compose|write|reply|forward|respond)\b/.test(lower) && /\b(email|mail|gmail)\b/.test(lower)) {
    return true
  }

  if (/\b(respond|reply|write back|get back to|follow up)\b/.test(lower)) {
    return true
  }

  const mentionsMail = /\b(email|emails|mail|mails|message|messages|thread|correspondence)\b/.test(lower)
  if (mentionsMail) {
    if (/\b(lightspeed customer|customer table|contact table|crm record)\b/.test(lower)) return false
    if (
      /\b(search|find|summar|check|read|look up|lookup|show|list|scan|count|how many|earliest|latest|first|last|oldest|newest|who|which|any|have we|did we|from our)\b/.test(
        lower,
      )
    ) {
      return true
    }
  }

  if (
    /\b(rep|representative|account manager|sales contact|first contact)\b/.test(lower)
    && /\b(apollo|shimano|supplier|vendor|brand|dealer|wholesale)\b/.test(lower)
  ) {
    return true
  }

  return false
}

/** Gmail tasks always require a hidden execution plan before tools run. */
export function applyGmailPlanningPolicy(
  decision: GenieOrchestrationDecision,
  latestUserMessage: string,
): GenieOrchestrationDecision {
  if (!isGmailTaskIntent(latestUserMessage)) return decision

  const route =
    decision.route === 'casual_chat' || decision.route === 'unsupported'
      ? 'storefront_action'
      : decision.route

  const reasonPrefix = 'Gmail task — execution plan required.'
  const reason = decision.reason.includes(reasonPrefix)
    ? decision.reason
    : `${reasonPrefix} ${decision.reason}`.trim().slice(0, 300)

  return {
    route,
    needs_plan: true,
    reason,
  }
}
