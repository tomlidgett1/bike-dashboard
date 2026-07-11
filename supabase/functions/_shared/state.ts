import { CONVERSATION_MESSAGES_TABLE, CONVERSATIONS_TABLE, JOB_FAILURES_TABLE, OUTBOUND_MESSAGES_TABLE, USER_PROFILES_TABLE, WEBHOOK_EVENTS_TABLE, MEMORY_ITEMS_TABLE, CONVERSATION_SUMMARIES_TABLE, TOOL_TRACES_TABLE, PENDING_ACTIONS_TABLE, REPORTED_BUGS_TABLE, REMINDERS_TABLE, ENTITIES_TABLE } from './env.ts';
import { getAdminClient } from './supabase.ts';
import { dedupeExtractedMedia } from './inbound-image-buffer.ts';
import type { ExtractedMedia, MessageService, NormalisedIncomingMessage } from './linq.ts';
import type { ConversationEngagement, ConversationEngagementScope, ConversationScopeFilter } from './conversation-engagement.ts';
import { normaliseConversationEngagement, normaliseConversationScopeFilter } from './conversation-engagement.ts';
import { isValidIanaTimeZone } from './granola-time.ts';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  handle?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  engagementScope?: ConversationEngagementScope;
  engagementBrandKey?: string | null;
}

interface ReportedBugInsert {
  chat_id: string;
  sender_handle: string | null;
  auth_user_id: string | null;
  provider: string | null;
  service: string | null;
  message_text: string;
  bug_text: string;
  prior_messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    handle: string | null;
    created_at: string | null;
    metadata: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Memory System v2 Types
// ============================================================================

export type MemoryType =
  | 'identity'
  | 'preference'
  | 'plan'
  | 'task_commitment'
  | 'relationship'
  | 'emotional_context'
  | 'bio_fact'
  | 'contextual_note';

export type MemoryStatus =
  | 'active'
  | 'uncertain'
  | 'stale'
  | 'expired'
  | 'superseded'
  | 'rejected';

export type SourceKind =
  | 'realtime_tool'
  | 'background_extraction'
  | 'legacy_migration';

export interface MemoryItem {
  id: number;
  handle: string;
  chatId: string | null;
  memoryType: MemoryType;
  category: string;
  valueText: string;
  normalizedValue: string | null;
  confidence: number;
  status: MemoryStatus;
  scope: string;
  sourceKind: SourceKind;
  firstSeenAt: string;
  lastSeenAt: string;
  lastConfirmedAt: string | null;
  expiryAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationSummary {
  id: number;
  chatId: string;
  senderHandle: string | null;
  engagementScope: ConversationEngagementScope;
  engagementBrandKey: string | null;
  summary: string;
  topics: string[];
  openLoops: string[];
  summaryKind: string;
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
  confidence: number;
  createdAt: string;
}

export interface ToolTrace {
  id: number;
  chatId: string;
  engagementScope: ConversationEngagementScope;
  engagementBrandKey: string | null;
  toolName: string;
  outcome: string;
  safeSummary: string | null;
  createdAt: string;
}

export type PendingActionStatus =
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'expired';

export interface PendingEmailSendAction {
  id: number;
  chatId: string;
  actionType: 'email_send';
  status: PendingActionStatus;
  draftId: string | null;
  account: string | null;
  to: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  cc: string[];
  bcc: string[];
  replyToThreadId: string | null;
  replyAll: boolean;
  sourceTurnId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
}

export interface IdleConversation {
  chatId: string;
  engagementScope: ConversationEngagementScope;
  engagementBrandKey: string | null;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  sinceTs: string;
}

export interface UnsummarisedMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  handle: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface UserProfile {
  handle: string;
  name: string | null;
  facts: string[];
  useLinq: boolean;
  route: string | null;
  routeBrandKey: string | null;
  firstSeen: number;
  lastSeen: number;
  deepProfileSnapshot: Record<string, unknown> | null;
  deepProfileBuiltAt: string | null;
  newDeepdiveSummary: string | null;
  contextProfile?: UserContextProfile | null;
  testRouteLlm: boolean;
  newRouter: boolean;
  /** When true, Nest uses Gen Z personality prompt layers (same tools and capabilities). */
  genz: boolean;
}

export type UserContextLocationPrecision =
  | 'unknown'
  | 'country'
  | 'state'
  | 'city'
  | 'suburb'
  | 'address';

export interface UserContextLocation {
  value: string;
  precision: UserContextLocationPrecision;
  updatedAt: string;
  expiresAt?: string | null;
  source: 'explicit_user' | 'manual' | 'inferred';
}

export interface UserContextProfile {
  homeLocation?: UserContextLocation | null;
  currentLocation?: UserContextLocation | null;
  workLocation?: UserContextLocation | null;
  timezone?: string | null;
  dietaryPreferences?: string[];
  updatedAt?: string;
}

export interface ConnectedAccount {
  provider: 'google' | 'microsoft' | 'granola';
  email: string;
  name: string | null;
  isPrimary: boolean;
  scopes: string[];
}

export interface WebhookEventRow {
  id: number;
  provider: string;
  provider_message_id: string;
  chat_id: string;
  sender_handle: string;
  bot_number: string;
  status: string;
  raw_payload: Record<string, unknown>;
  normalized_payload: NormalisedIncomingMessage;
  last_error: string | null;
}

interface RpcWebhookEventResult {
  event_id: number;
  created: boolean;
}

interface ConversationWindowRow {
  role: 'user' | 'assistant';
  content: string;
  handle: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  engagement_scope: ConversationEngagementScope;
  engagement_brand_key: string | null;
}

interface UserProfileRow {
  handle: string;
  name: string | null;
  facts: unknown;
  use_linq: boolean;
  first_seen: number;
  last_seen: number;
  deep_profile_snapshot: Record<string, unknown> | null;
  deep_profile_built_at: string | null;
  new_deepdive_summary?: string | null;
  context_profile: unknown;
  test_route_llm: boolean;
  new_router: boolean;
  genz: boolean;
  route?: string | null;
  route_brand_key?: string | null;
}

interface PendingInboundImagesRow {
  chat_id: string;
  sender_handle: string;
  images: unknown;
  expires_at: string;
}

const PENDING_INBOUND_IMAGES_TABLE = 'pending_inbound_images';
const PENDING_INBOUND_IMAGES_TTL_MS = 30 * 60 * 1000;

function sanitiseFacts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sanitiseExtractedMediaArray(value: unknown): ExtractedMedia[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const url = typeof row.url === 'string' ? row.url.trim() : '';
      const mimeType = typeof row.mimeType === 'string'
        ? row.mimeType.trim()
        : typeof row.mime_type === 'string'
          ? row.mime_type.trim()
          : '';
      if (!url || !mimeType) return null;
      return { url, mimeType };
    })
    .filter((item): item is ExtractedMedia => item !== null);
}

function sanitiseLocationEntry(value: unknown): UserContextLocation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.value !== 'string' || row.value.trim().length === 0) return null;

  const precision = typeof row.precision === 'string'
    ? row.precision as UserContextLocationPrecision
    : 'unknown';
  const updatedAt = typeof row.updatedAt === 'string' && row.updatedAt.trim().length > 0
    ? row.updatedAt
    : new Date(0).toISOString();
  const source = typeof row.source === 'string'
    ? row.source as UserContextLocation['source']
    : 'inferred';

  return {
    value: row.value.trim(),
    precision,
    updatedAt,
    expiresAt: typeof row.expiresAt === 'string' ? row.expiresAt : null,
    source,
  };
}

export function sanitiseUserContextProfile(value: unknown): UserContextProfile | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const dietaryPreferences = Array.isArray(row.dietaryPreferences)
    ? row.dietaryPreferences.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    homeLocation: sanitiseLocationEntry(row.homeLocation),
    currentLocation: sanitiseLocationEntry(row.currentLocation),
    workLocation: sanitiseLocationEntry(row.workLocation),
    timezone: typeof row.timezone === 'string' ? row.timezone : null,
    dietaryPreferences,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
  };
}

export async function enqueueWebhookEvent(rawPayload: Record<string, unknown>, message: NormalisedIncomingMessage): Promise<{ eventId: number; created: boolean }> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('enqueue_webhook_event', {
    p_provider: 'linq',
    p_provider_message_id: message.messageId,
    p_chat_id: message.chatId,
    p_sender_handle: message.from,
    p_bot_number: message.conversation.fromNumber,
    p_raw_payload: rawPayload,
    p_normalized_payload: message,
  });

  if (error) {
    throw error;
  }

  const result = (data as RpcWebhookEventResult[] | null)?.[0];
  if (!result) {
    throw new Error('enqueue_webhook_event returned no data');
  }

  return { eventId: result.event_id, created: result.created };
}

