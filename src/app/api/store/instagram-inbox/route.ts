import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  fetchInstagramConversations,
  fetchInstagramProfile,
  isComposioConfigured,
  listInstagramConnections,
  sendInstagramTextMessage,
} from "@/lib/composio/instagram";
import type {
  InstagramConversationItem,
  InstagramInboxAccount,
  InstagramInboxResponse,
} from "@/lib/customer-inquiries/instagram-types";

export const dynamic = "force-dynamic";

/** Instagram Graph API calls are slow and rate-limited — serve a short-lived
 * per-user snapshot between the client's 30s polls. */
const INBOX_CACHE_TTL_MS = 60 * 1000;
const inboxCache = new Map<
  string,
  { payload: InstagramInboxResponse; fetchedAt: number }
>();

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function buildInboxPayload(userId: string): Promise<InstagramInboxResponse> {
  if (!isComposioConfigured()) {
    return { configured: false, connected: false, accounts: [], conversations: [] };
  }

  const connections = await listInstagramConnections(userId);
  if (connections.length === 0) {
    return { configured: true, connected: false, accounts: [], conversations: [] };
  }

  const accounts: InstagramInboxAccount[] = [];
  const conversations: InstagramConversationItem[] = [];

  await Promise.all(
    connections.map(async (connection) => {
      const [profile, items] = await Promise.all([
        fetchInstagramProfile(userId, connection.id).catch(() => ({
          id: null,
          username: null,
        })),
        fetchInstagramConversations(userId, connection.id).catch((error) => {
          console.error("[instagram-inbox] conversations failed:", connection.id, error);
          return [] as InstagramConversationItem[];
        }),
      ]);
      accounts.push({
        id: connection.id,
        label: profile.username ? `@${profile.username}` : connection.label,
        username: profile.username,
      });
      conversations.push(...items);
    }),
  );

  conversations.sort((a, b) => {
    const aMs = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bMs = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return bMs - aMs;
  });

  return { configured: true, connected: true, accounts, conversations };
}

async function resolveInboxPayload(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<InstagramInboxResponse> {
  if (!options?.forceRefresh) {
    const cached = inboxCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < INBOX_CACHE_TTL_MS) {
      return { ...cached.payload, cached: true };
    }
  }

  const payload = await buildInboxPayload(userId);
  inboxCache.set(userId, { payload, fetchedAt: Date.now() });
  return payload;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const payload = await resolveInboxPayload(auth.user.id, { forceRefresh });
    return json(payload);
  } catch (error) {
    console.error("[instagram-inbox] GET failed:", error);
    return json(
      { error: error instanceof Error ? error.message : "Could not load Instagram inbox." },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = (await request.json()) as {
      action?: string;
      conversation_id?: string;
      connected_account_id?: string;
      recipient_id?: string;
      business_messaging_id?: string;
      text?: string;
    };
    const action = String(body.action ?? "").trim();

    if (action === "refresh") {
      const payload = await resolveInboxPayload(auth.user.id, { forceRefresh: true });
      return json(payload);
    }

    if (action === "send") {
      const connectedAccountId = String(body.connected_account_id ?? "").trim();
      const recipientId = String(body.recipient_id ?? "").trim();
      const text = String(body.text ?? "").trim();
      if (!connectedAccountId || !recipientId || !text) {
        return json(
          { error: "connected_account_id, recipient_id and text are required." },
          400,
        );
      }

      const result = await sendInstagramTextMessage(auth.user.id, {
        connectedAccountId,
        recipientId,
        text,
        businessMessagingId: String(body.business_messaging_id ?? "").trim() || null,
      });

      // Fold the sent message into the cached snapshot so the next poll
      // doesn't briefly drop the optimistic message from the thread.
      const cached = inboxCache.get(auth.user.id);
      const conversationId = String(body.conversation_id ?? "").trim();
      const sentAt = new Date().toISOString();
      if (cached && conversationId) {
        const conversations = cached.payload.conversations.map((conversation) =>
          conversation.conversation_id === conversationId
            ? {
                ...conversation,
                preview: text.replace(/\s+/g, " ").slice(0, 180),
                preview_role: "shop" as const,
                updated_at: sentAt,
                messages: [
                  ...conversation.messages,
                  {
                    id: result.message_id ?? `local:${Date.now()}`,
                    role: "shop" as const,
                    text,
                    from_id: null,
                    from_username: null,
                    from_name: null,
                    to_ids: [],
                    created_at: sentAt,
                    has_attachments: false,
                  },
                ],
              }
            : conversation,
        );
        inboxCache.set(auth.user.id, {
          payload: { ...cached.payload, conversations },
          fetchedAt: cached.fetchedAt,
        });
      }

      return json({ ok: true, message_id: result.message_id, sent_at: sentAt });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("[instagram-inbox] POST failed:", error);
    return json(
      { error: error instanceof Error ? error.message : "Could not update Instagram inbox." },
      500,
    );
  }
}
