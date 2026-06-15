import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import type { CustomerInquiriesResponse } from "@/lib/customer-inquiries/client";
import type { NestConversationListItem } from "@/lib/nest/types";

export type UnifiedInboxResponse = {
  inquiries?: CustomerInquiryListItem[];
  nestChats?: NestConversationListItem[];
  nestReadMap?: Record<string, string>;
  gmail?: CustomerInquiriesResponse["gmail"];
  nestConfigured?: boolean;
  cached?: boolean;
  refreshed?: boolean;
  error?: string;
};

export async function fetchUnifiedInbox(): Promise<UnifiedInboxResponse> {
  const res = await fetch("/api/store/unified-inbox", { cache: "no-store" });
  const data = (await res.json()) as UnifiedInboxResponse;
  if (!res.ok) {
    throw new Error(data.error || "Could not load inbox.");
  }
  return data;
}

export async function refreshUnifiedInbox(): Promise<UnifiedInboxResponse> {
  const res = await fetch("/api/store/unified-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh" }),
    cache: "no-store",
  });
  const data = (await res.json()) as UnifiedInboxResponse;
  if (!res.ok) {
    throw new Error(data.error || "Could not refresh inbox.");
  }
  return data;
}

export async function markNestReadOnServer(chatId: string, lastReadAt: string): Promise<void> {
  const res = await fetch("/api/store/unified-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark_nest_read", chatId, lastReadAt }),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "Could not mark conversation read.");
  }
}
