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
          "sticky top-0 z-40 transition-transform duration-200 ease-out",
          showFloatingSearch && "md:-translate-y-full md:pointer-events-none",
        )}
      >
      <header
        className={cn(
          "bg-white/95 backdrop-blur-md transition-all duration-200",
          scrolled ? "border-b-2 border-[#ffde59]" : "border-b border-gray-200",
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
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <Link
                href={homeHref}
                className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-gray-200 sm:h-11 sm:w-11"
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
                  <div className="flex h-full w-full items-center justify-center bg-gray-50">
                    <Store className="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" />
                  </div>
                )}
              </Link>
              <div className="flex min-w-0 flex-col items-start text-left">
                <h1 className="truncate text-[15px] font-bold leading-tight tracking-tight text-gray-900 sm:text-lg">
                  <Link href={homeHref} className="block truncate hover:text-gray-700">
                    {store.store_name}
                  </Link>
                </h1>
                {showHeaderHoursBadge && openStatus && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onHoursOpenChange(true);
                    }}
                    className={cn(
                      "mt-0.5 inline-flex items-center justify-start gap-1 rounded-full text-left text-[10px] font-semibold leading-none transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900/10 sm:hidden",
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
                {(headerRating != null || store.address || store.phone || showHeaderHoursBadge) && (
                  <div className="mt-0.5 hidden min-w-0 items-center justify-start gap-1.5 text-left text-[11px] text-gray-500 sm:flex sm:text-xs">
                    {headerRating != null && (
                      <span className="inline-flex flex-shrink-0 items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-gray-700">
                          {headerRating.toFixed(1)}
                        </span>
                        {store.review_count != null && (
                          <span className="text-gray-400">({store.review_count})</span>
                        )}
                      </span>
                    )}
                    {headerRating != null && store.address && (
                      <span className="flex-shrink-0 text-gray-300">·</span>
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
                          className="hidden truncate hover:text-gray-900 transition-colors sm:inline"
                        >
                          {store.address}
                        </a>
                      ) : (
                        <span className="hidden truncate sm:inline">{store.address}</span>
                      ))}
                    {store.address && store.phone && (
                      <span className="hidden flex-shrink-0 text-gray-300 sm:inline">·</span>
                    )}
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
                        className="hidden flex-shrink-0 hover:text-gray-900 transition-colors sm:inline"
                      >
                        {store.phone}
                      </a>
                    )}
                    {showHeaderHoursBadge && openStatus && (
                      <>
                        {(store.address || store.phone || headerRating != null) && (
                          <span
                            className={cn(
                              "flex-shrink-0 text-gray-300",
                              headerRating == null && "hidden sm:inline",
                            )}
                          >
                            ·
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onHoursOpenChange(true);
                          }}
                          className={cn(
                            "inline-flex flex-shrink-0 cursor-pointer items-center justify-start gap-1 rounded-full px-2 py-0.5 text-left text-[11px] font-semibold transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900/10",
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
                      </>
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
                  className="hidden md:block w-44 lg:w-56"
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
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 md:hidden"
                  aria-label="Search products"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
              {actionButtons}
              <CartButton />
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
          "max-md:bg-gray-50/95 max-md:backdrop-blur-sm max-md:px-3 max-md:pb-2 max-md:pt-1.5",
          "md:border-b md:border-gray-200 md:bg-gray-50",
          contentShell,
          "max-md:!px-3",
        )}
      >
        <div
          className={cn(
            "flex items-center",
            "max-md:overflow-hidden max-md:rounded-xl max-md:border max-md:border-gray-200 max-md:bg-white max-md:shadow-[0_4px_20px_rgba(17,17,17,0.08)]",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide sm:gap-1 max-md:px-0.5">
            {tabs.map(({ key, label, icon: Icon }) => {
              const active = activeTab === key;
              const tabClassName = cn(
                "relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 py-3.5 text-sm font-medium transition-colors focus:outline-none sm:px-3.5",
                "max-md:px-2.5 max-md:py-2.5",
                active ? "text-gray-900" : "text-gray-500 hover:text-gray-900",
              );
              const tabChildren = (
                <>
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 flex-shrink-0",
                      active ? "text-gray-900" : "text-gray-400",
                    )}
                  />
                  {label}
                  {active && (
                    <span className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-gray-900 max-md:bottom-1" />
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

          {store.brands.filter((b) => b.is_active && b.logo_url).length > 0 && (
            <div className="ml-2 hidden flex-shrink-0 items-center gap-3 border-l border-gray-200 py-2 pl-4 sm:flex">
              {store.brands
                .filter((b) => b.is_active && b.logo_url)
                .sort((a, b) => a.display_order - b.display_order)
                .slice(0, 6)
                .map((brand) => (
                  <div
                    key={brand.id}
                    className="flex h-7 w-16 flex-shrink-0 items-center justify-center"
                    title={brand.name}
                  >
                    <img
                      src={brand.logo_url!}
                      alt={brand.name}
                      className="max-h-full max-w-full object-contain opacity-60 transition-opacity hover:opacity-100"
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
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
