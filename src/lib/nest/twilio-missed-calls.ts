import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import type { NestConversationListItem } from "@/lib/nest/types";

export const NEST_TWILIO_VOICE_WEBHOOK_SOURCE = "twilio-voice-webhook";

export async function fetchNestTwilioMissedCallChatIds(brandKey: string): Promise<Set<string>> {
  try {
    const data = await proxyNestBrandPortalRequest(brandKey, {
      method: "GET",
      query: new URLSearchParams({ twilioActivity: "1" }),
    });

    const events = Array.isArray(data.events) ? data.events : [];
    const chatIds = new Set<string>();

    for (const event of events) {
      if (!event || typeof event !== "object") continue;
      const chatId = (event as { chatId?: unknown }).chatId;
      if (typeof chatId === "string" && chatId.trim()) {
        chatIds.add(chatId.trim());
      }
    }

    return chatIds;
  } catch (error) {
    console.error("[nest-twilio-missed-calls] activity fetch failed:", error);
    return new Set();
  }
}

export function enrichNestChatsWithTwilioMissedCalls(
  chats: NestConversationListItem[],
  missedCallChatIds: Set<string>,
): NestConversationListItem[] {
  if (missedCallChatIds.size === 0) {
    return chats.map((chat) =>
      chat.triggeredByTwilio ? { ...chat, triggeredByTwilio: false } : chat,
    );
  }

  return chats.map((chat) => ({
    ...chat,
    triggeredByTwilio: missedCallChatIds.has(chat.chatId),
  }));
}

export function messageTriggeredByTwilioWebhook(
  metadata: Record<string, unknown> | undefined,
): boolean {
  return metadata?.source === NEST_TWILIO_VOICE_WEBHOOK_SOURCE;
}
