"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SolarProvider, MagicStick3, Bag, Shop } from "@solar-icons/react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import type { ViewMode } from "@/components/marketplace/unified-filter-bar";

function UberLogo({ active, className }: { active?: boolean; className?: string }) {
  return (
    <Image
      src="/uber.png"
      alt="Uber"
      width={52}
      height={18}
      className={cn(
        "h-4 w-auto max-w-none transition-[filter,opacity] duration-200",
        !active && "opacity-50 grayscale group-hover:opacity-70",
        className,
      )}
      style={
        active
          ? {
              filter:
                "brightness(0) saturate(100%) invert(27%) sepia(96%) saturate(1200%) hue-rotate(130deg) brightness(92%) contrast(94%)",
            }
          : undefined
      }
      unoptimized
    />
  );
}

function gitTabClass(active: boolean) {
  return cn(
    "relative flex h-10 shrink-0 cursor-pointer items-center gap-1.5 px-0.5 text-sm leading-none whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
    active
      ? "font-semibold text-black"
      : "font-medium text-gray-500 hover:text-gray-700",
    active &&
      "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:z-[3] after:h-[3px] after:bg-[#ffde59]",
  );
}

interface MarketplaceSpaceTabsProps {
  currentSpace: MarketplaceSpace;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigateToStores?: () => void;
  onNavigateToUber?: () => void;
  onNavigateToForYou?: () => void;
  onPrefetchSpace?: (space: MarketplaceSpace) => void;
  /** Filter controls rendered on the right (desktop nav bar). */
  trailing?: React.ReactNode;
  className?: string;
}

export function MarketplaceSpaceTabs({
  currentSpace,
  viewMode,
  onViewModeChange,
  onNavigateToStores,
  onNavigateToUber,
  onNavigateToForYou,
  onPrefetchSpace,
  trailing,
  className,
}: MarketplaceSpaceTabsProps) {
  const router = useRouter();
  const [optimisticTab, setOptimisticTab] = React.useState<MarketplaceSpace | null>(null);

  React.useEffect(() => {
    setOptimisticTab(null);
  }, [currentSpace, viewMode]);

  const isBrowseActive = optimisticTab ? optimisticTab === "marketplace" : currentSpace === "marketplace";
  const isStoresActive = optimisticTab ? optimisticTab === "stores" : currentSpace === "stores";
  const isUberActive = optimisticTab ? optimisticTab === "uber" : currentSpace === "uber";
  const isForYouActive = optimisticTab ? optimisticTab === "for-you" : currentSpace === "for-you";

  const goForYou = () => {
    if (onNavigateToForYou) {
      setOptimisticTab("for-you");
      onNavigateToForYou();
    } else {
      router.push("/marketplace?space=for-you");
    }
  };

  return (
    <SolarProvider value={{ weight: "Linear", color: "currentColor" }} svgProps={{ strokeWidth: 2 }}>
      <div
        className={cn(
          "flex h-10 items-center justify-between gap-4 overflow-visible px-4 sm:px-6",
          className,
        )}
      >
        <nav
          className="flex h-10 min-w-0 items-center gap-5 overflow-x-auto overflow-y-visible scrollbar-hide sm:gap-6"
          aria-label="Marketplace sections"
        >
          <button
            type="button"
            onPointerDown={() => onPrefetchSpace?.("for-you")}
            onClick={goForYou}
            className={gitTabClass(isForYouActive)}
          >
            <MagicStick3 className="h-4 w-4 flex-shrink-0" />
            For You
          </button>
          <button
            type="button"
            onPointerDown={() => onPrefetchSpace?.("marketplace")}
            onClick={() => {
              setOptimisticTab("marketplace");
              onViewModeChange("all");
            }}
            className={gitTabClass(isBrowseActive)}
          >
            <Bag className="h-4 w-4 flex-shrink-0" />
            Marketplace
          </button>
          <button
            type="button"
            onPointerDown={() => onPrefetchSpace?.("stores")}
            onClick={() => {
              setOptimisticTab("stores");
              onNavigateToStores?.();
            }}
            className={gitTabClass(isStoresActive)}
          >
            <Shop className="h-4 w-4 flex-shrink-0" />
            Bike Stores
          </button>
          <button
            type="button"
            onPointerDown={() => onPrefetchSpace?.("uber")}
            onClick={() => {
              setOptimisticTab("uber");
              onNavigateToUber?.();
            }}
            className={cn(
              "group relative flex h-10 min-w-14 shrink-0 cursor-pointer items-center justify-center px-1 text-sm font-medium leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              isUberActive &&
                "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:z-[3] after:h-[3px] after:bg-[#047848]",
            )}
            aria-label="Uber delivery"
          >
            <UberLogo active={isUberActive} className="h-3.5" />
          </button>
        </nav>

        {trailing ? (
          <div className="flex h-10 flex-shrink-0 items-center">{trailing}</div>
        ) : null}
      </div>
    </SolarProvider>
  );
}
