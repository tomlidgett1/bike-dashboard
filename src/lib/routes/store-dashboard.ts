/**
 * Routes that use the verified-store dashboard shell (sidebar + topbar).
 * Matches ConditionalLayout — not marketplace, auth, onboarding, etc.
 */
export function isStoreSettingsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/settings/store" || pathname.startsWith("/settings/store/");
}

export function isStoreDashboardPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/marketplace")) return false;
  if (pathname.startsWith("/messages")) return false;
  if (pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/auth")) return false;
  if (pathname.startsWith("/onboarding")) return false;
  if (pathname.startsWith("/mockup")) return false;
  if (pathname === "/admin/ecommerce-hero") return false;
  return true;
}
