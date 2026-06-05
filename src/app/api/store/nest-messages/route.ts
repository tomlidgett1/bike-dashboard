import { NextRequest, NextResponse } from "next/server";
import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
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
    brandKey: resolveStoreNestBrandKey(profile),
  } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const query = new URLSearchParams();
  query.set("conversations", "1");

  const chatId = searchParams.get("chatId")?.trim();
  if (chatId) query.set("chatId", chatId);
  if (searchParams.get("listOnly") === "1") query.set("listOnly", "1");
  if (searchParams.get("threadOnly") === "1") query.set("threadOnly", "1");

  if (searchParams.get("customerSearch") === "1") {
    query.set("customerSearch", "1");
    const q = searchParams.get("q")?.trim();
    if (q) query.set("q", q);
  }

  try {
    const data = await proxyNestBrandPortalRequest(auth.brandKey, {
      method: "GET",
      query,
    });
    return json({ ...data, configured: true, brandKey: auth.brandKey });
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
