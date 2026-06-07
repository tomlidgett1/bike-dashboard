"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  Eye,
  Loader2,
  Monitor,
  MousePointerClick,
  Package,
  RefreshCw,
  Search,
  Smartphone,
  Users,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { StoreAnalyticsByDevice } from "@/lib/types/store-analytics";
import {
  formatStoreAnalyticsDate,
  getStoreAnalyticsTimezoneShortLabel,
} from "@/lib/utils/format-store-analytics-date";

type AnalyticsTab = "overview" | "traffic" | "products" | "devices" | "search";
type ChartGrouping = "daily" | "weekly";

interface AnalyticsSummary {
  storeViews: number;
  storeDistinctUsers: number;
  productViews: number;
  productDistinctUsers: number;
  productImpressions: number;
  impressionDistinctUsers: number;
  totalViews: number;
  totalDistinctUsers: number;
  byDevice?: StoreAnalyticsByDevice;
}

interface TrackingPeriodSummary {
  startDate: string;
  endDate: string;
  storeViews: number;
  productViews: number;
  productImpressions: number;
  totalViews: number;
  totalDistinctViewers: number;
  byDevice: StoreAnalyticsByDevice;
}

interface WebTrackingAnalytics {
  timezone?: string;
  today: TrackingPeriodSummary;
  currentWeek: TrackingPeriodSummary;
  selectedPeriod: TrackingPeriodSummary;
  last30Days: TrackingPeriodSummary;
  daily: TrackingPeriodSummary[];
  weekly: TrackingPeriodSummary[];
}

interface TopProduct {
  productId: string;
  name: string;
  price: number | null;
  imageUrl: string | null;
  views: number;
  distinctUsers: number;
  impressions: number;
  lastViewedAt: string | null;
}

interface SearchTermRow {
  term: string;
  searchCount: number;
  distinctSearchers: number;
  avgResultCount: number;
  zeroResultCount: number;
  lastSearchedAt: string | null;
}

interface SearchAnalyticsSummary {
  totalSearches: number;
  distinctSearchers: number;
  zeroResultSearches: number;
}

interface SearchAnalytics {
  days: number;
  summary: SearchAnalyticsSummary;
  searchTerms: SearchTermRow[];
}

interface AnalyticsResponse {
  days: number;
  timezone?: string;
  summary: AnalyticsSummary;
  daily: Array<{
    date: string;
    storeViews: number;
    productViews: number;
    impressions: number;
    distinctUsers: number;
  }>;
  topProducts: TopProduct[];
  searchAnalytics?: SearchAnalytics;
  webAnalytics: WebTrackingAnalytics;
}

const emptyDeviceBreakdown: StoreAnalyticsByDevice = {
  mobile: { totalViews: 0, distinctUsers: 0 },
  desktop: { totalViews: 0, distinctUsers: 0 },
  unknown: { totalViews: 0, distinctUsers: 0 },
};

const trafficChartConfig = {
  totalViews: {
    label: "Page views",
    color: "var(--chart-1)",
  },
  totalDistinctViewers: {
    label: "Distinct viewers",
    color: "var(--chart-2)",
  },
  productImpressions: {
    label: "Product impressions",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

const tabs: Array<{ value: AnalyticsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "traffic", label: "Traffic", icon: Eye },
  { value: "products", label: "Products", icon: Package },
  { value: "search", label: "Search", icon: Search },
  { value: "devices", label: "Devices", icon: Monitor },
];

function shouldUnoptimizeProductImage(url: string) {
  return !url.includes("res.cloudinary.com") && !url.includes("supabase.co");
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU").format(value || 0);
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "No price";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "";
  if (startDate === endDate) return formatStoreAnalyticsDate(startDate);
  return `${formatStoreAnalyticsDate(startDate)} - ${formatStoreAnalyticsDate(endDate)}`;
}

function getDeviceTotal(byDevice: StoreAnalyticsByDevice | undefined) {
  const device = byDevice ?? emptyDeviceBreakdown;
  return device.mobile.totalViews + device.desktop.totalViews + device.unknown.totalViews;
}

function getEngagementRate(views: number, impressions: number) {
  return impressions > 0 ? (views / impressions) * 100 : 0;
}

function AnalyticsTabButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-sm font-medium transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
      {typeof count === "number" && count > 0 ? (
        <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[10px] font-medium">
          {formatNumber(count)}
        </Badge>
      ) : null}
    </button>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {formatNumber(value)}
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  total,
  detail,
}: {
  label: string;
  value: number;
  total: number;
  detail: string;
}) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(value)}</p>
          <p className="text-xs text-muted-foreground">{formatPercent(percent)}</p>
        </div>
      </div>
      <Progress value={percent} />
    </div>
  );
}

