export type NestConversationListItem = {
  chatId: string;
  title: string;
  displayName: string | null;
  participantHandle: string | null;
  preview: string;
  previewRole: string;
  lastMessageAt: string;
  lastCustomerMessageAt?: string | null;
  hasManualMessages?: boolean;
  latestManualMessageAt?: string | null;
  source: "customer" | "portal_test";
  /** True when the thread was started by the Twilio missed-call webhook auto-text. */
  triggeredByTwilio?: boolean;
  /** How this conversation reached the store. Derived — see deriveNestChannel. */
  channel?: NestChannel;
};

/**
 * The entry point of a Nest conversation:
 * - website_chat: customer tapped "Chat with store" on the storefront and messaged via iMessage/SMS
 * - missed_call: customer called the store, nobody answered, Twilio texted them back
 * - store_outreach: the shop started the thread from Yellow Jersey
 */
export type NestChannel = "website_chat" | "missed_call" | "store_outreach";

export type NestConversationMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  handle: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type NestConversationDetail = {
  chatId: string;
  title: string;
  displayName: string | null;
  participantHandle: string | null;
  source: "customer" | "portal_test";
  lastSeen: number | null;
  messages: NestConversationMessage[];
};

export type NestConversationsResponse = {
  chats: NestConversationListItem[];
  selectedChatId: string | null;
  conversation: NestConversationDetail | null;
};

export type NestLightspeedCustomer = {
  customerId: string;
  name: string;
  phone: string;
};

/** True when the shop still owes a reply (opening the thread does not clear this). */
export function nestConversationNeedsAction(
  chat: Pick<
    NestConversationListItem,
    | "previewRole"
    | "lastCustomerMessageAt"
    | "latestManualMessageAt"
    | "hasManualMessages"
    | "lastMessageAt"
  >,
  closedAt?: string | null,
): boolean {
  const messageNeedsAction = (() => {
    if (chat.previewRole === "user") return true;
    if (chat.lastCustomerMessageAt) {
      if (!chat.latestManualMessageAt) return true;
      return (
        new Date(chat.lastCustomerMessageAt).getTime() >
        new Date(chat.latestManualMessageAt).getTime()
      );
    }
    return !chat.hasManualMessages;
  })();

  if (!messageNeedsAction) return false;
  if (!closedAt) return true;

  const anchor =
    chat.lastCustomerMessageAt ||
    (chat.previewRole === "user" ? chat.lastMessageAt : null) ||
    chat.lastMessageAt;
  if (!anchor) return false;

  return new Date(anchor).getTime() > new Date(closedAt).getTime();
}

export function isNestPortalTestChat(
  chat: Pick<NestConversationListItem, "chatId"> & Partial<Pick<NestConversationListItem, "source">>,
): boolean {
  if (chat.source === "portal_test") return true;
  if (chat.chatId.startsWith("portal-test#")) return true;
  if (chat.chatId.startsWith("portal-sim#")) return true;
  return false;
}

/** Public storefront chatbot threads (web widget on store pages). */
export function isNestStorefrontChat(chatId: string): boolean {
  return chatId.startsWith("storefront#");
}

export function filterNestCustomerChats(chats: NestConversationListItem[]): NestConversationListItem[] {
  return chats.filter((chat) => !isNestPortalTestChat(chat));
}

export function isNestMissedCallChat(
  chat: Pick<NestConversationListItem, "chatId" | "triggeredByTwilio">,
): boolean {
  return chat.triggeredByTwilio === true;
}

export function filterNestMissedCallChats(chats: NestConversationListItem[]): NestConversationListItem[] {
  return chats.filter(isNestMissedCallChat);
}

export function filterNestInboxChats(chats: NestConversationListItem[]): NestConversationListItem[] {
  return chats.filter((chat) => !isNestMissedCallChat(chat));
}

/** Minimal shape of the earliest message in a thread, used to pin down the channel. */
export type NestFirstMessageHint = {
  role: string;
  handle: string | null;
  source: string | null;
};

function isStaffFirstMessage(hint: NestFirstMessageHint): boolean {
  return (
    hint.handle?.startsWith("staff@") === true ||
    hint.source?.startsWith("brand_portal_") === true
  );
}

/**
 * Work out how a Nest conversation reached the store.
 * The first message is authoritative when we have it cached; otherwise fall back
 * to list-level signals (Twilio flag, who has spoken so far).
 */
export function deriveNestChannel(
  chat: Pick<
    NestConversationListItem,
    "triggeredByTwilio" | "hasManualMessages" | "lastCustomerMessageAt" | "previewRole"
  >,
  firstMessage?: NestFirstMessageHint | null,
): NestChannel {
  if (chat.triggeredByTwilio) return "missed_call";

  if (firstMessage) {
    if (firstMessage.source === "twilio-voice-webhook") return "missed_call";
    if (isStaffFirstMessage(firstMessage)) return "store_outreach";
    if (firstMessage.role === "user") return "website_chat";
  }

  // No first message cached yet: if the shop has spoken but the customer never
  // has, the shop must have started it. Otherwise assume the customer did.
  if (chat.hasManualMessages && !chat.lastCustomerMessageAt && chat.previewRole !== "user") {
    return "store_outreach";
  }
  return "website_chat";
}

export function deriveNestChannelFromMessages(
  chat: Pick<
    NestConversationListItem,
    "triggeredByTwilio" | "hasManualMessages" | "lastCustomerMessageAt" | "previewRole"
  >,
  messages: NestConversationMessage[] | undefined,
): NestChannel {
  const first = messages?.length
    ? messages.reduce((earliest, message) =>
        new Date(message.createdAt).getTime() < new Date(earliest.createdAt).getTime()
          ? message
          : earliest,
      )
    : null;
  return deriveNestChannel(
    chat,
    first
      ? {
          role: first.role,
          handle: first.handle,
          source: typeof first.metadata?.source === "string" ? first.metadata.source : null,
        }
      : null,
  );
}

export function sanitiseNestConversationsResponse(
  raw: NestConversationsResponse,
): NestConversationsResponse {
  const chats = filterNestCustomerChats(raw.chats);
  let { selectedChatId, conversation } = raw;

  if (selectedChatId?.startsWith("portal-test#") || selectedChatId?.startsWith("portal-sim#")) {
    selectedChatId = null;
    conversation = null;
  }
  if (conversation && isNestPortalTestChat(conversation)) {
    conversation = null;
    selectedChatId = null;
  }

  const selectedExistsInList = selectedChatId ? chats.some((c) => c.chatId === selectedChatId) : false;
  const selectedMatchesConversation = Boolean(
    selectedChatId && conversation?.chatId === selectedChatId,
  );
  if (selectedChatId && !selectedExistsInList && !selectedMatchesConversation) {
    selectedChatId = null;
    conversation = null;
  }

  return { ...raw, chats, selectedChatId, conversation };
}
