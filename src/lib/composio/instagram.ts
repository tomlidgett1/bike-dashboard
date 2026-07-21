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

export async function mintInstagramConnectLink(
  userId: string,
  options?: { callbackUrl?: string },
): Promise<{ url: string }> {
  const link = await mintToolkitConnectLink(userId, 'instagram', {
    allowMultiple: false,
    callbackUrl: options?.callbackUrl,
  })
  return { url: link.url }
}

export type InstagramPublishResult = {
  mediaId: string | null
  creationId: string | null
  igUserId: string | null
  username: string | null
}

/**
 * Publish a single image post or story via Composio (Meta auth is handled by Composio).
 * Flow: create media container → publish container.
 *
 * Feed images: omit media_type (inferred from image_url).
 * Stories: media_type = STORIES.
 */
export async function publishInstagramPhotoPost(args: {
  userId: string
  imageUrl: string
  caption: string
  destination?: 'post' | 'story'
  connectedAccountId?: string
}): Promise<InstagramPublishResult> {
  const connections = await listInstagramConnections(args.userId)
  const connection =
    (args.connectedAccountId
      ? connections.find((c) => c.id === args.connectedAccountId)
      : null) ?? connections[0]

  if (!connection) {
    throw new Error('Connect Instagram in Yellow Jersey first.')
  }

  const profile = await fetchInstagramProfile(args.userId, connection.id)
  const igUserId = profile.id || 'me'
  const isStory = args.destination === 'story'

  const containerArgs: Record<string, unknown> = {
    ig_user_id: igUserId,
    image_url: args.imageUrl,
  }
  if (isStory) {
    containerArgs.media_type = 'STORIES'
  } else if (args.caption.trim()) {
    containerArgs.caption = args.caption
  }

  const container = await executeInstagramTool(
    args.userId,
    'INSTAGRAM_POST_IG_USER_MEDIA',
    containerArgs,
    connection.id,
  )

  const creationId = pickString(
    container.id,
    container.creation_id,
    (container.data as Record<string, unknown> | undefined)?.id,
    (container.data as Record<string, unknown> | undefined)?.creation_id,
  )
  if (!creationId) {
    throw new Error('Instagram did not return a media container id.')
  }

  return publishInstagramContainer({
    userId: args.userId,
    igUserId,
    creationId,
    username: profile.username,
    connectedAccountId: connection.id,
  })
}

/**
 * Publish a multi-image feed carousel (2–10 photos) via Composio.
 */
export async function publishInstagramCarouselPost(args: {
  userId: string
  imageUrls: string[]
  caption: string
  connectedAccountId?: string
}): Promise<InstagramPublishResult> {
  const urls = args.imageUrls.map((url) => url.trim()).filter(Boolean)
  if (urls.length < 2) {
    throw new Error('A carousel needs at least 2 photos.')
  }
  if (urls.length > 10) {
    throw new Error('Instagram carousels support up to 10 photos.')
  }

  const connections = await listInstagramConnections(args.userId)
  const connection =
    (args.connectedAccountId
      ? connections.find((c) => c.id === args.connectedAccountId)
      : null) ?? connections[0]

  if (!connection) {
    throw new Error('Connect Instagram in Yellow Jersey first.')
  }

  const profile = await fetchInstagramProfile(args.userId, connection.id)
  const igUserId = profile.id || 'me'

  const container = await executeInstagramTool(
    args.userId,
    'INSTAGRAM_CREATE_CAROUSEL_CONTAINER',
    {
      ig_user_id: igUserId,
      child_image_urls: urls,
      caption: args.caption.trim() || undefined,
    },
    connection.id,
  )

  const creationId = pickString(
    container.id,
    container.creation_id,
    (container.data as Record<string, unknown> | undefined)?.id,
    (container.data as Record<string, unknown> | undefined)?.creation_id,
  )
  if (!creationId) {
    throw new Error('Instagram did not return a carousel container id.')
  }

  return publishInstagramContainer({
    userId: args.userId,
    igUserId,
    creationId,
    username: profile.username,
    connectedAccountId: connection.id,
  })
}

async function publishInstagramContainer(args: {
  userId: string
  igUserId: string
  creationId: string
  username: string | null
  connectedAccountId: string
}): Promise<InstagramPublishResult> {
  const published = await executeInstagramTool(
    args.userId,
    'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
    {
      ig_user_id: args.igUserId,
      creation_id: args.creationId,
    },
    args.connectedAccountId,
  )

  const mediaId = pickString(
    published.id,
    (published.data as Record<string, unknown> | undefined)?.id,
  )

  return {
    mediaId,
    creationId: args.creationId,
    igUserId: args.igUserId === 'me' ? null : args.igUserId,
    username: args.username,
  }
}

