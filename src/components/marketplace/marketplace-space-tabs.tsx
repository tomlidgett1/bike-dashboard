"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { SolarProvider, MagicStick3, Bag, Shop } from "@solar-icons/react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { UBER_GREEN } from "@/lib/uber-brand-colors";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import type { ViewMode } from "@/components/marketplace/unified-filter-bar";

function UberLogo({
  active,
  className,
  onGreenBackground = false,
}: {
  active?: boolean;
  className?: string;
  onGreenBackground?: boolean;
}) {
  if (onGreenBackground && active) {
    return (
      <Image
        src="/uberwhite.png"
        alt="Uber"
        width={52}
        height={18}
        className={cn("h-3.5 w-auto max-w-none", className)}
        unoptimized
      />
    );
  }

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

function floatingPillButtonClass(active: boolean) {
  return cn(
    "relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
    active ? "text-gray-800" : "text-gray-600 hover:bg-gray-200/70",
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

function InlineSpaceTabs({
  actions,
}: {
  actions: SpaceTabActions;
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

  return (
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
  );
}

const INDICATOR_SPRING = { type: "spring", bounce: 0.2, duration: 0.4 } as const;

function scrollPageToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function FloatingSpacePills({ actions }: { actions: SpaceTabActions }) {
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
          <MagicStick3 className="size-[15px] shrink-0" />
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
          <Bag className="size-[15px] shrink-0" />
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
          <Shop className="size-[15px] shrink-0" />
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
      label: <UberLogo active={isUberActive} className="h-3.5" onGreenBackground />,
    },
  ];

  return (
    <LayoutGroup id={indicatorLayoutId}>
      <nav
        className="flex w-fit items-center rounded-full border border-gray-200/80 bg-gray-100/95 p-0.5 shadow-md backdrop-blur-md"
        aria-label="Marketplace sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.space}
            type="button"
            onPointerDown={() => onPrefetchSpace?.(tab.space)}
            onClick={() => {
              scrollPageToTop();
              tab.onSelect();
            }}
            className={
              tab.uber
                ? cn(
                    "relative flex shrink-0 cursor-pointer items-center justify-center rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
                    !tab.active && "hover:bg-gray-200/70",
                  )
                : floatingPillButtonClass(tab.active)
            }
            aria-label={tab.uber ? "Uber delivery" : undefined}
          >
            {tab.active ? (
              <motion.div
                layoutId="floating-space-tab-indicator"
                className={cn(
                  "absolute inset-0 rounded-full shadow-sm",
                  !tab.uber && "bg-white",
                )}
                style={tab.uber ? { backgroundColor: UBER_GREEN } : undefined}
                transition={INDICATOR_SPRING}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-1.5">{tab.label}</span>
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
  /** Desktop: element to observe — category pills on browse tabs, feed sentinel on For You. */
  scrollSentinelRef?: React.RefObject<HTMLDivElement | null>;
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
  scrollSentinelRef,
  trailing,
  className,
}: MarketplaceSpaceTabsProps) {
  const router = useRouter();
  const [optimisticTab, setOptimisticTab] = React.useState<MarketplaceSpace | null>(null);
  const [showFloatingPills, setShowFloatingPills] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setOptimisticTab(null);
  }, [currentSpace, viewMode]);

  React.useEffect(() => {
    const desktopMq = window.matchMedia("(min-width: 640px)");
    let observer: IntersectionObserver | null = null;

    // Attach after a short delay so the category pills row has (re)mounted
    // after a space/view change. Crucially, do NOT hide the bar while
    // reattaching — unmounting it mid-transition kills the sliding
    // indicator animation.
    const attach = () => {
      const el = scrollSentinelRef?.current;
      if (!el || !desktopMq.matches) {
        setShowFloatingPills(false);
        return;
      }
      observer = new IntersectionObserver(
        ([entry]) => {
          setShowFloatingPills(desktopMq.matches && !entry.isIntersecting);
        },
        { threshold: 0, rootMargin: "-96px 0px 0px 0px" },
      );
      observer.observe(el);
    };

    const attachId = window.setTimeout(attach, 50);

    const handleViewportChange = () => {
      if (!desktopMq.matches) {
        setShowFloatingPills(false);
      }
    };
    desktopMq.addEventListener("change", handleViewportChange);

    return () => {
      window.clearTimeout(attachId);
      observer?.disconnect();
      desktopMq.removeEventListener("change", handleViewportChange);
    };
  }, [scrollSentinelRef, currentSpace, viewMode]);

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

  return (
    <SolarProvider value={{ weight: "Linear", color: "currentColor" }} svgProps={{ strokeWidth: 2 }}>
      <div
        className={cn(
          "flex h-10 items-center justify-between gap-4 overflow-visible px-4 sm:px-6",
          className,
        )}
      >
        <InlineSpaceTabs actions={tabActions} />

        {trailing ? (
          <div className="flex h-10 flex-shrink-0 items-center">{trailing}</div>
        ) : null}
      </div>

      {mounted
        ? createPortal(
            <AnimatePresence>
              {showFloatingPills ? (
                <motion.div
                  key="floating-space-pills"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="pointer-events-none fixed top-2.5 left-3 z-[60]"
                >
                  <div className="pointer-events-auto">
                    <FloatingSpacePills actions={tabActions} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </SolarProvider>
  );
}
