/**
 * Google Business Profile auth for the Next.js app (service-account JWT →
 * OAuth2 access token). Mirrors supabase/functions/_shared/google-auth.ts.
 *
 * Required env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — full service-account key JSON
 *   GBP_ACCOUNT_ID              — numeric account id (accounts/{id})
 *   GBP_LOCATION_ID             — numeric location id (locations/{id})
 *
 * The service account must be invited as Manager on the Google Business
 * Profile listing, and the project must have My Business API access approved.
 */

import jwt from "jsonwebtoken";

export const BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type TokenCacheEntry = { token: string; exp: number };

const tokenCache = new Map<string, TokenCacheEntry>();

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    console.warn("[gbp-auth] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

export function googleBusinessProfileConfigured(): boolean {
  return Boolean(
    loadServiceAccount() &&
      process.env.GBP_ACCOUNT_ID?.trim() &&
      process.env.GBP_LOCATION_ID?.trim(),
  );
}

export function googleBusinessProfileConfigStatus(): {
  ok: boolean;
  reason: string;
  /** Missing pieces for inline UI hints (no secrets). */
  missing: string[];
} {
  const missing: string[] = [];
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  } else {
    try {
      const sa = JSON.parse(raw) as Partial<ServiceAccount>;
      if (!sa.client_email || !sa.private_key) {
        return {
          ok: false,
          reason:
            "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key — paste the full key file.",
          missing: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
        };
      }
    } catch {
      return {
        ok: false,
        reason: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.",
        missing: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
      };
    }
  }
  if (!process.env.GBP_ACCOUNT_ID?.trim()) missing.push("GBP_ACCOUNT_ID");
  if (!process.env.GBP_LOCATION_ID?.trim()) missing.push("GBP_LOCATION_ID");
  if (missing.length) {
    return {
      ok: false,
      reason: `Missing ${missing.join(", ")}.`,
      missing,
    };
  }
  return { ok: true, reason: "ok", missing: [] };
}

export function gbpAccountId(): string | null {
  return process.env.GBP_ACCOUNT_ID?.trim() || null;
}

export function gbpLocationId(): string | null {
  return process.env.GBP_LOCATION_ID?.trim() || null;
}

/**
 * Mint (or reuse) a Google OAuth2 access token for Business Profile scopes.
 * Returns null when the service account is not configured.
 */
export async function getGoogleBusinessAccessToken(
  scopes: string[] = [BUSINESS_SCOPE],
): Promise<string | null> {
  const sa = loadServiceAccount();
  if (!sa) return null;

  const cacheKey = scopes.slice().sort().join(" ");
  const cached = tokenCache.get(cacheKey);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: scopes.join(" "),
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: "RS256", header: { alg: "RS256", typ: "JWT" } },
  );

  try {
    const res = await fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    if (!res.ok) {
      console.warn(
        `[gbp-auth] token exchange HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    tokenCache.set(cacheKey, {
      token: data.access_token,
      exp: now + (data.expires_in ?? 3600),
    });
    return data.access_token;
  } catch (err) {
    console.warn(
      "[gbp-auth] failed to mint token:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
