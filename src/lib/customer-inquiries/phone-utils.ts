import type { NestConversationListItem } from "@/lib/nest/types";

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

const CHANNEL_PREFIX = /^(whatsapp|sms|tel|phone|voice|viber|line|messenger):/i;

export function isLikelyPhone(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return phoneDigits(value).length >= 8;
}

/** Canonical 10-digit AU local mobile (e.g. 0428808811) for Lightspeed exact filters. */
export function normalizeAustralianMobileLocal(phone: string): string | null {
  const digits = phoneDigits(phone);
  if (!digits) return null;

  if (digits.startsWith("61") && digits.length >= 11) {
    const local = `0${digits.slice(2)}`;
    if (local.length === 10) return local;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }

  if (digits.length === 9 && digits.startsWith("4")) {
    return `0${digits}`;
  }

  return null;
}

/** Strip channel prefixes and fix common encoding quirks before Lightspeed lookup. */
export function sanitizePhoneForLookup(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  let phone = value.trim().replace(CHANNEL_PREFIX, "").trim();
  if (/^\s+\d/.test(phone)) {
    phone = `+${phone.trim()}`;
  }
  const digits = phoneDigits(phone);
  if (digits.startsWith("61") && digits.length >= 11 && !phone.startsWith("+")) {
    phone = `+${digits}`;
  }

  if (!isLikelyPhone(phone)) return null;
  return phone;
}

export function normalizePhoneForDirectory(phone: string): string | null {
  return normalizeAustralianMobileLocal(phone);
}

export function formatPhoneDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const name = [firstName, lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
}

export function extractPhoneFromInquirySender(
  senderEmail: string,
  senderName: string,
): string | null {
  for (const candidate of [senderEmail, senderName]) {
    const sanitized = sanitizePhoneForLookup(candidate);
    if (sanitized) return sanitized;
  }
  return null;
}

function firstSanitizedPhone(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const sanitized = sanitizePhoneForLookup(candidate);
    if (sanitized) return sanitized;
  }
  return null;
}

export function extractPhoneFromNestMessages(
  messages: Array<{
    role: string;
    handle?: string | null;
    metadata?: Record<string, unknown> | null;
  }>,
): string | null {
  for (const message of messages) {
    if (message.role === "user") {
      const fromHandle = sanitizePhoneForLookup(message.handle);
      if (fromHandle) return fromHandle;
    }
    const recipient = message.metadata?.recipient_phone_e164;
    if (typeof recipient === "string") {
      const fromMetadata = sanitizePhoneForLookup(recipient);
      if (fromMetadata) return fromMetadata;
    }
  }
  return null;
}

export function extractPhoneFromNestChat(
  chat: Pick<
    NestConversationListItem,
    "chatId" | "title" | "participantHandle" | "displayName"
  >,
): string | null {
  const dmMatch = chat.chatId.match(/^DM#[^#]+#(.+)$/);
  const fromChatId = chat.chatId.match(/\+?\d[\d\s()-]{7,}\d/);

  return firstSanitizedPhone([
    chat.participantHandle,
    dmMatch?.[1],
    fromChatId ? fromChatId[0].replace(/\s+/g, "").trim() : null,
    chat.title,
  ]);
}

export function resolveNestConversationPhone(
  chat: Pick<
    NestConversationListItem,
    "chatId" | "title" | "participantHandle" | "displayName"
  >,
  messages?: Array<{
    role: string;
    handle?: string | null;
    metadata?: Record<string, unknown> | null;
  }>,
): string | null {
  return extractPhoneFromNestChat(chat) ?? (messages ? extractPhoneFromNestMessages(messages) : null);
}

export function nestChatNeedsNameEnrichment(
  chat: Pick<
    NestConversationListItem,
    "chatId" | "title" | "participantHandle" | "displayName"
  >,
): boolean {
  const phone = extractPhoneFromNestChat(chat);
  if (!phone) return false;
  const display = chat.displayName?.trim();
  if (!display) return true;
  return isLikelyPhone(display) || phoneDigits(display) === phoneDigits(phone);
}
