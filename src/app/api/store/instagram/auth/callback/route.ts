import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeFacebookCode,
  exchangeForLongLivedUserToken,
  listFacebookPagesWithInstagram,
  markInstagramConnectionError,
  storeInstagramPageConnection,
  storePendingInstagramUserToken,
  validateInstagramOAuthState,
} from "@/lib/instagram/oauth-connection";

export const dynamic = "force-dynamic";

const RETURN_PATH = "/settings/store/instagram";

function redirectWith(baseUrl: string, params: Record<string, string>) {
  const url = new URL(RETURN_PATH, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url.toString());
}

async function resolveOwnerUserId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.account_type === "bicycle_store" && profile?.bicycle_store === true) {
    return userId;
  }

  const { data: membership } = await supabase
    .from("store_memberships")
    .select("stores(owner_user_id)")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const storeRelation = Array.isArray(membership?.stores)
    ? membership?.stores[0]
    : membership?.stores;
  return (storeRelation as { owner_user_id?: string } | null)?.owner_user_id ?? null;
}

/**
 * GET /api/store/instagram/auth/callback
 * Facebook Login → long-lived user token → Page + IG Business account.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const baseUrl = forwardedHost
    ? `${forwardedProto || "https"}://${forwardedHost}`
    : origin;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return redirectWith(baseUrl, {
      instagram: "error",
      reason: errorDescription || error,
    });
  }

  if (!code || !state) {
    return redirectWith(baseUrl, {
      instagram: "error",
      reason: "Missing authorisation code or state.",
    });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return redirectWith(baseUrl, {
        instagram: "error",
        reason: "Session expired. Please log in and try Connect again.",
      });
    }

    const ownerUserId = await resolveOwnerUserId(user.id);
    if (!ownerUserId) {
      return redirectWith(baseUrl, {
        instagram: "error",
        reason: "Store access required.",
      });
    }

    const valid = await validateInstagramOAuthState(ownerUserId, state);
    if (!valid) {
      return redirectWith(baseUrl, {
        instagram: "error",
        reason: "Invalid or expired state. Please try Connect again.",
      });
    }

    const shortLived = await exchangeFacebookCode(code, baseUrl);
    const longLived = await exchangeForLongLivedUserToken(shortLived.accessToken);
    const pages = await listFacebookPagesWithInstagram(longLived.accessToken);

    if (pages.length === 0) {
      await storePendingInstagramUserToken({
        userId: ownerUserId,
        userAccessToken: longLived.accessToken,
        expiresIn: longLived.expiresIn,
      });
      return redirectWith(baseUrl, {
        instagram: "error",
        reason:
          "No Instagram professional account linked to a Facebook Page was found. Convert Instagram to Business/Creator, link a Facebook Page, then try again.",
      });
    }

    if (pages.length === 1) {
      await storeInstagramPageConnection({
        userId: ownerUserId,
        page: pages[0],
        userAccessToken: longLived.accessToken,
        expiresIn: longLived.expiresIn,
      });
      return redirectWith(baseUrl, { instagram: "connected" });
    }

    await storePendingInstagramUserToken({
      userId: ownerUserId,
      userAccessToken: longLived.accessToken,
      expiresIn: longLived.expiresIn,
    });
    return redirectWith(baseUrl, { instagram: "pick_page" });
  } catch (err) {
    console.error("[ig-oauth] callback failed:", err);
    const message =
      err instanceof Error ? err.message : "Could not connect Instagram.";
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ownerUserId = await resolveOwnerUserId(user.id);
        if (ownerUserId) {
          await markInstagramConnectionError(ownerUserId, message);
        }
      }
    } catch {
      // ignore
    }
    return redirectWith(baseUrl, {
      instagram: "error",
      reason: message,
    });
  }
}
