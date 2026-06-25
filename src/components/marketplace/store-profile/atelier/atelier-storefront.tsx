"use client";

import * as React from "react";
import { AtelierChrome } from "./atelier-chrome";
import { AtelierHomeTab } from "./atelier-home-tab";
import { AtelierCatalogTab } from "./atelier-catalog-tab";
import {
  AtelierServiceTab,
  AtelierRentalsTab,
  AtelierAboutTab,
} from "./atelier-tabs";
import { STUDIO, STUDIO_FONT_CLASS, DISPLAY_FONT } from "./atelier-theme";
import {
  useStoreScrollDepthTracking,
  useStoreTabTracking,
} from "@/lib/tracking/store-analytics";
import type { StoreProfile } from "@/lib/types/store";
import type { StoreTab } from "@/components/marketplace/store-profile/store-profile-chrome";
import type { StoreAnalyticsEventType } from "@/lib/tracking/store-analytics";

type SortKey = "featured" | "price-asc" | "price-desc" | "newest";

export interface AtelierStorefrontProps {
  store: StoreProfile;
  isOwnProfile?: boolean;
  /** Switch back to the classic storefront design. */
  onSwitchDesign: () => void;
  activeTab: StoreTab;
  onTabSelect: (tab: StoreTab) => void;
  hoursOpen: boolean;
  onHoursOpenChange: (open: boolean) => void;
}

export function AtelierStorefront({
  store,
  isOwnProfile,
  onSwitchDesign,
  activeTab,
  onTabSelect,
  hoursOpen,
  onHoursOpenChange,
}: AtelierStorefrontProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [showSaleOnly, setShowSaleOnly] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>("featured");
  const [storeSearch, setStoreSearch] = React.useState("");
  const analyticsRootRef = React.useRef<HTMLDivElement | null>(null);

  const shouldTrack = !isOwnProfile;
  const analyticsContext = React.useMemo(() => ({ tab: activeTab }), [activeTab]);

  useStoreTabTracking(shouldTrack ? store.id : null, activeTab, shouldTrack);
  useStoreScrollDepthTracking(
    shouldTrack ? store.id : null,
    analyticsContext,
    shouldTrack,
  );

  const trackBehaviour = React.useCallback(
    (eventType: StoreAnalyticsEventType, metadata: Record<string, unknown> = {}) => {
      if (!shouldTrack) return;
      // re-exported usage; import lazily to avoid a second hook binding
      import("@/lib/tracking/store-analytics").then((mod) => {
        mod.trackStoreBehaviourEvent(store.id, eventType, metadata);
      });
    },
    [shouldTrack, store.id],
  );

  const handleNavigate = React.useCallback(
    (href: string) => {
      if (!href) return;
      if (href === "call") {
        trackBehaviour("contact_click", { action: "call", label: "Call", tab: activeTab, source: "atelier_cta" });
        if (store.phone) window.location.href = `tel:${store.phone}`;
        return;
      }
      if (href === "directions") {
        trackBehaviour("contact_click", { action: "directions", label: "Directions", tab: activeTab, source: "atelier_cta" });
        if (store.address) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`, "_blank", "noopener,noreferrer");
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        trackBehaviour("cta_click", { action: "external_link", href, tab: activeTab, source: "atelier_cta" });
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      const tabKeys: StoreTab[] = ["home", "products", "bikes", "rentals", "service", "about", "reviews"];
      if (tabKeys.includes(href as StoreTab)) {
        const tab = href as StoreTab;
        trackBehaviour("cta_click", { action: "open_tab", tab, previousTab: activeTab, source: "atelier_cta" });
        onTabSelect(tab);
        setSelectedCategory(null);
        setStoreSearch("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [activeTab, onTabSelect, store.address, store.phone, trackBehaviour],
  );

  const handleOpenCollection = React.useCallback(
    (categoryName: string) => {
      trackBehaviour("collection_open", { categoryName, previousTab: activeTab, source: "atelier_home" });
      onTabSelect("products");
      setSelectedCategory(categoryName);
      setStoreSearch("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [activeTab, onTabSelect, trackBehaviour],
  );

  const handleCategoryToggle = React.useCallback((name: string) => {
    setSelectedCategory((cur) => (cur === name ? null : name));
  }, []);

  const handleSaleOnlyToggle = React.useCallback(() => setShowSaleOnly((v) => !v), []);

  const handleTabSelect = React.useCallback(
    (tab: StoreTab) => {
      onTabSelect(tab);
      setSelectedCategory(null);
      setStoreSearch("");
    },
    [onTabSelect],
  );

  const showSearch = activeTab === "home" || activeTab === "products" || activeTab === "bikes";

  return (
    <div
      ref={analyticsRootRef}
      className={STUDIO_FONT_CLASS}
      style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, minHeight: "100vh" }}
    >
      <AtelierChrome
        store={store}
        activeTab={activeTab}
        onTabSelect={handleTabSelect}
        onSwitchDesign={onSwitchDesign}
        storeSearch={storeSearch}
        onStoreSearchChange={setStoreSearch}
        showSearch={showSearch}
        hoursOpen={hoursOpen}
        onHoursOpenChange={onHoursOpenChange}
        isOwnProfile={isOwnProfile}
      />

      {activeTab === "home" && (
        <AtelierHomeTab
          store={store}
          isOwnProfile={isOwnProfile}
          trackAnalytics={shouldTrack}
          onNavigate={handleNavigate}
          onOpenCollection={handleOpenCollection}
          onOpenHours={() => onHoursOpenChange(true)}
          onTrackBehaviour={trackBehaviour}
        />
      )}

      {(activeTab === "products" || activeTab === "bikes") && (
        <AtelierCatalogTab
          store={store}
          page={activeTab === "bikes" ? "bikes" : "products"}
          storeSearch={storeSearch}
          onStoreSearchChange={setStoreSearch}
          selectedCategory={selectedCategory}
          onCategoryToggle={handleCategoryToggle}
          showSaleOnly={showSaleOnly}
          onSaleOnlyToggle={handleSaleOnlyToggle}
          sort={sort}
          onSortChange={setSort}
          trackAnalytics={shouldTrack}
        />
      )}

      {activeTab === "rentals" && (
        <AtelierRentalsTab store={store} onCall={() => handleNavigate("call")} />
      )}

      {activeTab === "service" && (
        <AtelierServiceTab store={store} onCall={() => handleNavigate("call")} />
      )}

      {activeTab === "about" && (
        <AtelierAboutTab store={store} onOpenHours={() => onHoursOpenChange(true)} />
      )}

      {activeTab === "reviews" && (
        <div style={{ backgroundColor: STUDIO.surface, color: STUDIO.ink, minHeight: "60vh" }}>
          <div className="mx-auto max-w-3xl px-5 py-32 text-center sm:px-8">
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
              Reviews
            </p>
            <h1 className="mt-4 text-3xl sm:text-4xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
              No reviews yet
            </h1>
            <p className="mt-4 text-sm" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
              Reviews from customers will appear here once this store has been rated.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
