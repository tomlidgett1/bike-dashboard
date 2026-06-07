"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GenieChartPayload } from "@/components/genie/genie-chart";
import type { GenieTablePayload } from "@/components/genie/genie-data-table";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import {
  mergeVisualArgsWithWidget,
  type DashboardWidgetQuerySource,
} from "@/lib/dashboard/dashboard-query-visual";
import {
  addDashboardWidget,
  isWidgetOnDashboard,
  type DashboardWidgetPayload,
} from "@/lib/dashboard/store-dashboard";

type PinPayload =
  | { type: "chart"; data: GenieChartPayload }
  | { type: "table"; data: GenieTablePayload }
  | { type: "pivot"; data: GeniePivotTablePayload };

export function PinToDashboardButton({
  payload,
  title,
  querySource,
  className,
}: {
  payload: PinPayload;
  title: string;
  querySource?: DashboardWidgetQuerySource;
  className?: string;
}) {
  const [pinned, setPinned] = React.useState(false);
  const [justPinned, setJustPinned] = React.useState(false);

  React.useEffect(() => {
    setPinned(isWidgetOnDashboard(payload.type, title));
  }, [payload.type, title]);

  const handlePin = () => {
    if (pinned) return;
    const enrichedQuerySource = querySource
      ? {
          ...querySource,
          visual: mergeVisualArgsWithWidget(
            querySource.visual,
            payload as DashboardWidgetPayload,
            title,
          ),
        }
      : undefined;
    addDashboardWidget(payload as DashboardWidgetPayload, title, enrichedQuerySource);
    setPinned(true);
    setJustPinned(true);
    window.setTimeout(() => setJustPinned(false), 2400);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handlePin}
        disabled={pinned}
        className="h-8 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground"
        aria-label={pinned ? "Already on dashboard" : "Add to dashboard"}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        {pinned ? "On dashboard" : "Dashboard"}
      </Button>
      {justPinned ? (
        <Link
          href="/settings/store/dashboard"
          className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
        >
          View
        </Link>
      ) : null}
    </div>
  );
}
