/**
 * Per-store Instagram connection via Facebook Login for Business.
 * Stores the Page access token (used for Graph publishing) encrypted at rest.
 */

import crypto from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  decryptToken,
  encryptToken,
} from "@/lib/services/lightspeed/token-manager";
import {
  INSTAGRAM_OAUTH,
  getInstagramOAuthCredentials,
  graphUrl,
  instagramOAuthConfigured,
} from "@/lib/instagram/oauth-config";

export type InstagramConnectionStatus =
  | "connected"
  | "pending_page"
  | "disconnected"
  | "error"
  | "expired";

export type InstagramConnectionRow = {
  id: string;
  user_id: string;
  status: InstagramConnectionStatus;
  instagram_user_id: string | null;
  username: string | null;
  account_name: string | null;
  account_type: string | null;
  profile_picture_url: string | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  access_token_encrypted: string | null;
  user_access_token_encrypted: string | null;
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

export type InstagramPublicStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  needsPage: boolean;
  status: InstagramConnectionStatus | "not_configured";
  username: string | null;
  accountName: string | null;
  accountType: string | null;
  profilePictureUrl: string | null;
  instagramUserId: string | null;
  facebookPageId: string | null;
  facebookPageName: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
};

export type FacebookPageWithInstagram = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramUserId: string;
};

function admin() {
  return createServiceRoleClient();
}

export async function getInstagramConnection(
  userId: string,
): Promise<InstagramConnectionRow | null> {
  const { data, error } = await admin()
    .from("store_instagram_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[ig-oauth] get connection failed:", error.message);
    return null;
  }
  return (data as InstagramConnectionRow | null) ?? null;
}

export function toPublicInstagramStatus(
  row: InstagramConnectionRow | null,
): InstagramPublicStatus {
  const oauthConfigured = instagramOAuthConfigured();
  if (!oauthConfigured && !row) {
    return {
      oauthConfigured: false,
      connected: false,
      needsPage: false,
      status: "not_configured",
      username: null,
      accountName: null,
      accountType: null,
      profilePictureUrl: null,
      instagramUserId: null,
      facebookPageId: null,
      facebookPageName: null,
      connectedAt: null,
      tokenExpiresAt: null,
      lastError: null,
    };
  }

  const status = row?.status ?? "disconnected";
  const connected =
    status === "connected" &&
    Boolean(row?.access_token_encrypted && row?.instagram_user_id);

  return {
    oauthConfigured,
    connected,
    needsPage: status === "pending_page",
    status: !oauthConfigured && status === "disconnected" ? "not_configured" : status,
    username: row?.username ?? null,
    accountName: row?.account_name ?? null,
    accountType: row?.account_type ?? null,
    profilePictureUrl: row?.profile_picture_url ?? null,
    instagramUserId: row?.instagram_user_id ?? null,
    facebookPageId: row?.facebook_page_id ?? null,
    facebookPageName: row?.facebook_page_name ?? null,
    connectedAt: row?.connected_at ?? null,
    tokenExpiresAt: row?.token_expires_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

export async function generateInstagramOAuthState(userId: string): Promise<string> {
  const state = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + INSTAGRAM_OAUTH.STATE_TOKEN_EXPIRY_MS,
  ).toISOString();

  const { error } = await admin()
    .from("store_instagram_connections")
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

export async function validateInstagramOAuthState(
  userId: string,
  state: string,
): Promise<boolean> {
  const row = await getInstagramConnection(userId);
  if (!row?.oauth_state || !row.oauth_state_expires_at) return false;
  if (row.oauth_state !== state) return false;
  if (new Date(row.oauth_state_expires_at).getTime() < Date.now()) return false;
  return true;
}

export async function exchangeFacebookCode(
  code: string,
  requestOrigin?: string | null,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret, redirectUri } =
    getInstagramOAuthCredentials(requestOrigin);
  const cleanedCode = code.replace(/#_$/, "");
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: cleanedCode,
  });

  const res = await fetch(
    `${graphUrl("/oauth/access_token")}?${params.toString()}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error?.message || `Facebook token exchange failed (${res.status}).`,
    );
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const { clientId, clientSecret } = getInstagramOAuthCredentials();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(
    `${graphUrl("/oauth/access_token")}?${params.toString()}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error?.message || "Could not exchange for a long-lived Facebook token.",
    );
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 60 * 24 * 60 * 60,
  };
}

export async function listFacebookPagesWithInstagram(
  userAccessToken: string,
): Promise<FacebookPageWithInstagram[]> {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account",
    access_token: userAccessToken,
  });

  const res = await fetch(`${graphUrl("/me/accounts")}?${params.toString()}`);
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(
      data.error?.message || "Could not load Facebook Pages for this account.",
    );
  }

  const pages: FacebookPageWithInstagram[] = [];
  for (const page of data.data ?? []) {
    const igId = page.instagram_business_account?.id;
    if (!page.id || !page.access_token || !igId) continue;
    pages.push({
      pageId: page.id,
      pageName: page.name || "Facebook Page",
      pageAccessToken: page.access_token,
      instagramUserId: igId,
    });
  }
  return pages;
}

