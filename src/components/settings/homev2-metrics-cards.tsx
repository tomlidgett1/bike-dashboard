"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  formatStoreAnalyticsDate,
  getStoreAnalyticsTimezoneShortLabel,
} from "@/lib/utils/format-store-analytics-date";

interface OverviewMetrics {
  rolling7Days: {
    startDate: string;
    endDate: string;
    totalDistinctViewers: number;
  };
  inventory: {
    marketplaceLive: number;
    withoutApprovedPhotos: number;
  };
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU").format(value || 0);
}

function formatTrackingRange(startDate: string, endDate: string) {
  if (startDate === endDate) return formatStoreAnalyticsDate(startDate);
  return `${formatStoreAnalyticsDate(startDate)} – ${formatStoreAnalyticsDate(endDate)}`;
}

function MetricCell({
  value,
  label,
  tooltip,
}: {
  value: string;
  label: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 cursor-default flex-col items-center justify-center px-3 py-3.5 text-center sm:px-4 sm:py-4">
          <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
            {value}
          </p>
          <p className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
            {label}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8} className="max-w-[220px] text-center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white/80 shadow-sm">
      <div className="grid grid-cols-3 divide-x divide-gray-200/70">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex flex-col items-center gap-2 px-3 py-4">
            <div className="h-7 w-12 animate-pulse rounded-md bg-gray-100" />
            <div className="h-3 w-16 animate-pulse rounded-md bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeV2MetricsCards({ className }: { className?: string }) {
  const [metrics, setMetrics] = React.useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const analyticsTimezoneLabel = getStoreAnalyticsTimezoneShortLabel();

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/store/overview?chartDays=7", {
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok || cancelled) return;

        const rolling7Days = json.webAnalytics?.rolling7Days;
        const inventory = json.inventory;
        if (!rolling7Days || !inventory) return;

        setMetrics({
          rolling7Days: {
            startDate: rolling7Days.startDate,
            endDate: rolling7Days.endDate,
            totalDistinctViewers: rolling7Days.totalDistinctViewers,
          },
          inventory: {
            marketplaceLive: inventory.marketplaceLive,
            withoutApprovedPhotos: inventory.withoutApprovedPhotos,
          },
        });
      } catch {
        if (!cancelled) setMetrics(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && !metrics) return null;

  const viewsTooltip = metrics
    ? `Rolling 7 days · ${formatTrackingRange(metrics.rolling7Days.startDate, metrics.rolling7Days.endDate)} · ${analyticsTimezoneLabel}`
    : "";

  return (
    <div className={cn("mx-auto w-full max-w-xl", className)}>
      {loading || !metrics ? (
        <MetricsSkeleton />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
          <div className="grid grid-cols-3 divide-x divide-gray-200/70">
            <MetricCell
              value={formatNumber(metrics.rolling7Days.totalDistinctViewers)}
              label="Distinct views"
              tooltip={viewsTooltip}
            />
            <MetricCell
              value={formatNumber(metrics.inventory.marketplaceLive)}
              label="Live products"
              tooltip="Approved and listed on the marketplace"
            />
            <MetricCell
              value={formatNumber(metrics.inventory.withoutApprovedPhotos)}
              label="Missing photos"
              tooltip="Active products without an approved image"
            />
          </div>
        </div>
      )}
    </div>
  );
}
