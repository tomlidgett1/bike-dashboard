import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isLikelyPhone as isLikelyPhoneValue,
  lookupLightspeedCustomerForLab,
  normalizeAustralianMobileLocal,
} from "@/lib/services/lightspeed/customer-search";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import type { NestConversationListItem } from "@/lib/nest/types";

export type PhoneContactRecord = {
  phoneNormalized: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  lightspeedCustomerId: string | null;
};

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

const CHANNEL_PREFIX = /^(whatsapp|sms|tel|phone|voice|viber|line|messenger):/i;

/** Strip channel prefixes and fix common encoding quirks before Lightspeed lookup. */
export function sanitizePhoneForLookup(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  let phone = value.trim().replace(CHANNEL_PREFIX, "").trim();
  // Query strings sometimes turn leading "+" into a space.
  if (/^\s+\d/.test(phone)) {
    phone = `+${phone.trim()}`;
  }
  const digits = phoneDigits(phone);
  if (digits.startsWith("61") && digits.length >= 11 && !phone.startsWith("+")) {
    phone = `+${digits}`;
  }

  if (!isLikelyPhoneValue(phone)) return null;
  return phone;
}

export function isLikelyPhone(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return isLikelyPhoneValue(value);
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

export async function loadPhoneContactsFromDb(
  supabase: SupabaseClient,
  userId: string,
  phones: string[],
): Promise<Map<string, PhoneContactRecord>> {
  const entries = phones
    .map((raw) => ({ raw, key: normalizePhoneForDirectory(raw) }))
    .filter((entry): entry is { raw: string; key: string } => Boolean(entry.key));

  const keys = Array.from(new Set(entries.map((entry) => entry.key)));
  if (keys.length === 0) return new Map();

  const { data, error } = await supabase
    .from("store_lightspeed_phone_contacts")
    .select("phone_normalized, first_name, last_name, display_name, lightspeed_customer_id")
    .eq("user_id", userId)
    .in("phone_normalized", keys);

  if (error) {
    console.error("[lightspeed-phone-directory] load failed:", error.message);
    return new Map();
  }

  const byNormalized = new Map<string, PhoneContactRecord>();
  for (const row of data ?? []) {
    byNormalized.set(String(row.phone_normalized), {
      phoneNormalized: String(row.phone_normalized),
      firstName: row.first_name ? String(row.first_name) : null,
      lastName: row.last_name ? String(row.last_name) : null,
      displayName: String(row.display_name ?? ""),
      lightspeedCustomerId: row.lightspeed_customer_id
        ? String(row.lightspeed_customer_id)
        : null,
    });
  }

  const resolved = new Map<string, PhoneContactRecord>();
  for (const entry of entries) {
    const contact = byNormalized.get(entry.key);
    if (contact) resolved.set(entry.raw, contact);
  }
  return resolved;
}

export async function upsertPhoneContactToDb(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
  contact: PhoneContactRecord,
): Promise<void> {
  const phoneNormalized = contact.phoneNormalized || normalizePhoneForDirectory(phone);
  if (!phoneNormalized || !contact.displayName.trim()) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from("store_lightspeed_phone_contacts").upsert(
    {
      user_id: userId,
      phone_normalized: phoneNormalized,
      first_name: contact.firstName,
      last_name: contact.lastName,
      display_name: contact.displayName,
      lightspeed_customer_id: contact.lightspeedCustomerId,
      resolved_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,phone_normalized" },
  );

  if (error) {
    console.error("[lightspeed-phone-directory] upsert failed:", error.message);
  }
}

export async function resolvePhoneContactFromApi(
  userId: string,
  phone: string,
): Promise<PhoneContactRecord | null> {
  if (isLightspeedInBackoff(userId)) return null;

  const queryPhone = sanitizePhoneForLookup(phone) ?? phone.trim();
  const phoneNormalized = normalizePhoneForDirectory(queryPhone);
  if (!phoneNormalized) return null;

  const lookup = await lookupLightspeedCustomerForLab(userId, {
    phone: queryPhone,
    maxScanPages: 10,
  });
  const customer = lookup.customer;
  if (!customer) return null;

  const firstName = customer.firstName ?? null;
  const lastName = customer.lastName ?? null;
  const displayName =
    [firstName, lastName]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" ") ||
    String(customer.company ?? "").trim() ||
    `Customer ${customer.customerID}`;

  return {
    phoneNormalized,
    firstName,
    lastName,
    displayName,
    lightspeedCustomerId:
      customer.customerID != null ? String(customer.customerID) : null,
  };
}

function isLightspeedSessionExpiredError(error: unknown): boolean {
  return error instanceof Error && /Session expired|No valid access token|reconnect/i.test(error.message);
}

export async function resolvePhoneContactsForInbox(
  supabase: SupabaseClient,
  userId: string,
  phones: string[],
  options?: { allowApi?: boolean; apiLimit?: number },
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(phones.map((phone) => phone.trim()).filter(isLikelyPhone)));
  const names = new Map<string, string>();
  if (unique.length === 0) return names;

  const fromDb = await loadPhoneContactsFromDb(supabase, userId, unique);
  for (const [phone, contact] of fromDb) {
    names.set(phone, contact.displayName);
  }

  if (options?.allowApi === false || isLightspeedInBackoff(userId)) {
    return names;
  }

  const unresolved = unique.filter((phone) => !names.has(phone));
  const limit = options?.apiLimit ?? 12;

  for (const phone of unresolved.slice(0, limit)) {
    try {
      const contact = await resolvePhoneContactFromApi(userId, phone);
      if (!contact) continue;
      await upsertPhoneContactToDb(supabase, userId, phone, contact);
      names.set(phone, contact.displayName);
    } catch (error) {
      console.error("[lightspeed-phone-directory] api resolve failed:", phone, error);
      if (isLightspeedSessionExpiredError(error)) break;
    }
  }

  return names;
}

