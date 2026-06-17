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
};

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
