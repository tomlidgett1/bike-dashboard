import type { LucideIcon } from '@/components/layout/app-sidebar/dashboard-icons';
import { ShoppingBag, Store, Settings } from '@/components/layout/app-sidebar/dashboard-icons';

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

/** Account nav labels — shared across marketplace header, sidebar, and desktop pill. */
export const marketplaceAccountNavLabels = {
  shopfront: "My Store",
  listings: "My Listings",
  settings: "Account Settings",
} as const;

/** @deprecated Use marketplaceAccountNavLabels */
export const bicycleStoreNavLabels = {
  shopfront: marketplaceAccountNavLabels.shopfront,
  orders: marketplaceAccountNavLabels.listings,
  settings: marketplaceAccountNavLabels.settings,
} as const;

/** @deprecated Use marketplaceAccountNavLabels */
export const individualUserNavLabels = {
  shopfront: marketplaceAccountNavLabels.shopfront,
  orders: marketplaceAccountNavLabels.listings,
  settings: marketplaceAccountNavLabels.settings,
} as const;

export type MarketplaceUserNavLabels =
  | typeof bicycleStoreNavLabels
  | typeof individualUserNavLabels;

export function getMarketplaceUserNavLabels(
  accountType: string | null | undefined,
): MarketplaceUserNavLabels {
  return accountType === "bicycle_store"
    ? bicycleStoreNavLabels
    : individualUserNavLabels;
}

/** Default landing page for verified bike stores leaving the marketplace. */
export const VERIFIED_STORE_SETTINGS_PATH = "/settings/store/home";

export function getMarketplaceSettingsRoute(isVerifiedStore: boolean): string {
  return isVerifiedStore
    ? VERIFIED_STORE_SETTINGS_PATH
    : "/marketplace/settings";
}

export function getMarketplaceListingsRoute(): string {
  return "/settings/my-listings";
}

export const marketplaceIndividualUserNavItems: MarketplaceNavItem[] = [
  { type: "separator" },
  {
    type: "item",
    title: individualUserNavLabels.shopfront,
    value: "my-store",
    icon: Store,
  },
  {
    type: "item",
    title: marketplaceAccountNavLabels.listings,
    value: "my-listings",
    icon: ShoppingBag,
  },
  {
    type: "item",
    title: individualUserNavLabels.settings,
    value: "settings",
    icon: Settings,
  },
];

export const marketplaceStoreUserNavItems: MarketplaceNavItem[] = [
  { type: "separator" },
  {
    type: "item",
    title: bicycleStoreNavLabels.shopfront,
    value: "my-store",
    icon: Store,
  },
  {
    type: "item",
    title: bicycleStoreNavLabels.orders,
    value: "my-listings",
    icon: ShoppingBag,
  },
  {
    type: "item",
    title: bicycleStoreNavLabels.settings,
    value: "settings",
    icon: Settings,
  },
];

/** @deprecated Use getMarketplaceUserNavLabels(accountType).settings */
export function getMarketplaceSettingsNavLabel(
  accountType: string | null | undefined,
): string {
  return getMarketplaceUserNavLabels(accountType).settings;
}

export function getMarketplaceActiveView(
  pathname: string,
  searchParams: URLSearchParams,
  profileUserId: string | undefined,
  authUserId: string | undefined
): string {
  if (
    pathname === "/settings" ||
    pathname === "/marketplace/settings" ||
    pathname.startsWith("/settings/store")
  ) {
    return "settings";
  }
  if (
    pathname === "/settings/purchases" ||
    pathname === "/marketplace/purchases" ||
    pathname === "/settings/my-listings" ||
    pathname.startsWith("/settings/my-listings/")
  ) {
    return "my-listings";
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
      return getMarketplaceSettingsRoute(isVerifiedStore);
    case "purchases":
    case "my-listings":
      return getMarketplaceListingsRoute();
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
