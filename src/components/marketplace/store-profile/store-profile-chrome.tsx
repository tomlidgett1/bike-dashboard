"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Store,
  Home,
  Star,
  Search,
  X,
  Package,
  Bike,
  Wrench,
  Info,
  CircleDot,
  Gift,
  MapPin,
  Phone,
  type LucideIcon,
} from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CartButton } from "@/components/marketplace/cart-button";
import type { StoreAnalyticsEventType } from "@/lib/tracking/store-analytics";
import type { OpeningHours, StoreProfile } from "@/lib/types/store";

export type StoreTab =
  | "home"
  | "products"
  | "bikes"
  | "rentals"
  | "service"
  | "offers"
  | "about"
  | "reviews";

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEK_ORDER: (keyof OpeningHours)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function getStoreOpenStatus(
  hours: OpeningHours | undefined,
): { open: boolean; label: string } | null {
  if (!hours) return null;
  const now = new Date();
  const today = hours[DAY_KEYS[now.getDay()]];
  if (!today) return null;
  if (today.closed) return { open: false, label: "Closed today" };
  const cur = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(today.open);
  const close = toMinutes(today.close);
  if (cur < open) return { open: false, label: `Opens ${today.open}` };
  if (cur >= close) return { open: false, label: "Closed now" };
  return { open: true, label: `Open until ${today.close}` };
}

export function isStoreHomeEnabled(store: StoreProfile): boolean {
  return store.homepage_config?.enabled !== false;
}

export function buildStoreTabs(
  homeEnabled: boolean,
): { key: StoreTab; label: string; icon: LucideIcon }[] {
  return [
    ...(homeEnabled ? [{ key: "home" as StoreTab, label: "Home", icon: Home }] : []),
    { key: "products", label: "Products", icon: Package },
    { key: "bikes", label: "Bikes", icon: Bike },
    { key: "rentals", label: "Rentals", icon: CircleDot },
    { key: "service", label: "Service", icon: Wrench },
    { key: "offers", label: "Offers", icon: Gift },
    { key: "about", label: "About", icon: Info },
    { key: "reviews", label: "Reviews", icon: Star },
  ];
}

export function countStoreProducts(store: StoreProfile): number {
  const seen = new Set<string>();
  for (const cat of store.categories) {
    for (const p of cat.products) {
      seen.add(p.id);
    }
  }
  return seen.size;
}

export function storeTabHref(storeId: string, tab: StoreTab, search?: string): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (search?.trim()) {
    params.set("q", search.trim());
  }
  return `/marketplace/store/${storeId}?${params.toString()}`;
}

export function parseStoreTabParam(
  value: string | null,
  homeEnabled: boolean,
): StoreTab | null {
  const tabs = buildStoreTabs(homeEnabled).map((t) => t.key);
  if (value && tabs.includes(value as StoreTab)) {
    return value as StoreTab;
  }
  return null;
}

/** Matches product page horizontal inset (px-4 / xl:px-5). */
export const STORE_PAGE_CONTENT_SHELL = "px-4 sm:px-4 lg:px-4 xl:px-5";

/** Banner artwork for each store tab (Unsplash, cropped small). */
const STORE_TAB_BANNERS: Record<StoreTab, string> = {
  home: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=500&q=60",
  products: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=500&q=60",
  bikes: "https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=500&q=60",
  rentals: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=500&q=60",
  service: "https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?auto=format&fit=crop&w=500&q=60",
  offers: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=500&q=60",
  about: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=500&q=60",
  reviews: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=500&q=60",
};

export interface StoreProfileChromeProps {
  store: StoreProfile;
  contentShell: string;
  activeTab?: StoreTab | null;
  storeSearch: string;
  onStoreSearchChange: (value: string) => void;
  mobileSearchOpen: boolean;
  onMobileSearchOpenChange: (open: boolean) => void;
  showHeaderSearch: boolean;
  hoursOpen: boolean;
  onHoursOpenChange: (open: boolean) => void;
  onTabSelect?: (tab: StoreTab) => void;
  getTabHref?: (tab: StoreTab) => string;
  actionButtons?: React.ReactNode;
  storeHomeHref?: string;
  /** Immersive mode — offsets the floating search bar below the back control */
  immersive?: boolean;
  /** Extra content below the search field in the desktop floating bar (e.g. category pills) */
  floatingBarExtra?: React.ReactNode;
  /** Mobile home hero — fixed transparent header overlays the hero image */
  heroOverlay?: boolean;
  onBehaviourEvent?: (eventType: StoreAnalyticsEventType, metadata?: Record<string, unknown>) => void;
}

