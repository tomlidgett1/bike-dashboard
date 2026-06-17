import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import type { CustomerInquiriesResponse } from "@/lib/customer-inquiries/client";
import type { NestConversationListItem } from "@/lib/nest/types";

export type UnifiedInboxResponse = {
  inquiries?: CustomerInquiryListItem[];
  nestChats?: NestConversationListItem[];
  nestReadMap?: Record<string, string>;
  gmailReadMap?: Record<string, string>;
  nestCloseMap?: Record<string, string>;
  closedGmailIds?: string[];
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

const REFRESH_CLIENT_TIMEOUT_MS = 35_000;

export async function refreshUnifiedInbox(): Promise<UnifiedInboxResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REFRESH_CLIENT_TIMEOUT_MS);

  try {
    const res = await fetch("/api/store/unified-inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = (await res.json()) as UnifiedInboxResponse;
    if (!res.ok) {
      throw new Error(data.error || "Could not refresh inbox.");
    }
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Refresh timed out. Try again in a moment.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function closeInboxCases(payload: {
  gmailIds?: string[];
  nestCloses?: Array<{ chatId: string; closedAt: string }>;
}): Promise<UnifiedInboxResponse> {
  const res = await fetch("/api/store/unified-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close_cases", ...payload }),
    cache: "no-store",
  });
  const data = (await res.json()) as UnifiedInboxResponse;
  if (!res.ok) {
    throw new Error(data.error || "Could not close cases.");
  }
  return data;
}

export async function closeNestCaseOnServer(
  chatId: string,
  closedAt: string,
): Promise<void> {
  const res = await fetch("/api/store/unified-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close_nest_case", chatId, closedAt }),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "Could not close conversation.");
  }
}

export async function reopenNestCaseOnServer(chatId: string): Promise<void> {
  const res = await fetch("/api/store/unified-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reopen_nest_case", chatId }),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "Could not reopen conversation.");
  }
}

const pendingNestReadPosts = new Map<string, Promise<void>>();

export async function markNestReadOnServer(chatId: string, lastReadAt: string): Promise<void> {
  const key = `${chatId}:${lastReadAt}`;
  const pending = pendingNestReadPosts.get(key);
  if (pending) return pending;

  const request = (async () => {
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
  })().finally(() => {
    pendingNestReadPosts.delete(key);
  });

  pendingNestReadPosts.set(key, request);
  return request;
}

export async function markGmailInquiryReadOnServer(
  inquiryId: string,
  lastReadAt: string,
): Promise<void> {
  const res = await fetch("/api/store/unified-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark_gmail_read", inquiryId, lastReadAt }),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "Could not mark enquiry read.");
  }
}

export async function markAllInboxReadOnServer(payload: {
  gmailReads?: Array<{ inquiryId: string; lastReadAt: string }>;
  nestReads?: Array<{ chatId: string; lastReadAt: string }>;
}): Promise<void> {
  const res = await fetch("/api/store/unified-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark_all_read", ...payload }),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "Could not mark all enquiries read.");
  }
}

export async function fetchLightspeedContextByPhone(
  phone: string,
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/store/lightspeed-customer-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
    cache: "no-store",
  });
  const data = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not load Lightspeed customer.");
  }
  return data;
}