export async function getWebhookEvent(eventId: number): Promise<WebhookEventRow | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(WEBHOOK_EVENTS_TABLE)
    .select('id, provider, provider_message_id, chat_id, sender_handle, bot_number, status, raw_payload, normalized_payload, last_error')
    .eq('id', eventId)
    .maybeSingle<WebhookEventRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function markWebhookEventStatus(eventId: number, status: string, lastError?: string | null): Promise<void> {
  const supabase = getAdminClient();
  const patch: Record<string, unknown> = {
    status,
    last_error: lastError ?? null,
  };

  if (status === 'processing') {
    patch.processing_started_at = new Date().toISOString();
  }

  if (status === 'completed' || status === 'failed') {
    patch.processed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from(WEBHOOK_EVENTS_TABLE)
    .update(patch)
    .eq('id', eventId);

  if (error) {
    throw error;
  }
}

export async function recordJobFailure(queueName: string, queueMessageId: number, webhookEventId: number | null, attemptNumber: number, errorMessage: string, payload: Record<string, unknown>): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(JOB_FAILURES_TABLE)
    .insert({
      queue_name: queueName,
      queue_message_id: queueMessageId,
      webhook_event_id: webhookEventId,
      attempt_number: attemptNumber,
      error: errorMessage,
      payload,
    });

  if (error) {
    console.error('[state] Failed to record job failure:', error);
  }
}

export async function logOutboundMessage(chatId: string, kind: string, payload: Record<string, unknown>, status = 'pending', providerMessageId?: string | null, errorText?: string | null): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(OUTBOUND_MESSAGES_TABLE)
    .insert({
      chat_id: chatId,
      kind,
      payload,
      status,
      provider_message_id: providerMessageId ?? null,
      error: errorText ?? null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });

  if (error) {
    console.error('[state] Failed to log outbound message:', error);
  }
}


export async function getConversation(
  chatId: string,
  limit = 20,
  filter?: ConversationScopeFilter,
): Promise<StoredMessage[]> {
  const supabase = getAdminClient();
  const scopeFilter = normaliseConversationScopeFilter(filter);
  const { data, error } = await supabase.rpc('get_conversation_window', {
    p_chat_id: chatId,
    p_limit: limit,
    p_engagement_scope: scopeFilter.scope === 'all' ? null : scopeFilter.scope,
    p_engagement_brand_key: scopeFilter.scope === 'brand' ? scopeFilter.brandKey : null,
  });

  if (error) {
    console.error('[state] Error getting conversation window:', error);
    return [];
  }

  return ((data as ConversationWindowRow[] | null) || []).map((row) => ({
    role: row.role,
    content: row.content,
    ...(row.handle ? { handle: row.handle } : {}),
    createdAt: row.created_at,
    ...(row.metadata && Object.keys(row.metadata).length > 0 ? { metadata: row.metadata } : {}),
    engagementScope: row.engagement_scope,
    engagementBrandKey: row.engagement_brand_key ?? null,
  }));
}

export async function reportBug(params: {
  chatId: string;
  senderHandle?: string | null;
  authUserId?: string | null;
  provider?: string | null;
  service?: string | null;
  messageText: string;
  bugText: string;
  priorMessages: StoredMessage[];
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  const supabase = getAdminClient();

  const insertPayload: ReportedBugInsert = {
    chat_id: params.chatId,
    sender_handle: params.senderHandle ?? null,
    auth_user_id: params.authUserId ?? null,
    provider: params.provider ?? null,
    service: params.service ?? null,
    message_text: params.messageText,
    bug_text: params.bugText,
    prior_messages: params.priorMessages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
      handle: m.handle ?? null,
      created_at: m.createdAt ?? null,
      metadata: m.metadata ?? {},
    })),
    metadata: params.metadata ?? {},
  };

  const { data, error } = await supabase
    .from(REPORTED_BUGS_TABLE)
    .insert(insertPayload)
    .select('id')
    .maybeSingle<{ id: number }>();

  if (error) {
    console.error('[state] Failed to report bug:', error);
    return null;
  }

  return data?.id ?? null;
}

export async function addMessage(
  chatId: string,
  role: 'user' | 'assistant',
  content: string,
  handle?: string,
  context?: {
    isGroupChat?: boolean;
    chatName?: string | null;
    participantNames?: string[];
    service?: MessageService;
    metadata?: Record<string, unknown>;
    engagement?: ConversationEngagement;
    providerMessageId?: string | null;
  },
): Promise<void> {
  const supabase = getAdminClient();
  const engagement = normaliseConversationEngagement(context?.engagement);
  const { error } = await supabase.rpc('append_conversation_message', {
    p_chat_id: chatId,
    p_role: role,
    p_content: content,
    p_handle: handle ?? null,
    p_metadata: context?.metadata ?? {},
    p_is_group_chat: context?.isGroupChat ?? false,
    p_chat_name: context?.chatName ?? null,
    p_participant_names: context?.participantNames ?? [],
    p_service: context?.service ?? null,
    p_engagement_scope: engagement.scope,
    p_engagement_brand_key: engagement.brandKey,
    p_provider_message_id: context?.providerMessageId ?? null,
  });

  if (error) {
    console.error('[state] Error appending conversation message:', error);
  }
}

export async function addMessageStrict(
  chatId: string,
  role: 'user' | 'assistant',
  content: string,
  handle?: string,
  context?: {
    isGroupChat?: boolean;
    chatName?: string | null;
    participantNames?: string[];
    service?: MessageService;
    metadata?: Record<string, unknown>;
    engagement?: ConversationEngagement;
    providerMessageId?: string | null;
  },
): Promise<void> {
  const supabase = getAdminClient();
  const engagement = normaliseConversationEngagement(context?.engagement);
  const { error } = await supabase.rpc('append_conversation_message', {
    p_chat_id: chatId,
    p_role: role,
    p_content: content,
    p_handle: handle ?? null,
    p_metadata: context?.metadata ?? {},
    p_is_group_chat: context?.isGroupChat ?? false,
    p_chat_name: context?.chatName ?? null,
    p_participant_names: context?.participantNames ?? [],
    p_service: context?.service ?? null,
    p_engagement_scope: engagement.scope,
    p_engagement_brand_key: engagement.brandKey,
    p_provider_message_id: context?.providerMessageId ?? null,
  });

  if (error) {
    console.error('[state] Error appending conversation message:', error);
    throw new Error(`append_conversation_message failed: ${error.message}`);
  }
}

async function deletePendingInboundImages(chatId: string, senderHandle: string): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(PENDING_INBOUND_IMAGES_TABLE)
    .delete()
    .eq('chat_id', chatId)
    .eq('sender_handle', senderHandle);

  if (error) {
    console.error('[state] Error clearing pending inbound images:', error);
  }
}

export async function bufferPendingInboundImages(params: {
  chatId: string;
  senderHandle: string;
  images: ExtractedMedia[];
}): Promise<void> {
  if (params.images.length === 0) return;

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(PENDING_INBOUND_IMAGES_TABLE)
    .select('chat_id, sender_handle, images, expires_at')
    .eq('chat_id', params.chatId)
    .eq('sender_handle', params.senderHandle)
    .maybeSingle<PendingInboundImagesRow>();

  if (error) {
    console.error('[state] Error loading pending inbound images:', error);
    return;
  }

  let existingImages: ExtractedMedia[] = [];
  if (data) {
    const isExpired = new Date(data.expires_at).getTime() <= Date.now();
    if (isExpired) {
      await deletePendingInboundImages(params.chatId, params.senderHandle);
    } else {
      existingImages = sanitiseExtractedMediaArray(data.images);
    }
  }

  const images = dedupeExtractedMedia([...existingImages, ...params.images]);
  const expiresAt = new Date(Date.now() + PENDING_INBOUND_IMAGES_TTL_MS).toISOString();
  const { error: upsertError } = await supabase
    .from(PENDING_INBOUND_IMAGES_TABLE)
    .upsert(
      {
        chat_id: params.chatId,
        sender_handle: params.senderHandle,
        images,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id,sender_handle' },
    );

  if (upsertError) {
    console.error('[state] Error buffering pending inbound images:', upsertError);
  }
}

export async function consumePendingInboundImages(chatId: string, senderHandle: string): Promise<ExtractedMedia[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(PENDING_INBOUND_IMAGES_TABLE)
    .select('chat_id, sender_handle, images, expires_at')
    .eq('chat_id', chatId)
    .eq('sender_handle', senderHandle)
    .maybeSingle<PendingInboundImagesRow>();

  if (error) {
    console.error('[state] Error loading pending inbound images:', error);
    return [];
  }

  if (!data) return [];

  const isExpired = new Date(data.expires_at).getTime() <= Date.now();
  if (isExpired) {
    await deletePendingInboundImages(chatId, senderHandle);
    return [];
  }

  const images = sanitiseExtractedMediaArray(data.images);
  await deletePendingInboundImages(chatId, senderHandle);
  return images;
}

export async function clearConversation(chatId: string): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('clear_conversation_history', {
    p_chat_id: chatId,
  });

  if (error) {
    console.error('[state] Error clearing conversation:', error);
  }
}

