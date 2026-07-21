import { NextRequest, NextResponse } from "next/server";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { loadNestThreadFromSupabase } from "@/lib/nest/inbox-supabase";
import { runStorefrontAgentChat } from "@/lib/nest/storefront-agent";
import {
  persistStorefrontNestTurn,
  storefrontThreadHasStaffReply,
} from "@/lib/nest/persist-storefront-chat";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadStorefrontStore(storeId: string) {
  const supabase = createServiceRoleClient();
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("user_id, business_name, nest_brand_key, bicycle_store, account_type")
    .eq("user_id", storeId)
    .maybeSingle();

  if (profileError) {
    console.error("[marketplace/store/nest-chat] profile load failed:", profileError);
    return { error: json({ error: "Could not load this store." }, 500) } as const;
  }

  if (
    !profile ||
    profile.account_type !== "bicycle_store" ||
    profile.bicycle_store !== true
  ) {
    return { error: json({ error: "Store not found." }, 404) } as const;
  }

  const brandKey = resolveStoreNestBrandKey(profile);
  if (!brandKey) {
    return {
      error: json({ error: "This store is not linked to messaging yet." }, 400),
    } as const;
  }

  return { supabase, profile, brandKey } as const;
}

function assertStorefrontChatId(chatId: string, brandKey: string): boolean {
  return chatId.startsWith(`storefront#${brandKey}#`);
}

/** Poll thread messages so store staff replies appear in the website chatbot. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    if (!isNestMessagingConfigured()) {
      return json({ error: "Messaging is not available right now." }, 503);
    }

    const { storeId } = await context.params;
    if (!storeId || !UUID_RE.test(storeId)) {
      return json({ error: "Invalid store." }, 400);
    }

    const chatId = request.nextUrl.searchParams.get("chatId")?.trim() || "";
    if (!chatId) {
      return json({ error: "Missing chat session." }, 400);
    }

    const loaded = await loadStorefrontStore(storeId);
    if ("error" in loaded) return loaded.error;

    if (!assertStorefrontChatId(chatId, loaded.brandKey)) {
      return json({ error: "Invalid chat session." }, 400);
    }

    const conversation = await loadNestThreadFromSupabase(
      loaded.supabase,
      storeId,
      chatId,
    );

    const messages = (conversation?.messages ?? []).map((message) => ({
      id: String(message.id),
      role: message.role === "user" ? "user" : "assistant",
      text: message.content,
      createdAt: message.createdAt,
      fromStaff:
        message.handle?.startsWith("staff@") === true ||
        message.metadata?.source === "brand_portal_staff_reply",
    }));

    return json({
      chatId,
      messages,
      staffActive: storefrontThreadHasStaffReply(conversation?.messages ?? []),
    });
  } catch (error) {
    console.error("[marketplace/store/nest-chat] GET failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not load chat.",
      },
      500,
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    if (!isNestMessagingConfigured()) {
      return json({ error: "Messaging is not available right now." }, 503);
    }

    const { storeId } = await context.params;
    if (!storeId || !UUID_RE.test(storeId)) {
      return json({ error: "Invalid store." }, 400);
    }

    const loaded = await loadStorefrontStore(storeId);
    if ("error" in loaded) return loaded.error;
    const { supabase, profile, brandKey } = loaded;

    let body: {
      message?: unknown;
      chatId?: unknown;
      history?: unknown;
      browseContext?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "Invalid request." }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "Type a message to continue." }, 400);
    }
    if (message.length > 1000) {
      return json({ error: "Message is too long." }, 400);
    }

    const browseContext =
      body.browseContext && typeof body.browseContext === "object"
        ? (body.browseContext as {
            interestSummary?: string;
            products?: Array<{
              name?: string;
              brand?: string | null;
              category?: string | null;
              price?: number | null;
            }>;
            categories?: string[];
            searches?: string[];
            tabs?: string[];
            path?: string | null;
          })
        : null;

    const existingChatId =
      typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : "";
    if (existingChatId && !assertStorefrontChatId(existingChatId, brandKey)) {
      return json({ error: "Invalid chat session." }, 400);
    }
    const chatId =
      existingChatId ||
      `storefront#${brandKey}#${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const history: Array<{ role: "user" | "assistant"; text: string }> = [];
    if (Array.isArray(body.history)) {
      for (const item of body.history.slice(-12)) {
        if (!item || typeof item !== "object") continue;
        const row = item as { role?: unknown; text?: unknown };
        const role =
          row.role === "assistant" ? "assistant" : row.role === "user" ? "user" : null;
        const text = typeof row.text === "string" ? row.text.trim() : "";
        if (!role || !text) continue;
        history.push({ role, text: text.slice(0, 1000) });
      }
    }

    // Once a teammate has replied in Customer inquiries, stop auto-bot replies
    // and wait for the next staff message (customer UI polls for it).
    let staffActive = false;
    if (existingChatId) {
      const existingThread = await loadNestThreadFromSupabase(
        supabase,
        storeId,
        existingChatId,
      );
      staffActive = storefrontThreadHasStaffReply(existingThread?.messages ?? []);
    }

    let reply: string | null = null;
    if (!staffActive) {
      const result = await runStorefrontAgentChat({
        storeUserId: storeId,
        brandKey,
        storeName: profile.business_name?.trim() || "Store",
        chatId,
        message,
        chatHistory: history,
        browseContext,
      });
      reply = result.reply;
    }

    try {
      await persistStorefrontNestTurn({
        supabase,
        storeUserId: storeId,
        brandKey,
        chatId,
        storeName: profile.business_name?.trim() || "Store",
        userMessage: message,
        assistantReply: reply,
      });
    } catch (persistError) {
      console.error("[marketplace/store/nest-chat] persist failed:", persistError);
    }

    return json({
      chatId,
      reply,
      staffActive,
      storeName: profile.business_name?.trim() || "Store",
    });
  } catch (error) {
    console.error("[marketplace/store/nest-chat] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not send your message.",
      },
      500,
    );
  }
}
