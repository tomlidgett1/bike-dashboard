import { gmailInquiryReadAnchor } from "@/lib/customer-inquiries/inquiry-read-state";
import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import {
  filterNestCustomerChats,
  nestConversationNeedsAction,
  type NestConversationListItem,
} from "@/lib/nest/types";

export function isGmailInquiryUnreadWithMap(
  item: Pick<CustomerInquiryListItem, "id" | "last_customer_at" | "received_at">,
  readMap: Record<string, string>,
): boolean {
  const anchor = gmailInquiryReadAnchor(item);
  if (!anchor) return false;
  const lastRead = readMap[item.id];
  if (!lastRead) return true;
  return new Date(anchor).getTime() > new Date(lastRead).getTime();
}

export function isNestConversationUnreadWithMap(
  chat: Pick<NestConversationListItem, "chatId" | "lastCustomerMessageAt" | "lastMessageAt">,
  readMap: Record<string, string>,
): boolean {
  const anchor = chat.lastCustomerMessageAt || chat.lastMessageAt;
  if (!anchor) return false;
  const lastRead = readMap[chat.chatId];
  if (!lastRead) return true;
  return new Date(anchor).getTime() > new Date(lastRead).getTime();
}

/** Same unread total as the unified inbox "Unread" tab. */
export function countUnifiedInboxUnread(args: {
  inquiries: CustomerInquiryListItem[];
  nestChats: NestConversationListItem[];
  gmailReadMap: Record<string, string>;
  nestReadMap: Record<string, string>;
  nestCloseMap: Record<string, string>;
  nestConfigured: boolean;
}): number {
  let count = 0;

  for (const inquiry of args.inquiries) {
    if (isGmailInquiryUnreadWithMap(inquiry, args.gmailReadMap)) count++;
  }

  if (args.nestConfigured) {
    for (const chat of filterNestCustomerChats(args.nestChats)) {
      const closedAt = args.nestCloseMap[chat.chatId] ?? null;
      if (!nestConversationNeedsAction(chat, closedAt)) continue;
      if (isNestConversationUnreadWithMap(chat, args.nestReadMap)) count++;
    }
  }

  return count;
}

function mergeReadMaps(
  base: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const merged = { ...base };
  for (const [id, incomingTs] of Object.entries(incoming)) {
    const existingTs = merged[id];
    if (!existingTs || new Date(incomingTs).getTime() > new Date(existingTs).getTime()) {
      merged[id] = incomingTs;
    }
  }
  return merged;
}

export function mergeGmailAndNestReadMaps(args: {
  gmailReadMap?: Record<string, string>;
  nestReadMap?: Record<string, string>;
  localGmailReadMap?: Record<string, string>;
  localNestReadMap?: Record<string, string>;
}): { gmailReadMap: Record<string, string>; nestReadMap: Record<string, string> } {
  return {
    gmailReadMap: mergeReadMaps(args.gmailReadMap ?? {}, args.localGmailReadMap ?? {}),
    nestReadMap: mergeReadMaps(args.nestReadMap ?? {}, args.localNestReadMap ?? {}),
  };
}
