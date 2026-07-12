import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertNestThreadToSupabase } from "@/lib/nest/inbox-supabase";
import type { NestConversationDetail, NestConversationMessage } from "@/lib/nest/types";

function syntheticMessageId(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  // Keep in a safe positive int range for bigint-ish uniqueness with chat_id.
  return (hash % 2_000_000_000) + 1;
}

/**
 * Persist a storefront Nest turn into the store's Customer inquiries cache
 * (`store_nest_conversations` / `store_nest_messages`) so it appears as a
 * Website chat row. Does not go through SMS/Linq.
 */
export async function persistStorefrontNestTurn(args: {
  supabase: SupabaseClient;
  storeUserId: string;
  brandKey: string;
  chatId: string;
  storeName: string;
  userMessage: string;
  assistantReply?: string | null;
  visitorHandle?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const slightlyEarlier = new Date(Date.now() - 250).toISOString();
  const handle =
    args.visitorHandle?.trim() ||
    `storefront@${args.chatId.replace(/^storefront#[^#]+#/, "").slice(0, 16) || "visitor"}`;

  const userMsg: NestConversationMessage = {
    id: syntheticMessageId(`${args.chatId}:user:${args.userMessage}:${slightlyEarlier}`),
    role: "user",
    content: args.userMessage,
    handle,
    createdAt: slightlyEarlier,
    metadata: {
      source: "storefront_chat",
      service: "storefront_chat",
    },
  };

  const messages: NestConversationMessage[] = [userMsg];
  const assistantReply = args.assistantReply?.trim() || "";
  if (assistantReply) {
    messages.push({
      id: syntheticMessageId(`${args.chatId}:assistant:${assistantReply}:${now}`),
      role: "assistant",
      content: assistantReply,
      handle: `brand@${args.brandKey}`,
      createdAt: now,
      metadata: {
        source: "storefront_chat",
        service: "storefront_chat",
      },
    });
  }

  const lastMessage = messages[messages.length - 1]!;
  const conversation: NestConversationDetail = {
    chatId: args.chatId,
    title: "Website visitor",
    displayName: "Website visitor",
    participantHandle: handle,
    source: "customer",
    lastSeen: null,
    messages,
  };

  await upsertNestThreadToSupabase(args.supabase, args.storeUserId, args.brandKey, conversation, {
    chatId: args.chatId,
    title: "Website visitor",
    displayName: "Website visitor",
    participantHandle: handle,
    preview: lastMessage.content.replace(/\s+/g, " ").trim().slice(0, 180),
    previewRole: lastMessage.role,
    lastMessageAt: lastMessage.createdAt,
    lastCustomerMessageAt: slightlyEarlier,
    source: "customer",
    triggeredByTwilio: false,
    channel: "website_chat",
  });
}

export async function persistStorefrontStaffReply(args: {
  supabase: SupabaseClient;
  storeUserId: string;
  brandKey: string;
  chatId: string;
  content: string;
}): Promise<{ messageId: number; createdAt: string }> {
  const now = new Date().toISOString();
  const messageId = syntheticMessageId(`${args.chatId}:staff:${args.content}:${now}`);
  const handle = `staff@${args.brandKey}`;

  const { data: existing } = await args.supabase
    .from("store_nest_conversations")
    .select(
      "title, display_name, participant_handle, last_customer_message_at, has_manual_messages, latest_manual_message_at",
    )
    .eq("user_id", args.storeUserId)
    .eq("chat_id", args.chatId)
    .maybeSingle();

  const conversation: NestConversationDetail = {
    chatId: args.chatId,
    title: existing?.title || "Website visitor",
    displayName: existing?.display_name || "Website visitor",
    participantHandle: existing?.participant_handle || null,
    source: "customer",
    lastSeen: null,
    messages: [
      {
        id: messageId,
        role: "assistant",
        content: args.content,
        handle,
        createdAt: now,
        metadata: {
          source: "brand_portal_staff_reply",
          service: "storefront_chat",
        },
      },
    ],
  };

  await upsertNestThreadToSupabase(args.supabase, args.storeUserId, args.brandKey, conversation, {
    chatId: args.chatId,
    title: conversation.title,
    displayName: conversation.displayName,
    participantHandle: conversation.participantHandle,
    preview: args.content.replace(/\s+/g, " ").trim().slice(0, 180),
    previewRole: "assistant",
    lastMessageAt: now,
    lastCustomerMessageAt: existing?.last_customer_message_at ?? null,
    hasManualMessages: true,
    latestManualMessageAt: now,
    source: "customer",
    triggeredByTwilio: false,
    channel: "website_chat",
  });

  return { messageId, createdAt: now };
}

/** True when a store teammate has already replied in this website chat. */
export function storefrontThreadHasStaffReply(
  messages: Array<{ handle?: string | null; metadata?: Record<string, unknown> | null }>,
): boolean {
  return messages.some((message) => {
    if (message.handle?.startsWith("staff@")) return true;
    const source =
      typeof message.metadata?.source === "string" ? message.metadata.source : "";
    return source === "brand_portal_staff_reply";
  });
}