export async function disconnectInstagramAccount(
  userId: string,
  connectedAccountId?: string,
): Promise<void> {
  const connections = await listInstagramConnections(userId)
  const targets = connectedAccountId
    ? connections.filter((c) => c.id === connectedAccountId)
    : connections

  if (targets.length === 0) return

  const composio = getComposioClient()
  for (const connection of targets) {
    try {
      await composio.connectedAccounts.delete(connection.id)
    } catch (error) {
      console.error('[composio/instagram] disconnect failed:', connection.id, error)
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Could not disconnect Instagram. Try again from Settings.',
      )
    }
  }
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

const profileNameCache = new Map<string, { name: string | null; fetchedAt: number }>()
const PROFILE_NAME_TTL_MS = 24 * 60 * 60 * 1000
const PROFILE_NAME_MISS_TTL_MS = 5 * 60 * 1000

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function nameFromOgTitle(rawTitle: string, handle: string): string | null {
  const title = decodeHtmlEntities(rawTitle).trim()
  if (!title || /^instagram$/i.test(title)) return null
  const nameMatch =
    title.match(/^(.+?)\s*\(@[a-zA-Z0-9._]+\)/) ||
    title.match(/^(.+?)\s*[|·•\-]\s*@?[a-zA-Z0-9._]+/i)
  let name = nameMatch?.[1]?.trim() || null
  if (
    name &&
    (name.toLowerCase() === handle.toLowerCase() ||
      /^instagram$/i.test(name) ||
      name.length > 80)
  ) {
    name = null
  }
  return name
}

/**
 * Instagram Messaging only returns usernames. Resolve the public display name
 * via Instagram's web profile endpoint (HTML og:title is often blocked from servers).
 */
async function resolveInstagramDisplayName(username: string | null): Promise<string | null> {
  const handle = username?.trim().replace(/^@/, '')
  if (!handle || !/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null

  const cached = profileNameCache.get(handle.toLowerCase())
  if (cached) {
    const ttl = cached.name ? PROFILE_NAME_TTL_MS : PROFILE_NAME_MISS_TTL_MS
    if (Date.now() - cached.fetchedAt < ttl) return cached.name
  }

  const cacheMiss = () => {
    profileNameCache.set(handle.toLowerCase(), { name: null, fetchedAt: Date.now() })
    return null
  }

  try {
    // Primary: private web API used by Instagram's own site — returns full_name.
    const profileRes = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'X-IG-App-ID': '936619743392459',
          Accept: '*/*',
          'Accept-Language': 'en-AU,en;q=0.9',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          Referer: `https://www.instagram.com/${handle}/`,
          Origin: 'https://www.instagram.com',
        },
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (profileRes.ok) {
      const payload = (await profileRes.json()) as {
        data?: { user?: { full_name?: unknown; username?: unknown } }
      }
      const fullName =
        typeof payload.data?.user?.full_name === 'string'
          ? payload.data.user.full_name.trim()
          : ''
      if (
        fullName &&
        fullName.toLowerCase() !== handle.toLowerCase() &&
        !/^instagram$/i.test(fullName)
      ) {
        profileNameCache.set(handle.toLowerCase(), { name: fullName, fetchedAt: Date.now() })
        return fullName
      }
    }

    // Fallback: public profile HTML og:title (often blocked from cloud IPs).
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return cacheMiss()
    const html = await res.text()
    const ogMatch =
      html.match(/property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+property="og:title"/i) ||
      html.match(/<title>([^<]+)<\/title>/i)
    const name = ogMatch?.[1] ? nameFromOgTitle(ogMatch[1], handle) : null
    profileNameCache.set(handle.toLowerCase(), { name, fetchedAt: Date.now() })
    return name
  } catch (error) {
    console.warn(
      '[instagram] display name lookup failed:',
      handle,
      error instanceof Error ? error.message : error,
    )
    return cacheMiss()
  }
}

async function enrichConversationNames(
  conversations: InstagramConversationItem[],
): Promise<InstagramConversationItem[]> {
  return Promise.all(
    conversations.map(async (conversation) => {
      if (conversation.participant_name?.trim()) return conversation
      const name = await resolveInstagramDisplayName(conversation.participant_username)
      if (!name) return conversation
      return { ...conversation, participant_name: name }
    }),
  )
}

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
  participants: Array<{ id: string | null; username: string | null; name: string | null }>
}

