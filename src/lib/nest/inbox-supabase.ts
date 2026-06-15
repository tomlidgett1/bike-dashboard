import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NestConversationDetail,
  NestConversationListItem,
  NestConversationMessage,
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
};

type MessageRow = {
  nest_message_id: number;
  role: NestConversationMessage["role"];
  content: string;
  handle: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
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

export async function loadNestChatsFromSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<NestConversationListItem[]> {
  const { data, error } = await supabase
    .from("store_nest_conversations")
    .select(
      "chat_id, title, display_name, participant_handle, preview, preview_role, last_message_at, last_customer_message_at, has_manual_messages, latest_manual_message_at, source, triggered_by_twilio",
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
  const chat = listChat ?? {
    chatId: conversation.chatId,
    title: conversation.title,
    displayName: conversation.displayName,
    participantHandle: conversation.participantHandle,
    preview:
      conversation.messages[conversation.messages.length - 1]?.content
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180) ?? "",
    previewRole:
      conversation.messages[conversation.messages.length - 1]?.role ?? "user",
    lastMessageAt:
      conversation.messages[conversation.messages.length - 1]?.createdAt ?? now,
    source: conversation.source,
  };

  await upsertNestChatsToSupabase(supabase, userId, brandKey, [
    {
      ...chat,
      previewRole: chat.previewRole ?? "user",
      lastMessageAt: chat.lastMessageAt ?? now,
      source: chat.source ?? conversation.source,
    },
  ]);

  if (conversation.messages.length === 0) return;

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
