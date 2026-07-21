import { NextRequest, NextResponse } from "next/server";
import {
  sendLinqReaction,
  type LinqReactionOperation,
  type LinqReactionType,
} from "@/lib/nest/linq-outbound-media";
import {
  loadNestThreadFromSupabase,
  setNestMessageStoreLiked,
} from "@/lib/nest/inbox-supabase";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { syncNestThreadFromPortal } from "@/lib/store/unified-inbox-sync";
import { createClient } from "@/lib/supabase/server";
import type { NestConversationMessage } from "@/lib/nest/types";

export const dynamic = "force-dynamic";

const REACTION_TYPES = new Set<LinqReactionType>([
  "love",
  "like",
  "dislike",
  "laugh",
  "emphasize",
  "question",
  "custom",
]);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function providerMessageIdFromMessage(message: NestConversationMessage): string | null {
  const meta = message.metadata ?? {};
  for (const key of ["linq_provider_message_id", "provider_message_id", "providerMessageId"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: json({ error: "Unauthorised" }, 401) } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("account_type, bicycle_store, nest_brand_key, business_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: json({ error: "Could not load store profile." }, 500) } as const;
  }

  if (profile?.account_type !== "bicycle_store" || profile?.bicycle_store !== true) {
    return { error: json({ error: "Store access required." }, 403) } as const;
  }

  if (!isNestMessagingConfigured()) {
    return {
      error: json(
        {
          error: "Nest messaging is not configured yet.",
          configured: false,
        },
        503,
      ),
    } as const;
  }

  return {
    supabase,
    userId: user.id,
    brandKey: resolveStoreNestBrandKey(profile),
  } as const;
}

async function resolveProviderMessageId(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  brandKey: string;
  chatId: string;
  nestMessageId: number;
  providerMessageId?: string | null;
}): Promise<string | null> {
  const direct = params.providerMessageId?.trim();
  if (direct) return direct;

  const cached = await loadNestThreadFromSupabase(
    params.supabase,
    params.userId,
    params.chatId,
  );
  const cachedMatch = cached?.messages.find((message) => message.id === params.nestMessageId);
  const fromCache = cachedMatch ? providerMessageIdFromMessage(cachedMatch) : null;
  if (fromCache) return fromCache;

  try {
    await syncNestThreadFromPortal(
      params.supabase,
      params.userId,
      params.brandKey,
      params.chatId,
    );
  } catch (error) {
    console.error("[nest-message-reaction] thread sync failed:", error);
  }

  const refreshed = await loadNestThreadFromSupabase(
    params.supabase,
    params.userId,
    params.chatId,
  );
  const refreshedMatch = refreshed?.messages.find(
    (message) => message.id === params.nestMessageId,
  );
  return refreshedMatch ? providerMessageIdFromMessage(refreshedMatch) : null;
}

/**
 * Like (or otherwise react to) a Nest / iMessage bubble via Linq.
 * POST /api/store/nest-message-reaction
 * Body: { chatId, nestMessageId, type?: "like", operation?: "add"|"remove", providerMessageId? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  const nestMessageId =
    typeof body.nestMessageId === "number"
      ? body.nestMessageId
      : typeof body.nestMessageId === "string"
        ? Number(body.nestMessageId)
        : NaN;
  const typeRaw = typeof body.type === "string" ? body.type.trim() : "like";
  const operationRaw =
    typeof body.operation === "string" ? body.operation.trim() : "add";
  const providerMessageIdHint =
    typeof body.providerMessageId === "string" ? body.providerMessageId.trim() : null;
  const customEmoji =
    typeof body.customEmoji === "string" ? body.customEmoji.trim() : undefined;

  if (!chatId) return json({ error: "chatId is required." }, 400);
  if (!Number.isFinite(nestMessageId)) {
    return json({ error: "nestMessageId is required." }, 400);
  }

  const type = typeRaw as LinqReactionType;
  if (!REACTION_TYPES.has(type)) {
    return json({ error: "Unsupported reaction type." }, 400);
  }

  const operation = operationRaw as LinqReactionOperation;
  if (operation !== "add" && operation !== "remove") {
    return json({ error: "operation must be add or remove." }, 400);
  }

  if (type === "custom" && !customEmoji) {
    return json({ error: "customEmoji is required when type is custom." }, 400);
  }

  const providerMessageId = await resolveProviderMessageId({
    supabase: auth.supabase,
    userId: auth.userId,
    brandKey: auth.brandKey,
    chatId,
    nestMessageId,
    providerMessageId: providerMessageIdHint,
  });

  if (!providerMessageId) {
    return json(
      {
        error:
          "Could not find the Linq message id for this bubble. Refresh the conversation and try again.",
      },
      404,
    );
  }

  try {
    await sendLinqReaction({
      messageId: providerMessageId,
      type,
      operation,
      customEmoji,
    });
  } catch (error) {
    console.error("[nest-message-reaction] Linq failed:", error);
    return json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Could not send reaction.",
      },
      502,
    );
  }

  // Persist inbox "liked" state for the default thumbs-up control so refresh
  // and portal re-sync keep the UI in sync with what we sent via Linq.
  if (type === "like") {
    let persisted = await setNestMessageStoreLiked(
      auth.supabase,
      auth.userId,
      chatId,
      nestMessageId,
      operation === "add",
    );
    if (!persisted) {
      try {
        await syncNestThreadFromPortal(
          auth.supabase,
          auth.userId,
          auth.brandKey,
          chatId,
        );
      } catch (error) {
        console.error("[nest-message-reaction] post-reaction sync failed:", error);
      }
      persisted = await setNestMessageStoreLiked(
        auth.supabase,
        auth.userId,
        chatId,
        nestMessageId,
        operation === "add",
      );
    }
    if (!persisted) {
      console.warn(
        "[nest-message-reaction] Linq reaction sent but store_liked was not persisted",
        { chatId, nestMessageId },
      );
    }
  }

  return json({
    ok: true,
    chatId,
    nestMessageId,
    providerMessageId,
    type,
    operation,
    storeLiked: type === "like" ? operation === "add" : undefined,
  });
}
