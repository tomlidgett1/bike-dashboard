import { inquiryNeedsReplyFromRow } from "@/lib/customer-inquiries/thread";
import type { CustomerInquiryListItem, CustomerInquiryRow } from "@/lib/customer-inquiries/types";
import {
  filterNestCustomerChats,
  nestConversationNeedsAction,
  type NestConversationListItem,
} from "@/lib/nest/types";

export function inquiryListItemNeedsAction(
  row: CustomerInquiryRow | CustomerInquiryListItem,
): boolean {
  if ("needs_action" in row && typeof row.needs_action === "boolean") {
    return row.needs_action;
  }
  return inquiryNeedsReplyFromRow(row);
}

/** Same needs-action total as the unified inbox "Needs Action" tab. */
export function countUnifiedInboxNeedsAction(args: {
  inquiries: Array<CustomerInquiryRow | CustomerInquiryListItem>;
  nestChats: NestConversationListItem[];
  nestCloseMap: Record<string, string>;
  nestConfigured: boolean;
}): number {
  let count = 0;

  for (const inquiry of args.inquiries) {
    if (inquiryListItemNeedsAction(inquiry)) count++;
  }

  if (args.nestConfigured) {
    for (const chat of filterNestCustomerChats(args.nestChats)) {
      const closedAt = args.nestCloseMap[chat.chatId] ?? null;
      if (nestConversationNeedsAction(chat, closedAt)) count++;
    }
  }

  return count;
}
