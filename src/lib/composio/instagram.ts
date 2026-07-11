import { getComposioClient, getComposioUserId, isComposioConfigured } from '@/lib/composio/client'
import {
  composioErrorMessage,
  listActiveConnections,
  listConnectedAccountsSafe,
  mintToolkitConnectLink,
  type ComposioConnectedAccount,
} from '@/lib/composio/toolkit'
import type {
  InstagramConversationItem,
  InstagramInboxMessage,
  InstagramMessageRole,
} from '@/lib/customer-inquiries/instagram-types'

export { isComposioConfigured }

/** Most recent DM conversations hydrated per inbox load. */
const MAX_CONVERSATIONS = 15
const MESSAGES_PER_CONVERSATION = 30

export async function listInstagramConnections(userId: string): Promise<ComposioConnectedAccount[]> {
  const { accounts, error } = await listConnectedAccountsSafe(userId)
  if (error) throw new Error(error)
  return listActiveConnections(accounts, 'instagram')
}

export async function mintInstagramConnectLink(userId: string): Promise<{ url: string }> {
  const link = await mintToolkitConnectLink(userId, 'instagram', { allowMultiple: false })
  return { url: link.url }
}

async function executeInstagramTool(
  userId: string,
  slug: string,
  input: Record<string, unknown>,
  connectedAccountId: string,
): Promise<Record<string, unknown>> {
  const composio = getComposioClient()
  const result = await composio.tools.execute(slug, {
    userId: getComposioUserId(userId),
    connectedAccountId,
    arguments: input,
    dangerouslySkipVersionCheck: true,
  } as Parameters<typeof composio.tools.execute>[1])

  const row = result as unknown as Record<string, unknown>
  if (row.successful === false) {
    throw new Error(composioErrorMessage(String(row.error ?? `${slug} failed.`)))
  }
  const data = row.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return row
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** Graph API list payloads arrive as `{ data: [...] }`, sometimes nested one level. */
function extractGraphList(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [payload.data, (payload.data as Record<string, unknown> | undefined)?.data]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
      )
    }
  }
  return []
}

type InstagramProfile = { id: string | null; username: string | null }

const profileCache = new Map<string, { profile: InstagramProfile; fetchedAt: number }>()
const PROFILE_TTL_MS = 30 * 60 * 1000

export async function fetchInstagramProfile(
  userId: string,
  connectedAccountId: string,
): Promise<InstagramProfile> {
  const cached = profileCache.get(connectedAccountId)
  if (cached && Date.now() - cached.fetchedAt < PROFILE_TTL_MS) return cached.profile

  const data = await executeInstagramTool(userId, 'INSTAGRAM_GET_USER_INFO', {}, connectedAccountId)
  const nested = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
    ? (data.data as Record<string, unknown>)
    : data
  const profile: InstagramProfile = {
    id: pickString(nested.id, data.id),
    username: pickString(nested.username, data.username),
  }
  profileCache.set(connectedAccountId, { profile, fetchedAt: Date.now() })
  return profile
}

type ConversationStub = {
  id: string
  updatedTime: string | null
  participants: Array<{ id: string | null; username: string | null }>
}

function parseParticipants(raw: unknown): ConversationStub['participants'] {
  // Graph API: participants: { data: [{ id, username }] }
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).data
      : null
  if (!Array.isArray(list)) return []
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: pickString(item.id),
      username: pickString(item.username, item.name),
    }))
}

async function listConversationStubs(
  userId: string,
  connectedAccountId: string,
): Promise<ConversationStub[]> {
  const data = await executeInstagramTool(
    userId,
    'INSTAGRAM_LIST_ALL_CONVERSATIONS',
    { limit: MAX_CONVERSATIONS },
    connectedAccountId,
  )
  return extractGraphList(data)
    .map((item) => ({
      id: pickString(item.id) ?? '',
      updatedTime: pickString(item.updated_time, item.updatedTime),
      participants: parseParticipants(item.participants),
    }))
    .filter((item) => item.id.length > 0)
}