function StoreDesktopSearchField({
  storeSearch,
  onStoreSearchChange,
  placeholder,
  className,
  compact = false,
}: {
  storeSearch: string;
  onStoreSearchChange: (value: string) => void;
  placeholder: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400",
          compact ? "left-2.5 h-3.5 w-3.5" : "left-3 h-4 w-4",
        )}
      />
      <input
        type="text"
        value={storeSearch}
        onChange={(e) => onStoreSearchChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-md border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-colors",
          compact ? "h-9 pl-8 pr-8" : "h-10 pl-9 pr-9",
        )}
      />
      {storeSearch && (
        <button
          type="button"
          onClick={() => onStoreSearchChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-700"
          aria-label="Clear search"
        >
          <X className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </button>
      )}
    </div>
  );
}

export function StoreProfileChrome({
  store,
  contentShell,
  activeTab = null,
  storeSearch,
  onStoreSearchChange,
  mobileSearchOpen,
  onMobileSearchOpenChange,
  showHeaderSearch,
  hoursOpen,
  onHoursOpenChange,
  onTabSelect,
  getTabHref,
  actionButtons,
  storeHomeHref,
  immersive = false,
  floatingBarExtra,
  heroOverlay = false,
  onBehaviourEvent,
}: StoreProfileChromeProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const [showFloatingSearch, setShowFloatingSearch] = React.useState(false);
  const chromeRef = React.useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = React.useRef<HTMLInputElement>(null);
  const mobileSearchMode = mobileSearchOpen && showHeaderSearch;
  const searchPlaceholder = `Search ${store.store_name}…`;
  const homeEnabled = isStoreHomeEnabled(store);
  const tabs = React.useMemo(() => buildStoreTabs(homeEnabled), [homeEnabled]);
  const mobileHeroOverlay = heroOverlay && !mobileSearchMode;
  const overlayHeaderActive = mobileHeroOverlay && !scrolled;

  const openStatus = getStoreOpenStatus(store.opening_hours);
  const headerRating =
    store.rating != null && store.homepage_config?.badges?.show_rating === true
      ? store.rating
      : null;
  const showHeaderHoursBadge = openStatus != null;

  const directionsUrl = store.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : null;

  const homeHref = storeHomeHref ?? `/marketplace/store/${store.id}`;

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Desktop: once the full chrome (header + tabs) has scrolled away, show a fixed search bar
  React.useEffect(() => {
    const updateFloatingSearch = () => {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (!isDesktop || !showHeaderSearch || mobileSearchMode) {
        setShowFloatingSearch(false);
        return;
      }
      const el = chromeRef.current;
      if (!el) {
        setShowFloatingSearch(false);
        return;
      }
      const pastChrome = window.scrollY > el.offsetTop + el.offsetHeight;
      setShowFloatingSearch(pastChrome);
    };

    updateFloatingSearch();
    window.addEventListener("scroll", updateFloatingSearch, { passive: true });
    window.addEventListener("resize", updateFloatingSearch);
    return () => {
      window.removeEventListener("scroll", updateFloatingSearch);
      window.removeEventListener("resize", updateFloatingSearch);
    };
  }, [showHeaderSearch, mobileSearchMode]);

  React.useEffect(() => {
    if (mobileSearchMode) {
      mobileSearchInputRef.current?.focus();
    }
  }, [mobileSearchMode]);

  const handleTabClick = (tab: StoreTab) => {
    if (tab === "home") {
      onStoreSearchChange("");
      onMobileSearchOpenChange(false);
    }
    onTabSelect?.(tab);
  };

  return (
    <>
      <div
        ref={chromeRef}
        className={cn(
          "z-40 transition-transform duration-200 ease-out md:sticky md:top-0",
          mobileHeroOverlay && "max-md:fixed max-md:inset-x-0 max-md:top-0",
          !mobileHeroOverlay && "sticky top-0",
          showFloatingSearch && "md:-translate-y-full md:pointer-events-none",
        )}
      >
      <header
        className={cn(
          "transition-all duration-200 md:bg-white/95 md:backdrop-blur-md",
          overlayHeaderActive
            ? "max-md:border-transparent max-md:bg-transparent"
            : cn(
                "bg-white/95 backdrop-blur-md",
                scrolled ? "border-b-2 border-[#ffde59]" : "border-b border-gray-200",
              ),
        )}
      >
        <div className={cn(contentShell, mobileSearchMode && "max-md:px-3")}>
          {mobileSearchMode ? (
            <div className="relative flex h-14 w-full items-center md:hidden">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={mobileSearchInputRef}
                type="text"
                value={storeSearch}
                onChange={(e) => onStoreSearchChange(e.target.value)}
                placeholder={`Search ${store.store_name}…`}
                className="h-11 w-full rounded-md border border-gray-200 bg-white pl-9 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition-colors"
              />
              <button
                type="button"
                onClick={() => {
                  if (storeSearch) {
                    onStoreSearchChange("");
                    mobileSearchInputRef.current?.focus();
                  } else {
                    onMobileSearchOpenChange(false);
                  }
                }}
                className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 cursor-pointer p-1 text-gray-400 hover:text-gray-700"
                aria-label={storeSearch ? "Clear search" : "Close search"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div
            className={cn(
              "relative h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4",
              mobileSearchMode ? "hidden md:flex" : "flex",
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
              <Link
                href={homeHref}
                className={cn(
                  "h-9 w-9 flex-shrink-0 overflow-hidden rounded-md sm:h-11 sm:w-11",
                  overlayHeaderActive
                    ? "max-md:bg-transparent max-md:ring-0"
                    : "ring-1 ring-gray-200",
                )}
                aria-label={`${store.store_name} store home`}
              >
                {store.logo_url ? (
                  <Image
                    src={store.logo_url}
                    alt={store.store_name}
                    width={44}
                    height={44}
                    sizes="44px"
                    className="h-full w-full object-cover"
                    priority
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-full w-full items-center justify-center",
                      overlayHeaderActive ? "max-md:bg-white/10" : "bg-gray-50",
                    )}
                  >
                    <Store
                      className={cn(
                        "h-4 w-4 sm:h-5 sm:w-5",
                        overlayHeaderActive ? "max-md:text-white/80" : "text-gray-400",
                      )}
                    />
                  </div>
                )}
              </Link>
              <div className="flex min-w-0 flex-col items-start gap-0.5 text-left sm:gap-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h1
                    className={cn(
                      "truncate text-xl font-bold leading-tight tracking-tight sm:text-2xl",
                      overlayHeaderActive
                        ? "max-md:text-white"
                        : "text-gray-900",
                    )}
                  >
                    <Link
                      href={homeHref}
                      className={cn(
                        "block truncate",
                        overlayHeaderActive
                          ? "max-md:text-white max-md:hover:text-white/90"
                          : "hover:text-gray-700",
                      )}
                    >
                      {store.store_name}
                    </Link>
                  </h1>
                  {headerRating != null && (
                    <span className="hidden flex-shrink-0 items-center gap-1 text-xs sm:inline-flex">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-gray-800">
                        {headerRating.toFixed(1)}
                      </span>
                      {store.review_count != null && (
                        <span className="text-gray-400">({store.review_count})</span>
                      )}
                    </span>
                  )}
                </div>
                {showHeaderHoursBadge && openStatus && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onHoursOpenChange(true);
                    }}
                    className={cn(
                      "inline-flex items-center justify-start gap-1 rounded-full text-left text-[10px] font-semibold leading-none transition-colors focus:outline-none focus:ring-2 sm:hidden",
                      overlayHeaderActive
                        ? "max-md:text-white/90 max-md:hover:bg-white/10 max-md:focus:ring-white/20"
                        : "hover:bg-gray-100 focus:ring-gray-900/10",
                      !overlayHeaderActive && (openStatus.open ? "text-green-700" : "text-gray-600"),
                    )}
                    aria-label={`Show opening hours. ${openStatus.label}`}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        openStatus.open
                          ? overlayHeaderActive
                            ? "bg-green-400"
                            : "bg-green-500"
                          : overlayHeaderActive
                            ? "bg-white/50"
                            : "bg-gray-400",
                      )}
                      aria-hidden="true"
                    />
                    {openStatus.label}
                  </button>
                )}
                {(store.address || store.phone || showHeaderHoursBadge) && (
                  <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
                    {showHeaderHoursBadge && openStatus && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onHoursOpenChange(true);
                        }}
                        className={cn(
                          "inline-flex h-6 flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-semibold transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/10",
                          openStatus.open ? "text-green-700" : "text-gray-600",
                        )}
                        aria-label={`Show opening hours. ${openStatus.label}`}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            openStatus.open ? "bg-green-500" : "bg-gray-400",
                          )}
                          aria-hidden="true"
                        />
                        {openStatus.label}
                      </button>
                    )}
                    {store.address &&
                      (directionsUrl ? (
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBehaviourEvent?.("contact_click", {
                              action: "directions",
                              label: "Store address",
                              source: "store_header",
                            });
                          }}
                          title="Get directions"
                          className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                        >
                          <MapPin className="h-3 w-3 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{store.address}</span>
                        </a>
                      ) : (
                        <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600">
                          <MapPin className="h-3 w-3 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{store.address}</span>
                        </span>
                      ))}
                    {store.phone && (
                      <a
                        href={`tel:${store.phone}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBehaviourEvent?.("contact_click", {
                            action: "call",
                            label: "Store phone",
                            source: "store_header",
                          });
                        }}
                        title={`Call ${store.store_name}`}
                        className="hidden h-6 flex-shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 lg:inline-flex"
                      >
                        <Phone className="h-3 w-3 flex-shrink-0 text-gray-400" />
                        {store.phone}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              {showHeaderSearch && (
                <StoreDesktopSearchField
                  storeSearch={storeSearch}
                  onStoreSearchChange={onStoreSearchChange}
                  placeholder="Search products…"
                  className="hidden md:block w-48 lg:w-64 xl:w-72"
                  compact
                />
              )}
              {showHeaderSearch && (
                <button
                  type="button"
                  onClick={() => {
                    onBehaviourEvent?.("search_focus", {
                      action: "open_mobile_search",
                      label: "Search products",
                      source: "store_header",
                    });
                    onMobileSearchOpenChange(true);
                  }}
                  className={cn(
                    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors md:hidden",
                    overlayHeaderActive
                      ? "max-md:border max-md:border-white/30 max-md:bg-white/10 max-md:text-white max-md:backdrop-blur-sm max-md:hover:bg-white/20"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  )}
                  aria-label="Search products"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
              {actionButtons ? (
                <div
                  className={cn(
                    overlayHeaderActive &&
                      "max-md:[&_button]:border-white/20 max-md:[&_button]:text-white/90 max-md:[&_button]:hover:bg-white/10",
                  )}
                >
                  {actionButtons}
                </div>
              ) : null}
              <CartButton
                className={cn(
                  overlayHeaderActive &&
                    "max-md:border max-md:border-white/30 max-md:bg-white/10 max-md:backdrop-blur-sm max-md:hover:bg-white/20 max-md:[&_svg]:text-white",
                )}
              />
              <span
                className="hidden h-6 w-px flex-shrink-0 bg-gray-200 sm:block"
                aria-hidden="true"
              />
              <a
                href="/marketplace"
                aria-label="Back to Yellow Jersey marketplace"
                title="Yellow Jersey Marketplace"
                className="group hidden h-9 flex-shrink-0 items-center rounded-md px-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 sm:inline-flex"
              >
                <Image
                  src="/yjlogo.svg"
                  alt="Yellow Jersey"
                  width={84}
                  height={20}
                  className="h-[18px] w-auto opacity-75 transition-opacity group-hover:opacity-100 lg:h-5"
                  unoptimized
                />
              </a>
            </div>
          </div>
        </div>
      </header>

      <div
        className={cn(
          mobileSearchMode && "hidden md:block",
          activeTab === "home" ? "max-md:hidden" : "max-md:block",
          "border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm md:block",
          contentShell,
          "pb-2 pt-2 md:pb-2.5 md:pt-2.5",
        )}
      >
        {/* Full-width banner tabs — evenly spread, image-backed tiles */}
        <div className="flex items-stretch gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide md:grid md:grid-flow-col md:auto-cols-fr md:gap-2 md:overflow-visible">
          {tabs.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            const tabClassName = cn(
              "group relative isolate flex h-14 min-w-[104px] flex-shrink-0 cursor-pointer items-end overflow-hidden rounded-md transition-all duration-300 focus:outline-none md:h-16 md:min-w-0 md:flex-shrink",
              active
                ? "shadow-[0_4px_16px_rgba(17,17,17,0.18)] ring-2 ring-[#ffde59]"
                : "ring-1 ring-black/10 hover:shadow-[0_4px_14px_rgba(17,17,17,0.14)] hover:ring-black/20",
            );
            const tabChildren = (
              <>
                <img
                  src={STORE_TAB_BANNERS[key]}
                  alt=""
                  loading="lazy"
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 -z-10 h-full w-full object-cover transition-all duration-500",
                    active
                      ? "scale-105"
                      : "grayscale-[45%] group-hover:scale-105 group-hover:grayscale-0",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 -z-10 transition-opacity duration-300",
                    active
                      ? "bg-gradient-to-t from-gray-950/85 via-gray-950/30 to-transparent"
                      : "bg-gradient-to-t from-gray-950/90 via-gray-950/45 to-gray-950/15 group-hover:from-gray-950/85 group-hover:via-gray-950/35",
                  )}
                />
                <span className="relative flex w-full items-center gap-1.5 px-2.5 pb-2 text-[12px] font-semibold tracking-wide text-white drop-shadow-sm md:px-3 md:text-[13px]">
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[3px] bg-[#ffde59]"
                  />
                )}
              </>
            );

            if (getTabHref) {
              return (
                <Link
                  key={key}
                  href={getTabHref(key)}
                  className={tabClassName}
                  onClick={() => handleTabClick(key)}
                >
                  {tabChildren}
                </Link>
              );
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleTabClick(key)}
                className={tabClassName}
              >
                {tabChildren}
              </button>
            );
          })}
        </div>

        {/* Brand logos — relocated to their own strip below the banner tabs */}
        {store.brands.filter((b) => b.is_active && b.logo_url).length > 0 && (
          <div className="mt-2 hidden items-center justify-center gap-8 md:flex">
            {store.brands
              .filter((b) => b.is_active && b.logo_url)
              .sort((a, b) => a.display_order - b.display_order)
              .slice(0, 6)
              .map((brand) => (
                <div
                  key={brand.id}
                  className="flex h-6 w-16 flex-shrink-0 items-center justify-center"
                  title={brand.name}
                >
                  <img
                    src={brand.logo_url!}
                    alt={brand.name}
                    className="max-h-full max-w-full object-contain opacity-50 transition-opacity hover:opacity-100"
                  />
                </div>
              ))}
          </div>
        )}
      </div>
      </div>

      {showFloatingSearch && showHeaderSearch && (
        <div
          className={cn(
            "hidden md:block fixed left-0 right-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-md shadow-sm",
            "animate-in fade-in slide-in-from-top-4 duration-200",
            immersive ? "top-14" : "top-0",
          )}
        >
          <div
            className={cn(
              contentShell,
              "flex items-center gap-2 py-2.5 sm:gap-3",
              !floatingBarExtra && "justify-center",
            )}
          >
            <StoreDesktopSearchField
              storeSearch={storeSearch}
              onStoreSearchChange={onStoreSearchChange}
              placeholder={searchPlaceholder}
              className={cn(
                "flex-shrink-0",
                floatingBarExtra ? "w-44 lg:w-56" : "w-full max-w-xl",
              )}
              compact
            />
            {floatingBarExtra ? <div className="min-w-0 flex-1">{floatingBarExtra}</div> : null}
          </div>
        </div>
      )}

      <StoreHoursDialog
        open={hoursOpen}
        onOpenChange={onHoursOpenChange}
        store={store}
        openStatus={openStatus}
      />
    </>
  );
}

function StoreHoursDialog({
  open,
  onOpenChange,
  store,
  openStatus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: StoreProfile;
  openStatus: { open: boolean; label: string } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl p-0 duration-200 data-open:slide-in-from-bottom-8 data-closed:slide-out-to-bottom-8",
          "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-0 sm:data-open:slide-in-from-bottom-0 sm:data-closed:slide-out-to-bottom-0",
        )}
      >
        <DialogHeader className="border-b border-gray-100 px-5 pb-4 pt-5">
          <DialogTitle className="text-base font-semibold text-gray-900">
            Opening hours
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {store.store_name}
          </DialogDescription>
        </DialogHeader>
        <StoreHoursList store={store} openStatus={openStatus} />
      </DialogContent>
    </Dialog>
  );
}

function StoreHoursList({
  store,
  openStatus,
}: {
  store: StoreProfile;
  openStatus: { open: boolean; label: string } | null;
}) {
  const todayKey = DAY_KEYS[new Date().getDay()];

  return (
    <div className="px-5 pb-6 pt-4">
      {openStatus && (
        <div
          className={cn(
            "mb-4 flex items-center justify-between rounded-lg px-3 py-2 text-sm",
            openStatus.open ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-700",
          )}
        >
          <span className="font-semibold">{openStatus.open ? "Open now" : "Closed"}</span>
          <span className="text-xs font-medium">{openStatus.label}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {WEEK_ORDER.map((day) => {
          const h = store.opening_hours?.[day];
          const isToday = day === todayKey;

          return (
            <div
              key={day}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                isToday ? "bg-gray-900 font-semibold text-white" : "text-gray-600",
              )}
            >
              <span className="capitalize">{day}</span>
              <span>
                {!h || h.closed ? (
                  <span className={cn(isToday ? "text-white/75" : "text-gray-400")}>Closed</span>
                ) : (
                  `${h.open} - ${h.close}`
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
