import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import type { MissingBrandProduct } from "@/lib/missing-brands/types";
import type { MissingCategoryProduct } from "@/lib/missing-categories/types";
import type { NestConversationListItem } from "@/lib/nest/types";
import { nestConversationNeedsAction } from "@/lib/nest/types";

/** Matches the simple Actions table catalog fetch limit. */
export const OPEN_ACTIONS_CATALOG_LIMIT = 30;

export function nestChatNeedsStoreResponse(
  chat: NestConversationListItem,
  nestCloseMap: Record<string, string>,
): boolean {
  return nestConversationNeedsAction(chat, nestCloseMap[chat.chatId] ?? null);
}

export function countOpenStoreActions({
  enquiries,
  nestChats,
  brandProducts,
  categoryProducts,
  nestCloseMap,
}: {
  enquiries: CustomerInquiryListItem[];
  nestChats: NestConversationListItem[];
  brandProducts: MissingBrandProduct[];
  categoryProducts: MissingCategoryProduct[];
  nestCloseMap: Record<string, string>;
}): number {
  let count = enquiries.length;

  for (const chat of nestChats) {
    if (nestChatNeedsStoreResponse(chat, nestCloseMap)) count += 1;
  }

  return count + brandProducts.length + categoryProducts.length;
}

export function formatOpenActionsBadgeCount(count: number): string | undefined {
  if (count <= 0) return undefined;
  return String(count);
}