export async function applyResolvedNestDisplayNames(
  supabase: SupabaseClient,
  userId: string,
  chats: NestConversationListItem[],
  namesByPhone: Map<string, string>,
): Promise<NestConversationListItem[]> {
  const updates: Array<{ chatId: string; displayName: string }> = [];

  const enriched = chats.map((chat) => {
    if (!nestChatNeedsNameEnrichment(chat)) return chat;
    const phone = extractPhoneFromNestChat(chat);
    const displayName = phone ? namesByPhone.get(phone) ?? null : null;
    if (!displayName || displayName === chat.displayName) return chat;
    updates.push({ chatId: chat.chatId, displayName });
    return { ...chat, displayName };
  });

  if (updates.length === 0) return enriched;

  const now = new Date().toISOString();
  await Promise.all(
    updates.map(({ chatId, displayName }) =>
      supabase
        .from("store_nest_conversations")
        .update({ display_name: displayName, updated_at: now })
        .eq("user_id", userId)
        .eq("chat_id", chatId),
    ),
  );

  return enriched;
}

export async function applyResolvedInquiryCustomerNames(
  supabase: SupabaseClient,
  userId: string,
  inquiries: CustomerInquiryListItem[],
  namesByPhone: Map<string, string>,
): Promise<CustomerInquiryListItem[]> {
  const updates: Array<{ id: string; name: string }> = [];

  const enriched = inquiries.map((inquiry) => {
    if (inquiry.lightspeed_customer_name?.trim()) return inquiry;
    const phone = extractPhoneFromInquirySender(inquiry.sender_email, inquiry.sender_name);
    const name = phone ? namesByPhone.get(phone) ?? null : null;
    if (!name) return inquiry;
    updates.push({ id: inquiry.id, name });
    return { ...inquiry, lightspeed_customer_name: name };
  });

  if (updates.length === 0) return enriched;

  const now = new Date().toISOString();
  await Promise.all(
    updates.map(({ id, name }) =>
      supabase
        .from("store_customer_inquiries")
        .update({ lightspeed_customer_name: name, updated_at: now })
        .eq("user_id", userId)
        .eq("id", id),
    ),
  );

  return enriched;
}

export async function hydrateInboxCustomerNamesFromDb(
  supabase: SupabaseClient,
  userId: string,
  args: {
    nestChats: NestConversationListItem[];
    inquiries: CustomerInquiryListItem[];
  },
): Promise<{
  nestChats: NestConversationListItem[];
  inquiries: CustomerInquiryListItem[];
}> {
  const phones: string[] = [];

  for (const chat of args.nestChats) {
    if (!nestChatNeedsNameEnrichment(chat)) continue;
    const phone = extractPhoneFromNestChat(chat);
    if (phone) phones.push(phone);
  }

  for (const inquiry of args.inquiries) {
    if (inquiry.lightspeed_customer_name?.trim()) continue;
    const phone = extractPhoneFromInquirySender(inquiry.sender_email, inquiry.sender_name);
    if (phone) phones.push(phone);
  }

  const namesByPhone = await resolvePhoneContactsForInbox(supabase, userId, phones, {
    allowApi: false,
  });

  const [nestChats, inquiries] = await Promise.all([
    applyResolvedNestDisplayNames(supabase, userId, args.nestChats, namesByPhone),
    applyResolvedInquiryCustomerNames(supabase, userId, args.inquiries, namesByPhone),
  ]);

  return { nestChats, inquiries };
}

export async function backgroundResolveInboxPhoneContacts(
  supabase: SupabaseClient,
  userId: string,
  args: {
    nestChats: NestConversationListItem[];
    inquiries: CustomerInquiryListItem[];
  },
  options?: { apiLimit?: number },
): Promise<void> {
  if (isLightspeedInBackoff(userId)) return;

  const phones: string[] = [];
  for (const chat of args.nestChats) {
    if (!nestChatNeedsNameEnrichment(chat)) continue;
    const phone = extractPhoneFromNestChat(chat);
    if (phone) phones.push(phone);
  }
  for (const inquiry of args.inquiries) {
    if (inquiry.lightspeed_customer_name?.trim()) continue;
    const phone = extractPhoneFromInquirySender(inquiry.sender_email, inquiry.sender_name);
    if (phone) phones.push(phone);
  }

  const namesByPhone = await resolvePhoneContactsForInbox(supabase, userId, phones, {
    allowApi: true,
    apiLimit: options?.apiLimit ?? 16,
  });

  await Promise.all([
    applyResolvedNestDisplayNames(supabase, userId, args.nestChats, namesByPhone),
    applyResolvedInquiryCustomerNames(supabase, userId, args.inquiries, namesByPhone),
  ]);
}
