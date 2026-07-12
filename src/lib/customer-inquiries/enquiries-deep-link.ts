import {
  resolveNestConversationPhone,
  sanitizePhoneForLookup,
} from "@/lib/customer-inquiries/phone-utils";
import type { NestConversationListItem } from "@/lib/nest/types";

export type CustomerEnquiriesNestPrefill = {
  chatId?: string;
  compose?: boolean;
  phone?: string;
  name?: string;
  customerId?: string;
};

export type NestComposeInitialRecipient = {
  customerName: string;
  customerId?: string | null;
  mobile?: string | null;
};

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function phonesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const sanitizedLeft = sanitizePhoneForLookup(left);
  const sanitizedRight = sanitizePhoneForLookup(right);
  if (!sanitizedLeft || !sanitizedRight) return false;

  const leftDigits = phoneDigits(sanitizedLeft);
  const rightDigits = phoneDigits(sanitizedRight);
  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;

  const leftTail = leftDigits.slice(-9);
  const rightTail = rightDigits.slice(-9);
  return leftTail.length >= 9 && leftTail === rightTail;
}

export function buildCustomerEnquiriesNestUrl(
  prefill: CustomerEnquiriesNestPrefill,
): string {
  const params = new URLSearchParams();

  if (prefill.chatId) {
    params.set("chatId", prefill.chatId);
  } else if (prefill.compose !== false) {
    params.set("compose", "1");
    if (prefill.phone) params.set("phone", prefill.phone);
    if (prefill.name) params.set("name", prefill.name);
    if (prefill.customerId) params.set("customerId", prefill.customerId);
  }

  const query = params.toString();
  return query
    ? `/settings/store/customer-inquiries?${query}`
    : "/settings/store/customer-inquiries";
}

export function findNestChatIdByPhone(
  chats: NestConversationListItem[],
  phone: string | null | undefined,
): string | null {
  if (!phone?.trim()) return null;

  for (const chat of chats) {
    const chatPhone = resolveNestConversationPhone(chat);
    if (phonesMatch(phone, chatPhone)) return chat.chatId;
  }

  return null;
}

export function findNestInboxRowKeyByPhone<
  T extends {
    key: string;
    source: string;
    nestItem?: NestConversationListItem;
  },
>(rows: T[], phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;

  for (const row of rows) {
    if (row.source !== "nest" || !row.nestItem) continue;
    const chatPhone = resolveNestConversationPhone(row.nestItem);
    if (phonesMatch(phone, chatPhone)) return row.key;
  }

  return null;
}

export function parseCustomerEnquiriesNestPrefill(
  searchParams: Pick<URLSearchParams, "get">,
): CustomerEnquiriesNestPrefill | null {
  const chatId = searchParams.get("chatId")?.trim();
  const compose = searchParams.get("compose") === "1";
  const phone = searchParams.get("phone")?.trim();
  const name = searchParams.get("name")?.trim();
  const customerId = searchParams.get("customerId")?.trim();

  if (!chatId && !compose) return null;

  return {
    chatId: chatId || undefined,
    compose,
    phone: phone || undefined,
    name: name || undefined,
    customerId: customerId || undefined,
  };
}

export function prefillToNestComposeRecipient(
  prefill: CustomerEnquiriesNestPrefill,
): NestComposeInitialRecipient | null {
  if (!prefill.name && !prefill.phone && !prefill.customerId) return null;

  return {
    customerName: prefill.name || "Customer",
    customerId: prefill.customerId ?? null,
    mobile: prefill.phone ?? null,
  };
}
