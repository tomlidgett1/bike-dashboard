"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Package, PackageOpen, RefreshCw, Store, Users } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard";
import { HomeGenieFloatingPrompt } from "@/components/settings/home-genie-floating-prompt";
import { StoreSetupBanner } from "@/components/settings/store-setup-button";
import { useAuth } from "@/components/providers/auth-provider";
import {
  formatStoreAnalyticsDate,
  getStoreAnalyticsTimezoneShortLabel,
} from "@/lib/utils/format-store-analytics-date";

interface TrackingPeriodSummary {
  startDate: string;
  endDate: string;
  totalViews: number;
  totalDistinctViewers: number;
}

interface WebTrackingAnalytics {
  rolling7Days: TrackingPeriodSummary;
}

interface OverviewResponse {
  storeOwnerId: string;
  displayName: string;
  inventory: {
    marketplaceLive: number;
    notYetLive: number;
  };
  webAnalytics: WebTrackingAnalytics;
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU").format(value || 0);
}

function formatTrackingRange(startDate: string, endDate: string) {
  if (startDate === endDate) return formatStoreAnalyticsDate(startDate);
  return `${formatStoreAnalyticsDate(startDate)} - ${formatStoreAnalyticsDate(endDate)}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function StoreOverviewDashboard() {
  const { user } = useAuth();
  const [data, setData] = React.useState<OverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store/overview?chartDays=90", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to load overview");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const rolling7Days = data?.webAnalytics?.rolling7Days;
  const inventory = data?.inventory;
  const analyticsTimezoneLabel = getStoreAnalyticsTimezoneShortLabel();

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center rounded-md border border-border bg-background py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data || !rolling7Days || !inventory) {
    return null;
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-10rem)] flex-col space-y-6">
      <HomeGenieFloatingPrompt />

      <StoreSetupBanner />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {greeting()} - here&apos;s how {data.displayName} is performing.
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href={`/marketplace/store/${data.storeOwnerId ?? user?.id ?? ""}`}>
              <Store className="size-4" />
              View storefront
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Distinct website views"
          value={formatNumber(rolling7Days.totalDistinctViewers)}
          subMetric={{
            value: formatNumber(rolling7Days.totalViews),
            label: "total page views",
          }}
          icon={Users}
          hint={`Rolling 7 days · ${formatTrackingRange(rolling7Days.startDate, rolling7Days.endDate)} · ${analyticsTimezoneLabel}`}
        />
        <StatCard
          label="Live products"
          value={formatNumber(inventory.marketplaceLive)}
          icon={Package}
          hint="Approved and listed on the marketplace"
        />
        <StatCard
          label="Needs attention"
          value={formatNumber(inventory.notYetLive)}
          icon={PackageOpen}
          hint="Products not yet live on the marketplace"
        />
      </div>
    </div>
  );
}
