"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HomeV2RollingMetricValue } from "@/components/settings/homev2-rolling-metric-value";
import {
  homeV2MetricsChanged,
  parseHomeV2OverviewMetrics,
  readCachedHomeV2MetricsEntry,
  writeCachedHomeV2Metrics,
  type HomeV2OverviewMetrics,
} from "@/lib/store/homev2-metrics-cache";
import { cn } from "@/lib/utils";
import {
  formatStoreAnalyticsDate,
  getStoreAnalyticsTimezoneShortLabel,
} from "@/lib/utils/format-store-analytics-date";

function formatTrackingRange(startDate: string, endDate: string) {
  if (startDate === endDate) return formatStoreAnalyticsDate(startDate);
  return `${formatStoreAnalyticsDate(startDate)} – ${formatStoreAnalyticsDate(endDate)}`;
}

function MetricCell({
  value,
  previousValue,
  animate,
  label,
  periodLabel,
  tooltip,
  onClick,
  compact = false,
}: {
  value: number;
  previousValue: number | null;
  animate: boolean;
  label: string;
  periodLabel?: string;
  tooltip: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  const Wrapper = onClick ? "button" : "div";
  const wrapperProps = onClick
    ? {
        type: "button" as const,
        onClick,
        "aria-label": `${label}. ${periodLabel ?? ""}. Tap to switch period.`,
      }
    : {};

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Wrapper
          {...wrapperProps}
          className={cn(
            "flex min-w-0 w-full flex-col items-center justify-center text-center",
            compact ? "px-2 py-1.5 sm:px-2.5 sm:py-2" : "px-4 py-3.5 sm:px-5 sm:py-4",
            onClick
              ? "cursor-pointer transition-colors hover:bg-gray-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
              : "cursor-default",
          )}
        >
          <p
            className={cn(
              "font-semibold tabular-nums tracking-tight text-foreground",
              compact ? "text-sm sm:text-base" : "text-xl sm:text-2xl",
            )}
          >
            <HomeV2RollingMetricValue
              value={value}
              previousValue={previousValue}
              animate={animate}
            />
          </p>
          <p
            className={cn(
              "mt-0.5 max-w-full whitespace-nowrap font-medium leading-snug",
              compact
                ? "text-[10px] text-gray-400 sm:text-[11px]"
                : "mt-1 text-[11px] text-muted-foreground sm:text-xs",
            )}
          >
            {label}
            {periodLabel ? (
              <>
                <span className="text-gray-300"> · </span>
                <span className={compact ? "text-gray-400" : "text-gray-500"}>{periodLabel}</span>
              </>
            ) : null}
          </p>
        </Wrapper>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8} className="max-w-[220px] text-center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricsSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-hidden backdrop-blur-sm",
        compact
          ? "rounded-md border border-gray-200/60 bg-white/50 shadow-none"
          : "rounded-2xl border border-gray-200/70 bg-white/80 shadow-sm",
      )}
    >
      <div
        className={cn(
          "grid grid-cols-3 divide-x",
          compact ? "divide-gray-200/60" : "divide-gray-200/70",
        )}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "flex flex-col items-center",
              compact ? "gap-1 px-2 py-2" : "gap-2 px-3 py-4",
            )}
          >
            <div
              className={cn(
                "animate-pulse rounded-md bg-gray-100",
                compact ? "h-4 w-8" : "h-7 w-12",
              )}
            />
            <div
              className={cn(
                "animate-pulse rounded-md bg-gray-100",
                compact ? "h-2.5 w-12" : "h-3 w-16",
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeV2MetricsCards({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "subtle";
}) {
  const [metrics, setMetrics] = React.useState<HomeV2OverviewMetrics | null>(null);
  const [previousMetrics, setPreviousMetrics] = React.useState<HomeV2OverviewMetrics | null>(null);
  const [animateValues, setAnimateValues] = React.useState(false);
  const [viewsPeriod, setViewsPeriod] = React.useState<"rolling7" | "today">("today");
  const [loading, setLoading] = React.useState(true);
  const metricsRef = React.useRef<HomeV2OverviewMetrics | null>(null);
  const cachedEntryRef = React.useRef<ReturnType<typeof readCachedHomeV2MetricsEntry>>(null);
  const analyticsTimezoneLabel = getStoreAnalyticsTimezoneShortLabel();

  React.useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  React.useLayoutEffect(() => {
    const entry = readCachedHomeV2MetricsEntry();
    cachedEntryRef.current = entry;

    if (entry?.metrics) {
      setMetrics(entry.metrics);
      metricsRef.current = entry.metrics;
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/store/overview?chartDays=7", {
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok || cancelled) return;

        const nextMetrics = parseHomeV2OverviewMetrics(json);
        const storeOwnerId = typeof json.storeOwnerId === "string" ? json.storeOwnerId : null;
        if (!nextMetrics || !storeOwnerId) return;

        const cachedEntry = cachedEntryRef.current;
        const cacheMatchesStore = cachedEntry?.storeOwnerId === storeOwnerId;
        const baseline = cacheMatchesStore ? metricsRef.current ?? cachedEntry?.metrics ?? null : null;

        if (baseline && homeV2MetricsChanged(baseline, nextMetrics)) {
          setPreviousMetrics(baseline);
          setAnimateValues(true);
        } else {
          setPreviousMetrics(null);
          setAnimateValues(false);
        }

        setMetrics(nextMetrics);
        metricsRef.current = nextMetrics;
        writeCachedHomeV2Metrics(storeOwnerId, nextMetrics);
      } catch {
        if (!cancelled && !metricsRef.current) {
          setMetrics(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && !metrics) return null;

  const showingToday = viewsPeriod === "today";
  const viewsValue = showingToday
    ? metrics?.today.totalDistinctViewers ?? 0
    : metrics?.rolling7Days.totalDistinctViewers ?? 0;
  const viewsPreviousValue = showingToday
    ? previousMetrics?.today.totalDistinctViewers ?? null
    : previousMetrics?.rolling7Days.totalDistinctViewers ?? null;
  const viewsTooltip = metrics
    ? showingToday
      ? `Distinct viewers today · ${formatStoreAnalyticsDate(metrics.today.startDate)} · ${analyticsTimezoneLabel}. Tap to show last 7 days.`
      : `Distinct viewers in the last 7 days · ${formatTrackingRange(metrics.rolling7Days.startDate, metrics.rolling7Days.endDate)} · ${analyticsTimezoneLabel}. Tap to show today.`
    : "";

  const isCompact = tone === "subtle";

  return (
    <div
      className={cn(
        "mx-auto w-full",
        isCompact ? "max-w-md" : "max-w-2xl",
        className,
      )}
    >
      {loading && !metrics ? (
        <MetricsSkeleton compact={isCompact} />
      ) : metrics ? (
        <div
          className={cn(
            "overflow-hidden backdrop-blur-sm",
            isCompact
              ? "rounded-md border border-gray-200/60 bg-white/50 shadow-none"
              : "rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(15,23,42,0.06)]",
          )}
        >
          <div
            className={cn(
              "grid grid-cols-3 divide-x",
              isCompact ? "divide-gray-200/60" : "divide-gray-200/70",
            )}
          >
            <MetricCell
              compact={isCompact}
              value={viewsValue}
              previousValue={viewsPreviousValue}
              animate={animateValues}
              label="Distinct views"
              periodLabel={showingToday ? "Today" : "Last 7 days"}
              tooltip={viewsTooltip}
              onClick={() => {
                setViewsPeriod((current) => (current === "rolling7" ? "today" : "rolling7"));
              }}
            />
            <MetricCell
              compact={isCompact}
              value={metrics.inventory.marketplaceLive}
              previousValue={previousMetrics?.inventory.marketplaceLive ?? null}
              animate={animateValues}
              label="Live products"
              tooltip="Approved and listed on the marketplace"
            />
            <MetricCell
              compact={isCompact}
              value={metrics.inventory.notYetLive}
              previousValue={previousMetrics?.inventory.notYetLive ?? null}
              animate={animateValues}
              label="Needs attention"
              tooltip="Products in your catalogue not yet live on the marketplace — missing photos, inactive, out of stock, or other issues"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
