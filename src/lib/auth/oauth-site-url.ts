/**
 * Returns the app base URL used in Supabase OAuth `redirectTo`.
 *
 * - Local dev: `window.location.origin` (localhost vs 127.0.0.1, port).
 * - Production: `NEXT_PUBLIC_SITE_URL` when set so `redirect_to` matches the
 *   host Supabase allows (avoids www vs apex mismatches). Must match the host
 *   users actually load after any host canonicalisation (see next.config redirects).
 *
 * Supabase → Authentication → URL Configuration must list `{origin}/auth/callback`.
 *
 * Google "redirect_uri_mismatch" means Google Cloud Console is missing
 * `https://<project-ref>.supabase.co/auth/v1/callback` for the client ID in
 * Supabase → Providers → Google.
 */
export function getBrowserOAuthBaseUrl(): string {
  const canonical = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const devOrigin = (process.env.NEXT_PUBLIC_DEV_ORIGIN || "").replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
    if (isLocal) {
      // Optional fixed origin (e.g. http://localhost:3000) avoids PKCE cookies on the wrong port.
      if (devOrigin) {
        return devOrigin;
      }
      return window.location.origin;
    }
    if (canonical) {
      return canonical;
    }
    return window.location.origin;
  }

  return canonical;
}