export async function getUserProfile(handle: string): Promise<UserProfile | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select('handle, name, facts, use_linq, route, route_brand_key, first_seen, last_seen, deep_profile_snapshot, deep_profile_built_at, context_profile, test_route_llm, new_router, genz')
    .eq('handle', handle)
    .maybeSingle<UserProfileRow>();

  if (error) {
    console.error('[state] Error getting user profile:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    handle: data.handle,
    name: data.name,
    facts: sanitiseFacts(data.facts),
    useLinq: data.use_linq ?? false,
    route: data.route ?? null,
    routeBrandKey: data.route_brand_key ?? null,
    firstSeen: data.first_seen,
    lastSeen: data.last_seen,
    deepProfileSnapshot: data.deep_profile_snapshot ?? null,
    deepProfileBuiltAt: data.deep_profile_built_at ?? null,
    newDeepdiveSummary: null,
    contextProfile: sanitiseUserContextProfile(data.context_profile),
    testRouteLlm: data.test_route_llm ?? false,
    newRouter: data.new_router ?? false,
    genz: data.genz ?? false,
  };
}

/** IANA zone from user_profiles (for tools when request timezone is missing, e.g. WhatsApp). */
export async function getUserProfileTimezoneForHandle(handle: string): Promise<string | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select('timezone')
    .eq('handle', handle)
    .maybeSingle<{ timezone: string | null }>();

  if (error) {
    console.error('[state] getUserProfileTimezoneForHandle:', error);
    return null;
  }

  const raw = typeof data?.timezone === 'string' ? data.timezone.trim() : '';
  if (!raw || !isValidIanaTimeZone(raw)) return null;
  return raw;
}

export async function updateUserContextProfile(
  handle: string,
  contextProfile: UserContextProfile | null,
): Promise<void> {
  const supabase = getAdminClient();
  const patch: Record<string, unknown> = {
    context_profile: contextProfile ?? {},
  };
  if (contextProfile?.timezone) {
    patch.timezone = contextProfile.timezone;
  }
  const { error } = await supabase
    .from(USER_PROFILES_TABLE)
    .update(patch)
    .eq('handle', handle);

  if (error) {
    console.error('[state] Error updating user context profile:', error);
  }
}

export async function getConnectedAccounts(authUserId: string): Promise<ConnectedAccount[]> {
  const supabase = getAdminClient();

  const [googleResult, microsoftResult, granolaResult] = await Promise.all([
    supabase
      .from('user_google_accounts')
      .select('google_email, google_name, is_primary, scopes')
      .eq('user_id', authUserId),
    supabase
      .from('user_microsoft_accounts')
      .select('microsoft_email, microsoft_name, is_primary')
      .eq('user_id', authUserId),
    supabase
      .from('user_granola_accounts')
      .select('granola_email, granola_name, is_primary')
      .eq('user_id', authUserId),
  ]);

  const accounts: ConnectedAccount[] = [];

  if (!googleResult.error && googleResult.data) {
    for (const row of googleResult.data) {
      accounts.push({
        provider: 'google',
        email: row.google_email,
        name: row.google_name ?? null,
        isPrimary: row.is_primary ?? false,
        scopes: row.scopes ?? [],
      });
    }
  }

  if (!microsoftResult.error && microsoftResult.data) {
    for (const row of microsoftResult.data) {
      accounts.push({
        provider: 'microsoft',
        email: row.microsoft_email,
        name: row.microsoft_name ?? null,
        isPrimary: row.is_primary ?? false,
        scopes: [],
      });
    }
  }

  if (!granolaResult.error && granolaResult.data) {
    for (const row of granolaResult.data) {
      accounts.push({
        provider: 'granola',
        email: row.granola_email,
        name: row.granola_name ?? null,
        isPrimary: row.is_primary ?? false,
        scopes: ['meetings'],
      });
    }
  }

  return accounts;
}

export async function addUserFact(handle: string, fact: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('add_user_fact_atomic', {
    p_handle: handle,
    p_fact: fact,
  });

  if (error) {
    console.error('[state] Error adding user fact:', error);
    return false;
  }

  return Boolean(data);
}

export async function setUserName(handle: string, name: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('set_user_name_atomic', {
    p_handle: handle,
    p_name: name,
  });

  if (error) {
    console.error('[state] Error setting user name:', error);
    return false;
  }

  return Boolean(data);
}

export async function clearUserProfile(handle: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(USER_PROFILES_TABLE)
    .delete()
    .eq('handle', handle);

  if (error) {
    console.error('[state] Error clearing user profile:', error);
    return false;
  }

  return true;
}

export async function verifyTables(): Promise<void> {
  const supabase = getAdminClient();
  for (const table of [CONVERSATIONS_TABLE, CONVERSATION_MESSAGES_TABLE, USER_PROFILES_TABLE, WEBHOOK_EVENTS_TABLE, MEMORY_ITEMS_TABLE, CONVERSATION_SUMMARIES_TABLE, TOOL_TRACES_TABLE]) {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    if (error) {
      console.warn(`[state] Table "${table}" is not ready: ${error.message}`);
    }
  }
}

// ============================================================================
// Memory Items — structured memory with provenance
// ============================================================================

interface MemoryItemRow {
  id: number;
  handle: string;
  chat_id: string | null;
  memory_type: string;
  category: string;
  value_text: string;
  normalized_value: string | null;
  confidence: number;
  status: string;
  scope: string;
  source_kind: string;
  first_seen_at: string;
  last_seen_at: string;
  last_confirmed_at: string | null;
  expiry_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function rowToMemoryItem(row: MemoryItemRow): MemoryItem {
  return {
    id: row.id,
    handle: row.handle,
    chatId: row.chat_id,
    memoryType: row.memory_type as MemoryType,
    category: row.category,
    valueText: row.value_text,
    normalizedValue: row.normalized_value,
    confidence: row.confidence,
    status: row.status as MemoryStatus,
    scope: row.scope,
    sourceKind: row.source_kind as SourceKind,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastConfirmedAt: row.last_confirmed_at,
    expiryAt: row.expiry_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export async function insertMemoryItem(params: {
  handle: string;
  chatId?: string | null;
  memoryType: MemoryType;
  category: string;
  valueText: string;
  normalizedValue: string | null;
  confidence: number;
  status: MemoryStatus;
  scope?: string;
  sourceKind: SourceKind;
  sourceMessageIds?: number[];
  sourceSummaryId?: number | null;
  extractorVersion?: string | null;
  expiryAt?: string | null;
  supersedesMemoryId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('insert_memory_item', {
    p_handle: params.handle,
    p_chat_id: params.chatId ?? null,
    p_memory_type: params.memoryType,
    p_category: params.category,
    p_value_text: params.valueText,
    p_normalized_value: params.normalizedValue,
    p_confidence: params.confidence,
    p_status: params.status,
    p_scope: params.scope ?? 'user',
    p_source_kind: params.sourceKind,
    p_source_message_ids: JSON.stringify(params.sourceMessageIds ?? []),
    p_source_summary_id: params.sourceSummaryId ?? null,
    p_extractor_version: params.extractorVersion ?? null,
    p_expiry_at: params.expiryAt ?? null,
    p_supersedes_memory_id: params.supersedesMemoryId ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    console.error('[state] Error inserting memory item:', error);
    return null;
  }

  return data as number;
}

export async function supersedeMemoryItem(oldId: number, newId: number): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('supersede_memory_item', {
    p_old_id: oldId,
    p_new_id: newId,
  });

  if (error) {
    console.error('[state] Error superseding memory item:', error);
  }
}

export async function markMemoryItemStatus(id: number, status: MemoryStatus): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('mark_memory_item_status', {
    p_id: id,
    p_status: status,
  });

  if (error) {
    console.error('[state] Error marking memory item status:', error);
  }
}

export async function confirmMemoryItem(id: number): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('confirm_memory_item', { p_id: id });

  if (error) {
    console.error('[state] Error confirming memory item:', error);
  }
}

export async function getActiveMemoryItems(handle: string, limit = 30): Promise<MemoryItem[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_active_memory_items', {
    p_handle: handle,
    p_limit: limit,
  });

  if (error) {
    console.error('[state] Error getting active memory items:', error);
    return [];
  }

  return ((data as MemoryItemRow[] | null) || []).map(rowToMemoryItem);
}

export async function rejectMemoryItem(id: number, handle: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from(MEMORY_ITEMS_TABLE)
    .select('id')
    .eq('id', id)
    .eq('handle', handle)
    .maybeSingle<{ id: number }>();

  if (fetchError || !existing) {
    console.error('[state] Memory item not found or handle mismatch:', fetchError);
    return false;
  }

  const { error } = await supabase.rpc('mark_memory_item_status', {
    p_id: id,
    p_status: 'rejected',
  });

  if (error) {
    console.error('[state] Error rejecting memory item:', error);
    return false;
  }

  return true;
}

export async function rejectAllMemoryItems(handle: string): Promise<number> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(MEMORY_ITEMS_TABLE)
    .update({ status: 'rejected' })
    .eq('handle', handle)
    .in('status', ['active', 'uncertain'])
    .select('id');

  if (error) {
    console.error('[state] Error rejecting all memory items:', error);
    return 0;
  }

  return data?.length ?? 0;
}

// ============================================================================
// Conversation Summaries
// ============================================================================

interface ConversationSummaryRow {
  id: number;
  chat_id: string;
  sender_handle: string | null;
  engagement_scope: ConversationEngagementScope;
  engagement_brand_key: string | null;
  summary: string;
  topics: string[];
  open_loops: string[];
  summary_kind: string;
  first_message_at: string;
  last_message_at: string;
  message_count: number;
  confidence: number;
  created_at: string;
}