function normaliseMessage(
  raw: Record<string, unknown>,
  businessAccountId: string | null,
): InstagramInboxMessage | null {
  const id = pickString(raw.id)
  if (!id) return null
  const from = (raw.from && typeof raw.from === 'object' && !Array.isArray(raw.from))
    ? (raw.from as Record<string, unknown>)
    : {}
  const fromId = pickString(from.id)
  const role: InstagramMessageRole =
    businessAccountId && fromId === businessAccountId ? 'shop' : 'customer'
  const attachments = raw.attachments
  const hasAttachments = Array.isArray(attachments)
    ? attachments.length > 0
    : Boolean(
        attachments &&
          typeof attachments === 'object' &&
          Array.isArray((attachments as Record<string, unknown>).data) &&
          ((attachments as Record<string, unknown>).data as unknown[]).length > 0,
      )

  return {
    id,
    role,
    text: pickString(raw.message) ?? (hasAttachments ? '[Attachment]' : ''),
    from_id: fromId,
    from_username: pickString(from.username, from.name),
    created_at: pickString(raw.created_time, raw.createdTime),
    has_attachments: hasAttachments,
  }
}

async function fetchConversationMessages(
  userId: string,
  connectedAccountId: string,
  conversationId: string,
  businessAccountId: string | null,
): Promise<InstagramInboxMessage[]> {
  const data = await executeInstagramTool(
    userId,
    'INSTAGRAM_LIST_ALL_MESSAGES',
    { conversation_id: conversationId, limit: MESSAGES_PER_CONVERSATION },
    connectedAccountId,
  )
  const messages = extractGraphList(data)
    .map((item) => normaliseMessage(item, businessAccountId))
    .filter((item): item is InstagramInboxMessage => Boolean(item))

  // Graph API returns newest-first; threads render oldest → newest.
  return messages.sort((a, b) => {
    const aMs = a.created_at ? new Date(a.created_at).getTime() : 0
    const bMs = b.created_at ? new Date(b.created_at).getTime() : 0
    return aMs - bMs
  })
}

function buildConversationItem(
  stub: ConversationStub,
  messages: InstagramInboxMessage[],
  connectedAccountId: string,
  businessAccountId: string | null,
): InstagramConversationItem {
  const customer =
    stub.participants.find((participant) => participant.id && participant.id !== businessAccountId) ??
    null
  const customerFromMessages = messages.find((message) => message.role === 'customer')
  const last = messages[messages.length - 1] ?? null
  const lastCustomer = [...messages].reverse().find((message) => message.role === 'customer') ?? null

  return {
    conversation_id: stub.id,
    connected_account_id: connectedAccountId,
    participant_id: customer?.id ?? customerFromMessages?.from_id ?? null,
    participant_username:
      customer?.username ?? customerFromMessages?.from_username ?? null,
    updated_at: last?.created_at ?? stub.updatedTime,
    preview: (last?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
    preview_role: last?.role ?? null,
    last_customer_at: lastCustomer?.created_at ?? null,
    messages,
  }
}

export async function fetchInstagramConversations(
  userId: string,
  connectedAccountId: string,
): Promise<InstagramConversationItem[]> {
  const [profile, stubs] = await Promise.all([
    fetchInstagramProfile(userId, connectedAccountId).catch(() => ({
      id: null,
      username: null,
    })),
    listConversationStubs(userId, connectedAccountId),
  ])

  const conversations = await Promise.all(
    stubs.map(async (stub) => {
      try {
        const messages = await fetchConversationMessages(
          userId,
          connectedAccountId,
          stub.id,
          profile.id,
        )
        return buildConversationItem(stub, messages, connectedAccountId, profile.id)
      } catch (error) {
        console.error('[instagram] conversation fetch failed:', stub.id, error)
        return buildConversationItem(stub, [], connectedAccountId, profile.id)
      }
    }),
  )

  return conversations.sort((a, b) => {
    const aMs = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bMs = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return bMs - aMs
  })
}

export async function sendInstagramTextMessage(
  userId: string,
  args: {
    connectedAccountId: string
    recipientId: string
    text: string
  },
): Promise<{ message_id: string | null }> {
  const data = await executeInstagramTool(
    userId,
    'INSTAGRAM_SEND_TEXT_MESSAGE',
    { recipient_id: args.recipientId, text: args.text },
    args.connectedAccountId,
  )
  const nested = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
    ? (data.data as Record<string, unknown>)
    : data
  return { message_id: pickString(nested.message_id, data.message_id) }
}
