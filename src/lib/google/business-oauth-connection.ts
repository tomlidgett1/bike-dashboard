/**
 * Per-store Google Business Profile OAuth connection (Lightspeed-style).
 * Tokens encrypted with TOKEN_ENCRYPTION_KEY via the shared Lightspeed helpers.
 */

import crypto from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  decryptToken,
  encryptToken,
} from "@/lib/services/lightspeed/token-manager";
import { NEST_GOOGLE_REVIEW_URL_PREFS_KEY } from "@/lib/nest/compose-quick-actions";
import {
  GOOGLE_BUSINESS_OAUTH,
  getGoogleBusinessOAuthCredentials,
  googleBusinessOAuthConfigured,
} from "@/lib/google/business-oauth-config";

export type GoogleBusinessConnectionStatus =
  | "connected"
  | "pending_location"
  | "disconnected"
  | "error"
  | "expired";

export type GoogleBusinessConnectionRow = {
  id: string;
  user_id: string;
  status: GoogleBusinessConnectionStatus;
  google_email: string | null;
  google_name: string | null;
  gbp_account_id: string | null;
  gbp_location_id: string | null;
  gbp_account_name: string | null;
  gbp_location_name: string | null;
  gbp_review_url: string | null;
  gbp_maps_uri: string | null;
  gbp_place_id: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_token_refresh_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  error_count: number | null;
};

export type GoogleBusinessPublicStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  needsLocation: boolean;
  status: GoogleBusinessConnectionStatus | "not_configured";
  googleEmail: string | null;
  googleName: string | null;
  accountId: string | null;
  locationId: string | null;
  accountName: string | null;
  locationName: string | null;
  reviewUrl: string | null;
  mapsUri: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

function admin() {
  return createServiceRoleClient();
}

export async function getGoogleBusinessConnection(
  userId: string,
): Promise<GoogleBusinessConnectionRow | null> {
  const { data, error } = await admin()
    .from("store_google_business_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[gbp-oauth] get connection failed:", error.message);
    return null;
  }
  return (data as GoogleBusinessConnectionRow | null) ?? null;
}

