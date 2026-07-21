import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildInstagramAuthUrl,
  instagramOAuthConfigured,
} from "@/lib/instagram/oauth-config";
import { generateInstagramOAuthState } from "@/lib/instagram/oauth-connection";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";

export const dynamic = "force-dynamic";

const RETURN_PATH = "/settings/store/instagram";

/**
 * GET /api/store/instagram/auth/initiate
 * Starts Instagram Business Login OAuth.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const baseUrl = forwardedHost
    ? `${forwardedProto || "https"}://${forwardedHost}`
    : origin;

  try {
    if (!instagramOAuthConfigured()) {
      return NextResponse.redirect(
        `${baseUrl}${RETURN_PATH}?instagram=error&reason=${encodeURIComponent(
          "Instagram OAuth is not configured. Set INSTAGRAM_APP_ID (Meta App ID) and INSTAGRAM_APP_SECRET (App Secret from Settings → Basic).",
        )}`,
      );
    }

    const auth = await requireStoreUser();
    if ("error" in auth) {
      return NextResponse.redirect(
        `${baseUrl}/login?next=${encodeURIComponent(RETURN_PATH)}`,
      );
    }

    // Ensure session cookie is present for the callback round-trip.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(
        `${baseUrl}/login?next=${encodeURIComponent(RETURN_PATH)}`,
      );
    }

    const state = await generateInstagramOAuthState(auth.user.id);
    // Instagram Login scopes (instagram_business_*). Use request origin for redirect_uri.
    const authUrl = buildInstagramAuthUrl(state, baseUrl);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[ig-oauth] initiate failed:", error);
    return NextResponse.redirect(
      `${baseUrl}${RETURN_PATH}?instagram=error&reason=${encodeURIComponent(
        error instanceof Error ? error.message : "Could not start Instagram connection.",
      )}`,
    );
  }
}
