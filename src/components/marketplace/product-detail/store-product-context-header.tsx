"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Phone } from '@/components/layout/app-sidebar/dashboard-icons';
import {
  StoreProfileChrome,
  STORE_PAGE_CONTENT_SHELL,
  countStoreProducts,
  storeTabHref,
  type StoreTab,
} from "@/components/marketplace/store-profile/store-profile-chrome";
import { useNestStorefrontChat } from "@/components/providers/nest-storefront-chat-provider";
import type { StoreProfile } from "@/lib/types/store";

type StoreProductContextHeaderProps = {
  storeId: string;
  /** Server-prefetched store profile — renders instantly with no loading spinner. */
  initialStore?: StoreProfile | null;
  /** Optional actions rendered in the top header row (e.g. Exit customer view) */
  actionButtons?: React.ReactNode;
};

export function StoreProductContextHeader({
  storeId,
  initialStore = null,
  actionButtons,
}: StoreProductContextHeaderProps) {
  const router = useRouter();
  const { openChatbot } = useNestStorefrontChat();
  const [store, setStore] = React.useState<StoreProfile | null>(initialStore);
  const [loading, setLoading] = React.useState(!initialStore);
  const [storeSearch, setStoreSearch] = React.useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [hoursOpen, setHoursOpen] = React.useState(false);

  const initialStoreId = initialStore?.id ?? null;

  React.useEffect(() => {
    if (initialStore && initialStoreId === storeId) {
      setStore(initialStore);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/marketplace/store/${storeId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Store request failed: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled && data.store) {
          setStore(data.store as StoreProfile);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("[Product page] Failed to load store chrome:", error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // initialStore is only used when its id matches storeId; depend on id to avoid object churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [storeId, initialStoreId]);

  React.useEffect(() => {
    const query = storeSearch.trim();
    if (!query) return;

    const timer = window.setTimeout(() => {
      router.push(storeTabHref(storeId, "products", query));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [storeId, storeSearch, router]);

  if (loading) {
    return (
      <div className="sticky top-0 z-40 flex h-14 items-center justify-center border-b border-gray-200 bg-white/95 backdrop-blur-md sm:h-16">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!store) {
    return null;
  }

  const showHeaderSearch = countStoreProducts(store) > 0;

  const contextActions = (
    <div className="flex items-center gap-2">
      {store.phone && (
        <a
          href={`tel:${store.phone}`}
          title={`Call ${store.store_name}`}
          className="hidden h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 lg:inline-flex"
        >
          <Phone className="h-3.5 w-3.5 text-gray-500" />
          {store.phone}
        </a>
      )}
      <button
        type="button"
        onClick={() =>
          openChatbot({
            storeId: store.id,
            storeName: store.store_name,
            storeLogoUrl: store.logo_url,
          })
        }
        title={`Chat with ${store.store_name}`}
        className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border border-[#f2e7a8] bg-[#fff8d6] px-3 text-xs font-semibold text-gray-900 transition-colors hover:bg-[#fff3bf]"
      >
        <MessageCircle className="h-3.5 w-3.5 text-gray-800" />
        <span className="hidden sm:inline">Chat</span>
      </button>
      {actionButtons}
    </div>
  );

  return (
    <StoreProfileChrome
      store={store}
      contentShell={STORE_PAGE_CONTENT_SHELL}
      activeTab={null}
      storeSearch={storeSearch}
      onStoreSearchChange={setStoreSearch}
      mobileSearchOpen={mobileSearchOpen}
      onMobileSearchOpenChange={setMobileSearchOpen}
      showHeaderSearch={showHeaderSearch}
      hoursOpen={hoursOpen}
      onHoursOpenChange={setHoursOpen}
      getTabHref={(tab: StoreTab) => storeTabHref(storeId, tab)}
      actionButtons={contextActions}
      productContext
    />
  );
}