function rowToSummary(row: ConversationSummaryRow): ConversationSummary {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderHandle: row.sender_handle,
    engagementScope: row.engagement_scope,
    engagementBrandKey: row.engagement_brand_key ?? null,
    summary: row.summary,
    topics: row.topics ?? [],
    openLoops: row.open_loops ?? [],
    summaryKind: row.summary_kind,
    firstMessageAt: row.first_message_at,
    lastMessageAt: row.last_message_at,
    messageCount: row.message_count,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

export async function getIdleConversationsNeedingSummary(idleMinutes = 15, limit = 10): Promise<IdleConversation[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_idle_conversations_needing_summary', {
    p_idle_minutes: idleMinutes,
    p_limit: limit,
  });

  if (error) {
    console.error('[state] Error getting idle conversations:', error);
    return [];
  }

  return ((data as Array<{
    chat_id: string;
    engagement_scope: ConversationEngagementScope;
    engagement_brand_key: string | null;
    message_count: number;
    first_message_at: string;
    last_message_at: string;
    since_ts: string;
  }> | null) || []).map((row) => ({
    chatId: row.chat_id,
    engagementScope: row.engagement_scope,
    engagementBrandKey: row.engagement_brand_key ?? null,
    messageCount: Number(row.message_count),
    firstMessageAt: row.first_message_at,
    lastMessageAt: row.last_message_at,
    sinceTs: row.since_ts,
  }));
}

export async function getUnsummarisedMessages(
  chatId: string,
  since?: string,
  filter?: ConversationScopeFilter,
): Promise<UnsummarisedMessage[]> {
  const supabase = getAdminClient();
  const scopeFilter = normaliseConversationScopeFilter(filter);
  const { data, error } = await supabase.rpc('get_unsummarised_messages', {
    p_chat_id: chatId,
    p_since: since ?? '1970-01-01T00:00:00Z',
    p_engagement_scope: scopeFilter.scope === 'all' ? null : scopeFilter.scope,
    p_engagement_brand_key: scopeFilter.scope === 'brand' ? scopeFilter.brandKey : null,
  });

  if (error) {
    console.error('[state] Error getting unsummarised messages:', error);
    return [];
  }

  return ((data as Array<{ id: number; role: string; content: string; handle: string | null; metadata: Record<string, unknown> | null; created_at: string }> | null) || []).map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    handle: row.handle,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
}

/** Paginated summaries for replaying entity extraction (admin backfill). */
export interface ConversationSummaryBackfillRow {
  id: number;
  chatId: string;
  engagementScope: string;
  engagementBrandKey: string | null;
  sourceMessageIds: number[];
  firstMessageAt: string;
  lastMessageAt: string;
}

function parseSourceMessageIdsColumn(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    if (typeof x === 'number' && Number.isFinite(x)) out.push(x);
    else if (typeof x === 'string' && /^\d+$/.test(x)) out.push(Number(x));
  }
  return out;
}

export async function listConversationSummariesForEntityBackfill(
  senderHandle: string,
  afterId: number,
  limit: number,
): Promise<ConversationSummaryBackfillRow[]> {
  const supabase = getAdminClient();
  const cap = Math.max(1, Math.min(limit, 50));
  const { data, error } = await supabase
    .from('conversation_summaries')
    .select(
      'id, chat_id, engagement_scope, engagement_brand_key, source_message_ids, first_message_at, last_message_at',
    )
    .eq('sender_handle', senderHandle)
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(cap);

  if (error) {
    console.error('[state] listConversationSummariesForEntityBackfill:', error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    chatId: row.chat_id as string,
    engagementScope: String(row.engagement_scope ?? 'nest'),
    engagementBrandKey: (row.engagement_brand_key as string | null) ?? null,
    sourceMessageIds: parseSourceMessageIdsColumn(row.source_message_ids),
    firstMessageAt: String(row.first_message_at ?? ''),
    lastMessageAt: String(row.last_message_at ?? ''),
  }));
}

