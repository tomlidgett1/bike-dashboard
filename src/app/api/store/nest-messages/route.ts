import { NextRequest, NextResponse } from "next/server";
import {
  enrichNestChatsWithLightspeed,
  enrichNestConversationWithLightspeed,
} from "@/lib/nest/enrich-chats-with-lightspeed";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import {
  getServerNestThreadCache,
  invalidateServerNestThreadCache,
  setServerNestThreadCache,
} from "@/lib/nest/server-thread-cache";
import type { NestConversationDetail, NestConversationListItem } from "@/lib/nest/types";
import { searchLightspeedCustomersForNest } from "@/lib/services/lightspeed/customer-search";
import { isLightspeedApiAvailable } from "@/lib/services/lightspeed/token-manager";
import { createClient } from "@/lib/supabase/server";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
    userId: user.id,
    brandKey: resolveStoreNestBrandKey(profile),
  } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);

  if (searchParams.get("customerSearch") === "1") {
    const q = searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return json({ customers: [], configured: true, lightspeedConnected: true });
    }

    const lightspeedConnected = await isLightspeedApiAvailable(auth.userId);
    if (!lightspeedConnected) {
      return json({
        customers: [],
        configured: true,
        lightspeedConnected: false,
        error: "Connect Lightspeed to search customers.",
      });
    }

    try {
      const customers = await searchLightspeedCustomersForNest(auth.userId, q);
      return json({
        customers,
        configured: true,
        lightspeedConnected: true,
      });
    } catch (error) {
      console.error("[store-nest-messages] customer search failed:", error);
      return json(
        {
          customers: [],
          configured: true,
          lightspeedConnected: true,
          error: error instanceof Error ? error.message : "Could not search Lightspeed customers.",
        },
        502,
      );
    }
  }

  const query = new URLSearchParams();
  query.set("conversations", "1");

  const chatId = searchParams.get("chatId")?.trim();
  if (chatId) query.set("chatId", chatId);
  const listOnly = searchParams.get("listOnly") === "1";
  const threadOnly = searchParams.get("threadOnly") === "1";
  if (listOnly) query.set("listOnly", "1");
  if (threadOnly) query.set("threadOnly", "1");

  if (threadOnly && chatId) {
    const cachedThread = getServerNestThreadCache(auth.brandKey, chatId);
    if (cachedThread) {
      return json({
        chats: [],
        selectedChatId: chatId,
        conversation: cachedThread,
        configured: true,
        brandKey: auth.brandKey,
        cached: true,
      });
    }
  }

  try {
    const data = await proxyNestBrandPortalRequest(auth.brandKey, {
      method: "GET",
      query,
    });

    let lightspeedConnected = await isLightspeedApiAvailable(auth.userId);
    if (lightspeedConnected && !listOnly) {
      try {
        if (Array.isArray(data.chats) && !threadOnly) {
          data.chats = await enrichNestChatsWithLightspeed(
            auth.userId,
            data.chats as NestConversationListItem[],
          );
        }
        if (
          data.conversation &&
          typeof data.conversation === "object"
        ) {
          data.conversation = await enrichNestConversationWithLightspeed(
            auth.userId,
            data.conversation as NestConversationDetail,
          );
        }
      } catch (enrichError) {
        console.error("[store-nest-messages] Lightspeed name enrichment failed:", enrichError);
        lightspeedConnected = false;
      }
    }

    if (threadOnly && chatId && data.conversation && typeof data.conversation === "object") {
      setServerNestThreadCache(
        auth.brandKey,
        chatId,
        data.conversation as NestConversationDetail,
      );
    }

    return json({ ...data, configured: true, brandKey: auth.brandKey, lightspeedConnected });
  } catch (error) {
    console.error("[store-nest-messages] GET failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not load Nest messages.",
        configured: true,
      },
      502,
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "send_message" && action !== "start_message") {
    return json({ error: "Unsupported action." }, 400);
  }

  try {
    const data = await proxyNestBrandPortalRequest(auth.brandKey, {
      method: "POST",
      body,
    });

    const chatId =
      typeof body.chatId === "string"
        ? body.chatId.trim()
        : typeof data.chatId === "string"
          ? data.chatId.trim()
          : "";
    if (chatId) {
      invalidateServerNestThreadCache(auth.brandKey, chatId);
    }

    return json({ ...data, configured: true, brandKey: auth.brandKey });
  } catch (error) {
    console.error("[store-nest-messages] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not send Nest message.",
        configured: true,
      },
      502,
    );
  }
}