export async function fetchInstagramBusinessProfile(
  igUserId: string,
  pageAccessToken: string,
): Promise<{
  username: string | null;
  name: string | null;
  accountType: string | null;
  profilePictureUrl: string | null;
}> {
  const params = new URLSearchParams({
    fields: "username,name,profile_picture_url,account_type",
    access_token: pageAccessToken,
  });
  const res = await fetch(`${graphUrl(`/${igUserId}`)}?${params.toString()}`);
  const data = (await res.json().catch(() => ({}))) as {
    username?: string;
    name?: string;
    account_type?: string;
    profile_picture_url?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message || "Could not load Instagram profile.");
  }

  return {
    username: data.username ?? null,
    name: data.name ?? null,
    accountType: data.account_type ?? null,
    profilePictureUrl: data.profile_picture_url ?? null,
  };
}

export async function storePendingInstagramUserToken(payload: {
  userId: string;
  userAccessToken: string;
  expiresIn: number;
  scopes?: string[];
}): Promise<InstagramConnectionRow> {
  const tokenExpiresAt = new Date(Date.now() + payload.expiresIn * 1000).toISOString();
  const { data, error } = await admin()
    .from("store_instagram_connections")
    .upsert(
      {
        user_id: payload.userId,
        status: "pending_page",
        user_access_token_encrypted: encryptToken(payload.userAccessToken),
        access_token_encrypted: null,
        token_expires_at: tokenExpiresAt,
        scopes: payload.scopes ?? [...INSTAGRAM_OAUTH.SCOPES],
        oauth_state: null,
        oauth_state_expires_at: null,
        facebook_page_id: null,
        facebook_page_name: null,
        instagram_user_id: null,
        username: null,
        account_name: null,
        account_type: null,
        profile_picture_url: null,
        last_error: null,
        last_error_at: null,
        error_count: 0,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Could not store Facebook token: ${error?.message ?? "unknown"}`);
  }
  return data as InstagramConnectionRow;
}

export async function storeInstagramPageConnection(payload: {
  userId: string;
  page: FacebookPageWithInstagram;
  userAccessToken?: string | null;
  expiresIn?: number;
  scopes?: string[];
}): Promise<InstagramConnectionRow> {
  const profile = await fetchInstagramBusinessProfile(
    payload.page.instagramUserId,
    payload.page.pageAccessToken,
  );

  const existing = await getInstagramConnection(payload.userId);
  const now = new Date().toISOString();
  const tokenExpiresAt = payload.expiresIn
    ? new Date(Date.now() + payload.expiresIn * 1000).toISOString()
    : existing?.token_expires_at;

  const userTokenEncrypted = payload.userAccessToken
    ? encryptToken(payload.userAccessToken)
    : existing?.user_access_token_encrypted ?? null;

  const { data, error } = await admin()
    .from("store_instagram_connections")
    .upsert(
      {
        user_id: payload.userId,
        status: "connected",
        instagram_user_id: payload.page.instagramUserId,
        facebook_page_id: payload.page.pageId,
        facebook_page_name: payload.page.pageName,
        username: profile.username,
        account_name: profile.name,
        account_type: profile.accountType,
        profile_picture_url: profile.profilePictureUrl,
        access_token_encrypted: encryptToken(payload.page.pageAccessToken),
        user_access_token_encrypted: userTokenEncrypted,
        token_expires_at: tokenExpiresAt,
        scopes: payload.scopes ?? existing?.scopes ?? [...INSTAGRAM_OAUTH.SCOPES],
        oauth_state: null,
        oauth_state_expires_at: null,
        connected_at: existing?.connected_at ?? now,
        disconnected_at: null,
        last_token_refresh_at: now,
        last_error: null,
        last_error_at: null,
        error_count: 0,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Could not store Instagram connection: ${error?.message ?? "unknown"}`);
  }
  return data as InstagramConnectionRow;
}

export async function getValidInstagramAccessToken(
  userId: string,
): Promise<{ accessToken: string; connection: InstagramConnectionRow }> {
  const row = await getInstagramConnection(userId);
  if (!row?.access_token_encrypted || !row.instagram_user_id) {
    throw new Error("Instagram is not connected for this store.");
  }
  if (row.status !== "connected") {
    throw new Error("Instagram connection is not active. Please reconnect.");
  }

  const accessToken = decryptToken(row.access_token_encrypted);
  return { accessToken, connection: row };
}

export async function disconnectInstagram(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin()
    .from("store_instagram_connections")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      user_access_token_encrypted: null,
      token_expires_at: null,
      oauth_state: null,
      oauth_state_expires_at: null,
      facebook_page_id: null,
      facebook_page_name: null,
      instagram_user_id: null,
      username: null,
      account_name: null,
      account_type: null,
      profile_picture_url: null,
      disconnected_at: now,
      last_error: null,
      last_error_at: null,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Could not disconnect Instagram: ${error.message}`);
  }
}

export async function markInstagramConnectionError(
  userId: string,
  message: string,
): Promise<void> {
  const row = await getInstagramConnection(userId);
  await admin()
    .from("store_instagram_connections")
    .update({
      status: row?.status === "connected" ? "error" : row?.status ?? "error",
      last_error: message,
      last_error_at: new Date().toISOString(),
      error_count: (row?.error_count ?? 0) + 1,
    })
    .eq("user_id", userId);
}