export async function getConversationMessagesByIds(
  ids: number[],
): Promise<UnsummarisedMessage[]> {
  if (ids.length === 0) return [];
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, role, content, handle, metadata, created_at')
    .in('id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[state] getConversationMessagesByIds:', error);
    return [];
  }

  return ((data ?? []) as Array<{
    id: number;
    role: string;
    content: string;
    handle: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    handle: row.handle,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
}

/**
 * Messages in [firstMessageAt, lastMessageAt] for one summary segment (legacy summaries
 * often lack source_message_ids; this reconstructs the segment from timestamps).
 */
export async function getConversationMessagesInSummaryWindow(
  chatId: string,
  engagementScope: string,
  engagementBrandKey: string | null,
  firstMessageAt: string,
  lastMessageAt: string,
): Promise<UnsummarisedMessage[]> {
  if (!firstMessageAt || !lastMessageAt) return [];
  const supabase = getAdminClient();
  const scope = engagementScope === 'brand' ? 'brand' : 'nest';
  let q = supabase
    .from('conversation_messages')
    .select('id, role, content, handle, metadata, created_at')
    .eq('chat_id', chatId)
    .gte('created_at', firstMessageAt)
    .lte('created_at', lastMessageAt)
    .order('created_at', { ascending: true });

  if (scope === 'nest') {
    q = q.eq('engagement_scope', 'nest');
  } else {
    const bk = (engagementBrandKey ?? '').trim().toLowerCase();
    if (!bk) return [];
    q = q.eq('engagement_scope', 'brand').eq('engagement_brand_key', bk);
  }

  const { data, error } = await q;

  if (error) {
    console.error('[state] getConversationMessagesInSummaryWindow:', error);
    return [];
  }

  return ((data ?? []) as Array<{
    id: number;
    role: string;
    content: string;
    handle: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    handle: row.handle,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
}

/** True if any entity_timeline row already references this summary (idempotent backfill). */
export async function hasEntityTimelineForSummary(summaryId: number): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('entity_timeline')
    .select('id')
    .eq('source_summary_id', summaryId)
    .limit(1);

  if (error) {
    console.error('[state] hasEntityTimelineForSummary:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function saveConversationSummary(params: {
  chatId: string;
  senderHandle?: string | null;
  engagement?: ConversationEngagement;
  summary: string;
  topics: string[];
  openLoops: string[];
  summaryKind?: string;
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
  confidence?: number;
  sourceMessageIds?: number[];
  extractorVersion?: string | null;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const engagement = normaliseConversationEngagement(params.engagement);
  const { data, error } = await supabase.rpc('save_conversation_summary', {
    p_chat_id: params.chatId,
    p_sender_handle: params.senderHandle ?? null,
    p_engagement_scope: engagement.scope,
    p_engagement_brand_key: engagement.brandKey,
    p_summary: params.summary,
    p_topics: params.topics,
    p_open_loops: params.openLoops,
    p_summary_kind: params.summaryKind ?? 'segment',
    p_first_message_at: params.firstMessageAt,
    p_last_message_at: params.lastMessageAt,
    p_message_count: params.messageCount,
    p_confidence: params.confidence ?? 0.8,
    p_source_message_ids: JSON.stringify(params.sourceMessageIds ?? []),
    p_extractor_version: params.extractorVersion ?? null,
  });

  if (error) {
    console.error('[state] Error saving conversation summary:', error);
    return null;
  }

  return data as number | null;
}

export async function getConversationSummaries(
  chatId: string,
  limit = 5,
  filter?: ConversationScopeFilter,
): Promise<ConversationSummary[]> {
  const supabase = getAdminClient();
  const scopeFilter = normaliseConversationScopeFilter(filter);
  const { data, error } = await supabase.rpc('get_conversation_summaries', {
    p_chat_id: chatId,
    p_limit: limit,
    p_engagement_scope: scopeFilter.scope === 'all' ? null : scopeFilter.scope,
    p_engagement_brand_key: scopeFilter.scope === 'brand' ? scopeFilter.brandKey : null,
  });

  if (error) {
    console.error('[state] Error getting conversation summaries:', error);
    return [];
  }

  return ((data as ConversationSummaryRow[] | null) || []).map(rowToSummary);
}

// ============================================================================
// Tool Traces
// ============================================================================

interface ToolTraceRow {
  id: number;
  chat_id: string;
  engagement_scope: ConversationEngagementScope;
  engagement_brand_key: string | null;
  tool_name: string;
  outcome: string;
  safe_summary: string | null;
  created_at: string;
}

interface PendingActionRow {
  id: number;
  chat_id: string;
  action_type: string;
  status: PendingActionStatus;
  draft_id: string | null;
  account: string | null;
  to_recipients: unknown;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  cc: unknown;
  bcc: unknown;
  reply_to_thread_id: string | null;
  reply_all: boolean;
  source_turn_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
}

function parseRecipientList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function rowToPendingEmailSendAction(row: PendingActionRow): PendingEmailSendAction {
  return {
    id: row.id,
    chatId: row.chat_id,
    actionType: 'email_send',
    status: row.status,
    draftId: row.draft_id,
    account: row.account,
    to: parseRecipientList(row.to_recipients),
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    cc: parseRecipientList(row.cc),
    bcc: parseRecipientList(row.bcc),
    replyToThreadId: row.reply_to_thread_id,
    replyAll: row.reply_all ?? false,
    sourceTurnId: row.source_turn_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
    providerMessageId: row.provider_message_id,
    sentAt: row.sent_at,
  };
}

export async function insertToolTrace(params: {
  chatId: string;
  messageId?: number | null;
  engagement?: ConversationEngagement;
  toolName: string;
  outcome: string;
  safeSummary?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const engagement = normaliseConversationEngagement(params.engagement);
  const { data, error } = await supabase.rpc('insert_tool_trace', {
    p_chat_id: params.chatId,
    p_message_id: params.messageId ?? null,
    p_engagement_scope: engagement.scope,
    p_engagement_brand_key: engagement.brandKey,
    p_tool_name: params.toolName,
    p_outcome: params.outcome,
    p_safe_summary: params.safeSummary ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    console.error('[state] Error inserting tool trace:', error);
    return null;
  }

  return data as number;
}

export async function getRecentToolTraces(
  chatId: string,
  limit = 5,
  filter?: ConversationScopeFilter,
): Promise<ToolTrace[]> {
  const supabase = getAdminClient();
  const scopeFilter = normaliseConversationScopeFilter(filter);
  const { data, error } = await supabase.rpc('get_recent_tool_traces', {
    p_chat_id: chatId,
    p_limit: limit,
    p_engagement_scope: scopeFilter.scope === 'all' ? null : scopeFilter.scope,
    p_engagement_brand_key: scopeFilter.scope === 'brand' ? scopeFilter.brandKey : null,
  });

  if (error) {
    console.error('[state] Error getting tool traces:', error);
    return [];
  }

  return ((data as ToolTraceRow[] | null) || []).map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    engagementScope: row.engagement_scope,
    engagementBrandKey: row.engagement_brand_key ?? null,
    toolName: row.tool_name,
    outcome: row.outcome,
    safeSummary: row.safe_summary,
    createdAt: row.created_at,
  }));
}

// ============================================================================
// Pending email send actions
// ============================================================================

export async function createPendingEmailSend(params: {
  chatId: string;
  draftId?: string | null;
  account?: string | null;
  to: string[];
  subject: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  cc?: string[];
  bcc?: string[];
  replyToThreadId?: string | null;
  replyAll?: boolean;
  sourceTurnId?: string | null;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}): Promise<PendingEmailSendAction | null> {
  const supabase = getAdminClient();

  await expirePendingEmailSends(params.chatId);
  await cancelPendingEmailSends(params.chatId);

  const { data, error } = await supabase
    .from(PENDING_ACTIONS_TABLE)
    .insert({
      chat_id: params.chatId,
      action_type: 'email_send',
      status: 'awaiting_confirmation',
      draft_id: params.draftId ?? null,
      account: params.account ?? null,
      to_recipients: params.to,
      subject: params.subject,
      body_text: params.bodyText ?? null,
      body_html: params.bodyHtml ?? null,
      cc: params.cc ?? [],
      bcc: params.bcc ?? [],
      reply_to_thread_id: params.replyToThreadId ?? null,
      reply_all: params.replyAll ?? false,
      source_turn_id: params.sourceTurnId ?? null,
      metadata: params.metadata ?? {},
      expires_at: params.expiresAt ?? new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
    })
    .select('id, chat_id, action_type, status, draft_id, account, to_recipients, subject, body_text, body_html, cc, bcc, reply_to_thread_id, reply_all, source_turn_id, metadata, created_at, updated_at, expires_at, completed_at, failed_at, failure_reason, provider_message_id, sent_at')
    .single<PendingActionRow>();

  if (error) {
    console.error('[state] Error creating pending email send:', error);
    return null;
  }

  return rowToPendingEmailSendAction(data);
}

export async function getLatestPendingEmailSend(chatId: string): Promise<PendingEmailSendAction | null> {
  const supabase = getAdminClient();
  await expirePendingEmailSends(chatId);

  const { data, error } = await supabase
    .from(PENDING_ACTIONS_TABLE)
    .select('id, chat_id, action_type, status, draft_id, account, to_recipients, subject, body_text, body_html, cc, bcc, reply_to_thread_id, reply_all, source_turn_id, metadata, created_at, updated_at, expires_at, completed_at, failed_at, failure_reason, provider_message_id, sent_at')
    .eq('chat_id', chatId)
    .eq('action_type', 'email_send')
    .eq('status', 'awaiting_confirmation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<PendingActionRow>();

  if (error) {
    console.error('[state] Error getting latest pending email send:', error);
    return null;
  }

  return data ? rowToPendingEmailSendAction(data) : null;
}

export async function getPendingEmailSends(chatId: string): Promise<PendingEmailSendAction[]> {
  const supabase = getAdminClient();
  await expirePendingEmailSends(chatId);

  const { data, error } = await supabase
    .from(PENDING_ACTIONS_TABLE)
    .select('id, chat_id, action_type, status, draft_id, account, to_recipients, subject, body_text, body_html, cc, bcc, reply_to_thread_id, reply_all, source_turn_id, metadata, created_at, updated_at, expires_at, completed_at, failed_at, failure_reason, provider_message_id, sent_at')
    .eq('chat_id', chatId)
    .eq('action_type', 'email_send')
    .eq('status', 'awaiting_confirmation')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[state] Error getting pending email sends:', error);
    return [];
  }

  return ((data as PendingActionRow[] | null) || []).map(rowToPendingEmailSendAction);
}

export async function updatePendingEmailDraft(id: number, updates: {
  to?: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
}): Promise<PendingEmailSendAction | null> {
  const supabase = getAdminClient();
  const patch: Record<string, unknown> = {};
  if (updates.to !== undefined) patch.to_recipients = updates.to;
  if (updates.subject !== undefined) patch.subject = updates.subject;
  if (updates.bodyText !== undefined) patch.body_text = updates.bodyText;
  if (updates.bodyHtml !== undefined) patch.body_html = updates.bodyHtml;
  if (updates.cc !== undefined) patch.cc = updates.cc;
  if (updates.bcc !== undefined) patch.bcc = updates.bcc;

  const { data, error } = await supabase
    .from(PENDING_ACTIONS_TABLE)
    .update(patch)
    .eq('id', id)
    .eq('status', 'awaiting_confirmation')
    .select('id, chat_id, action_type, status, draft_id, account, to_recipients, subject, body_text, body_html, cc, bcc, reply_to_thread_id, reply_all, source_turn_id, metadata, created_at, updated_at, expires_at, completed_at, failed_at, failure_reason, provider_message_id, sent_at')
    .maybeSingle<PendingActionRow>();

  if (error) {
    console.error('[state] Error updating pending email draft:', error);
    return null;
  }

  return data ? rowToPendingEmailSendAction(data) : null;
}

export async function completePendingEmailSend(id: number, providerMessageId?: string, verified?: boolean): Promise<void> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(PENDING_ACTIONS_TABLE)
    .update({
      status: 'completed',
      completed_at: now,
      sent_at: now,
      provider_message_id: providerMessageId ?? null,
      failure_reason: null,
      verified: verified ?? false,
    })
    .eq('id', id);

  if (error) {
    console.error('[state] Error completing pending email send:', error);
  }
}

export async function cancelPendingEmailSends(chatId: string, reason = 'superseded'): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(PENDING_ACTIONS_TABLE)
    .update({
      status: 'cancelled',
      failure_reason: reason,
    })
    .eq('chat_id', chatId)
    .eq('action_type', 'email_send')
    .eq('status', 'awaiting_confirmation');

  if (error) {
    console.error('[state] Error cancelling pending email sends:', error);
  }
}

export async function failPendingEmailSend(id: number, reason: string): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(PENDING_ACTIONS_TABLE)
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: reason,
    })
    .eq('id', id);

  if (error) {
    console.error('[state] Error failing pending email send:', error);
  }
}

export async function expirePendingEmailSends(chatId?: string): Promise<void> {
  const supabase = getAdminClient();
  let query = supabase
    .from(PENDING_ACTIONS_TABLE)
    .update({
      status: 'expired',
      failure_reason: 'expired',
    })
    .eq('action_type', 'email_send')
    .eq('status', 'awaiting_confirmation')
    .lt('expires_at', new Date().toISOString());

  if (chatId) query = query.eq('chat_id', chatId);

  const { error } = await query;
  if (error) {
    console.error('[state] Error expiring pending email sends:', error);
  }
}

// ============================================================================
// Onboarding — user lifecycle and verification state
// ============================================================================

export interface NestUser {
  handle: string;
  name: string | null;
  status: string;
  onboardingToken: string;
  onboardMessages: Array<{ role: string; content: string }>;
  onboardCount: number;
  botNumber: string | null;
  pdlProfile: Record<string, unknown> | null;
  authUserId: string | null;
  onboardState: string;
  entryState: string | null;
  firstValueWedge: string | null;
  firstValueDeliveredAt: string | null;
  secondEngagementAt: string | null;
  activationScore: number;
  capabilityCategoriesUsed: string[];
  lastProactiveSentAt: string | null;
  lastProactiveIgnored: boolean;
  proactiveIgnoreCount: number;
  recoveryNudgeSentAt: string | null;
  timezone: string | null;
  ageGroup: string | null;
  firstSeen: number;
  lastSeen: number;
}

