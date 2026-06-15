"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { cn } from "@/lib/utils";

export const topbarActionClass = cn(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5",
  "text-xs text-muted-foreground transition-colors",
  "hover:bg-muted/60 hover:text-foreground"
);

/** Shared bordered control chrome for dashboard header actions. */
export const dashboardHeaderBoxClass = cn(
  "inline-flex h-8 shrink-0 items-center justify-center rounded-md border transition-colors",
  "!bg-[var(--dashboard-header-control-bg)]",
  "!border-[color:var(--dashboard-header-control-border)]",
  "!text-[color:var(--dashboard-header-control-fg)]",
  "hover:!bg-[var(--dashboard-header-control-hover-bg)]",
  "hover:!text-[color:var(--dashboard-header-control-hover-fg)]",
);

/** Active/pressed state for dashboard header controls. */
export const dashboardHeaderControlActiveClass =
  "!bg-[var(--dashboard-header-control-active-bg)] !text-[color:var(--dashboard-header-control-hover-fg)]";

/** Text controls in the dashboard header (Docs, Ask, Feedback). */
export const topbarOutlinePillClass = cn(
  dashboardHeaderBoxClass,
  "gap-1.5 px-3 text-xs font-medium",
);

/** Icon-only controls in the dashboard header. */
export const topbarIconButtonClass = cn(
  dashboardHeaderBoxClass,
  "relative size-8 [&_svg]:shrink-0 [&_svg]:text-current",
);

/** @deprecated Use topbarActionClass */
export const topbarPillClass = topbarActionClass;

export function TopbarNavPills() {
  const { profile } = useUserProfile();
  const storeId = profile?.user_id;

  if (!storeId) return null;

  return (
    <div className="hidden items-center gap-0.5 sm:flex">
      <Link
        href={`/marketplace/store/${storeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={topbarActionClass}
      >
        <ExternalLink className="size-3.5 shrink-0" />
        <span className="hidden lg:inline">View store</span>
      </Link>
    </div>
  );
}
