"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  StoreProfileChrome,
  STORE_PAGE_CONTENT_SHELL,
  countStoreProducts,
  storeTabHref,
  type StoreTab,
} from "@/components/marketplace/store-profile/store-profile-chrome";
import type { StoreProfile } from "@/lib/types/store";

type StoreProductContextHeaderProps = {
  storeId: string;
};

export function StoreProductContextHeader({ storeId }: StoreProductContextHeaderProps) {
  const router = useRouter();
  const [store, setStore] = React.useState<StoreProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [storeSearch, setStoreSearch] = React.useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [hoursOpen, setHoursOpen] = React.useState(false);

  React.useEffect(() => {
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
  }, [storeId]);

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
    />
  );
}
