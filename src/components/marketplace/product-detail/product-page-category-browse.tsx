"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SolarProvider, Bag } from "@solar-icons/react";
import { preload } from "swr";
import { BikeIcon } from "@/components/ui/bike-icon";
import { cn } from "@/lib/utils";
import { buildStaticCategoryHierarchy } from "@/lib/marketplace/canonical-taxonomy";
import {
  CATEGORY_PARENT_SECTIONS,
  resolveCategorySectionId,
  type CategoryParentSection,
} from "@/lib/constants/category-sections";

type CategoryHierarchy = {
  level1: string;
  level2Categories: {
    name: string;
    count: number;
    level3Categories: {
      name: string;
      count: number;
    }[];
  }[];
  totalProducts: number;
};

type BrowseSection = {
  section: CategoryParentSection;
  categories: CategoryHierarchy[];
  totalProducts: number;
};

const PANEL_EASE = "cubic-bezier(0.04, 0.62, 0.23, 0.98)";
const PANEL_DURATION_MS = 420;

/** Browse space for category navigation (For You ignores level filters). */
const BROWSE_SPACE = "stores";

function categoryTabClass(active: boolean, hovered: boolean) {
  return cn(
    "relative flex h-10 shrink-0 items-center gap-1.5 px-0.5 text-sm leading-none whitespace-nowrap transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20",
    active || hovered
      ? "font-semibold text-black"
      : "font-medium text-gray-500 hover:text-gray-700",
    active &&
      "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:z-[3] after:h-[3px] after:bg-[#ffde59]",
  );
}

function prefetchCategoryProducts(level1: string, level2?: string | null, level3?: string | null) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "50");
  params.set("listingType", "store_inventory");
  params.set("level1", level1);
  if (level2) params.set("level2", level2);
  if (level3) params.set("level3", level3);
  const url = `/api/marketplace/products?${params}`;
  preload(url, (key: string) => fetch(key).then((res) => res.json()));
}

function marketplaceUrl(
  level1: string | null,
  level2?: string | null,
  level3?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("space", BROWSE_SPACE);
  if (level1) params.set("level1", level1);
  if (level2) params.set("level2", level2);
  if (level3) params.set("level3", level3);
  return `/marketplace?${params.toString()}`;
}

function groupHierarchyIntoSections(categories: CategoryHierarchy[]): BrowseSection[] {
  const bySection = new Map<string, CategoryHierarchy[]>();

  for (const category of categories) {
    const sectionId = resolveCategorySectionId(category.level1);
    const list = bySection.get(sectionId) ?? [];
    list.push(category);
    bySection.set(sectionId, list);
  }

  return CATEGORY_PARENT_SECTIONS.map((section) => {
    const sectionCategories = bySection.get(section.id) ?? [];
    return {
      section,
      categories: sectionCategories,
      totalProducts: sectionCategories.reduce((sum, category) => sum + category.totalProducts, 0),
    };
  }).filter((group) => group.categories.length > 0);
}

