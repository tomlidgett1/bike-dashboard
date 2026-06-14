import {
  getLightspeedPhoneNameIndex,
  lookupLightspeedCustomerNameByPhone,
  resolveLightspeedNamesFromIndex,
} from "@/lib/services/lightspeed/customer-search";
import type { NestConversationDetail, NestConversationListItem } from "./types";

const LIST_INDEX_TIMEOUT_MS = 2_500;
const THREAD_LOOKUP_TIMEOUT_MS = 2_000;
const LIST_INDEX_MAX_PAGES = process.env.NODE_ENV === "development" ? 4 : 12;
const THREAD_SCAN_MAX_PAGES = process.env.NODE_ENV === "development" ? 4 : 12;

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function isLikelyPhone(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return phoneDigits(value).length >= 8;
}

function extractPhoneFromChatId(chatId: string): string | null {
  const match = chatId.match(/\+?\d[\d\s()-]{7,}\d/);
  if (!match) return null;
  const candidate = match[0].replace(/\s+/g, "").trim();
  return isLikelyPhone(candidate) ? candidate : null;
}

function extractChatPhone(
  chat: Pick<NestConversationListItem, "chatId" | "title" | "participantHandle">,
): string | null {
  const handle = chat.participantHandle?.trim();
  if (handle && isLikelyPhone(handle)) return handle;
  const title = chat.title?.trim();
  if (title && isLikelyPhone(title)) return title;
  const fromChatId = extractPhoneFromChatId(chat.chatId);
  if (fromChatId) return fromChatId;
  return null;
}

function chatNeedsNameEnrichment(chat: NestConversationListItem): boolean {
  const phone = extractChatPhone(chat);
  return Boolean(phone && (!chat.displayName || isLikelyPhone(chat.displayName)));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export async function enrichNestChatsWithLightspeed(
  userId: string,
  chats: NestConversationListItem[],
  options?: { allowPhoneScan?: boolean },
): Promise<NestConversationListItem[]> {
  if (!chats.some(chatNeedsNameEnrichment)) return chats;

  try {
    const index = await withTimeout(
      getLightspeedPhoneNameIndex(userId, {
        maxPages: LIST_INDEX_MAX_PAGES,
        timeoutMs: LIST_INDEX_TIMEOUT_MS,
      }),
      LIST_INDEX_TIMEOUT_MS,
      new Map<string, string>(),
    );

    const phones = chats
      .filter(chatNeedsNameEnrichment)
      .map((chat) => extractChatPhone(chat))
      .filter((phone): phone is string => Boolean(phone));

    const namesByPhone = await resolveLightspeedNamesFromIndex(userId, phones, index, {
      allowScan: options?.allowPhoneScan ?? true,
    });
    return chats.map((chat) => {
      if (!chatNeedsNameEnrichment(chat)) return chat;
      const phone = extractChatPhone(chat);
      const displayName = phone ? namesByPhone.get(phone) ?? null : null;
      if (!displayName || displayName === chat.displayName) return chat;
      return { ...chat, displayName };
    });
  } catch (error) {
    console.error("[nest] Lightspeed chat enrichment failed:", error);
    return chats;
  }
}

export async function enrichNestConversationWithLightspeed(
  userId: string,
  conversation: NestConversationDetail,
): Promise<NestConversationDetail> {
  if (conversation.displayName?.trim() && !isLikelyPhone(conversation.displayName)) {
    return conversation;
  }

  const phone = extractChatPhone(conversation);
  if (!phone) return conversation;

  try {
    const displayName = await withTimeout(
      lookupLightspeedCustomerNameByPhone(userId, phone, {
        allowScan: true,
        maxScanPages: THREAD_SCAN_MAX_PAGES,
      }),
      THREAD_LOOKUP_TIMEOUT_MS,
      null,
    );

    if (!displayName || displayName === conversation.displayName) return conversation;
    return { ...conversation, displayName };
  } catch (error) {
    console.error("[nest] Lightspeed thread enrichment failed:", error);
    return conversation;
  }
}
