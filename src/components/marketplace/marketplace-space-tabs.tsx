"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { SolarProvider, MagicStick3, Bag, Shop } from "@solar-icons/react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import type { ViewMode } from "@/components/marketplace/unified-filter-bar";

function UberLogo({
  active,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/uber.png"
      alt="Uber"
      width={52}
      height={18}
      className={cn(
        "h-3.5 w-auto max-w-none transition-[filter,opacity] duration-200",
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

interface SpaceTabActions {
  isForYouActive: boolean;
  isBrowseActive: boolean;
  isStoresActive: boolean;
  isUberActive: boolean;
  goForYou: () => void;
  setOptimisticTab: (space: MarketplaceSpace) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigateToStores?: () => void;
  onNavigateToUber?: () => void;
  onPrefetchSpace?: (space: MarketplaceSpace) => void;
}

const INDICATOR_SPRING = {
  type: "spring" as const,
  stiffness: 480,
  damping: 38,
  mass: 0.65,
};

/** Underline tabs that match the category browse strip. */
function SpaceUnderlineTabs({
  actions,
  className,
}: {
  actions: SpaceTabActions;
  className?: string;
}) {
  const {
    isForYouActive,
    isBrowseActive,
    isStoresActive,
    isUberActive,
    goForYou,
    setOptimisticTab,
    onViewModeChange,
    onNavigateToStores,
    onNavigateToUber,
    onPrefetchSpace,
  } = actions;

  const indicatorLayoutId = React.useId();

  const tabs: {
    space: MarketplaceSpace;
    label: React.ReactNode;
    active: boolean;
    onSelect: () => void;
    uber?: boolean;
  }[] = [
    {
      space: "for-you",
      active: isForYouActive,
      onSelect: goForYou,
      label: (
        <>
          <MagicStick3 className="h-4 w-4 shrink-0" />
          For You
        </>
      ),
    },
    {
      space: "marketplace",
      active: isBrowseActive,
      onSelect: () => {
        setOptimisticTab("marketplace");
        onViewModeChange("all");
      },
      label: (
        <>
          <Bag className="h-4 w-4 shrink-0" />
          Marketplace
        </>
      ),
    },
    {
      space: "stores",
      active: isStoresActive,
      onSelect: () => {
        setOptimisticTab("stores");
        onNavigateToStores?.();
      },
      label: (
        <>
          <Shop className="h-4 w-4 shrink-0" />
          Bike Stores
        </>
      ),
    },
    {
      space: "uber",
      active: isUberActive,
      uber: true,
      onSelect: () => {
        setOptimisticTab("uber");
        onNavigateToUber?.();
      },
      label: <UberLogo active={isUberActive} />,
    },
  ];

  return (
    <LayoutGroup id={indicatorLayoutId}>
      <nav
        className={cn(
          "flex h-10 min-w-0 items-center gap-5 overflow-visible sm:gap-6",
          className,
        )}
        aria-label="Marketplace sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.space}
            type="button"
            onPointerDown={() => onPrefetchSpace?.(tab.space)}
            onClick={tab.onSelect}
            className={cn(
              "group relative flex h-10 shrink-0 cursor-pointer items-center gap-1.5 px-0.5 text-sm leading-none whitespace-nowrap transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
              tab.uber && "min-w-14 justify-center px-1",
              tab.active
                ? "font-semibold text-black"
                : "font-medium text-gray-500 hover:text-gray-700",
            )}
            aria-label={tab.uber ? "Uber delivery" : undefined}
          >
            {tab.label}
            {tab.active ? (
              <motion.span
                layoutId="category-space-tab-indicator"
                className="pointer-events-none absolute inset-x-0 top-full z-[3] h-[3px]"
                style={{
                  backgroundColor: tab.uber ? "#047848" : "#ffde59",
                }}
                transition={INDICATOR_SPRING}
              />
            ) : null}
          </button>
        ))}
      </nav>
    </LayoutGroup>
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
  /**
   * `inline` renders underline tabs for the category browse strip.
   * `filters` renders only the trailing filter controls row.
   */
  variant?: "inline" | "filters";
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
  variant = "inline",
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

  const tabActions: SpaceTabActions = {
    isForYouActive,
    isBrowseActive,
    isStoresActive,
    isUberActive,
    goForYou,
    setOptimisticTab,
    onViewModeChange,
    onNavigateToStores,
    onNavigateToUber,
    onPrefetchSpace,
  };

  if (variant === "filters") {
    if (!trailing) return null;
    return (
      <div
        className={cn(
          "flex h-10 items-center justify-end gap-4 overflow-visible px-4 sm:px-6",
          className,
        )}
      >
        <div className="flex h-10 flex-shrink-0 items-center">{trailing}</div>
      </div>
    );
  }

  return (
    <SolarProvider value={{ weight: "Linear", color: "currentColor" }} svgProps={{ strokeWidth: 2 }}>
      <SpaceUnderlineTabs actions={tabActions} className={className} />
    </SolarProvider>
  );
}
