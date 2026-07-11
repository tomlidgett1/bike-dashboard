import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveNestChannel,
  deriveNestChannelFromMessages,
  type NestConversationDetail,
  type NestConversationListItem,
  type NestConversationMessage,
  type NestChannel,
} from "@/lib/nest/types";

type ConversationRow = {
  chat_id: string;
  title: string;
  display_name: string | null;
  participant_handle: string | null;
  preview: string;
  preview_role: string;
  last_message_at: string;
  last_customer_message_at: string | null;
  has_manual_messages: boolean;
  latest_manual_message_at: string | null;
  source: "customer" | "portal_test";
  triggered_by_twilio: boolean;
  channel: NestChannel;
};

type MessageRow = {
  nest_message_id: number;
  role: NestConversationMessage["role"];
  content: string;
  handle: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type NestThreadSyncState = {
  lastMessageAt: string | null;
  hasMessages: boolean;
};

function rowToListItem(row: ConversationRow): NestConversationListItem {
  return {
    chatId: row.chat_id,
    title: row.title,
    displayName: row.display_name,
    participantHandle: row.participant_handle,
    preview: row.preview,
    previewRole: row.preview_role,
    lastMessageAt: row.last_message_at,
    lastCustomerMessageAt: row.last_customer_message_at,
    hasManualMessages: row.has_manual_messages,
    latestManualMessageAt: row.latest_manual_message_at,
    source: row.source,
    triggeredByTwilio: row.triggered_by_twilio,
    channel: row.channel,
  };
}

function rowToMessage(row: MessageRow): NestConversationMessage {
  return {
    id: row.nest_message_id,
    role: row.role,
    content: row.content,
    handle: row.handle,
    createdAt: row.created_at,
    metadata: row.metadata,
  };
}

function chatTimeMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function loadNestChatsFromSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<NestConversationListItem[]> {
  const { data, error } = await supabase
    .from("store_nest_conversations")
    .select(
      "chat_id, title, display_name, participant_handle, preview, preview_role, last_message_at, last_customer_message_at, has_manual_messages, latest_manual_message_at, source, triggered_by_twilio, channel",
    )
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[nest-inbox-supabase] list load failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToListItem(row as ConversationRow));
}

export async function loadNestThreadSyncState(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, NestThreadSyncState>> {
  const [conversationResult, messageResult] = await Promise.all([
    supabase
      .from("store_nest_conversations")
      .select("chat_id, last_message_at")
      .eq("user_id", userId),
    supabase
      .from("store_nest_messages")
      .select("chat_id")
      .eq("user_id", userId)
      .limit(10000),
  ]);

  const state = new Map<string, NestThreadSyncState>();

  if (conversationResult.error) {
    console.error(
      "[nest-inbox-supabase] thread sync state conversations failed:",
      conversationResult.error.message,
    );
  } else {
    for (const row of conversationResult.data ?? []) {
      const chatId = String(row.chat_id ?? "").trim();
      if (!chatId) continue;
      state.set(chatId, {
        lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
        hasMessages: false,
      });
    }
  }

  if (messageResult.error) {
    console.error(
      "[nest-inbox-supabase] thread sync state messages failed:",
      messageResult.error.message,
    );
    return state;
  }

  for (const row of messageResult.data ?? []) {
    const chatId = String(row.chat_id ?? "").trim();
    if (!chatId) continue;
    const existing = state.get(chatId);
    state.set(chatId, {
      lastMessageAt: existing?.lastMessageAt ?? null,
      hasMessages: true,
    });
  }

  return state;
}

export async function loadNestThreadLastMessageAtFromSupabase(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("store_nest_conversations")
    .select("last_message_at")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error) {
    console.error("[nest-inbox-supabase] thread freshness load failed:", error.message);
    return null;
  }

  return data?.last_message_at ? String(data.last_message_at) : null;
}

export async function loadNestThreadFromSupabase(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
): Promise<NestConversationDetail | null> {
  const [{ data: chatRow, error: chatError }, { data: messageRows, error: messageError }] =
    await Promise.all([
      supabase
        .from("store_nest_conversations")
        .select(
          "chat_id, title, display_name, participant_handle, source, last_message_at",
        )
        .eq("user_id", userId)
        .eq("chat_id", chatId)
        .maybeSingle(),
      supabase
        .from("store_nest_messages")
        .select("nest_message_id, role, content, handle, metadata, created_at")
        .eq("user_id", userId)
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true }),
    ]);

  if (chatError) {
    console.error("[nest-inbox-supabase] thread chat load failed:", chatError.message);
    return null;
  }
  if (!chatRow) return null;
  if (messageError) {
    console.error("[nest-inbox-supabase] thread messages load failed:", messageError.message);
  }

  return {
    chatId: chatRow.chat_id,
    title: chatRow.title,
    displayName: chatRow.display_name,
    participantHandle: chatRow.participant_handle,
    source: chatRow.source as "customer" | "portal_test",
    lastSeen: null,
    messages: (messageRows ?? []).map((row) => rowToMessage(row as MessageRow)),
  };
}

