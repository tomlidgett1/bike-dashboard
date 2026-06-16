"use client";

import { Monitor, Smartphone } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { StoreAnalyticsByDevice } from "@/lib/types/store-analytics";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-AU").format(value);
}

type StoreAnalyticsByDeviceProps = {
  byDevice: StoreAnalyticsByDevice;
  className?: string;
  showUnknown?: boolean;
};

export function StoreAnalyticsByDeviceBreakdown({
  byDevice,
  className,
  showUnknown = true,
}: StoreAnalyticsByDeviceProps) {
  const rows = [
    {
      key: "mobile" as const,
      label: "Mobile",
      icon: Smartphone,
      stats: byDevice.mobile,
    },
    {
      key: "desktop" as const,
      label: "Desktop",
      icon: Monitor,
      stats: byDevice.desktop,
    },
  ];

  const unknownViews = byDevice.unknown.totalViews;
  const classifiedViews = byDevice.mobile.totalViews + byDevice.desktop.totalViews;
  const showUnknownRow = showUnknown && unknownViews > 0;
  const onlyLegacyTraffic = classifiedViews === 0 && unknownViews > 0;

  const totalTracked = classifiedViews + unknownViews;

  if (totalTracked === 0) return null;

  return (
    <div className={cn("rounded-md border border-border bg-white p-4", className)}>
      <p className="text-sm font-semibold text-foreground">Views by device</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Page views split by mobile browser or desktop. New visits are classified automatically.
      </p>
      {onlyLegacyTraffic && (
        <p className="mt-3 rounded-md border border-border bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
          All views in this period were recorded before device tracking. Open your public store
          in a private window (not while logged in as the store) to generate a test mobile or
          desktop visit.
        </p>
      )}
      <div className="mt-4 divide-y divide-border/60">
        {rows.map(({ key, label, icon: Icon, stats }) => {
          const share =
            totalTracked > 0 ? Math.round((stats.totalViews / totalTracked) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100">
                <Icon className="h-4 w-4 text-gray-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatNumber(stats.totalViews)} views
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(stats.distinctUsers)} distinct visitors
                  {totalTracked > 0 ? ` · ${share}% of views` : ""}
                </p>
              </div>
            </div>
          );
        })}
        {showUnknownRow && (
          <div className="flex items-center justify-between gap-2 py-3 text-xs text-muted-foreground">
            <span>Earlier traffic (device not recorded)</span>
            <span className="tabular-nums">
              {formatNumber(byDevice.unknown.totalViews)} views ·{" "}
              {formatNumber(byDevice.unknown.distinctUsers)} visitors
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
