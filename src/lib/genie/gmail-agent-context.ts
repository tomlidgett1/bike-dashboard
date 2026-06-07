import type { GmailAgentContext, GmailAgentContextBody, GmailEmailsPayload, GmailMessageContent } from '@/lib/types/genie-agent'

const MAX_BODY_CHARS = 2_500

export function buildGmailAgentContextFromMessages(
  messages: GmailMessageContent[],
): GmailAgentContext {
  const message_bodies = messages.slice(0, 5).map((message) => ({
    message_id: message.message_id,
    connected_account_id: message.connected_account_id,
    thread_id: message.thread_id,
    from: message.from,
    to: message.to,
    subject: message.subject,
    mailbox_label: message.mailbox_label ?? null,
    body_text: message.body_text.slice(0, MAX_BODY_CHARS),
  }))
  return message_bodies.length > 0 ? { message_bodies } : {}
}

export function buildGmailAgentContextFromPayload(payload: {
  message_bodies?: GmailMessageContent[]
}): GmailAgentContext {
  return buildGmailAgentContextFromMessages(payload.message_bodies ?? [])
}

export function mergeGmailAgentContext(
  existing: GmailEmailsPayload | undefined,
  patch: GmailAgentContext,
): GmailEmailsPayload {
  const patchBodies = patch.message_bodies ?? []
  if (!existing) {
    return {
      title: 'Gmail messages',
      query: '',
      emails: [],
      agent_context: patchBodies.length > 0 ? { message_bodies: patchBodies } : undefined,
    }
  }

  const mergedBodies = mergeGmailContextBodies(
    existing.agent_context?.message_bodies ?? [],
    patchBodies,
  )

  return {
    ...existing,
    agent_context: mergedBodies.length > 0 ? { message_bodies: mergedBodies } : existing.agent_context,
  }
}

function mergeGmailContextBodies(
  existing: GmailAgentContextBody[],
  patch: GmailAgentContextBody[],
): GmailAgentContextBody[] {
  if (patch.length === 0) return existing
  const byId = new Map(existing.map((body) => [body.message_id, body]))
  for (const body of patch) {
    byId.set(body.message_id, body)
  }
  return [...byId.values()].slice(0, 8)
}
