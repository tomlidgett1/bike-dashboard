"use client";

import * as React from "react";
import Image from "next/image";
import { BarChart3, Eye, Loader2, MousePointerClick, Package, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AnalyticsSummary {
  storeViews: number;
  storeDistinctUsers: number;
  productViews: number;
  productDistinctUsers: number;
  productImpressions: number;
  impressionDistinctUsers: number;
  totalViews: number;
  totalDistinctUsers: number;
}

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
  lastViewedAt: string | null;
}

interface AnalyticsResponse {
  days: number;
  summary: AnalyticsSummary;
  daily: DailyPoint[];
  topProducts: TopProduct[];
}

const emptySummary: AnalyticsSummary = {
  storeViews: 0,
  storeDistinctUsers: 0,
  productViews: 0,
  productDistinctUsers: 0,
  productImpressions: 0,
  impressionDistinctUsers: 0,
  totalViews: 0,
  totalDistinctUsers: 0,
};

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU").format(value || 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(value));
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return null;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{formatNumber(value)}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function TrendBars({ points }: { points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.storeViews + point.productViews));
  const compactPoints = points.length > 45 ? points.filter((_, index) => index % 3 === 0) : points;

  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Views Over Time</h3>
          <p className="text-xs text-muted-foreground">Store page views plus product page views.</p>
        </div>
      </div>
      <div className="flex h-44 items-end gap-1">
        {compactPoints.map((point) => {
          const views = point.storeViews + point.productViews;
          const height = Math.max(3, Math.round((views / max) * 100));
          return (
            <div key={point.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="relative flex w-full items-end justify-center">
                <div
                  className={cn(
                    "w-full max-w-5 rounded-t-sm bg-gray-900 transition-colors group-hover:bg-primary",
                    views === 0 && "bg-gray-200 group-hover:bg-gray-300",
                  )}
                  style={{ height: `${height}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-sm group-hover:block">
                  {formatDate(point.date)}: {formatNumber(views)} views, {formatNumber(point.distinctUsers)} users
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{points[0] ? formatDate(points[0].date) : ""}</span>
        <span>{points[points.length - 1] ? formatDate(points[points.length - 1].date) : ""}</span>
      </div>
    </div>
  );
}

function EmptyAnalytics() {
  return (
    <div className="rounded-md border border-dashed border-border bg-background px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">No analytics yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Store visits, product views, and product impressions will appear here once customers browse your public store.
      </p>
    </div>
  );
}

export function StoreAnalyticsManager() {
  const [days, setDays] = React.useState("30");
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

  const summary = data?.summary || emptySummary;
  const hasData = summary.totalViews > 0 || summary.productImpressions > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Store Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Counts use signed-in users where available and anonymous browser visitors otherwise. IP addresses are not stored.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-[140px] rounded-md">
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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-md border border-border bg-background py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasData ? (
        <EmptyAnalytics />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={Eye}
              label="Total Views"
              value={summary.totalViews}
              sub={`${formatNumber(summary.totalDistinctUsers)} distinct users`}
            />
            <Metric
              icon={Users}
              label="Store Page"
              value={summary.storeViews}
              sub={`${formatNumber(summary.storeDistinctUsers)} distinct users`}
            />
            <Metric
              icon={Package}
              label="Product Views"
              value={summary.productViews}
              sub={`${formatNumber(summary.productDistinctUsers)} distinct users`}
            />
            <Metric
              icon={MousePointerClick}
              label="Impressions"
              value={summary.productImpressions}
              sub={`${formatNumber(summary.impressionDistinctUsers)} distinct users`}
            />
          </div>

          <TrendBars points={data?.daily || []} />

          <Card className="rounded-md border-border">
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Top Products</h3>
                <p className="text-xs text-muted-foreground">Ranked by product page views, with impressions for context.</p>
              </div>
              <div className="divide-y divide-border">
                {(data?.topProducts || []).length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No product activity in this period.
                  </div>
                ) : (
                  data!.topProducts.map((product, index) => (
                    <a
                      key={product.productId}
                      href={`/marketplace/product/${product.productId}`}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/70"
                    >
                      <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md bg-secondary">
                          {product.imageUrl ? (
                            <Image src={product.imageUrl} alt="" fill sizes="44px" className="object-cover" />
                          ) : (
                            <Package className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(product.price) || "No price"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right text-xs sm:gap-6">
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">{formatNumber(product.views)}</p>
                          <p className="text-muted-foreground">views</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">{formatNumber(product.distinctUsers)}</p>
                          <p className="text-muted-foreground">users</p>
                        </div>
                        <div>
                          <p className="font-semibold tabular-nums text-foreground">{formatNumber(product.impressions)}</p>
                          <p className="text-muted-foreground">impr.</p>
                        </div>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