function DeviceRows({ byDevice }: { byDevice: StoreAnalyticsByDevice }) {
  const total = getDeviceTotal(byDevice);
  const rows = [
    { key: "mobile", label: "Mobile", icon: Smartphone, stats: byDevice.mobile },
    { key: "desktop", label: "Web", icon: Monitor, stats: byDevice.desktop },
    { key: "unknown", label: "Unclassified", icon: BarChart3, stats: byDevice.unknown },
  ] as const;

  return (
    <div className="space-y-4">
      {rows.map(({ key, label, icon: Icon, stats }) => {
        const percent = total > 0 ? (stats.totalViews / total) * 100 : 0;
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(stats.distinctUsers)} distinct viewers
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatNumber(stats.totalViews)}
                </p>
                <p className="text-xs text-muted-foreground">{formatPercent(percent)}</p>
              </div>
            </div>
            <Progress value={percent} />
          </div>
        );
      })}
    </div>
  );
}

function EmptyAnalytics() {
  return (
    <div className="rounded-md border border-dashed border-border bg-background px-6 py-14 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">No analytics yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Store visits, product views, and product impressions will appear once customers browse your
        public store outside your authenticated owner session.
      </p>
    </div>
  );
}

export function StoreAnalyticsManager() {
  const [days, setDays] = React.useState("30");
  const [activeTab, setActiveTab] = React.useState<AnalyticsTab>("overview");
  const [chartGrouping, setChartGrouping] = React.useState<ChartGrouping>("daily");
  const [data, setData] = React.useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadAnalytics = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/store/analytics?days=${days}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to load analytics");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  React.useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const summary = data?.summary;
  const webAnalytics = data?.webAnalytics;
  const selectedPeriod = webAnalytics?.selectedPeriod;
  const analyticsTimezoneLabel = getStoreAnalyticsTimezoneShortLabel();
  const topProducts = data?.topProducts ?? [];
  const searchAnalytics = data?.searchAnalytics;
  const searchTerms = searchAnalytics?.searchTerms ?? [];
  const searchSummary = searchAnalytics?.summary;
  const hasTrafficData = Boolean(
    selectedPeriod && (selectedPeriod.totalViews > 0 || selectedPeriod.productImpressions > 0),
  );
  const hasSearchData = (searchSummary?.totalSearches ?? 0) > 0;
  const hasData = hasTrafficData || hasSearchData;

  const chartPoints = React.useMemo(() => {
    const points = chartGrouping === "daily" ? webAnalytics?.daily ?? [] : webAnalytics?.weekly ?? [];
    return points.map((point) => ({
      label:
        chartGrouping === "daily"
          ? formatStoreAnalyticsDate(point.startDate)
          : formatRange(point.startDate, point.endDate),
      startDate: point.startDate,
      endDate: point.endDate,
      totalViews: point.totalViews,
      totalDistinctViewers: point.totalDistinctViewers,
      productImpressions: point.productImpressions,
      storeViews: point.storeViews,
      productViews: point.productViews,
    }));
  }, [chartGrouping, webAnalytics?.daily, webAnalytics?.weekly]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center rounded-md border border-border bg-background py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Storefront analytics</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Page views, distinct viewers, product engagement, customer search terms, and device
            split. Daily and weekly buckets use Melbourne calendar time ({analyticsTimezoneLabel});
            owner visits are excluded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger size="sm" className="w-[140px] rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={loadAnalytics} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <nav className="border-b border-border/60" aria-label="Analytics sections">
        <div className="-mb-px flex gap-6 overflow-x-auto pb-0">
          {tabs.map((tab) => (
            <AnalyticsTabButton
              key={tab.value}
              active={activeTab === tab.value}
              count={
                tab.value === "products"
                  ? topProducts.length
                  : tab.value === "search"
                    ? searchTerms.length
                    : undefined
              }
              icon={tab.icon}
              label={tab.label}
              onClick={() => setActiveTab(tab.value)}
            />
          ))}
        </div>
      </nav>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!data || !summary || !webAnalytics || !selectedPeriod ? null : !hasData ? (
        activeTab === "search" ? (
          <div className="space-y-4">
            <Card className="rounded-md border-border">
              <CardHeader className="border-b border-border/60 pb-3">
                <CardTitle className="text-sm font-semibold">Customer search terms</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Search queries customers enter on your public store profile.
                </p>
              </CardHeader>
              <CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
                No search activity in this period yet.
              </CardContent>
            </Card>
          </div>
        ) : (
          <EmptyAnalytics />
        )
      ) : (
        <div className="space-y-4">
          {activeTab === "overview" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  icon={Eye}
                  label="Page views"
                  value={selectedPeriod.totalViews}
                  detail={`${formatNumber(selectedPeriod.totalDistinctViewers)} distinct viewers`}
                />
                <MetricCard
                  icon={Users}
                  label="Distinct viewers"
                  value={selectedPeriod.totalDistinctViewers}
                  detail={formatRange(selectedPeriod.startDate, selectedPeriod.endDate)}
                />
                <MetricCard
                  icon={Package}
                  label="Product views"
                  value={summary.productViews}
                  detail={`${formatNumber(summary.productDistinctUsers)} product viewers`}
                />
                <MetricCard
                  icon={MousePointerClick}
                  label="Impressions"
                  value={selectedPeriod.productImpressions}
                  detail={`${formatPercent(getEngagementRate(summary.productViews, selectedPeriod.productImpressions))} view rate`}
                />
                <MetricCard
                  icon={CalendarDays}
                  label="This week"
                  value={webAnalytics.currentWeek.totalViews}
                  detail={`${formatNumber(webAnalytics.currentWeek.totalDistinctViewers)} distinct viewers`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Traffic mix</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 p-4">
                    <BreakdownRow
                      label="Store page views"
                      value={selectedPeriod.storeViews}
                      total={selectedPeriod.totalViews}
                      detail="Visits to the public store profile."
                    />
                    <BreakdownRow
                      label="Product page views"
                      value={selectedPeriod.productViews}
                      total={selectedPeriod.totalViews}
                      detail="Clicks through to product detail pages."
                    />
                    <BreakdownRow
                      label="Product impressions"
                      value={selectedPeriod.productImpressions}
                      total={Math.max(selectedPeriod.productImpressions, selectedPeriod.totalViews)}
                      detail="Products seen on storefront carousels and grids."
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Today and week</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                    <MetricCard
                      icon={Eye}
                      label="Today"
                      value={webAnalytics.today.totalViews}
                      detail={`${formatNumber(webAnalytics.today.totalDistinctViewers)} distinct viewers`}
                    />
                    <MetricCard
                      icon={CalendarDays}
                      label="This week"
                      value={webAnalytics.currentWeek.totalViews}
                      detail={`${formatNumber(webAnalytics.currentWeek.productImpressions)} impressions`}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}

          {activeTab === "traffic" ? (
            <>
              <Card className="rounded-md border-border">
                <CardHeader className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      {chartGrouping === "daily" ? "Daily traffic" : "Weekly traffic"}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Page views, distinct viewers, and impressions for the selected range.
                    </p>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={chartGrouping}
                    onValueChange={(value) => {
                      if (value === "daily" || value === "weekly") setChartGrouping(value);
                    }}
                    size="sm"
                    variant="outline"
                    spacing={0}
                  >
                    <ToggleGroupItem value="daily" aria-label="Group by day">
                      Day
                    </ToggleGroupItem>
                    <ToggleGroupItem value="weekly" aria-label="Group by week">
                      Week
                    </ToggleGroupItem>
                  </ToggleGroup>
                </CardHeader>
                <CardContent className="p-4">
                  <ChartContainer config={trafficChartConfig} className="min-h-[320px] w-full">
                    <AreaChart accessibilityLayer data={chartPoints} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={chartGrouping === "daily" ? 28 : 16}
                      />
                      <YAxis hide tickLine={false} axisLine={false} width={0} />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            labelFormatter={(_, payload) => {
                              const row = payload?.[0]?.payload as
                                | { startDate?: string; endDate?: string }
                                | undefined;
                              return row?.startDate && row?.endDate
                                ? formatRange(row.startDate, row.endDate)
                                : "";
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
                        dataKey="totalDistinctViewers"
                        type="monotone"
                        fill="var(--color-totalDistinctViewers)"
                        fillOpacity={0.16}
                        stroke="var(--color-totalDistinctViewers)"
                        strokeWidth={2}
                      />
                      <Area
                        dataKey="productImpressions"
                        type="monotone"
                        fill="var(--color-productImpressions)"
                        fillOpacity={0.1}
                        stroke="var(--color-productImpressions)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card className="rounded-md border-border">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="text-sm font-semibold">Recent buckets</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/60">
                    {chartPoints.slice(-14).reverse().map((point) => (
                      <div
                        key={`${point.startDate}-${point.endDate}`}
                        className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(160px,1fr)_repeat(4,minmax(82px,auto))]"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {formatRange(point.startDate, point.endDate)}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatNumber(point.totalViews)}
                          </p>
                          <p className="text-xs text-muted-foreground">views</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatNumber(point.totalDistinctViewers)}
                          </p>
                          <p className="text-xs text-muted-foreground">viewers</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatNumber(point.storeViews)}
                          </p>
                          <p className="text-xs text-muted-foreground">store</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatNumber(point.productViews)}
                          </p>
                          <p className="text-xs text-muted-foreground">product</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}

          {activeTab === "products" ? (
            <Card className="rounded-md border-border">
              <CardHeader className="border-b border-border/60 pb-3">
                <CardTitle className="text-sm font-semibold">Product engagement</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ranked by product page views, with impressions and view rate for context.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {topProducts.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No product activity in this period.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {topProducts.map((product, index) => (
                      <Link
                        key={product.productId}
                        href={`/marketplace/product/${product.productId}`}
                        className="grid gap-3 px-4 py-3 transition-colors hover:bg-secondary/60 sm:grid-cols-[auto_minmax(0,1fr)_repeat(4,minmax(78px,auto))]"
                      >
                        <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-secondary">
                            {product.imageUrl ? (
                              <Image
                                src={product.imageUrl}
                                alt=""
                                fill
                                sizes="44px"
                                className="object-cover"
                                unoptimized={shouldUnoptimizeProductImage(product.imageUrl)}
                              />
                            ) : (
                              <Package className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(product.price)}</p>
                          </div>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">{formatNumber(product.views)}</p>
                          <p className="text-xs text-muted-foreground">views</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatNumber(product.distinctUsers)}
                          </p>
                          <p className="text-xs text-muted-foreground">viewers</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatNumber(product.impressions)}
                          </p>
                          <p className="text-xs text-muted-foreground">impr.</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatPercent(getEngagementRate(product.views, product.impressions))}
                          </p>
                          <p className="text-xs text-muted-foreground">view rate</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "devices" ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-md border-border">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="text-sm font-semibold">Selected range</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatRange(selectedPeriod.startDate, selectedPeriod.endDate)}
                  </p>
                </CardHeader>
                <CardContent className="p-4">
                  <DeviceRows byDevice={selectedPeriod.byDevice} />
                </CardContent>
              </Card>
              <Card className="rounded-md border-border">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="text-sm font-semibold">This week</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatRange(webAnalytics.currentWeek.startDate, webAnalytics.currentWeek.endDate)}
                  </p>
                </CardHeader>
                <CardContent className="p-4">
                  <DeviceRows byDevice={webAnalytics.currentWeek.byDevice} />
                </CardContent>
              </Card>
              <Card className="rounded-md border-border">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="text-sm font-semibold">Today</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatRange(webAnalytics.today.startDate, webAnalytics.today.endDate)}
                  </p>
                </CardHeader>
                <CardContent className="p-4">
                  <DeviceRows byDevice={webAnalytics.today.byDevice} />
                </CardContent>
              </Card>
            </div>
          ) : null}

          {activeTab === "search" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  icon={Search}
                  label="Total searches"
                  value={searchSummary?.totalSearches ?? 0}
                  detail={`${formatNumber(searchSummary?.distinctSearchers ?? 0)} distinct searchers`}
                />
                <MetricCard
                  icon={Users}
                  label="Distinct searchers"
                  value={searchSummary?.distinctSearchers ?? 0}
                  detail={formatRange(selectedPeriod.startDate, selectedPeriod.endDate)}
                />
                <MetricCard
                  icon={MousePointerClick}
                  label="Zero-result searches"
                  value={searchSummary?.zeroResultSearches ?? 0}
                  detail={
                    (searchSummary?.totalSearches ?? 0) > 0
                      ? `${formatPercent(((searchSummary?.zeroResultSearches ?? 0) / (searchSummary?.totalSearches ?? 1)) * 100)} of searches`
                      : "No searches yet"
                  }
                />
              </div>

              <Card className="rounded-md border-border">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="text-sm font-semibold">Search terms</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Ranked by search volume. Terms are grouped case-insensitively; the most recent
                    spelling is shown.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  {searchTerms.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No search activity in this period.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {searchTerms.map((row, index) => (
                        <div
                          key={`${row.term}-${index}`}
                          className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_repeat(4,minmax(78px,auto))]"
                        >
                          <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{row.term}</p>
                            {row.zeroResultCount > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {formatNumber(row.zeroResultCount)} with no results
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <p className="font-semibold tabular-nums text-foreground">
                              {formatNumber(row.searchCount)}
                            </p>
                            <p className="text-xs text-muted-foreground">searches</p>
                          </div>
                          <div>
                            <p className="font-semibold tabular-nums text-foreground">
                              {formatNumber(row.distinctSearchers)}
                            </p>
                            <p className="text-xs text-muted-foreground">searchers</p>
                          </div>
                          <div>
                            <p className="font-semibold tabular-nums text-foreground">
                              {formatNumber(row.avgResultCount)}
                            </p>
                            <p className="text-xs text-muted-foreground">avg results</p>
                          </div>
                          <div>
                            <p className="font-semibold tabular-nums text-foreground">
                              {formatDateTime(row.lastSearchedAt)}
                            </p>
                            <p className="text-xs text-muted-foreground">last seen</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
