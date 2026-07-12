import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractPhoneFromNestChat,
  isLikelyPhone,
  loadPhoneContactsFromDb,
  sanitizePhoneForLookup,
} from "@/lib/customer-inquiries/lightspeed-phone-directory";

type NestConversationRow = {
  chat_id: string;
  title: string | null;
  display_name: string | null;
  participant_handle: string | null;
};

type PaymentRequestDbRow = {
  nest_chat_id: string | null;
  customer_name: string | null;
  customer_handle: string | null;
};

function isPhoneLikeLabel(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return isLikelyPhone(value.trim());
}

function pickHumanName(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed || isPhoneLikeLabel(trimmed)) continue;
    return trimmed;
  }
  return null;
}

export async function enrichPaymentRequestCustomerNames<
  T extends PaymentRequestDbRow,
>(supabase: SupabaseClient, userId: string, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;

  const chatIds = Array.from(
    new Set(rows.map((row) => row.nest_chat_id).filter((id): id is string => Boolean(id))),
  );

  const conversationsByChatId = new Map<string, NestConversationRow>();
  if (chatIds.length > 0) {
    const { data: conversations } = await supabase
      .from("store_nest_conversations")
      .select("chat_id, title, display_name, participant_handle")
      .eq("user_id", userId)
      .in("chat_id", chatIds);

    for (const conversation of conversations ?? []) {
      conversationsByChatId.set(conversation.chat_id, conversation);
    }
  }

  const phones = new Set<string>();
  for (const row of rows) {
    const conversation = row.nest_chat_id
      ? conversationsByChatId.get(row.nest_chat_id)
      : null;
    const phone =
      sanitizePhoneForLookup(row.customer_handle) ??
      (conversation
        ? extractPhoneFromNestChat({
            chatId: conversation.chat_id,
            title: conversation.title ?? "",
            displayName: conversation.display_name,
            participantHandle: conversation.participant_handle,
          })
        : null);
    if (phone) phones.add(phone);
  }

  const contactsByPhone = await loadPhoneContactsFromDb(
    supabase,
    userId,
    Array.from(phones),
  );

  return rows.map((row) => {
    const conversation = row.nest_chat_id
      ? conversationsByChatId.get(row.nest_chat_id)
      : null;
    const phone =
      sanitizePhoneForLookup(row.customer_handle) ??
      (conversation
        ? extractPhoneFromNestChat({
            chatId: conversation.chat_id,
            title: conversation.title ?? "",
            displayName: conversation.display_name,
            participantHandle: conversation.participant_handle,
          })
        : null);
    const directoryName = phone ? contactsByPhone.get(phone)?.displayName?.trim() : null;

    const resolvedName = pickHumanName(
      conversation?.display_name,
      row.customer_name,
      conversation?.title,
      directoryName,
    );

    const resolvedHandle =
      sanitizePhoneForLookup(row.customer_handle) ??
      sanitizePhoneForLookup(conversation?.participant_handle) ??
      phone ??
      row.customer_handle?.trim() ??
      null;

    return {
      ...row,
      customer_name: resolvedName ?? row.customer_name,
      customer_handle: resolvedHandle ?? row.customer_handle,
    };
  });
}
