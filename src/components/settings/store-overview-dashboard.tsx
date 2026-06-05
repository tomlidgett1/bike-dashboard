"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Eye,
  ImageOff,
  Loader2,
  Package,
  RefreshCw,
  Store,
  Tag,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { StoreAnalyticsByDeviceBreakdown } from "@/components/settings/store-analytics-by-device";
import { StoreOverviewLightspeedPanel } from "@/components/settings/store-overview-lightspeed-panel";
import type { NotSyncedLightspeedProduct } from "@/lib/lightspeed/not-synced-products";
import {
  normaliseStoreAnalyticsByDevice,
  type StoreAnalyticsByDevice,
} from "@/lib/types/store-analytics";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/dashboard";
import { useAuth } from "@/components/providers/auth-provider";
import { StoreSetupBanner } from "@/components/settings/store-setup-button";
import {
  formatStoreAnalyticsDate,
  getStoreAnalyticsTimezoneShortLabel,
} from "@/lib/utils/format-store-analytics-date";

interface DailyPoint {
  date: string;
  storeViews: number;
  productViews: number;
  impressions: number;
  distinctUsers: number;
}

interface TopProduct {
  productId: string;
  name: string;
  price: number | null;
  imageUrl: string | null;
  views: number;
  distinctUsers: number;
  impressions: number;
}

interface OverviewResponse {
  storeOwnerId: string;
  displayName: string;
  chartDays: number;
  topDays: number;
  inventory: {
    marketplaceLive: number;
    individualListings: number;
    totalProducts: number;
    withoutApprovedPhotos: number;
  };
  analytics: {
    timezone?: string;
    summary: {
      totalViews: number;
      totalDistinctUsers: number;
      byDevice?: StoreAnalyticsByDevice;
    };
    daily: DailyPoint[];
  };
  topProductsWeek: TopProduct[];
  lightspeed: {
    connected: boolean;
    notSynced: number | null;
    totalInLightspeed: number | null;
    notSyncedProducts: NotSyncedLightspeedProduct[];
    notSyncedProductsLimit: number;
  };
}