interface EnsureNestUserRow {
  out_handle: string;
  out_name: string | null;
  out_status: string;
  out_onboarding_token: string;
  out_onboard_messages: unknown;
  out_onboard_count: number;
  out_bot_number: string | null;
  out_pdl_profile: Record<string, unknown> | null;
  out_auth_user_id: string | null;
  out_onboard_state: string;
  out_entry_state: string | null;
  out_first_value_wedge: string | null;
  out_first_value_delivered_at: string | null;
  out_second_engagement_at: string | null;
  out_activation_score: number;
  out_capability_categories_used: string[];
  out_last_proactive_sent_at: string | null;
  out_last_proactive_ignored: boolean;
  out_proactive_ignore_count: number;
  out_recovery_nudge_sent_at: string | null;
  out_timezone: string | null;
  out_age_group?: string | null;
  out_first_seen: number;
  out_last_seen: number;
}

function parseOnboardMessages(raw: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is { role: string; content: string } =>
      m && typeof m === 'object' && typeof m.role === 'string' && typeof m.content === 'string',
  );
}

function rowToNestUser(row: EnsureNestUserRow): NestUser {
  return {
    handle: row.out_handle,
    name: row.out_name,
    status: row.out_status,
    onboardingToken: row.out_onboarding_token,
    onboardMessages: parseOnboardMessages(row.out_onboard_messages),
    onboardCount: row.out_onboard_count,
    botNumber: row.out_bot_number,
    pdlProfile: row.out_pdl_profile,
    authUserId: row.out_auth_user_id ?? null,
    onboardState: row.out_onboard_state ?? 'new_user_unclassified',
    entryState: row.out_entry_state ?? null,
    firstValueWedge: row.out_first_value_wedge ?? null,
    firstValueDeliveredAt: row.out_first_value_delivered_at ?? null,
    secondEngagementAt: row.out_second_engagement_at ?? null,
    activationScore: row.out_activation_score ?? 0,
    capabilityCategoriesUsed: row.out_capability_categories_used ?? [],
    lastProactiveSentAt: row.out_last_proactive_sent_at ?? null,
    lastProactiveIgnored: row.out_last_proactive_ignored ?? false,
    proactiveIgnoreCount: row.out_proactive_ignore_count ?? 0,
    recoveryNudgeSentAt: row.out_recovery_nudge_sent_at ?? null,
    timezone: row.out_timezone ?? null,
    ageGroup: row.out_age_group ?? null,
    firstSeen: row.out_first_seen ?? 0,
    lastSeen: row.out_last_seen ?? 0,
  };
}

export async function ensureNestUser(handle: string, botNumber: string): Promise<NestUser> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('ensure_nest_user', {
    p_handle: handle,
    p_bot_number: botNumber,
  });

  if (error) {
    throw new Error(`ensure_nest_user failed: ${error.message}`);
  }

  const rows = data as EnsureNestUserRow[] | null;
  if (!rows || rows.length === 0) {
    throw new Error('ensure_nest_user returned no data');
  }

  return rowToNestUser(rows[0]);
}

export async function updateOnboardState(
  handle: string,
  messages: Array<{ role: string; content: string }>,
  count: number,
  pdlProfile?: Record<string, unknown> | null,
): Promise<void> {
  const supabase = getAdminClient();
  const patch: Record<string, unknown> = {
    onboard_messages: messages,
    onboard_count: count,
  };

  if (pdlProfile !== undefined && pdlProfile !== null) {
    patch.pdl_profile = pdlProfile;
  }

  const { error } = await supabase
    .from(USER_PROFILES_TABLE)
    .update(patch)
    .eq('handle', handle);

  if (error) {
    console.error('[state] Error updating onboard state:', error.message);
    throw new Error(`updateOnboardState failed: ${error.message}`);
  }

  if (count === 10) {
    console.log(
      "[onboard-listener] updateOnboardState persisted count=10; scheduling pin-favourite tick",
      { handle },
    );
    void import("./customer-automation-onboard-listener.ts")
      .then((m) => m.onOnboardCountReachedTen(handle))
      .catch((err) =>
        console.error("[onboard-listener] pin-favourite tick failed:", err),
      );
  }

  if (count >= 3 && count <= 99 && count !== 10) {
    void import("./customer-automation-onboard-listener.ts")
      .then((m) => m.onOnboardTurnYoutube(handle, count))
      .catch((err) =>
        console.error("[onboard-listener] inline YouTube failed:", err),
      );
  }
}

export async function updateUserTimezone(handle: string, timezone: string): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from(USER_PROFILES_TABLE)
    .update({ timezone })
    .eq('handle', handle);
  if (error) {
    console.warn('[state] Failed to update timezone:', error.message);
  }
}

export async function getUserTimezone(handle: string): Promise<string | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select('timezone')
    .eq('handle', handle)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { timezone: string | null }).timezone ?? null;
}

export async function activateUser(token: string): Promise<string | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('activate_nest_user', {
    p_token: token,
  });

  if (error) {
    console.error('[state] Error activating user:', error);
    return null;
  }

  return (data as string) || null;
}

export async function getUserByToken(token: string): Promise<NestUser | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select('handle, name, status, onboarding_token, onboard_messages, onboard_count, bot_number, pdl_profile, auth_user_id, onboard_state, entry_state, first_value_wedge, first_value_delivered_at, second_engagement_at, activation_score, capability_categories_used, last_proactive_sent_at, last_proactive_ignored, proactive_ignore_count, recovery_nudge_sent_at, timezone, age_group, first_seen, last_seen')
    .eq('onboarding_token', token)
    .maybeSingle();

  if (error) {
    console.error('[state] Error getting user by token:', error);
    return null;
  }

  if (!data) return null;

  return {
    handle: data.handle,
    name: data.name,
    status: data.status,
    onboardingToken: data.onboarding_token,
    onboardMessages: parseOnboardMessages(data.onboard_messages),
    onboardCount: data.onboard_count,
    botNumber: data.bot_number,
    pdlProfile: data.pdl_profile,
    authUserId: data.auth_user_id ?? null,
    onboardState: data.onboard_state ?? 'new_user_unclassified',
    entryState: data.entry_state ?? null,
    firstValueWedge: data.first_value_wedge ?? null,
    firstValueDeliveredAt: data.first_value_delivered_at ?? null,
    secondEngagementAt: data.second_engagement_at ?? null,
    activationScore: data.activation_score ?? 0,
    capabilityCategoriesUsed: data.capability_categories_used ?? [],
    lastProactiveSentAt: data.last_proactive_sent_at ?? null,
    lastProactiveIgnored: data.last_proactive_ignored ?? false,
    proactiveIgnoreCount: data.proactive_ignore_count ?? 0,
    recoveryNudgeSentAt: data.recovery_nudge_sent_at ?? null,
    timezone: data.timezone ?? null,
    ageGroup: data.age_group ?? null,
    firstSeen: data.first_seen ?? 0,
    lastSeen: data.last_seen ?? 0,
  };
}

// ============================================================================
// First 48 Hours: State Machine, Events, Proactive, Experiments
// ============================================================================

export type OnboardState =
  | 'new_user_unclassified'
  | 'new_user_intro_started'
  | 'first_value_pending'
  | 'first_value_delivered'
  | 'follow_through_pending'
  | 'follow_through_delivered'
  | 'second_engagement_observed'
  | 'memory_moment_eligible'
  | 'memory_moment_delivered'
  | 'referral_eligible'
  | 'quiet_user'
  | 'spam_hold'
  | 'at_risk'
  | 'activated';

export type EntryState =
  | 'curious_opener'
  | 'direct_task_opener'
  | 'drafting_opener'
  | 'overwhelm_opener'
  | 'referral_opener'
  | 'trust_opener'
  | 'ambiguous_opener';

export type ValueWedge = 'offload' | 'draft' | 'organise' | 'ask_plan';

export type OnboardingEventType =
  | 'new_user_first_inbound_received'
  | 'new_user_entry_state_classified'
  | 'new_user_name_captured'
  | 'new_user_clarification_requested'
  | 'new_user_first_value_wedge_selected'
  | 'first_value_delivered'
  | 'first_value_type_offload'
  | 'first_value_type_draft'
  | 'first_value_type_organise'
  | 'first_value_time_to_delivery'
  | 'first_value_failed'
  | 'reminder_created'
  | 'reminder_confirmed'
  | 'reminder_delivered'
  | 'reminder_acknowledged'
  | 'reminder_missed'
  | 'reminder_corrected'
  | 'recovery_nudge_sent'
  | 'recovery_nudge_ignored'
  | 'recovery_nudge_replied'
  | 'proactive_hold_due_to_spam_rule'
  | 'memory_candidate_generated'
  | 'memory_candidate_rejected_low_confidence'
  | 'memory_candidate_rejected_creep_risk'
  | 'memory_moment_sent'
  | 'memory_moment_positive_response'
  | 'memory_moment_correction'
  | 'trust_hesitation_detected'
  | 'trust_reassurance_sent'
  | 'error_misunderstanding_detected'
  | 'error_hallucination_detected'
  | 'error_recovery_success'
  | 'error_recovery_failure'
  | 'second_engagement_observed'
  | 'second_capability_used'
  | 'day2_return'
  | 'activated_composite'
  | 'at_risk_48h'
  | 'calendar_timezone_change_notified';

