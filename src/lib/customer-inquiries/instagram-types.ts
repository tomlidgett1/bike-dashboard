/**
 * Client-safe Instagram DM inbox types shared between the Composio server lib,
 * the /api/store/instagram-inbox route, and the unified inbox UI.
 */

export type InstagramMessageRole = 'customer' | 'shop'

export type InstagramInboxMessage = {
  id: string
  role: InstagramMessageRole
  text: string
  from_id: string | null
  from_username: string | null
  created_at: string | null
  has_attachments: boolean
}

export type InstagramConversationItem = {
  conversation_id: string
  connected_account_id: string
  /** Customer's Instagram-scoped ID — the recipient_id for replies. */
  participant_id: string | null
  participant_username: string | null
  updated_at: string | null
  preview: string
  preview_role: InstagramMessageRole | null
  last_customer_at: string | null
  /** Oldest → newest, ready for thread display. */
  messages: InstagramInboxMessage[]
}

export type InstagramInboxAccount = {
  id: string
  label: string
  username: string | null
}

export type InstagramInboxState = {
  configured: boolean
  connected: boolean
  accounts: InstagramInboxAccount[]
}

export type InstagramInboxResponse = InstagramInboxState & {
  conversations: InstagramConversationItem[]
  cached?: boolean
  error?: string
}