const viewsChartConfig = {
  totalViews: {
    label: "Total views",
    color: "var(--chart-1)",
  },
  distinctVisitors: {
    label: "Distinct visitors",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function shouldUnoptimizeProductImage(url: string) {
  return !url.includes("res.cloudinary.com") && !url.includes("supabase.co");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-AU").format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "No price";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
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
      const response = await fetch("/api/store/overview?chartDays=30&topDays=7", {
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

  const chartPoints = React.useMemo(() => {
    const daily = data?.analytics?.daily ?? [];
    return daily.map((point) => ({
      date: point.date,
      label: formatStoreAnalyticsDate(point.date),
      totalViews: point.storeViews + point.productViews,
      distinctVisitors: point.distinctUsers,
    }));
  }, [data?.analytics?.daily]);

  const topProducts = (data?.topProductsWeek ?? []).slice(0, 10);
  const byDevice = React.useMemo(
    () => normaliseStoreAnalyticsByDevice(data?.analytics?.summary?.byDevice),
    [data?.analytics?.summary?.byDevice]
  );
  const analyticsTimezoneLabel = getStoreAnalyticsTimezoneShortLabel();
  const hasChartData = chartPoints.some(
    (p) => p.totalViews > 0 || p.distinctVisitors > 0
  );
  const hasDeviceBreakdown =
    byDevice.mobile.totalViews > 0 ||
    byDevice.desktop.totalViews > 0 ||
    byDevice.unknown.totalViews > 0;
  const inventory = data?.inventory;
  const lightspeedConnected = data?.lightspeed?.connected === true;
  const statCardCount = lightspeedConnected ? 5 : 4;

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

  if (!data) return null;

  return (
    <div className="space-y-6">
      <StoreSetupBanner />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {greeting()} — here&apos;s how {data.displayName} is performing.
          </p>
        </div>
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

      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          statCardCount === 5 ? "lg:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-4"
        )}
      >
        <StatCard
          label="Website views (30 days)"
          value={formatNumber(data.analytics?.summary?.totalViews ?? 0)}
          icon={Eye}
          hint={`${formatNumber(data.analytics?.summary?.totalDistinctUsers ?? 0)} distinct visitors · ${analyticsTimezoneLabel}`}
        />
        <StatCard
          label="Live on marketplace"
          value={formatNumber(inventory?.marketplaceLive ?? 0)}
          icon={Package}
          hint={
            inventory?.totalProducts
              ? `${Math.round(((inventory.marketplaceLive ?? 0) / Math.max(inventory.totalProducts, 1)) * 100)}% of catalogue`
              : "Approved photos and listing rules"
          }
        />
        {lightspeedConnected && (
          <StatCard
            label="Not synced"
            value={formatNumber(data.lightspeed?.notSynced ?? 0)}
            icon={Zap}
            hint={
              data.lightspeed?.totalInLightspeed
                ? `In Lightspeed, not on marketplace · ${formatNumber(data.lightspeed.totalInLightspeed)} total`
                : "In Lightspeed, not on marketplace"
            }
          />
        )}
        <StatCard
          label="Individual listings"
          value={formatNumber(inventory?.individualListings ?? 0)}
          icon={Tag}
          hint="Non-Lightspeed uploads"
        />
        <StatCard
          label="Missing approved photos"
          value={formatNumber(inventory?.withoutApprovedPhotos ?? 0)}
          icon={ImageOff}
          hint="Active products without an approved image"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="gap-0 py-0 lg:col-span-3">
          <CardHeader className="space-y-4 border-b border-border/60 px-6 pt-6 pb-4">
            <div className="space-y-1">
              <CardTitle className="font-heading text-base">Total website views</CardTitle>
              <CardDescription>
                Store and product page views over the last {data.chartDays} days, grouped by
                Melbourne calendar day ({analyticsTimezoneLabel}). Distinct visitors are counted
                per browser (anonymous visitor ID) and signed-in account — IP addresses are not
                stored.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-xs text-muted-foreground">Total views</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatNumber(data.analytics?.summary?.totalViews ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Distinct visitors</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatNumber(data.analytics?.summary?.totalDistinctUsers ?? 0)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4 pt-4 sm:px-6">
            {!hasChartData ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-14 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No view data yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Traffic will appear here once customers browse your public store.
                </p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/settings/store/analytics">Open analytics</Link>
                </Button>
              </div>
            ) : (
              <ChartContainer config={viewsChartConfig} className="min-h-[280px] w-full">
                <AreaChart accessibilityLayer data={chartPoints} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                  />
                  <YAxis hide tickLine={false} axisLine={false} width={0} />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as { date?: string } | undefined;
                          return row?.date ? formatStoreAnalyticsDate(row.date) : "";
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    dataKey="totalViews"
                    type="monotone"
                    fill="var(--color-totalViews)"
                    fillOpacity={0.2}
                    stroke="var(--color-totalViews)"
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="distinctVisitors"
                    type="monotone"
                    fill="var(--color-distinctVisitors)"
                    fillOpacity={0.15}
                    stroke="var(--color-distinctVisitors)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
            {hasChartData && hasDeviceBreakdown && (
              <div className="mt-4 px-2 sm:px-0">
                <StoreAnalyticsByDeviceBreakdown byDevice={byDevice} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
            <div className="space-y-0.5">
              <h3 className="font-heading text-base font-semibold leading-none">
                Top products this week
              </h3>
              <p className="text-sm text-muted-foreground">
                Ranked by product page views in the last {data.topDays} days.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link href="/settings/store/analytics">
                View all
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="divide-y divide-border/60">
            {topProducts.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No product views in the last {data.topDays} days.
              </div>
            ) : (
              topProducts.map((product, index) => (
                <Link
                  key={product.productId}
                  href={`/marketplace/product/${product.productId}`}
                  className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized={shouldUnoptimizeProductImage(product.imageUrl)}
                      />
                    ) : (
                      <Package className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(product.price)} · {formatNumber(product.views)} views
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
          <Separator />
          <div className="px-6 py-3">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/products">Review all products</Link>
            </Button>
          </div>
        </Card>
      </div>

      {lightspeedConnected && (data.lightspeed?.notSynced ?? 0) > 0 && (
        <div className="w-full max-w-2xl">
          <StoreOverviewLightspeedPanel
            notSynced={data.lightspeed.notSynced ?? 0}
            totalInLightspeed={data.lightspeed.totalInLightspeed ?? 0}
            products={data.lightspeed.notSyncedProducts ?? []}
            listLimit={data.lightspeed.notSyncedProductsLimit ?? 50}
            onSynced={load}
          />
        </div>
      )}
    </div>
  );
}