export interface EmitEventParams {
  handle: string;
  chatId?: string;
  eventType: OnboardingEventType;
  messageTurnIndex?: number;
  entryState?: string;
  valueWedge?: string;
  currentState?: string;
  experimentVariantIds?: string[];
  confidenceScores?: Record<string, number>;
  payload?: Record<string, unknown>;
}

export async function emitOnboardingEvent(params: EmitEventParams): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('emit_onboarding_event', {
    p_handle: params.handle,
    p_chat_id: params.chatId ?? null,
    p_event_type: params.eventType,
    p_message_turn_index: params.messageTurnIndex ?? null,
    p_entry_state: params.entryState ?? null,
    p_value_wedge: params.valueWedge ?? null,
    p_current_state: params.currentState ?? null,
    p_experiment_variant_ids: JSON.stringify(params.experimentVariantIds ?? []),
    p_confidence_scores: params.confidenceScores ? JSON.stringify(params.confidenceScores) : null,
    p_payload: JSON.stringify(params.payload ?? {}),
  });

  if (error) {
    console.error('[state] Error emitting onboarding event:', error.message);
  }
}

export interface StateTransitionParams {
  handle: string;
  newState: OnboardState;
  entryState?: string;
  firstValueWedge?: string;
  firstValueDelivered?: boolean;
  followThroughDelivered?: boolean;
  secondEngagement?: boolean;
  memoryMomentDelivered?: boolean;
  activated?: boolean;
  atRisk?: boolean;
  capabilityCategory?: string;
  timezone?: string;
}

export async function transitionOnboardState(params: StateTransitionParams): Promise<string | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('update_onboard_state_machine', {
    p_handle: params.handle,
    p_new_state: params.newState,
    p_entry_state: params.entryState ?? null,
    p_first_value_wedge: params.firstValueWedge ?? null,
    p_first_value_delivered: params.firstValueDelivered ?? false,
    p_follow_through_delivered: params.followThroughDelivered ?? false,
    p_second_engagement: params.secondEngagement ?? false,
    p_checkin_opt_in: null,
    p_memory_moment_delivered: params.memoryMomentDelivered ?? false,
    p_activated: params.activated ?? false,
    p_at_risk: params.atRisk ?? false,
    p_capability_category: params.capabilityCategory ?? null,
    p_timezone: params.timezone ?? null,
  });

  if (error) {
    console.error('[state] Error transitioning onboard state:', error.message);
    return null;
  }

  return data as string | null;
}

export async function recordProactiveMessage(
  handle: string,
  chatId: string,
  messageType: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<number | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('record_proactive_message', {
    p_handle: handle,
    p_chat_id: chatId,
    p_message_type: messageType,
    p_content: content,
    p_metadata: metadata ?? {},
  });

  if (error) {
    console.error('[state] Error recording proactive message:', error.message);
    return null;
  }

  return data as number;
}

export async function markProactiveReplied(handle: string): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('mark_proactive_replied', {
    p_handle: handle,
  });

  if (error) {
    console.error('[state] Error marking proactive replied:', error.message);
  }
}

export interface ProactiveEligibleUser {
  handle: string;
  name: string | null;
  onboardState: string;
  entryState: string | null;
  firstValueWedge: string | null;
  firstValueDeliveredAt: string | null;
  followThroughDeliveredAt: string | null;
  secondEngagementAt: string | null;
  memoryMomentDeliveredAt: string | null;
  activatedAt: string | null;
  lastProactiveSentAt: string | null;
  lastProactiveIgnored: boolean;
  proactiveIgnoreCount: number;
  recoveryNudgeSentAt: string | null;
  activationScore: number;
  capabilityCategoriesUsed: string[];
  botNumber: string | null;
  firstSeen: number;
  lastSeen: number;
  onboardCount: number;
  timezone: string | null;
}

export async function getProactiveEligibleUsers(limit = 20): Promise<ProactiveEligibleUser[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_proactive_eligible_users', {
    p_limit: limit,
  });

  if (error) {
    console.error('[state] Error getting proactive eligible users:', error.message);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    handle: row.handle as string,
    name: row.name as string | null,
    onboardState: row.onboard_state as string,
    entryState: row.entry_state as string | null,
    firstValueWedge: row.first_value_wedge as string | null,
    firstValueDeliveredAt: row.first_value_delivered_at as string | null,
    followThroughDeliveredAt: row.follow_through_delivered_at as string | null,
    secondEngagementAt: row.second_engagement_at as string | null,
    memoryMomentDeliveredAt: row.memory_moment_delivered_at as string | null,
    activatedAt: row.activated_at as string | null,
    lastProactiveSentAt: row.last_proactive_sent_at as string | null,
    lastProactiveIgnored: row.last_proactive_ignored as boolean,
    proactiveIgnoreCount: row.proactive_ignore_count as number,
    recoveryNudgeSentAt: row.recovery_nudge_sent_at as string | null,
    activationScore: row.activation_score as number,
    capabilityCategoriesUsed: row.capability_categories_used as string[],
    botNumber: row.bot_number as string | null,
    firstSeen: row.first_seen as number,
    lastSeen: row.last_seen as number,
    onboardCount: row.onboard_count as number,
    timezone: row.timezone as string | null,
  }));
}

export async function assignExperiment(
  handle: string,
  experimentName: string,
  variants: string[],
): Promise<string> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('assign_experiment', {
    p_handle: handle,
    p_experiment_name: experimentName,
    p_variants: variants,
  });

  if (error) {
    console.error('[state] Error assigning experiment:', error.message);
    return variants[0];
  }

  return (data as string) || variants[0];
}

export async function getUserExperiments(handle: string): Promise<Record<string, string>> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('experiment_assignments')
    .select('experiment_name, variant')
    .eq('handle', handle);

  if (error || !data) return {};

  const result: Record<string, string> = {};
  for (const row of data as { experiment_name: string; variant: string }[]) {
    result[row.experiment_name] = row.variant;
  }
  return result;
}

// ============================================================================
// Reminders
// ============================================================================

export interface Reminder {
  id: number;
  handle: string;
  chatId: string | null;
  actionDescription: string;
  cronExpression: string | null;
  repeating: boolean;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  timezone: string;
  createdAt: string;
}

interface DueReminderRow {
  id: number;
  handle: string;
  chat_id: string | null;
  action_description: string;
  cron_expression: string | null;
  repeating: boolean;
  timezone: string;
}

interface UserReminderRow {
  id: number;
  action_description: string;
  cron_expression: string | null;
  repeating: boolean;
  next_fire_at: string | null;
  last_fired_at: string | null;
  timezone: string;
  created_at: string;
}

export async function insertReminder(params: {
  handle: string;
  chatId?: string | null;
  actionDescription: string;
  cronExpression?: string | null;
  repeating: boolean;
  nextFireAt: string | null;
  timezone: string;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('insert_reminder', {
    p_handle: params.handle,
    p_chat_id: params.chatId ?? null,
    p_action_description: params.actionDescription,
    p_cron_expression: params.cronExpression ?? null,
    p_repeating: params.repeating,
    p_next_fire_at: params.nextFireAt,
    p_timezone: params.timezone,
  });

  if (error) {
    console.error('[state] Error inserting reminder:', error.message);
    return null;
  }

  return data as number;
}

export async function getDueReminders(): Promise<Array<{
  id: number;
  handle: string;
  chatId: string | null;
  actionDescription: string;
  cronExpression: string | null;
  repeating: boolean;
  timezone: string;
}>> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_due_reminders');

  if (error) {
    console.error('[state] Error getting due reminders:', error.message);
    return [];
  }

  return ((data as DueReminderRow[] | null) || []).map((row) => ({
    id: row.id,
    handle: row.handle,
    chatId: row.chat_id,
    actionDescription: row.action_description,
    cronExpression: row.cron_expression,
    repeating: row.repeating,
    timezone: row.timezone,
  }));
}

export async function markReminderFired(id: number, nextFireAt: string | null): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('mark_reminder_fired', {
    p_id: id,
    p_next_fire_at: nextFireAt,
  });

  if (error) {
    console.error('[state] Error marking reminder fired:', error.message);
  }
}

export async function getUserReminders(handle: string): Promise<Reminder[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_user_reminders', {
    p_handle: handle,
  });

  if (error) {
    console.error('[state] Error getting user reminders:', error.message);
    return [];
  }

  return ((data as UserReminderRow[] | null) || []).map((row) => ({
    id: row.id,
    handle,
    chatId: null,
    actionDescription: row.action_description,
    cronExpression: row.cron_expression,
    repeating: row.repeating,
    nextFireAt: row.next_fire_at,
    lastFiredAt: row.last_fired_at,
    timezone: row.timezone,
    createdAt: row.created_at,
  }));
}

export async function deleteReminder(id: number, handle: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('delete_reminder', {
    p_id: id,
    p_handle: handle,
  });

  if (error) {
    console.error('[state] Error deleting reminder:', error.message);
    return false;
  }

  return data as boolean;
}