export async function upsertNestChatsToSupabase(
  supabase: SupabaseClient,
  userId: string,
  brandKey: string,
  chats: NestConversationListItem[],
): Promise<void> {
  if (chats.length === 0) return;

  const { data: existingRows } = await supabase
    .from("store_nest_conversations")
    .select("chat_id, channel")
    .eq("user_id", userId)
    .in(
      "chat_id",
      chats.map((chat) => chat.chatId),
    );
  const existingChannels = new Map<string, NestChannel>();
  for (const row of existingRows ?? []) {
    const chatId = String(row.chat_id ?? "").trim();
    const channel = row.channel as NestChannel | null;
    if (chatId && channel) existingChannels.set(chatId, channel);
  }

  const now = new Date().toISOString();
  const rows = chats.map((chat) => ({
    user_id: userId,
    brand_key: brandKey,
    chat_id: chat.chatId,
    title: chat.title ?? "",
    display_name: chat.displayName,
    participant_handle: chat.participantHandle,
    preview: chat.preview ?? "",
    preview_role: chat.previewRole ?? "",
    last_message_at: chat.lastMessageAt || now,
    last_customer_message_at: chat.lastCustomerMessageAt ?? null,
    has_manual_messages: chat.hasManualMessages ?? false,
    latest_manual_message_at: chat.latestManualMessageAt ?? null,
    source: chat.source ?? "customer",
    triggered_by_twilio: chat.triggeredByTwilio ?? false,
    channel: chat.channel ?? existingChannels.get(chat.chatId) ?? deriveNestChannel(chat),
    synced_at: now,
    updated_at: now,
  }));

  const { error } = await supabase.from("store_nest_conversations").upsert(rows, {
    onConflict: "user_id,chat_id",
  });

  if (error) {
    console.error("[nest-inbox-supabase] chat upsert failed:", error.message);
  }
}

export async function upsertNestThreadToSupabase(
  supabase: SupabaseClient,
  userId: string,
  brandKey: string,
  conversation: NestConversationDetail,
  listChat?: NestConversationListItem,
): Promise<void> {
  const now = new Date().toISOString();
  if (conversation.messages.length === 0) {
    if (listChat) {
      await upsertNestChatsToSupabase(supabase, userId, brandKey, [listChat]);
    }
    return;
  }

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const lastImages = Array.isArray(lastMessage?.metadata?.images)
    ? lastMessage.metadata.images
    : [];
  const lastPreviewText = (lastMessage?.content ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const imagePreview =
    lastImages.length > 0
      ? lastImages.length === 1
        ? "Sent a photo"
        : `Sent ${lastImages.length} photos`
      : "";

  const chat = listChat ?? {
    chatId: conversation.chatId,
    title: conversation.title,
    displayName: conversation.displayName,
    participantHandle: conversation.participantHandle,
    preview: lastPreviewText || imagePreview,
    previewRole: lastMessage?.role ?? "user",
    lastMessageAt: lastMessage?.createdAt ?? now,
    lastCustomerMessageAt:
      [...conversation.messages].reverse().find((message) => message.role === "user")
        ?.createdAt ?? null,
    source: conversation.source,
  };

  const threadIsNewer =
    !!lastMessage &&
    new Date(lastMessage.createdAt).getTime() > chatTimeMs(chat.lastMessageAt);

  // When the portal list item is stale (common for image-only human-mode
  // replies), prefer the thread's latest customer message timestamps.
  const enrichedListChat: NestConversationListItem = {
    ...chat,
    preview: threadIsNewer
      ? lastPreviewText || imagePreview || chat.preview
      : chat.preview?.trim() || lastPreviewText || imagePreview || chat.preview,
    previewRole: threadIsNewer && lastMessage ? lastMessage.role : chat.previewRole,
    lastMessageAt: threadIsNewer && lastMessage ? lastMessage.createdAt : chat.lastMessageAt,
    lastCustomerMessageAt:
      [...conversation.messages].reverse().find((message) => message.role === "user")
        ?.createdAt ??
      chat.lastCustomerMessageAt ??
      null,
    channel: deriveNestChannelFromMessages(chat, conversation.messages),
  };

  await upsertNestChatsToSupabase(supabase, userId, brandKey, [
    {
      ...enrichedListChat,
      previewRole: enrichedListChat.previewRole ?? "user",
      lastMessageAt: enrichedListChat.lastMessageAt ?? now,
      source: enrichedListChat.source ?? conversation.source,
    },
  ]);

  const messageRows = conversation.messages.map((message) => ({
    user_id: userId,
    chat_id: conversation.chatId,
    nest_message_id: message.id,
    role: message.role,
    content: message.content,
    handle: message.handle,
    metadata: message.metadata ?? {},
    created_at: message.createdAt,
    synced_at: now,
  }));

  const { error } = await supabase.from("store_nest_messages").upsert(messageRows, {
    onConflict: "user_id,chat_id,nest_message_id",
  });

  if (error) {
    console.error("[nest-inbox-supabase] message upsert failed:", error.message);
  }
}

export async function loadNestReadMapFromSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("store_nest_conversation_reads")
    .select("chat_id, last_read_at")
    .eq("user_id", userId);

  if (error) {
    console.error("[nest-inbox-supabase] read map load failed:", error.message);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.chat_id && row.last_read_at) {
      map[row.chat_id] = row.last_read_at;
    }
  }
  return map;
}

