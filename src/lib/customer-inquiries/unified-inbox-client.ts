import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import type { CustomerInquiriesResponse } from "@/lib/customer-inquiries/client";
import { notifyInboxNeedsActionChanged } from "@/lib/customer-inquiries/inbox-needs-action-events";
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
  nestSyncPending?: boolean;
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
  notifyInboxNeedsActionChanged();
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
  notifyInboxNeedsActionChanged();
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
  notifyInboxNeedsActionChanged();
}

const pendingNestReadPosts = new Map<string, { lastReadAt: string; promise: Promise<void> }>();
const pendingGmailReadPosts = new Map<string, { lastReadAt: string; promise: Promise<void> }>();

async function postMarkReadWithRetry(
  body: Record<string, unknown>,
  errorLabel: string,
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("/api/store/unified-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (res.ok) return;
      const data = (await res.json()) as { error?: string };
      lastError = new Error(data.error || errorLabel);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(errorLabel);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError ?? new Error(errorLabel);
}

function toMillis(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function markNestReadOnServer(chatId: string, lastReadAt: string): Promise<void> {
  const pending = pendingNestReadPosts.get(chatId);
  if (pending && toMillis(pending.lastReadAt) >= toMillis(lastReadAt)) {
    return pending.promise;
  }

  const request = postMarkReadWithRetry(
    { action: "mark_nest_read", chatId, lastReadAt },
    "Could not mark conversation read.",
  ).finally(() => {
    const current = pendingNestReadPosts.get(chatId);
    if (current?.promise === request) {
      pendingNestReadPosts.delete(chatId);
    }
  });

  pendingNestReadPosts.set(chatId, { lastReadAt, promise: request });
  return request;
}

export async function markGmailInquiryReadOnServer(
  inquiryId: string,
  lastReadAt: string,
): Promise<void> {
  const pending = pendingGmailReadPosts.get(inquiryId);
  if (pending && toMillis(pending.lastReadAt) >= toMillis(lastReadAt)) {
    return pending.promise;
  }

  const request = postMarkReadWithRetry(
    { action: "mark_gmail_read", inquiryId, lastReadAt },
    "Could not mark enquiry read.",
  ).finally(() => {
    const current = pendingGmailReadPosts.get(inquiryId);
    if (current?.promise === request) {
      pendingGmailReadPosts.delete(inquiryId);
    }
  });

  pendingGmailReadPosts.set(inquiryId, { lastReadAt, promise: request });
  return request;
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
