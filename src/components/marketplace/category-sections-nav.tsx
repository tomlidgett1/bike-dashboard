"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { BikeIcon, getCategoryIconName } from "@/components/ui/bike-icon";
import { BRAND_YELLOW } from "@/lib/constants/brand-colors";
import { groupCategoriesBySection } from "@/lib/constants/category-sections";
import type { DynamicCategory } from "@/lib/constants/category-sections";

interface CategorySectionsNavProps {
  categories: DynamicCategory[];
  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onCategoryClick: (level1: string) => void;
  onCategoryHover?: (level1: string) => void;
  loading?: boolean;
  className?: string;
}

function CategorySectionsSkeleton() {
  return <div className="h-10 w-full max-w-sm animate-pulse rounded-md bg-gray-100" />;
}

function CategoryChip({
  label,
  level1,
  isActive,
  onClick,
  onMouseEnter,
}: {
  label: string;
  level1: string;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-white px-2.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
        isActive
          ? "border-2 text-gray-900"
          : "border-gray-200 text-gray-700 hover:border-gray-300",
      )}
      style={isActive ? ({ borderColor: BRAND_YELLOW } as React.CSSProperties) : undefined}
    >
      <BikeIcon
        iconName={getCategoryIconName(level1)}
        size={14}
        className="h-3.5 w-3.5 shrink-0 opacity-90"
      />
      {label}
    </button>
  );
}

export function CategorySectionsNav({
  categories,
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onCategoryClick,
  onCategoryHover,
  loading = false,
  className,
}: CategorySectionsNavProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const grouped = React.useMemo(
    () => groupCategoriesBySection(categories),
    [categories],
  );

  const [expandedSectionId, setExpandedSectionId] = React.useState<string | null>(null);

  const expandedGroup = React.useMemo(
    () => grouped.find((group) => group.section.id === expandedSectionId) ?? null,
    [grouped, expandedSectionId],
  );

  const hasActiveCategory =
    !!selectedLevel1 && !selectedLevel2 && !selectedLevel3;

  const activeLabel = React.useMemo(() => {
    if (!selectedLevel1) return null;
    return categories.find((category) => category.level1 === selectedLevel1)?.label ?? selectedLevel1;
  }, [categories, selectedLevel1]);

  React.useEffect(() => {
    if (!expandedSectionId) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpandedSectionId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [expandedSectionId]);

  const handleSectionClick = (sectionId: string) => {
    setExpandedSectionId((current) => (current === sectionId ? null : sectionId));
  };

  const handleClearAll = () => {
    setExpandedSectionId(null);
    if (selectedLevel1) {
      onCategoryClick(selectedLevel1);
    }
  };

  const handleCategorySelect = (level1: string) => {
    onCategoryClick(level1);
    setExpandedSectionId(null);
  };

  if (loading) {
    return (
      <div className={className}>
        <CategorySectionsSkeleton />
      </div>
    );
  }

  if (grouped.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className={cn("relative h-10", className)}>
      <div className="flex h-10 min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide">
        <div className="flex shrink-0 items-center rounded-md bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={handleClearAll}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              !hasActiveCategory
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            All
          </button>

          {grouped.map((group) => {
            const isExpanded = expandedSectionId === group.section.id;
            const sectionHasSelection = group.items.some(
              ({ level1 }) =>
                selectedLevel1 === level1 && !selectedLevel2 && !selectedLevel3,
            );

            return (
              <button
                key={group.section.id}
                type="button"
                onClick={() => handleSectionClick(group.section.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
                  isExpanded
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                <BikeIcon
                  iconName={group.section.icon}
                  size={15}
                  className="h-4 w-4 shrink-0 opacity-90"
                />
                {group.section.label}
                {sectionHasSelection && !isExpanded ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: BRAND_YELLOW }}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {hasActiveCategory && activeLabel && !expandedSectionId ? (
          <button
            type="button"
            onClick={handleClearAll}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 transition-colors hover:border-gray-300 cursor-pointer"
            style={{ borderColor: `${BRAND_YELLOW}99` }}
          >
            <BikeIcon
              iconName={getCategoryIconName(selectedLevel1!)}
              size={14}
              className="h-3.5 w-3.5 shrink-0 opacity-90"
            />
            <span className="max-w-[8rem] truncate">{activeLabel}</span>
            <X className="h-3 w-3 text-gray-400" />
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expandedGroup ? (
          <motion.div
            key={expandedGroup.section.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-[calc(100%+6px)] left-0 right-0 z-30"
          >
            <div className="rounded-md border border-gray-200 bg-white px-2 py-2 shadow-lg">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                {expandedGroup.items.map(({ label, level1 }) => (
                  <CategoryChip
                    key={level1}
                    label={label}
                    level1={level1}
                    isActive={
                      selectedLevel1 === level1 &&
                      !selectedLevel2 &&
                      !selectedLevel3
                    }
                    onClick={() => handleCategorySelect(level1)}
                    onMouseEnter={() => onCategoryHover?.(level1)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
