import type { InstagramInboxResponse } from "@/lib/customer-inquiries/instagram-types";

export async function fetchInstagramInbox(options?: {
  forceRefresh?: boolean;
}): Promise<InstagramInboxResponse> {
  const url = options?.forceRefresh
    ? "/api/store/instagram-inbox?refresh=1"
    : "/api/store/instagram-inbox";
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as InstagramInboxResponse;
  if (!res.ok) {
    throw new Error(data.error || "Could not load Instagram messages.");
  }
  return data;
}

export async function sendInstagramReplyOnServer(payload: {
  conversationId: string;
  connectedAccountId: string;
  recipientId: string;
  text: string;
}): Promise<{ message_id: string | null; sent_at: string }> {
  const res = await fetch("/api/store/instagram-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "send",
      conversation_id: payload.conversationId,
      connected_account_id: payload.connectedAccountId,
      recipient_id: payload.recipientId,
      text: payload.text,
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    message_id?: string | null;
    sent_at?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "Could not send Instagram message.");
  }
  return {
    message_id: data.message_id ?? null,
    sent_at: data.sent_at ?? new Date().toISOString(),
  };
}

export async function mintInstagramConnectUrl(): Promise<string> {
  const res = await fetch("/api/composio/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolkit: "instagram" }),
    cache: "no-store",
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Could not start Instagram connection.");
  }
  return data.url;
}
