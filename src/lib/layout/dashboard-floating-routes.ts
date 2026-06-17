/** Routes that use the full-height FloatingCardPage shell (hide topbar, overflow-hidden). */
const FLOATING_CARD_ROUTE_PREFIXES = [
  "/products",
  "/optimize",
  "/connect-lightspeed",
  "/settings/store",
  "/settings/purchases",
  "/settings/my-listings",
  "/settings/uber",
  "/settings/data",
  "/settings/test",
] as const;

export function isDashboardFloatingCardRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/settings") return true;
  return FLOATING_CARD_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
