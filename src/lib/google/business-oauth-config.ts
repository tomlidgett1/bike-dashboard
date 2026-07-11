/**
 * Google Business Profile OAuth (3-legged) configuration.
 *
 * Required env:
 *   GOOGLE_BUSINESS_CLIENT_ID
 *   GOOGLE_BUSINESS_CLIENT_SECRET
 *   GOOGLE_BUSINESS_REDIRECT_URI — optional; defaults to
 *     {NEXT_PUBLIC_APP_URL}/api/store/google-business/auth/callback
 *   TOKEN_ENCRYPTION_KEY — shared with Lightspeed (64-char hex)
 *
 * Google Cloud Console: create an OAuth client (Web), enable
 * My Business Account Management + Business Information + Google My Business
 * (legacy reviews) APIs, and add the redirect URI above.
 */

export const GOOGLE_BUSINESS_OAUTH = {
  AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  USERINFO_URL: "https://www.googleapis.com/oauth2/v2/userinfo",
  ACCOUNT_API: "https://mybusinessaccountmanagement.googleapis.com/v1",
  INFO_API: "https://mybusinessbusinessinformation.googleapis.com/v1",
  REVIEWS_API: "https://mybusiness.googleapis.com/v4",
  SCOPE: "https://www.googleapis.com/auth/business.manage",
  /** OpenID-ish extras so we can show which Google account connected. */
  EXTRA_SCOPES: ["openid", "email", "profile"] as const,
  STATE_TOKEN_EXPIRY_MS: 10 * 60 * 1000,
  TOKEN_EXPIRY_BUFFER_MS: 5 * 60 * 1000,
} as const;

export function googleBusinessOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim() &&
      process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim(),
  );
}

export function getGoogleBusinessOAuthCredentials() {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim();
  const redirectUri = (
    process.env.GOOGLE_BUSINESS_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/store/google-business/auth/callback`
  ).trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET are required for Connect Google Business.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleBusinessAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleBusinessOAuthCredentials();
  const scopes = [GOOGLE_BUSINESS_OAUTH.SCOPE, ...GOOGLE_BUSINESS_OAUTH.EXTRA_SCOPES];
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${GOOGLE_BUSINESS_OAUTH.AUTH_URL}?${params.toString()}`;
}