function parseParticipants(raw: unknown): ConversationStub['participants'] {
  // Graph API: participants: { data: [{ id, username, name? }] }
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).data
      : null
  if (!Array.isArray(list)) return []
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const username = pickString(item.username)
      const name = pickString(item.name, item.full_name, item.fullName)
      // Don't treat a duplicate of the handle as a real display name.
      const distinctName =
        name && username && name.replace(/^@/, '').toLowerCase() === username.toLowerCase()
          ? null
          : name
      return {
        id: pickString(item.id),
        username,
        name: distinctName,
      }
    })
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

function normaliseHandle(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/^@/, '')
  return trimmed ? trimmed.toLowerCase() : null
}

function extractToIds(raw: Record<string, unknown>): string[] {
  const to = raw.to
  if (!to || typeof to !== 'object') return []
  const list = Array.isArray(to)
    ? to
    : Array.isArray((to as Record<string, unknown>).data)
      ? ((to as Record<string, unknown>).data as unknown[])
      : [to]
  const ids: string[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const id = pickString((item as Record<string, unknown>).id)
    if (id) ids.push(id)
  }
  return ids
}

function parseMessageRaw(raw: Record<string, unknown>): Omit<InstagramInboxMessage, 'role'> | null {
  const id = pickString(raw.id)
  if (!id) return null
  const from = (raw.from && typeof raw.from === 'object' && !Array.isArray(raw.from))
    ? (raw.from as Record<string, unknown>)
    : {}
  const fromId = pickString(from.id)
  const attachments = raw.attachments
  const hasAttachments = Array.isArray(attachments)
    ? attachments.length > 0
    : Boolean(
        attachments &&
          typeof attachments === 'object' &&
          Array.isArray((attachments as Record<string, unknown>).data) &&
          ((attachments as Record<string, unknown>).data as unknown[]).length > 0,
      )

  const fromUsername = pickString(from.username)
  const fromNameRaw = pickString(from.name, from.full_name, from.fullName)
  const fromName =
    fromNameRaw &&
    fromUsername &&
    normaliseHandle(fromNameRaw) === normaliseHandle(fromUsername)
      ? null
      : fromNameRaw

  return {
    id,
    text: pickString(raw.message) ?? (hasAttachments ? '[Attachment]' : ''),
    from_id: fromId,
    from_username: fromUsername,
    from_name: fromName,
    to_ids: extractToIds(raw),
    created_at: pickString(raw.created_time, raw.createdTime),
    has_attachments: hasAttachments,
  }
}

/**
 * GET_USER_INFO returns a different id than conversation participants use for
 * messaging. Collect every id that belongs to the shop so we don't treat the
 * business as the customer (and send replies to ourselves).
 */
function collectBusinessMessagingIds(args: {
  profileId: string | null
  profileUsername: string | null
  participants: ConversationStub['participants']
  messages: Array<Omit<InstagramInboxMessage, 'role'>>
}): Set<string> {
  const ids = new Set<string>()
  if (args.profileId) ids.add(args.profileId)
  const shopHandle = normaliseHandle(args.profileUsername)

  for (const participant of args.participants) {
    if (shopHandle && normaliseHandle(participant.username) === shopHandle && participant.id) {
      ids.add(participant.id)
    }
  }

  for (const message of args.messages) {
    if (shopHandle && normaliseHandle(message.from_username) === shopHandle && message.from_id) {
      ids.add(message.from_id)
    }
    // Inbound customer messages list the shop in `to`.
    if (shopHandle && normaliseHandle(message.from_username) !== shopHandle) {
      for (const toId of message.to_ids) ids.add(toId)
    }
  }

  return ids
}

function assignMessageRoles(
  messages: Array<Omit<InstagramInboxMessage, 'role'>>,
  businessIds: Set<string>,
): InstagramInboxMessage[] {
  return messages.map((message) => ({
    ...message,
    role: message.from_id && businessIds.has(message.from_id) ? 'shop' : 'customer',
  }))
}

async function fetchConversationMessages(
  userId: string,
  connectedAccountId: string,
  conversationId: string,
): Promise<Array<Omit<InstagramInboxMessage, 'role'>>> {
  const data = await executeInstagramTool(
    userId,
    'INSTAGRAM_LIST_ALL_MESSAGES',
    { conversation_id: conversationId, limit: MESSAGES_PER_CONVERSATION },
    connectedAccountId,
  )
  const messages = extractGraphList(data)
    .map((item) => parseMessageRaw(item))
    .filter((item): item is Omit<InstagramInboxMessage, 'role'> => Boolean(item))

  // Graph API returns newest-first; threads render oldest → newest.
  return messages.sort((a, b) => {
    const aMs = a.created_at ? new Date(a.created_at).getTime() : 0
    const bMs = b.created_at ? new Date(b.created_at).getTime() : 0
    return aMs - bMs
  })
}

