import { cn } from "@/lib/utils";

/** Sliding pill tab container — matches customer enquiries / SettingsNavTabs. */
export const dashboardTabPillsClass =
  "flex w-fit max-w-full items-center overflow-x-auto rounded-full bg-gray-100 p-0.5";

export function dashboardTabPillClass(active: boolean, compact = false) {
  return cn(
    "relative shrink-0 rounded-full font-medium transition-colors",
    compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-1.5 text-sm",
    active ? "text-gray-800" : "text-gray-600 hover:bg-gray-200/70",
  );
}

/** Compact filter / dropdown trigger in floating-card toolbars. */
export const dashboardFilterTriggerClass =
  "h-9 shrink-0 rounded-full border border-input bg-white px-3.5 font-normal shadow-none";

/** Search input in floating-card toolbars. */
export const dashboardToolbarSearchClass =
  "h-9 w-full rounded-full border border-input bg-white pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/30";

/** Header action buttons (outline / primary sm). */
export const dashboardHeaderButtonClass = "rounded-full";

/** Count badge beside filters/tabs. */
export const dashboardToolbarCountBadgeClass =
  "rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-800";
