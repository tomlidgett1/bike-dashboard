import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GOOGLE_BUSINESS_OAUTH,
  getGoogleBusinessOAuthCredentials,
} from "@/lib/google/business-oauth-config";
import {
  selectGoogleBusinessLocation,
  storeGoogleBusinessTokens,
  validateGoogleBusinessOAuthState,
} from "@/lib/google/business-oauth-connection";
import {
  fetchGoogleUserInfo,
  listAllGoogleBusinessLocations,
} from "@/lib/google/business-profile-accounts";

export const dynamic = "force-dynamic";

const RETURN_PATH = "/settings/store/customer-inquiries";

function redirectWith(
  baseUrl: string,
  params: Record<string, string>,
) {
  const url = new URL(RETURN_PATH, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url.toString());
}

/**
 * GET /api/store/google-business/auth/callback
 * Exchanges the auth code, stores tokens, auto-selects location when only one.
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
      google_business: "error",
      reason: errorDescription || error,
    });
  }

  if (!code || !state) {
    return redirectWith(baseUrl, {
      google_business: "error",
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
        google_business: "error",
        reason: "Session expired. Please log in and try again.",
      });
    }

    const valid = await validateGoogleBusinessOAuthState(user.id, state);
    if (!valid) {
      return redirectWith(baseUrl, {
        google_business: "error",
        reason: "Invalid or expired state. Please try Connect again.",
      });
    }

    const { clientId, clientSecret, redirectUri } = getGoogleBusinessOAuthCredentials();
    const tokenRes = await fetch(GOOGLE_BUSINESS_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const body = (await tokenRes.text()).slice(0, 300);
      console.error("[gbp-oauth] token exchange failed:", body);
      return redirectWith(baseUrl, {
        google_business: "error",
        reason: "Could not complete Google authorisation. Please try again.",
      });
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!tokenData.access_token) {
      return redirectWith(baseUrl, {
        google_business: "error",
        reason: "Google did not return an access token.",
      });
    }

    const userInfo = await fetchGoogleUserInfo(tokenData.access_token);
    await storeGoogleBusinessTokens({
      userId: user.id,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresIn: tokenData.expires_in ?? 3600,
      googleEmail: userInfo.email,
      googleName: userInfo.name,
      scopes: tokenData.scope?.split(/\s+/).filter(Boolean),
    });

    // Auto-select when the account has exactly one location.
    try {
      const locations = await listAllGoogleBusinessLocations(tokenData.access_token);
      if (locations.length === 1) {
        const only = locations[0];
        await selectGoogleBusinessLocation({
          userId: user.id,
          accountId: only.accountId,
          locationId: only.locationId,
          locationName: only.title,
          reviewUrl: only.reviewUrl,
          mapsUri: only.mapsUri,
          placeId: only.placeId,
        });
        return redirectWith(baseUrl, { google_business: "connected" });
      }
      if (locations.length === 0) {
        return redirectWith(baseUrl, {
          google_business: "error",
          reason:
            "No Google Business locations found on this account. Confirm you manage a listing, then try again.",
        });
      }
      return redirectWith(baseUrl, { google_business: "pick_location" });
    } catch (listError) {
      console.error("[gbp-oauth] list locations failed:", listError);
      return redirectWith(baseUrl, {
        google_business: "pick_location",
        reason:
          listError instanceof Error
            ? listError.message
            : "Connected — choose a location to finish setup.",
      });
    }
  } catch (error) {
    console.error("[gbp-oauth] callback failed:", error);
    return redirectWith(baseUrl, {
      google_business: "error",
      reason:
        error instanceof Error ? error.message : "Could not connect Google Business.",
    });
  }
}
