import type { LucideIcon } from "lucide-react";
import { ShoppingBag, Store, Settings } from "lucide-react";

export interface MarketplaceNavItem {
  type: "item" | "separator";
  title?: string;
  value?: string;
  icon?: LucideIcon;
}

export const marketplaceBrowsingNavItems: MarketplaceNavItem[] = [
  {
    type: "item",
    title: "Marketplace",
    value: "marketplace",
    icon: ShoppingBag,
  },
  { type: "separator" },
  {
    type: "item",
    title: "Bike Stores",
    value: "stores",
    icon: Store,
  },
];

export const marketplaceIndividualUserNavItems: MarketplaceNavItem[] = [
  { type: "separator" },
  {
    type: "item",
    title: "My Store",
    value: "my-store",
    icon: Store,
  },
  {
    type: "item",
    title: "Order Management",
    value: "purchases",
    icon: ShoppingBag,
  },
  {
    type: "item",
    title: "Settings",
    value: "settings",
    icon: Settings,
  },
];

export const marketplaceStoreUserNavItems: MarketplaceNavItem[] =
  marketplaceIndividualUserNavItems;

export function getMarketplaceActiveView(
  pathname: string,
  searchParams: URLSearchParams,
  profileUserId: string | undefined,
  authUserId: string | undefined
): string {
  if (pathname === "/settings" || pathname === "/marketplace/settings") {
    return "settings";
  }
  if (pathname === "/settings/purchases" || pathname === "/marketplace/purchases") {
    return "purchases";
  }

  const storeMatch = pathname.match(/^\/marketplace\/store\/(.+)$/);
  if (
    storeMatch &&
    (storeMatch[1] === profileUserId || storeMatch[1] === authUserId)
  ) {
    return "my-store";
  }

  const spaceParam = searchParams.get("space");
  const viewParam = searchParams.get("view");
  if (spaceParam === "stores" || viewParam === "stores") {
    return "stores";
  }

  return "marketplace";
}

export function buildMarketplaceNavUrl(
  value: string,
  options: {
    isVerifiedStore: boolean;
    profileUserId?: string;
    authUserId?: string;
  }
): string {
  const { isVerifiedStore, profileUserId, authUserId } = options;

  switch (value) {
    case "marketplace":
      return "/marketplace";
    case "stores":
      return "/marketplace?space=stores";
    case "settings":
      return isVerifiedStore ? "/settings" : "/marketplace/settings";
    case "purchases":
      return isVerifiedStore
        ? "/marketplace/purchases"
        : "/settings/purchases";
    case "my-store":
      return `/marketplace/store/${profileUserId || authUserId}`;
    default:
      return `/marketplace?space=${value}`;
  }
}

export function getMarketplaceNavItems(isLoggedIn: boolean, isVerifiedStore: boolean) {
  return [
    ...marketplaceBrowsingNavItems,
    ...(isLoggedIn
      ? isVerifiedStore
        ? marketplaceStoreUserNavItems
        : marketplaceIndividualUserNavItems
      : []),
  ];
}

const MARKETPLACE_SIDEBAR_ROUTES = [
  "/marketplace/settings",
  "/settings/purchases",
  "/marketplace/purchases",
  "/settings/my-listings",
  "/settings/drafts",
] as const;

export function shouldShowMarketplaceSidebar(pathname: string): boolean {
  return MARKETPLACE_SIDEBAR_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