function CategoryMegaPanel({
  browseSection,
  activeLevel1,
  activeLevel2,
  activeLevel3,
}: {
  browseSection: BrowseSection;
  activeLevel1?: string | null;
  activeLevel2?: string | null;
  activeLevel3?: string | null;
}) {
  const l1Columns = browseSection.categories;

  return (
    <div className="px-4 py-7 sm:px-6 sm:py-8 xl:px-5">
      <div className="mx-auto max-w-[1536px]">
        <p className="mb-5 text-xs font-medium text-gray-500">
          Browse {browseSection.section.label}
        </p>
        <div
          className={cn(
            "grid gap-x-14 gap-y-8",
            l1Columns.length >= 4
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : l1Columns.length === 3
                ? "w-fit max-w-full sm:grid-cols-2 lg:grid-cols-3"
                : l1Columns.length === 2
                  ? "w-fit max-w-full sm:grid-cols-2"
                  : "grid-cols-1",
          )}
        >
          {l1Columns.map((category) => (
            <div key={category.level1} className="min-w-0">
              <Link
                href={marketplaceUrl(category.level1)}
                className={cn(
                  "mb-3 block text-lg font-semibold tracking-tight text-gray-900 transition-colors hover:text-gray-600",
                  activeLevel1 === category.level1 && !activeLevel2 && "text-black",
                )}
                onMouseEnter={() => prefetchCategoryProducts(category.level1)}
              >
                {category.level1}
              </Link>
              <ul className="space-y-1.5">
                {category.level2Categories.map((subcategory) => {
                  const subActive =
                    activeLevel1 === category.level1 &&
                    activeLevel2 === subcategory.name &&
                    !activeLevel3;

                  return (
                    <li key={subcategory.name}>
                      <Link
                        href={marketplaceUrl(category.level1, subcategory.name)}
                        className={cn(
                          "block text-sm text-gray-700 transition-colors hover:text-gray-900",
                          subActive && "font-medium text-black",
                        )}
                        onMouseEnter={() =>
                          prefetchCategoryProducts(category.level1, subcategory.name)
                        }
                      >
                        {subcategory.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProductPageCategoryBrowse({
  activeLevel1 = null,
  activeLevel2 = null,
  activeLevel3 = null,
  className,
  onMenuOpenChange,
  leading,
}: {
  activeLevel1?: string | null;
  activeLevel2?: string | null;
  activeLevel3?: string | null;
  className?: string;
  onMenuOpenChange?: (open: boolean) => void;
  /** Optional content left of category links (e.g. space slider pills). */
  leading?: React.ReactNode;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [categories, setCategories] = React.useState<CategoryHierarchy[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hoveredSectionId, setHoveredSectionId] = React.useState<string | null>(null);
  const [isPanelExpanded, setIsPanelExpanded] = React.useState(false);
  const [barTinted, setBarTinted] = React.useState(false);
  const [panelTop, setPanelTop] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    void fetch("/api/marketplace/categories")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const fromApi = data?.categories as CategoryHierarchy[] | undefined;
        setCategories(
          fromApi && fromApi.length > 0
            ? fromApi
            : (buildStaticCategoryHierarchy() as CategoryHierarchy[]),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCategories(buildStaticCategoryHierarchy() as CategoryHierarchy[]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const browseSections = React.useMemo(
    () => groupHierarchyIntoSections(categories),
    [categories],
  );

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearOpenTimer = React.useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const openSection = React.useCallback(
    (sectionId: string) => {
      clearCloseTimer();
      clearOpenTimer();
      setHoveredSectionId(sectionId);
      setBarTinted(true);

      if (isPanelExpanded) {
        return;
      }

      openTimerRef.current = setTimeout(() => {
        setIsPanelExpanded(true);
      }, 70);
    },
    [clearCloseTimer, clearOpenTimer, isPanelExpanded],
  );

  const scheduleClose = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setIsPanelExpanded(false);
    setBarTinted(false);
    closeTimerRef.current = setTimeout(() => setHoveredSectionId(null), PANEL_DURATION_MS);
  }, [clearCloseTimer, clearOpenTimer]);

  React.useEffect(
    () => () => {
      clearCloseTimer();
      clearOpenTimer();
    },
    [clearCloseTimer, clearOpenTimer],
  );

  const hoveredSection = React.useMemo(
    () => browseSections.find((group) => group.section.id === hoveredSectionId) ?? null,
    [browseSections, hoveredSectionId],
  );

  const panelOpen = Boolean(
    isPanelExpanded && hoveredSection && hoveredSection.categories.length > 0,
  );

  React.useEffect(() => {
    onMenuOpenChange?.(panelOpen);
    return () => onMenuOpenChange?.(false);
  }, [panelOpen, onMenuOpenChange]);

  const updatePanelTop = React.useCallback(() => {
    if (!rootRef.current) return;
    setPanelTop(rootRef.current.getBoundingClientRect().bottom);
  }, []);

  React.useEffect(() => {
    if (!panelOpen) return;
    updatePanelTop();
    window.addEventListener("scroll", updatePanelTop, true);
    window.addEventListener("resize", updatePanelTop);
    return () => {
      window.removeEventListener("scroll", updatePanelTop, true);
      window.removeEventListener("resize", updatePanelTop);
    };
  }, [panelOpen, updatePanelTop]);

  const handleMenuPointerLeave = React.useCallback(
    (event: React.PointerEvent) => {
      const related = event.relatedTarget as Node | null;
      if (
        related &&
        (rootRef.current?.contains(related) || panelRef.current?.contains(related))
      ) {
        return;
      }
      scheduleClose();
    },
    [scheduleClose],
  );

  const handlePanelPointerEnter = React.useCallback(() => {
    clearCloseTimer();
    setBarTinted(true);
  }, [clearCloseTimer]);

  const resetMenu = React.useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
    setIsPanelExpanded(false);
    setBarTinted(false);
    setHoveredSectionId(null);
  }, [clearCloseTimer, clearOpenTimer]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-10 w-full items-center justify-start gap-5 border-b border-gray-100 bg-gray-50 px-4 xl:px-5",
          className,
        )}
      >
        {leading ? <div className="h-8 w-64 shrink-0 animate-pulse rounded-full bg-gray-100" /> : null}
        <div className="h-4 w-24 animate-pulse rounded-md bg-gray-100" />
        <div className="h-4 w-28 animate-pulse rounded-md bg-gray-100" />
        <div className="h-4 w-24 animate-pulse rounded-md bg-gray-100" />
      </div>
    );
  }

  if (browseSections.length === 0) {
    if (!leading) return null;
    return (
      <div
        className={cn(
          "flex h-10 w-full items-center border-b border-gray-100 bg-gray-50",
          className,
        )}
      >
        {leading}
      </div>
    );
  }

  const allCategoriesActive = !activeLevel1 && !activeLevel2 && !activeLevel3;
  const activeSectionId = activeLevel1 ? resolveCategorySectionId(activeLevel1) : null;

  return (
    <SolarProvider value={{ weight: "Linear", color: "currentColor" }} svgProps={{ strokeWidth: 2 }}>
      <div
        ref={rootRef}
        className={cn(
          "relative w-full border-b border-gray-100 bg-gray-50 transition-colors duration-300 ease-out",
          barTinted && "bg-gray-100/80",
        )}
        onPointerLeave={handleMenuPointerLeave}
      >
        <nav
          aria-label="Browse categories"
          className={cn(
            "flex h-10 w-full items-center justify-start gap-4 overflow-x-auto overflow-y-visible scrollbar-hide sm:gap-5",
            className,
          )}
        >
          {leading ? (
            <>
              <div className="flex shrink-0 items-center">{leading}</div>
              <div className="h-4 w-px shrink-0 bg-gray-200" aria-hidden />
            </>
          ) : null}

          <div className="flex min-w-0 items-center justify-start gap-5 sm:gap-6">
            <Link
              href={marketplaceUrl(null)}
              className={categoryTabClass(allCategoriesActive, false)}
              onMouseEnter={resetMenu}
            >
              <Bag className="h-4 w-4 shrink-0" />
              All categories
            </Link>

            {browseSections.map((group) => {
              const isActive = activeSectionId === group.section.id;
              const isHovered = hoveredSectionId === group.section.id;
              const primaryLevel1 = group.categories[0]?.level1 ?? null;

              return (
                <Link
                  key={group.section.id}
                  href={marketplaceUrl(primaryLevel1)}
                  className={categoryTabClass(isActive, isHovered)}
                  onMouseEnter={() => openSection(group.section.id)}
                >
                  <BikeIcon
                    iconName={group.section.icon}
                    size={16}
                    className="h-4 w-4 shrink-0 opacity-90"
                  />
                  {group.section.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {mounted && hoveredSection
          ? createPortal(
              <div
                ref={panelRef}
                className={cn(
                  "fixed inset-x-0 z-[45] grid border-b border-gray-200 bg-gray-100/80 transition-[grid-template-rows] duration-[420ms] ease-[cubic-bezier(0.04,0.62,0.23,0.98)]",
                  panelOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  panelOpen ? "pointer-events-auto" : "pointer-events-none",
                )}
                style={{ top: panelTop, transitionTimingFunction: PANEL_EASE }}
                aria-hidden={!panelOpen}
                onPointerEnter={handlePanelPointerEnter}
                onPointerLeave={handleMenuPointerLeave}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "bg-gray-100/80 transition-opacity duration-300 ease-out",
                      panelOpen ? "opacity-100 delay-75" : "opacity-0 delay-0",
                    )}
                  >
                    <CategoryMegaPanel
                      browseSection={hoveredSection}
                      activeLevel1={activeLevel1}
                      activeLevel2={activeLevel2}
                      activeLevel3={activeLevel3}
                    />
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </SolarProvider>
  );
}
