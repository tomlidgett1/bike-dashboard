/**
 * Instagram API with Facebook Login.
 *
 * Uses the Meta (Facebook) App ID + App Secret from Settings → Basic.
 * Do NOT send this App ID to Instagram Login endpoints (that causes
 * "Invalid platform app"). Instagram Login needs a separate Instagram App ID.
 *
 * Required env:
 *   INSTAGRAM_APP_ID / FACEBOOK_APP_ID — Meta App ID (e.g. 1607983123328781)
 *   INSTAGRAM_APP_SECRET / FACEBOOK_APP_SECRET — App Secret
 *   INSTAGRAM_REDIRECT_URI — optional override
 *
 * Meta dashboard (required before Connect works in Live mode):
 *   Use cases → Instagram / Facebook Login → add these permissions:
 *     instagram_basic, instagram_content_publish,
 *     pages_show_list, pages_read_engagement
 *   Facebook Login → Valid OAuth Redirect URIs:
 *     https://yellowjersey.store/api/store/instagram/auth/callback
 */

export const INSTAGRAM_OAUTH = {
  AUTH_HOST: "https://www.facebook.com",
  GRAPH_BASE: "https://graph.facebook.com",
  API_VERSION: process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || "v22.0",
  SCOPES: [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
  ] as const,
  EXTRAS: '{"setup":{"channel":"IG_API_ONBOARDING"}}',
  STATE_TOKEN_EXPIRY_MS: 10 * 60 * 1000,
  TOKEN_REFRESH_BUFFER_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

export function instagramOAuthConfigured(): boolean {
  const { clientId, clientSecret } = readAppCredentials();
  return Boolean(clientId && clientSecret);
}

function readAppCredentials() {
  const clientId = (
    process.env.INSTAGRAM_APP_ID ||
    process.env.FACEBOOK_APP_ID ||
    process.env.META_APP_ID ||
    ""
  ).trim();
  const clientSecret = (
    process.env.INSTAGRAM_APP_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    process.env.META_APP_SECRET ||
    ""
  ).trim();
  return { clientId, clientSecret };
}

export function resolveInstagramRedirectUri(requestOrigin?: string | null): string {
  const configured = process.env.INSTAGRAM_REDIRECT_URI?.trim();
  if (configured) return configured;

  const origin = (requestOrigin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
  return `${origin}/api/store/instagram/auth/callback`;
}

export function getInstagramOAuthCredentials(requestOrigin?: string | null) {
  const { clientId, clientSecret } = readAppCredentials();
  const redirectUri = resolveInstagramRedirectUri(requestOrigin);

  if (!clientId || !clientSecret) {
    throw new Error(
      "INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET (Meta App ID + App Secret) are required.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildInstagramAuthUrl(
  state: string,
  requestOrigin?: string | null,
): string {
  const { clientId, redirectUri } = getInstagramOAuthCredentials(requestOrigin);
  const version = INSTAGRAM_OAUTH.API_VERSION;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: INSTAGRAM_OAUTH.SCOPES.join(","),
    display: "page",
    extras: INSTAGRAM_OAUTH.EXTRAS,
  });
  return `${INSTAGRAM_OAUTH.AUTH_HOST}/${version}/dialog/oauth?${params.toString()}`;
}

export function graphUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${INSTAGRAM_OAUTH.GRAPH_BASE}/${INSTAGRAM_OAUTH.API_VERSION}${clean}`;
}