export async function markNestReadInSupabase(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
  lastReadAt: string,
): Promise<void> {
  // Prefer idempotent RPC (GREATEST) so concurrent/stale writes never move the
  // high-water mark backwards. Fall back to upsert if the migration is not applied yet.
  const { error: rpcError } = await supabase.rpc("mark_nest_conversation_read", {
    p_user_id: userId,
    p_chat_id: chatId,
    p_last_read_at: lastReadAt,
  });

  if (!rpcError) return;

  if (rpcError.message && !/mark_nest_conversation_read|Could not find the function/i.test(rpcError.message)) {
    console.error("[nest-inbox-supabase] mark read rpc failed:", rpcError.message);
  }

  const existingMap = await loadNestReadMapFromSupabase(supabase, userId);
  const existing = existingMap[chatId];
  const existingMs = existing ? new Date(existing).getTime() : 0;
  const nextMs = new Date(lastReadAt).getTime();
  if (Number.isFinite(existingMs) && Number.isFinite(nextMs) && existingMs >= nextMs) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("store_nest_conversation_reads").upsert(
    {
      user_id: userId,
      chat_id: chatId,
      last_read_at: lastReadAt,
      updated_at: now,
    },
    { onConflict: "user_id,chat_id" },
  );

  if (error) {
    console.error("[nest-inbox-supabase] mark read failed:", error.message);
  }
}

export async function loadNestCloseMapFromSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("store_nest_conversation_closes")
    .select("chat_id, closed_at")
    .eq("user_id", userId);

  if (error) {
    console.error("[nest-inbox-supabase] close map load failed:", error.message);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.chat_id && row.closed_at) {
      map[row.chat_id] = row.closed_at as string;
    }
  }
  return map;
}

export async function markNestCloseInSupabase(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
  closedAt: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_nest_conversation_closes").upsert(
    {
      user_id: userId,
      chat_id: chatId,
      closed_at: closedAt,
      updated_at: now,
    },
    { onConflict: "user_id,chat_id" },
  );

  if (error) {
    console.error("[nest-inbox-supabase] mark close failed:", error.message);
  }
}

export async function clearNestCloseInSupabase(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
): Promise<void> {
  const { error } = await supabase
    .from("store_nest_conversation_closes")
    .delete()
    .eq("user_id", userId)
    .eq("chat_id", chatId);

  if (error) {
    console.error("[nest-inbox-supabase] clear close failed:", error.message);
  }
}

export async function markAllNestClosesInSupabase(
  supabase: SupabaseClient,
  userId: string,
  closes: Array<{ chatId: string; closedAt: string }>,
): Promise<void> {
  if (closes.length === 0) return;
  const now = new Date().toISOString();
  const rows = closes.map((item) => ({
    user_id: userId,
    chat_id: item.chatId,
    closed_at: item.closedAt,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("store_nest_conversation_closes")
    .upsert(rows, { onConflict: "user_id,chat_id" });

  if (error) {
    console.error("[nest-inbox-supabase] mark all close failed:", error.message);
  }
}

export async function getNestLastSyncedAt(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("store_inbox_connection_state")
    .select("nest_last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.nest_last_synced_at) return null;
  return data.nest_last_synced_at as string;
}

export async function touchNestSyncTimestamp(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from("store_inbox_connection_state").upsert(
    {
      user_id: userId,
      nest_last_synced_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
}
