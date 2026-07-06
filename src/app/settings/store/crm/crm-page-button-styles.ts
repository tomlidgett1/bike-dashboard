import { cn } from "@/lib/utils";
import { storeSettingsHeaderActionClass } from "@/components/settings/actions-page-header";

export { storeSettingsHeaderActionClass };

/** Primary CTA — keep yellow, pill-shaped */
export const crmPrimaryButtonClass = "rounded-full";

/** Outline Button override (use with variant="outline") */
export const crmOutlineButtonClass =
  "rounded-full border-gray-200/80 bg-white shadow-sm hover:bg-gray-50";

/** Icon-only header control (settings cog, etc.) */
export const crmIconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

/** Compact icon action on cards / rows */
export const crmCardIconButtonClass =
  "inline-flex rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground disabled:opacity-40";

/** Sort / filter dropdown triggers — match filter pill row height (py-1.5 text-xs) */
export const crmDropdownTriggerClass =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200/80 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10";

/** Filter chip group (All / Subscribed / Opted out) */
export const crmFilterPillsClass = "flex shrink-0 items-center rounded-full bg-gray-100 p-0.5";

export function crmFilterPillClass(active: boolean) {
  return cn(
    "shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors",
    active ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:bg-gray-200/70",
  );
}

/** Segmented control on white (repeat, send mode, preview toggles) */
export const crmSegmentPillsClass =
  "flex items-center rounded-full border border-gray-200/80 bg-gray-100 p-0.5";

export function crmSegmentPillClass(active: boolean, compact = false) {
  return cn(
    "font-medium rounded-full transition-colors",
    compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-1.5 text-sm",
    active ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:bg-gray-200/70",
  );
}

/** Toolbar control in agent preview panel */
export const crmToolbarControlClass =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-gray-200/80 bg-white px-2.5 text-xs font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 @min-[560px]/preview:px-3";

/** Grouped read-only stat bar (contacts / subscribed / opted out) */
export const crmStatBarClass =
  "hidden shrink-0 items-center rounded-full border border-gray-200/80 bg-white p-0.5 shadow-sm lg:inline-flex";

export const crmStatBarDividerClass = "h-3 w-px shrink-0 bg-gray-200/80";

export const crmStatBarItemClass = "inline-flex items-baseline gap-1 px-2.5 py-1.5 text-xs";
