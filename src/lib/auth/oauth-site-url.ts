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
function isLocalDevHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return true;
  }
  // Private LAN IPs (RFC 1918) — e.g. testing from a phone on the same network.
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

export function getBrowserOAuthBaseUrl(): string {
  const canonical = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const devOrigin = (process.env.NEXT_PUBLIC_DEV_ORIGIN || "").replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (isLocalDevHost(host)) {
      // Pin localhost/127.0.0.1 to a fixed port; keep LAN IPs on their actual origin.
      const useFixedDevOrigin =
        devOrigin && (host === "localhost" || host === "127.0.0.1");
      if (useFixedDevOrigin) {
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

export function getCurrentReturnPath(fallback = "/marketplace"): string {
  if (typeof window === "undefined") return fallback;

  const value = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function buildBrowserOAuthRedirectTo(returnPath: string): string {
  const url = new URL("/auth/callback", getBrowserOAuthBaseUrl());
  url.searchParams.set("next", returnPath);
  return url.toString();
}