// ============================================================================
// Entities — page-per-entity model (people/places/orgs/topics)
// Complements memory_items: memories are facts about the user, entities are
// pages about everyone/everything else in the user's life.
// ============================================================================

export type EntityType = 'person' | 'place' | 'org' | 'topic';
export type EntityStatus = 'active' | 'archived' | 'merged';

export interface Entity {
  id: number;
  handle: string;
  entityType: EntityType;
  canonicalName: string;
  aliases: string[];
  compiledTruth: string;
  isCore: boolean;
  importanceScore: number;
  mentionCount: number;
  status: EntityStatus;
  metadata: Record<string, unknown>;
  firstMentionedAt: string;
  lastMentionedAt: string;
  compiledTruthUpdatedAt: string | null;
  createdAt: string;
}

export interface EntityTimelineEvent {
  id: number;
  entityId: number;
  handle: string;
  eventText: string;
  eventAt: string;
  sourceKind: string;
  sourceMessageIds: number[];
  sourceSummaryId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface EntityRow {
  id: number;
  handle: string;
  entity_type: string;
  canonical_name: string;
  aliases: string[] | null;
  compiled_truth: string | null;
  is_core: boolean;
  importance_score: number | string;
  mention_count: number;
  status: string;
  metadata: Record<string, unknown> | null;
  first_mentioned_at: string;
  last_mentioned_at: string;
  compiled_truth_updated_at: string | null;
  created_at: string;
}

interface EntityTimelineRow {
  id: number;
  entity_id: number;
  handle: string;
  event_text: string;
  event_at: string;
  source_kind: string;
  source_message_ids: number[] | null;
  source_summary_id: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function rowToEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    handle: row.handle,
    entityType: row.entity_type as EntityType,
    canonicalName: row.canonical_name,
    aliases: row.aliases ?? [],
    compiledTruth: row.compiled_truth ?? '',
    isCore: !!row.is_core,
    importanceScore: typeof row.importance_score === 'string'
      ? parseFloat(row.importance_score)
      : row.importance_score,
    mentionCount: row.mention_count,
    status: row.status as EntityStatus,
    metadata: row.metadata ?? {},
    firstMentionedAt: row.first_mentioned_at,
    lastMentionedAt: row.last_mentioned_at,
    compiledTruthUpdatedAt: row.compiled_truth_updated_at,
    createdAt: row.created_at,
  };
}

function rowToEntityTimelineEvent(row: EntityTimelineRow): EntityTimelineEvent {
  return {
    id: row.id,
    entityId: row.entity_id,
    handle: row.handle,
    eventText: row.event_text,
    eventAt: row.event_at,
    sourceKind: row.source_kind,
    sourceMessageIds: row.source_message_ids ?? [],
    sourceSummaryId: row.source_summary_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export async function upsertEntity(params: {
  handle: string;
  entityType: EntityType;
  canonicalName: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('upsert_entity', {
    p_handle: params.handle,
    p_entity_type: params.entityType,
    p_canonical_name: params.canonicalName,
    p_aliases: params.aliases ?? [],
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    console.error('[state] Error upserting entity:', error);
    return null;
  }

  return data as number;
}

export async function updateEntityCompiledTruth(
  entityId: number,
  compiledTruth: string,
  importanceScore?: number | null,
): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('update_entity_compiled_truth', {
    p_entity_id: entityId,
    p_compiled_truth: compiledTruth,
    p_importance_score: importanceScore ?? null,
  });

  if (error) {
    console.error('[state] Error updating compiled_truth:', error);
  }
}

export async function setEntityCore(
  entityId: number,
  isCore: boolean,
): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc('set_entity_core', {
    p_entity_id: entityId,
    p_is_core: isCore,
  });

  if (error) {
    console.error('[state] Error setting entity core flag:', error);
  }
}

export async function appendEntityTimeline(params: {
  entityId: number;
  handle: string;
  eventText: string;
  eventAt?: string | null;
  sourceKind: string;
  sourceMessageIds?: number[];
  sourceSummaryId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('append_entity_timeline', {
    p_entity_id: params.entityId,
    p_handle: params.handle,
    p_event_text: params.eventText,
    p_event_at: params.eventAt ?? null,
    p_source_kind: params.sourceKind,
    p_source_message_ids: JSON.stringify(params.sourceMessageIds ?? []),
    p_source_summary_id: params.sourceSummaryId ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    console.error('[state] Error appending entity timeline event:', error);
    return null;
  }

  return data as number;
}

export async function getCoreEntities(
  handle: string,
  limit = 8,
): Promise<Entity[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_core_entities', {
    p_handle: handle,
    p_limit: limit,
  });

  if (error) {
    console.error('[state] Error getting core entities:', error);
    return [];
  }

  return ((data as EntityRow[] | null) ?? []).map(rowToEntity);
}

export async function getEntitiesByIds(
  handle: string,
  ids: number[],
): Promise<Entity[]> {
  if (ids.length === 0) return [];
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_entities_by_ids', {
    p_handle: handle,
    p_ids: ids,
  });

  if (error) {
    console.error('[state] Error getting entities by ids:', error);
    return [];
  }

  return ((data as EntityRow[] | null) ?? []).map(rowToEntity);
}

export async function findEntitiesByNames(
  handle: string,
  names: string[],
): Promise<Entity[]> {
  const cleaned = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  if (cleaned.length === 0) return [];

  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('find_entities_by_names', {
    p_handle: handle,
    p_names: cleaned,
  });

  if (error) {
    console.error('[state] Error finding entities by names:', error);
    return [];
  }

  return ((data as EntityRow[] | null) ?? []).map(rowToEntity);
}

export async function getEntityTimeline(
  entityId: number,
  limit = 20,
): Promise<EntityTimelineEvent[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_entity_timeline', {
    p_entity_id: entityId,
    p_limit: limit,
  });

  if (error) {
    console.error('[state] Error getting entity timeline:', error);
    return [];
  }

  return ((data as EntityTimelineRow[] | null) ?? []).map(rowToEntityTimelineEvent);
}

// Touched here so the linter sees ENTITIES_TABLE used. Reserved for direct
// queries (e.g. admin dashboards) outside the RPC surface.
export const _ENTITIES_TABLE_REF = ENTITIES_TABLE;

export interface EntityConsolidationCandidate {
  id: number;
  handle: string;
  pendingEventCount: number;
  lastEventAt: string | null;
  compiledTruthUpdatedAt: string | null;
  importanceScore: number;
}

interface EntityConsolidationCandidateRow {
  id: number;
  handle: string;
  pending_event_count: number | string;
  last_event_at: string | null;
  compiled_truth_updated_at: string | null;
  importance_score: number | string;
}

export async function getEntitiesNeedingConsolidation(
  limit = 25,
  maxIdleMinutes = 5,
): Promise<EntityConsolidationCandidate[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_entities_needing_consolidation', {
    p_limit: limit,
    p_max_idle_minutes: maxIdleMinutes,
  });
  if (error) {
    console.error('[state] Error fetching entities needing consolidation:', error);
    return [];
  }
  return ((data as EntityConsolidationCandidateRow[] | null) ?? []).map((row) => ({
    id: row.id,
    handle: row.handle,
    pendingEventCount: typeof row.pending_event_count === 'string'
      ? parseInt(row.pending_event_count, 10)
      : row.pending_event_count,
    lastEventAt: row.last_event_at,
    compiledTruthUpdatedAt: row.compiled_truth_updated_at,
    importanceScore: typeof row.importance_score === 'string'
      ? parseFloat(row.importance_score)
      : row.importance_score,
  }));
}

export interface EntityBootstrapCandidate {
  id: number;
  handle: string;
  pendingEventCount: number;
}

interface EntityBootstrapCandidateRow {
  id: number;
  handle: string;
  pending_event_count: number | string;
}

export async function getAllEntitiesWithTimeline(
  limit = 200,
  afterId = 0,
): Promise<EntityBootstrapCandidate[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_all_entities_with_timeline', {
    p_limit: limit,
    p_after_id: afterId,
  });
  if (error) {
    console.error('[state] Error fetching entities for bootstrap:', error);
    return [];
  }
  return ((data as EntityBootstrapCandidateRow[] | null) ?? []).map((row) => ({
    id: row.id,
    handle: row.handle,
    pendingEventCount: typeof row.pending_event_count === 'string'
      ? parseInt(row.pending_event_count, 10)
      : row.pending_event_count,
  }));
}

export async function editReminder(params: {
  id: number;
  handle: string;
  actionDescription?: string;
  cronExpression?: string;
  nextFireAt?: string;
  repeating?: boolean;
  active?: boolean;
}): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('edit_reminder', {
    p_id: params.id,
    p_handle: params.handle,
    p_action_description: params.actionDescription ?? null,
    p_cron_expression: params.cronExpression ?? null,
    p_next_fire_at: params.nextFireAt ?? null,
    p_repeating: params.repeating ?? null,
    p_active: params.active ?? null,
  });

  if (error) {
    console.error('[state] Error editing reminder:', error.message);
    return false;
  }

  return data as boolean;
}
