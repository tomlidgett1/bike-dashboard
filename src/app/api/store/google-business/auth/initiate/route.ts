import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildGoogleBusinessAuthUrl,
  googleBusinessOAuthConfigured,
} from "@/lib/google/business-oauth-config";
import { generateGoogleBusinessOAuthState } from "@/lib/google/business-oauth-connection";

export const dynamic = "force-dynamic";

/**
 * GET /api/store/google-business/auth/initiate
 * Starts Google Business Profile OAuth (redirects to Google consent).
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const baseUrl = forwardedHost
    ? `${forwardedProto || "https"}://${forwardedHost}`
    : origin;
  const returnPath = "/settings/store/customer-inquiries";

  try {
    if (!googleBusinessOAuthConfigured()) {
      return NextResponse.redirect(
        `${baseUrl}${returnPath}?google_business=error&reason=${encodeURIComponent(
          "Google Business OAuth is not configured. Set GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET.",
        )}`,
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        `${baseUrl}/login?next=${encodeURIComponent(returnPath)}`,
      );
    }

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.account_type !== "bicycle_store" || profile?.bicycle_store !== true) {
      return NextResponse.redirect(
        `${baseUrl}${returnPath}?google_business=error&reason=${encodeURIComponent(
          "Store access required.",
        )}`,
      );
    }

    const state = await generateGoogleBusinessOAuthState(user.id);
    const authUrl = buildGoogleBusinessAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[gbp-oauth] initiate failed:", error);
    return NextResponse.redirect(
      `${baseUrl}${returnPath}?google_business=error&reason=${encodeURIComponent(
        error instanceof Error ? error.message : "Could not start Google Business connection.",
      )}`,
    );
  }
}
