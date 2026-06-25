import {
  filterNestCustomerChats,
  sanitiseNestConversationsResponse,
  type NestConversationListItem,
  type NestConversationsResponse,
} from "@/lib/nest/types";

export async function fetchNestListForActions(): Promise<NestConversationListItem[]> {
  const res = await fetch("/api/store/nest-messages?listOnly=1", { cache: "no-store" });
  const data = (await res.json()) as NestConversationsResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not load Nest messages.");
  }

  const sanitised = sanitiseNestConversationsResponse({
    chats: Array.isArray(data.chats) ? data.chats : [],
    selectedChatId: null,
    conversation: null,
  });

  return filterNestCustomerChats(sanitised.chats).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}
