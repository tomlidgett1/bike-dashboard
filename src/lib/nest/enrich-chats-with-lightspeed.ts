import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyResolvedNestDisplayNames,
  extractPhoneFromNestChat,
  hydrateInboxCustomerNamesFromDb,
  nestChatNeedsNameEnrichment,
  resolvePhoneContactFromApi,
  upsertPhoneContactToDb,
} from "@/lib/customer-inquiries/lightspeed-phone-directory";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import type { NestConversationDetail, NestConversationListItem } from "./types";

const THREAD_LOOKUP_TIMEOUT_MS = 3_500;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export async function enrichNestChatsWithLightspeed(
  supabase: SupabaseClient,
  userId: string,
  chats: NestConversationListItem[],
  options?: { allowApi?: boolean },
): Promise<NestConversationListItem[]> {
  if (isLightspeedInBackoff(userId)) return chats;
  if (!chats.some(nestChatNeedsNameEnrichment)) return chats;

  try {
    const { nestChats } = await hydrateInboxCustomerNamesFromDb(supabase, userId, {
      nestChats: chats,
      inquiries: [],
    });

    if (options?.allowApi === false || isLightspeedInBackoff(userId)) {
      return nestChats;
    }

    const unresolved = nestChats.filter(nestChatNeedsNameEnrichment);
    const namesByPhone = new Map<string, string>();

    for (const chat of unresolved.slice(0, 16)) {
      const phone = extractPhoneFromNestChat(chat);
      if (!phone) continue;
      try {
        const contact = await resolvePhoneContactFromApi(userId, phone);
        if (!contact?.displayName) continue;
        await upsertPhoneContactToDb(supabase, userId, phone, contact);
        namesByPhone.set(phone, contact.displayName);
      } catch (error) {
        console.error("[nest] Lightspeed phone resolve failed:", phone, error);
      }
    }

    if (namesByPhone.size === 0) return nestChats;
    return applyResolvedNestDisplayNames(supabase, userId, nestChats, namesByPhone);
  } catch (error) {
    console.error("[nest] Lightspeed chat enrichment failed:", error);
    return chats;
  }
}

export async function enrichNestConversationWithLightspeed(
  supabase: SupabaseClient,
  userId: string,
  conversation: NestConversationDetail,
): Promise<NestConversationDetail> {
  if (isLightspeedInBackoff(userId)) return conversation;
  if (conversation.displayName?.trim() && !nestChatNeedsNameEnrichment(conversation)) {
    return conversation;
  }

  const phone = extractPhoneFromNestChat(conversation);
  if (!phone) return conversation;

  try {
    const { nestChats } = await hydrateInboxCustomerNamesFromDb(supabase, userId, {
      nestChats: [
        {
          chatId: conversation.chatId,
          title: conversation.title,
          displayName: conversation.displayName,
          participantHandle: conversation.participantHandle,
          preview: "",
          previewRole: "",
          lastMessageAt: new Date().toISOString(),
          source: conversation.source,
        },
      ],
      inquiries: [],
    });
    const hydrated = nestChats[0];
    if (hydrated?.displayName && hydrated.displayName !== conversation.displayName) {
      return { ...conversation, displayName: hydrated.displayName };
    }

    const contact = await withTimeout(
      resolvePhoneContactFromApi(userId, phone),
      THREAD_LOOKUP_TIMEOUT_MS,
      null,
    );
    if (!contact?.displayName || contact.displayName === conversation.displayName) {
      return conversation;
    }

    await upsertPhoneContactToDb(supabase, userId, phone, contact);
    await supabase
      .from("store_nest_conversations")
      .update({
        display_name: contact.displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("chat_id", conversation.chatId);

    return { ...conversation, displayName: contact.displayName };
  } catch (error) {
    console.error("[nest] Lightspeed thread enrichment failed:", error);
    return conversation;
  }
}