export function toPublicGoogleBusinessStatus(
  row: GoogleBusinessConnectionRow | null,
): GoogleBusinessPublicStatus {
  const oauthConfigured = googleBusinessOAuthConfigured();
  if (!oauthConfigured && !row) {
    return {
      oauthConfigured: false,
      connected: false,
      needsLocation: false,
      status: "not_configured",
      googleEmail: null,
      googleName: null,
      accountId: null,
      locationId: null,
      accountName: null,
      locationName: null,
      reviewUrl: null,
      mapsUri: null,
      connectedAt: null,
      lastError: null,
    };
  }

  const status = row?.status ?? "disconnected";
  const hasLocation = Boolean(row?.gbp_account_id && row?.gbp_location_id);
  const connected = status === "connected" && hasLocation;
  const needsLocation =
    status === "pending_location" ||
    (Boolean(row?.refresh_token_encrypted) && !hasLocation && status !== "disconnected");

  return {
    oauthConfigured,
    connected,
    needsLocation,
    status: !oauthConfigured && status === "disconnected" ? "not_configured" : status,
    googleEmail: row?.google_email ?? null,
    googleName: row?.google_name ?? null,
    accountId: row?.gbp_account_id ?? null,
    locationId: row?.gbp_location_id ?? null,
    accountName: row?.gbp_account_name ?? null,
    locationName: row?.gbp_location_name ?? null,
    reviewUrl: row?.gbp_review_url ?? null,
    mapsUri: row?.gbp_maps_uri ?? null,
    connectedAt: row?.connected_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

export async function generateGoogleBusinessOAuthState(userId: string): Promise<string> {
  const state = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + GOOGLE_BUSINESS_OAUTH.STATE_TOKEN_EXPIRY_MS,
  ).toISOString();

  const { error } = await admin()
    .from("store_google_business_connections")
    .upsert(
      {
        user_id: userId,
        status: "disconnected",
        oauth_state: state,
        oauth_state_expires_at: expiresAt,
        last_error: null,
        last_error_at: null,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(`Could not store OAuth state: ${error.message}`);
  }
  return state;
}

export async function validateGoogleBusinessOAuthState(
  userId: string,
  state: string,
): Promise<boolean> {
  const row = await getGoogleBusinessConnection(userId);
  if (!row?.oauth_state || !row.oauth_state_expires_at) return false;
  if (row.oauth_state !== state) return false;
  if (new Date(row.oauth_state_expires_at).getTime() < Date.now()) return false;
  return true;
}

export async function storeGoogleBusinessTokens(payload: {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  googleEmail?: string | null;
  googleName?: string | null;
  scopes?: string[];
}): Promise<GoogleBusinessConnectionRow> {
  const existing = await getGoogleBusinessConnection(payload.userId);
  const refreshEncrypted = payload.refreshToken
    ? encryptToken(payload.refreshToken)
    : existing?.refresh_token_encrypted ?? null;

  if (!refreshEncrypted) {
    throw new Error(
      "Google did not return a refresh token. Disconnect the app in your Google Account permissions and try Connect again.",
    );
  }

  const now = new Date().toISOString();
  const tokenExpiresAt = new Date(Date.now() + payload.expiresIn * 1000).toISOString();
  const hasLocation = Boolean(existing?.gbp_account_id && existing?.gbp_location_id);

  const { data, error } = await admin()
    .from("store_google_business_connections")
    .upsert(
      {
        user_id: payload.userId,
        status: hasLocation ? "connected" : "pending_location",
        google_email: payload.googleEmail ?? existing?.google_email ?? null,
        google_name: payload.googleName ?? existing?.google_name ?? null,
        access_token_encrypted: encryptToken(payload.accessToken),
        refresh_token_encrypted: refreshEncrypted,
        token_expires_at: tokenExpiresAt,
        scopes: payload.scopes ?? [GOOGLE_BUSINESS_OAUTH.SCOPE],
        oauth_state: null,
        oauth_state_expires_at: null,
        connected_at: existing?.connected_at ?? now,
        disconnected_at: null,
        last_token_refresh_at: now,
        last_error: null,
        last_error_at: null,
        error_count: 0,
        // Keep previously selected location across reconnects when still present.
        gbp_account_id: existing?.gbp_account_id ?? null,
        gbp_location_id: existing?.gbp_location_id ?? null,
        gbp_account_name: existing?.gbp_account_name ?? null,
        gbp_location_name: existing?.gbp_location_name ?? null,
        gbp_review_url: existing?.gbp_review_url ?? null,
        gbp_maps_uri: existing?.gbp_maps_uri ?? null,
        gbp_place_id: existing?.gbp_place_id ?? null,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Could not store Google Business tokens: ${error?.message ?? "unknown"}`);
  }
  return data as GoogleBusinessConnectionRow;
}

async function refreshAccessToken(
  userId: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
  const { clientId, clientSecret } = getGoogleBusinessOAuthCredentials();
  const res = await fetch(GOOGLE_BUSINESS_OAUTH.TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    await admin()
      .from("store_google_business_connections")
      .update({
        status: "error",
        last_error: `Token refresh failed (${res.status}): ${body}`,
        last_error_at: new Date().toISOString(),
        error_count: 1,
      })
      .eq("user_id", userId);
    throw new Error(`Google token refresh failed (${res.status}). Reconnect Google Business.`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access_token.");
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    refreshToken: data.refresh_token,
  };
}

/**
 * Returns a usable access token for the store's connected Google Business account,
 * refreshing when close to expiry.
 */
export async function getStoreGoogleBusinessAccessToken(
  userId: string,
): Promise<{
  accessToken: string;
  accountId: string;
  locationId: string;
  connection: GoogleBusinessConnectionRow;
} | null> {
  const row = await getGoogleBusinessConnection(userId);
  if (!row?.refresh_token_encrypted) return null;
  if (!row.gbp_account_id || !row.gbp_location_id) return null;
  if (row.status === "disconnected") return null;

  let accessToken: string | null = null;
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const needsRefresh =
    !row.access_token_encrypted ||
    expiresAt - GOOGLE_BUSINESS_OAUTH.TOKEN_EXPIRY_BUFFER_MS < Date.now();

  if (!needsRefresh && row.access_token_encrypted) {
    try {
      accessToken = decryptToken(row.access_token_encrypted);
    } catch {
      accessToken = null;
    }
  }

  if (!accessToken) {
    const refreshToken = decryptToken(row.refresh_token_encrypted);
    const refreshed = await refreshAccessToken(userId, refreshToken);
    const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
    const update: Record<string, unknown> = {
      access_token_encrypted: encryptToken(refreshed.accessToken),
      token_expires_at: tokenExpiresAt,
      last_token_refresh_at: new Date().toISOString(),
      status: "connected",
      last_error: null,
      last_error_at: null,
      error_count: 0,
    };
    if (refreshed.refreshToken) {
      update.refresh_token_encrypted = encryptToken(refreshed.refreshToken);
    }
    await admin().from("store_google_business_connections").update(update).eq("user_id", userId);
    accessToken = refreshed.accessToken;
  }

  const fresh = (await getGoogleBusinessConnection(userId)) ?? row;
  return {
    accessToken,
    accountId: fresh.gbp_account_id!,
    locationId: fresh.gbp_location_id!,
    connection: fresh,
  };
}

export async function selectGoogleBusinessLocation(payload: {
  userId: string;
  accountId: string;
  locationId: string;
  accountName?: string | null;
  locationName?: string | null;
  reviewUrl?: string | null;
  mapsUri?: string | null;
  placeId?: string | null;
}): Promise<GoogleBusinessConnectionRow> {
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from("store_google_business_connections")
    .update({
      status: "connected",
      gbp_account_id: payload.accountId,
      gbp_location_id: payload.locationId,
      gbp_account_name: payload.accountName ?? null,
      gbp_location_name: payload.locationName ?? null,
      gbp_review_url: payload.reviewUrl ?? null,
      gbp_maps_uri: payload.mapsUri ?? null,
      gbp_place_id: payload.placeId ?? null,
      connected_at: now,
      disconnected_at: null,
      last_error: null,
      last_error_at: null,
      error_count: 0,
    })
    .eq("user_id", payload.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Could not save Google Business location: ${error?.message ?? "unknown"}`);
  }

  // Persist review URL into Nest compose prefs so Request review works without env vars.
  if (payload.reviewUrl?.trim()) {
    await persistNestGoogleReviewUrl(payload.userId, payload.reviewUrl.trim());
  }

  return data as GoogleBusinessConnectionRow;
}

async function persistNestGoogleReviewUrl(userId: string, reviewUrl: string) {
  const supabase = admin();
  const { data: profile } = await supabase
    .from("users")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle();

  const prefs =
    profile?.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences)
      ? { ...(profile.preferences as Record<string, unknown>) }
      : {};
  prefs[NEST_GOOGLE_REVIEW_URL_PREFS_KEY] = reviewUrl;

  const { error } = await supabase
    .from("users")
    .update({ preferences: prefs })
    .eq("user_id", userId);
  if (error) {
    console.warn("[gbp-oauth] could not persist nest_google_review_url:", error.message);
  }
}

export async function disconnectGoogleBusiness(userId: string): Promise<void> {
  const row = await getGoogleBusinessConnection(userId);
  if (row?.access_token_encrypted) {
    try {
      const token = decryptToken(row.access_token_encrypted);
      // Best-effort revoke — ignore failures.
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }).catch(() => null);
    } catch {
      // ignore
    }
  }

  await admin()
    .from("store_google_business_connections")
    .upsert(
      {
        user_id: userId,
        status: "disconnected",
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        oauth_state: null,
        oauth_state_expires_at: null,
        gbp_account_id: null,
        gbp_location_id: null,
        gbp_account_name: null,
        gbp_location_name: null,
        gbp_review_url: null,
        gbp_maps_uri: null,
        gbp_place_id: null,
        disconnected_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
        error_count: 0,
      },
      { onConflict: "user_id" },
    );
}

/**
 * Temporary access token for listing accounts/locations before a location is chosen.
 */
export async function getPendingGoogleBusinessAccessToken(
  userId: string,
): Promise<string | null> {
  const row = await getGoogleBusinessConnection(userId);
  if (!row?.refresh_token_encrypted) return null;
  if (row.status === "disconnected") return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (
    row.access_token_encrypted &&
    expiresAt - GOOGLE_BUSINESS_OAUTH.TOKEN_EXPIRY_BUFFER_MS > Date.now()
  ) {
    try {
      return decryptToken(row.access_token_encrypted);
    } catch {
      // fall through to refresh
    }
  }

  const refreshToken = decryptToken(row.refresh_token_encrypted);
  const refreshed = await refreshAccessToken(userId, refreshToken);
  await admin()
    .from("store_google_business_connections")
    .update({
      access_token_encrypted: encryptToken(refreshed.accessToken),
      token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      last_token_refresh_at: new Date().toISOString(),
      ...(refreshed.refreshToken
        ? { refresh_token_encrypted: encryptToken(refreshed.refreshToken) }
        : {}),
    })
    .eq("user_id", userId);
  return refreshed.accessToken;
}
