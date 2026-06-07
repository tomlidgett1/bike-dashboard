"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { getStoreAnalyticsTimezoneShortLabel } from "@/lib/utils/format-store-analytics-date";

interface OverviewMetrics {
  rolling7Days: {
    totalViews: number;
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

function MetricCell({
  value,
  label,
  detail,
}: {
  value: string;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center px-3 py-3.5 text-center sm:px-4 sm:py-4">
      <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
        {label}
      </p>
      {detail ? (
        <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/75 sm:text-[11px]">
          {detail}
        </p>
      ) : null}
    </div>
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
            totalViews: rolling7Days.totalViews,
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

  return (
    <div className={cn("mx-auto w-full max-w-xl", className)}>
      {loading || !metrics ? (
        <MetricsSkeleton />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
          <div className="grid grid-cols-3 divide-x divide-gray-200/70">
            <MetricCell
              value={formatNumber(metrics.rolling7Days.totalDistinctViewers)}
              label="Distinct viewers"
              detail={`${formatNumber(metrics.rolling7Days.totalViews)} page views`}
            />
            <MetricCell
              value={formatNumber(metrics.inventory.marketplaceLive)}
              label="Live products"
            />
            <MetricCell
              value={formatNumber(metrics.inventory.withoutApprovedPhotos)}
              label="Missing photos"
            />
          </div>
          <p className="border-t border-gray-200/70 bg-gray-50/50 px-4 py-2 text-center text-[10px] text-muted-foreground">
            Rolling 7 days · {analyticsTimezoneLabel}
          </p>
        </div>
      )}
    </div>
  );
}
