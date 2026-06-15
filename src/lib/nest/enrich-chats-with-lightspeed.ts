import {
  getLightspeedPhoneNameIndex,
  lookupLightspeedCustomerNameByPhone,
  resolveLightspeedNamesFromIndex,
  resolveRecentCustomerPhoneNames,
} from "@/lib/services/lightspeed/customer-search";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import type { NestConversationDetail, NestConversationListItem } from "./types";

const LIST_INDEX_TIMEOUT_MS = 4_000;
const RECENT_LOOKUP_TIMEOUT_MS = 8_000;
const THREAD_LOOKUP_TIMEOUT_MS = 3_500;
const LIST_DIRECT_LOOKUP_LIMIT = 12;
const LIST_INDEX_MAX_PAGES = process.env.NODE_ENV === "development" ? 6 : 12;
const THREAD_SCAN_MAX_PAGES = process.env.NODE_ENV === "development" ? 40 : 60;

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
  if (isLightspeedInBackoff(userId)) return chats;
  if (!chats.some(chatNeedsNameEnrichment)) return chats;

  try {
    const phones = chats
      .filter(chatNeedsNameEnrichment)
      .map((chat) => extractChatPhone(chat))
      .filter((phone): phone is string => Boolean(phone));

    const [index, fromRecent] = await Promise.all([
      withTimeout(
        getLightspeedPhoneNameIndex(userId, {
          maxPages: LIST_INDEX_MAX_PAGES,
          timeoutMs: LIST_INDEX_TIMEOUT_MS,
        }),
        LIST_INDEX_TIMEOUT_MS,
        new Map<string, string>(),
      ),
      withTimeout(resolveRecentCustomerPhoneNames(userId, phones), RECENT_LOOKUP_TIMEOUT_MS, new Map()),
    ]);

    const namesByPhone = new Map(fromRecent);
    const unresolvedPhones = phones.filter((phone) => !namesByPhone.has(phone));
    if (unresolvedPhones.length > 0) {
      const fromIndex = await resolveLightspeedNamesFromIndex(userId, unresolvedPhones, index, {
        allowScan: options?.allowPhoneScan ?? true,
        directLookupLimit: LIST_DIRECT_LOOKUP_LIMIT,
      });
      for (const [phone, name] of fromIndex) {
        namesByPhone.set(phone, name);
      }
    }
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
  if (isLightspeedInBackoff(userId)) return conversation;
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