function buildConversationItem(
  stub: ConversationStub,
  rawMessages: Array<Omit<InstagramInboxMessage, 'role'>>,
  connectedAccountId: string,
  profile: InstagramProfile,
): InstagramConversationItem {
  const businessIds = collectBusinessMessagingIds({
    profileId: profile.id,
    profileUsername: profile.username,
    participants: stub.participants,
    messages: rawMessages,
  })
  const messages = assignMessageRoles(rawMessages, businessIds)

  const customerParticipant =
    stub.participants.find((participant) => participant.id && !businessIds.has(participant.id)) ??
    null
  const customerFromMessages = [...messages].reverse().find((message) => message.role === 'customer')
  const last = messages[messages.length - 1] ?? null
  const lastCustomer = customerFromMessages

  let businessMessagingId: string | null = null
  for (const id of businessIds) {
    if (id !== profile.id) {
      businessMessagingId = id
      break
    }
  }
  if (!businessMessagingId && profile.id) businessMessagingId = profile.id

  return {
    conversation_id: stub.id,
    connected_account_id: connectedAccountId,
    participant_id: customerParticipant?.id ?? customerFromMessages?.from_id ?? null,
    participant_username:
      customerParticipant?.username ?? customerFromMessages?.from_username ?? null,
    participant_name: customerParticipant?.name ?? customerFromMessages?.from_name ?? null,
    business_messaging_id: businessMessagingId,
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
        // Prefer GET_CONVERSATION when list stubs omit participants.
        let participants = stub.participants
        if (participants.length === 0) {
          try {
            const detail = await executeInstagramTool(
              userId,
              'INSTAGRAM_GET_CONVERSATION',
              { conversation_id: stub.id },
              connectedAccountId,
            )
            participants = parseParticipants(detail.participants)
          } catch {
            // Fall through — messages still identify the customer.
          }
        }
        const stubWithParticipants = { ...stub, participants }
        const rawMessages = await fetchConversationMessages(
          userId,
          connectedAccountId,
          stub.id,
        )
        return buildConversationItem(
          stubWithParticipants,
          rawMessages,
          connectedAccountId,
          profile,
        )
      } catch (error) {
        console.error('[instagram] conversation fetch failed:', stub.id, error)
        return buildConversationItem(stub, [], connectedAccountId, profile)
      }
    }),
  )

  return (await enrichConversationNames(conversations)).sort((a, b) => {
    const aMs = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bMs = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return bMs - aMs
  })
}

export function friendlyInstagramSendError(raw: string): string {
  if (/BadConnectedAccountState|not in an ACTIVE state|INITIATED|EXPIRED/i.test(raw)) {
    return (
      'Instagram is disconnected or stuck mid-reconnect. Open Settings → Enquiries, disconnect Instagram, ' +
      'connect it again, then retry the reply.'
    )
  }
  if (/2534048|Advanced Access|does not have role on app/i.test(raw)) {
    return (
      'Instagram API replies need Advanced Access on the Meta app (or the customer must be added as an app tester). ' +
      'Reply in the Instagram app for now, or we can wire a custom Meta app with Advanced Access.'
    )
  }
  if (/2534022|outside of allowed window/i.test(raw)) {
    return (
      'Instagram rejected this API reply. Your chat is inside the 24-hour window, so this is usually a Meta app access limit ' +
      '(Development mode can only message app testers). Reply in the Instagram app for now — ' +
      'or test with a customer account that isn’t an admin of the shop.'
    )
  }
  return raw
}

export async function sendInstagramTextMessage(
  userId: string,
  args: {
    connectedAccountId: string
    recipientId: string
    text: string
    businessMessagingId?: string | null
  },
): Promise<{ message_id: string | null }> {
  const input: Record<string, unknown> = {
    recipient_id: args.recipientId,
    text: args.text,
  }
  if (args.businessMessagingId?.trim()) {
    input.ig_user_id = args.businessMessagingId.trim()
  }

  try {
    const data = await executeInstagramTool(
      userId,
      'INSTAGRAM_SEND_TEXT_MESSAGE',
      input,
      args.connectedAccountId,
    )
    const nested = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
      ? (data.data as Record<string, unknown>)
      : data
    return { message_id: pickString(nested.message_id, data.message_id) }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    throw new Error(friendlyInstagramSendError(raw))
  }
}
