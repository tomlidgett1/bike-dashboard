"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Compass,
  Eye,
  Loader2,
  ListTree,
  Monitor,
  MousePointerClick,
  Package,
  RefreshCw,
  Route,
  Search,
  Smartphone,
  Target,
  Timer,
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

type AnalyticsTab =
  | "overview"
  | "behaviour"
  | "intent"
  | "journeys"
  | "traffic"
  | "products"
  | "devices"
  | "search";
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

interface BehaviourAnalyticsRow {
  key: string;
  label: string;
  count: number;
  visitors: number;
  sessions: number;
}

interface BehaviourAnalytics {
  days: number;
  summary: {
    totalEvents: number;
    totalSessions: number;
    distinctVisitors: number;
    engagedSessions: number;
    engagementRate: number;
    bounceRate: number;
    avgSessionDurationSeconds: number;
    avgEventsPerSession: number;
    conversionIntentRate: number;
    avgMaxScrollDepth: number;
  };
  eventsByType: BehaviourAnalyticsRow[];
  firstActions: BehaviourAnalyticsRow[];
  tabEngagement: BehaviourAnalyticsRow[];
  sectionEngagement: BehaviourAnalyticsRow[];
  ctaClicks: BehaviourAnalyticsRow[];
  carouselEngagement: BehaviourAnalyticsRow[];
  scrollDepth: Array<{ depth: number; sessions: number; percent: number }>;
  journeyPaths: Array<{ path: string; count: number; percent: number }>;
  recentSessions: Array<{
    sessionId: string;
    visitorKey: string;
    deviceType: string;
    startedAt: string;
    lastSeenAt: string;
    durationSeconds: number;
    eventCount: number;
    pageViews: number;
    maxScrollDepth: number;
    entrySource: string | null;
    exitSource: string | null;
    firstAction: string | null;
    journey: string[];
  }>;
}

interface StoreAnalyticsAiInsight {
  priority: "high" | "medium" | "low";
  title: string;
  recommendation: string;
  evidence: string;
  nextAction: string;
}

interface StoreAnalyticsAiResponse {
  generatedAt: string;
  model: string;
  periodDays: number;
  headline: string;
  executiveSummary: string;
  customerStory: string;
  confidence: "high" | "medium" | "low";
  periodComparison: Array<{
    metric: string;
    current: string;
    previous: string;
    interpretation: string;
  }>;
  recommendations: StoreAnalyticsAiInsight[];
  patterns: string[];
  risks: string[];
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
  behaviourAnalytics?: BehaviourAnalytics;
}

const emptyTopProducts: TopProduct[] = [];
const emptySearchTerms: SearchTermRow[] = [];
const AI_CACHE_TTL_MS = 15 * 60 * 1000;

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
  { value: "behaviour", label: "Behaviour", icon: Activity },
  { value: "intent", label: "Intent", icon: Target },
  { value: "journeys", label: "Journeys", icon: Route },
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

function formatDecimal(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "0";
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(Number(value));
}

function formatDuration(seconds: number | null | undefined) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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

function getIntentSessionCount(behaviourSummary: BehaviourAnalytics["summary"] | undefined) {
  if (!behaviourSummary) return 0;
  return Math.round((behaviourSummary.conversionIntentRate / 100) * behaviourSummary.totalSessions);
}

function getTopLabel(rows: BehaviourAnalyticsRow[] | undefined, fallback: string) {
  return rows?.[0]?.label || fallback;
}

function buildActionInsights({
  behaviourAnalytics,
  searchSummary,
  searchTerms,
  topProducts,
  selectedPeriod,
}: {
  behaviourAnalytics: BehaviourAnalytics | undefined;
  searchSummary: SearchAnalyticsSummary | undefined;
  searchTerms: SearchTermRow[];
  topProducts: TopProduct[];
  selectedPeriod: TrackingPeriodSummary | undefined;
}) {
  const insights: Array<{ title: string; body: string; meta: string }> = [];
  const behaviourSummary = behaviourAnalytics?.summary;
  const topSection = behaviourAnalytics?.sectionEngagement[0];
  const topAction = behaviourAnalytics?.ctaClicks[0];
  const topSearch = searchTerms[0];
  const topProduct = topProducts[0];

  if (!behaviourSummary || behaviourSummary.totalSessions === 0) {
    return [
      {
        title: "Start with a clean baseline",
        body: "The new behavioural tracking is ready. Let it collect a few customer sessions before making layout decisions.",
        meta: "Check again after the next meaningful traffic window",
      },
    ];
  }

  if (behaviourSummary.bounceRate >= 45) {
    insights.push({
      title: "Fix the first screen",
      body: "A high share of sessions leave before a meaningful click or scroll. Put the clearest product/service promise and primary action above the fold.",
      meta: `${formatPercent(behaviourSummary.bounceRate)} bounce rate`,
    });
  }

  if (behaviourSummary.avgMaxScrollDepth < 55) {
    insights.push({
      title: "Move value higher",
      body: "Customers are not reaching much of the page. Promote the best-selling carousel, services, and contact actions earlier.",
      meta: `${formatPercent(behaviourSummary.avgMaxScrollDepth)} average scroll depth`,
    });
  }

  if (searchSummary && searchSummary.zeroResultSearches > 0) {
    insights.push({
      title: "Search is exposing demand gaps",
      body: topSearch
        ? `Customers are searching for “${topSearch.term}”. Improve product naming, add matching stock, or create a collection for that demand.`
        : "Customers are searching and sometimes finding no results. Use those terms to improve product names and categories.",
      meta: `${formatNumber(searchSummary.zeroResultSearches)} zero-result searches`,
    });
  }

  if (topAction) {
    insights.push({
      title: "Lean into proven intent",
      body: `${topAction.label} is the strongest high-intent action. Make this action visible in the hero, sticky header, and relevant sections.`,
      meta: `${formatNumber(topAction.sessions)} sessions used this action`,
    });
  }

  if (topSection) {
    insights.push({
      title: "Protect the section customers actually see",
      body: `${topSection.label} is getting the most attention. Keep it fast, current, and tied to a clear next action.`,
      meta: `${formatNumber(topSection.sessions)} sessions reached it`,
    });
  }

  if (topProduct && selectedPeriod && selectedPeriod.productImpressions > 0) {
    insights.push({
      title: "Use product interest as merchandising signal",
      body: `${topProduct.name} is the leading product. Feature it near the top and make sure its image, price, and availability are strong.`,
      meta: `${formatNumber(topProduct.views)} product views`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "The storefront is behaving well",
      body: "Customers are engaging and showing intent. Use the sections below to find which products, searches, and paths deserve more prominence.",
      meta: `${formatPercent(behaviourSummary.engagementRate)} engagement rate`,
    });
  }

  return insights.slice(0, 4);
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
        "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-white text-gray-800 shadow-sm"
          : "text-gray-600 hover:bg-gray-200/70",
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

function SignalCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function InsightCard({
  title,
  body,
  meta,
}: {
  title: string;
  body: string;
  meta: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <p className="mt-3 text-xs font-medium text-foreground">{meta}</p>
    </div>
  );
}

function RankedInsightList({
  title,
  description,
  rows,
  emptyLabel,
  metricLabel = "sessions",
}: {
  title: string;
  description: string;
  rows: BehaviourAnalyticsRow[];
  emptyLabel: string;
  metricLabel?: string;
}) {
  return (
    <Card className="rounded-md border-border">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.slice(0, 6).map((row, index) => (
              <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(row.visitors)} visitors · {formatNumber(row.count)} events
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(row.sessions)}</p>
                  <p className="text-xs text-muted-foreground">{metricLabel}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function priorityLabel(priority: StoreAnalyticsAiInsight["priority"]) {
  if (priority === "high") return "High priority";
  if (priority === "medium") return "Medium priority";
  return "Low priority";
}

function readCachedAiInsights(cacheKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: StoreAnalyticsAiResponse };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > AI_CACHE_TTL_MS) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeCachedAiInsights(cacheKey: string, data: StoreAnalyticsAiResponse) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Ignore storage failures; AI insights can be regenerated.
  }
}

function AiInsightPanel({
  insights,
  loading,
  error,
  onGenerate,
}: {
  insights: StoreAnalyticsAiResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <Card className="rounded-md border-border">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md text-xs font-medium">
              AI analysis
            </Badge>
            {insights ? (
              <Badge variant="outline" className="rounded-md text-xs font-medium">
                {insights.confidence} confidence
              </Badge>
            ) : null}
          </div>
          <CardTitle className="mt-3 text-base font-semibold">
            {insights?.headline ?? "Generate store-specific recommendations"}
          </CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {insights?.executiveSummary ??
              "The AI reviews all current analytics, compares the previous period, detects patterns, and turns the data into plain-English actions."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onGenerate} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {insights ? "Refresh AI analysis" : "Generate AI analysis"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!insights ? (
          <div className="rounded-md border border-dashed border-border bg-background p-5 text-sm leading-relaxed text-muted-foreground">
            This is not a static rule engine. It calls the model with the full analytics context for this store,
            including period comparison, search demand, product interest, scroll depth, CTA intent, and journeys.
          </div>
        ) : (
          <>
            <div className="rounded-md border border-border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer story</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{insights.customerStory}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Generated {formatDateTime(insights.generatedAt)} using {insights.model}
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {insights.recommendations.map((item) => (
                <div key={`${item.priority}-${item.title}`} className="rounded-md border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <Badge variant="outline" className="rounded-md text-xs font-medium">
                      {priorityLabel(item.priority)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.recommendation}</p>
                  <div className="mt-4 space-y-2 rounded-md bg-gray-50 p-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Evidence: </span>
                      {item.evidence}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Next action: </span>
                      {item.nextAction}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {insights.periodComparison.length > 0 ? (
              <div className="rounded-md border border-border bg-background">
                <div className="border-b border-border/60 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">Period comparison</p>
                </div>
                <div className="divide-y divide-border/60">
                  {insights.periodComparison.map((row) => (
                    <div key={row.metric} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[160px_1fr_1fr_2fr]">
                      <p className="font-medium text-foreground">{row.metric}</p>
                      <p className="text-muted-foreground">Current: {row.current}</p>
                      <p className="text-muted-foreground">Previous: {row.previous}</p>
                      <p className="text-muted-foreground">{row.interpretation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-border bg-background p-4">
                <p className="text-sm font-semibold text-foreground">Patterns detected</p>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {insights.patterns.length > 0 ? (
                    insights.patterns.map((pattern) => <li key={pattern}>{pattern}</li>)
                  ) : (
                    <li>No clear pattern detected yet.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-md border border-border bg-background p-4">
                <p className="text-sm font-semibold text-foreground">Risks to watch</p>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {insights.risks.length > 0 ? (
                    insights.risks.map((risk) => <li key={risk}>{risk}</li>)
                  ) : (
                    <li>No major risk detected from the current data.</li>
                  )}
                </ul>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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

function BehaviourRow({
  row,
  detail,
}: {
  row: BehaviourAnalyticsRow;
  detail?: string;
}) {
  return (
    <div className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))]">
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.label}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <div>
        <p className="font-semibold tabular-nums text-foreground">{formatNumber(row.count)}</p>
        <p className="text-xs text-muted-foreground">events</p>
      </div>
      <div>
        <p className="font-semibold tabular-nums text-foreground">{formatNumber(row.sessions)}</p>
        <p className="text-xs text-muted-foreground">sessions</p>
      </div>
      <div>
        <p className="font-semibold tabular-nums text-foreground">{formatNumber(row.visitors)}</p>
        <p className="text-xs text-muted-foreground">visitors</p>
      </div>
    </div>
  );
}

function BehaviourList({
  title,
  description,
  rows,
  emptyLabel,
}: {
  title: string;
  description: string;
  rows: BehaviourAnalyticsRow[];
  emptyLabel: string;
}) {
  return (
    <Card className="rounded-md border-border">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((row) => (
              <BehaviourRow key={row.key} row={row} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
  const [aiInsights, setAiInsights] = React.useState<StoreAnalyticsAiResponse | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

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

  const aiCacheKey = React.useMemo(() => `store-analytics-ai:${days}`, [days]);

  React.useEffect(() => {
    setAiError(null);
    setAiInsights(readCachedAiInsights(aiCacheKey));
  }, [aiCacheKey]);

  const loadAiInsights = React.useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/store/analytics/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: Number(days) || 30 }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to generate AI analytics");
      }
      setAiInsights(json);
      writeCachedAiInsights(aiCacheKey, json);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to generate AI analytics");
    } finally {
      setAiLoading(false);
    }
  }, [aiCacheKey, days]);

  const summary = data?.summary;
  const webAnalytics = data?.webAnalytics;
  const selectedPeriod = webAnalytics?.selectedPeriod;
  const analyticsTimezoneLabel = getStoreAnalyticsTimezoneShortLabel();
  const topProducts = data?.topProducts ?? emptyTopProducts;
  const searchAnalytics = data?.searchAnalytics;
  const searchTerms = searchAnalytics?.searchTerms ?? emptySearchTerms;
  const searchSummary = searchAnalytics?.summary;
  const behaviourAnalytics = data?.behaviourAnalytics;
  const behaviourSummary = behaviourAnalytics?.summary;
  const hasTrafficData = Boolean(
    selectedPeriod && (selectedPeriod.totalViews > 0 || selectedPeriod.productImpressions > 0),
  );
  const hasSearchData = (searchSummary?.totalSearches ?? 0) > 0;
  const hasBehaviourData = (behaviourSummary?.totalEvents ?? 0) > 0;
  const hasData = hasTrafficData || hasSearchData || hasBehaviourData;

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
  const actionInsights = React.useMemo(
    () =>
      buildActionInsights({
        behaviourAnalytics,
        searchSummary,
        searchTerms,
        topProducts,
        selectedPeriod,
      }),
    [behaviourAnalytics, searchSummary, searchTerms, selectedPeriod, topProducts],
  );
  const intentSessionCount = getIntentSessionCount(behaviourSummary);
  const topFirstAction = getTopLabel(behaviourAnalytics?.firstActions, "No first action yet");
  const topSection = getTopLabel(behaviourAnalytics?.sectionEngagement, "No section signal yet");
  const topIntent = getTopLabel(behaviourAnalytics?.ctaClicks, "No CTA intent yet");
  const topJourney = behaviourAnalytics?.journeyPaths[0];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center rounded-md border border-border bg-background py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-background p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="outline" className="rounded-md text-xs font-medium">
              Customer intelligence
            </Badge>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              What customers actually do on your website
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Start here for decisions: what shoppers notice, what they click first, which intent
              signals are growing, where they drop, and what to improve next. Times use Melbourne
              calendar days ({analyticsTimezoneLabel}); owner visits are excluded.
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
      </div>

      <nav aria-label="Analytics sections">
        <div className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-md bg-gray-100 p-0.5">
          {tabs.map((tab) => (
            <AnalyticsTabButton
              key={tab.value}
              active={activeTab === tab.value}
              count={
                tab.value === "products"
                  ? topProducts.length
                  : tab.value === "search"
                    ? searchTerms.length
                    : tab.value === "behaviour"
                      ? behaviourSummary?.totalEvents
                      : tab.value === "intent"
                        ? behaviourAnalytics?.ctaClicks.length
                        : tab.value === "journeys"
                          ? behaviourSummary?.totalSessions
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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SignalCard
                  icon={Users}
                  label="Visitors"
                  value={formatNumber(selectedPeriod.totalDistinctViewers)}
                  detail={`${formatNumber(selectedPeriod.totalViews)} page views in ${formatRange(selectedPeriod.startDate, selectedPeriod.endDate)}`}
                />
                <SignalCard
                  icon={Activity}
                  label="Engaged sessions"
                  value={formatNumber(behaviourSummary?.engagedSessions ?? 0)}
                  detail={`${formatPercent(behaviourSummary?.engagementRate ?? 0)} engaged · ${formatPercent(behaviourSummary?.bounceRate ?? 0)} bounced`}
                />
                <SignalCard
                  icon={Target}
                  label="Intent shown"
                  value={formatNumber(intentSessionCount)}
                  detail={`${formatPercent(behaviourSummary?.conversionIntentRate ?? 0)} of sessions showed search, product, cart, contact, service, or rental intent`}
                />
                <SignalCard
                  icon={Compass}
                  label="Attention"
                  value={formatPercent(behaviourSummary?.avgMaxScrollDepth ?? 0)}
                  detail={`${formatDuration(behaviourSummary?.avgSessionDurationSeconds ?? 0)} average session`}
                />
              </div>

              <AiInsightPanel
                insights={aiInsights}
                loading={aiLoading}
                error={aiError}
                onGenerate={loadAiInsights}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Signal-based next steps</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Deterministic prompts from customer behaviour, search demand, product interest, and drop-off signals.
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-3 p-4 md:grid-cols-2">
                    {actionInsights.map((insight) => (
                      <InsightCard
                        key={insight.title}
                        title={insight.title}
                        body={insight.body}
                        meta={insight.meta}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Customer readout</CardTitle>
                    <p className="text-xs text-muted-foreground">The fastest way to understand current behaviour.</p>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">First thing they do</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{topFirstAction}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Most-seen area</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{topSection}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Strongest intent</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{topIntent}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Common path</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground">
                        {topJourney ? topJourney.path : "No journey pattern yet"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <RankedInsightList
                  title="Where attention goes"
                  description="The parts of the storefront people actually reach."
                  rows={behaviourAnalytics?.sectionEngagement ?? []}
                  emptyLabel="No section attention recorded yet."
                />
                <RankedInsightList
                  title="What they try first"
                  description="Early actions are the clearest signal of customer intent."
                  rows={behaviourAnalytics?.firstActions ?? []}
                  emptyLabel="No first actions recorded yet."
                />
                <RankedInsightList
                  title="What they click"
                  description="High-intent calls, messages, cart, service, and rental actions."
                  rows={behaviourAnalytics?.ctaClicks ?? []}
                  emptyLabel="No intent clicks recorded yet."
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Demand signals</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Searches and products that reveal what customers came looking for.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/60">
                      {searchTerms.slice(0, 4).map((row) => (
                        <div key={row.term} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{row.term}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(row.distinctSearchers)} searchers · {formatNumber(row.zeroResultCount)} no-result
                            </p>
                          </div>
                          <p className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(row.searchCount)}</p>
                        </div>
                      ))}
                      {searchTerms.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No customer searches in this period.
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Products pulling interest</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Use these to decide what belongs higher on the storefront.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/60">
                      {topProducts.slice(0, 4).map((product) => (
                        <div key={product.productId} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(product.price)} · {formatNumber(product.impressions)} impressions
                            </p>
                          </div>
                          <p className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(product.views)}</p>
                        </div>
                      ))}
                      {topProducts.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No product interest in this period.
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}

          {activeTab === "behaviour" ? (
            behaviourAnalytics ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MetricCard
                    icon={Activity}
                    label="Behaviour events"
                    value={behaviourAnalytics.summary.totalEvents}
                    detail={`${formatNumber(behaviourAnalytics.summary.totalSessions)} sessions`}
                  />
                  <MetricCard
                    icon={Users}
                    label="Behaviour visitors"
                    value={behaviourAnalytics.summary.distinctVisitors}
                    detail={`${formatDecimal(behaviourAnalytics.summary.avgEventsPerSession)} events per session`}
                  />
                  <MetricCard
                    icon={MousePointerClick}
                    label="Engagement rate"
                    value={behaviourAnalytics.summary.engagementRate}
                    detail={`${formatNumber(behaviourAnalytics.summary.engagedSessions)} engaged sessions`}
                  />
                  <MetricCard
                    icon={Timer}
                    label="Avg. duration"
                    value={behaviourAnalytics.summary.avgSessionDurationSeconds}
                    detail={formatDuration(behaviourAnalytics.summary.avgSessionDurationSeconds)}
                  />
                  <MetricCard
                    icon={Compass}
                    label="Avg. depth"
                    value={behaviourAnalytics.summary.avgMaxScrollDepth}
                    detail="Average maximum scroll depth"
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <BehaviourList
                    title="First customer actions"
                    description="The first meaningful thing customers do after landing."
                    rows={behaviourAnalytics.firstActions}
                    emptyLabel="No first actions recorded yet."
                  />
                  <Card className="rounded-md border-border">
                    <CardHeader className="border-b border-border/60 pb-3">
                      <CardTitle className="text-sm font-semibold">Scroll depth</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        How far sessions get through the storefront page.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      {behaviourAnalytics.scrollDepth.map((row) => (
                        <BreakdownRow
                          key={row.depth}
                          label={`${row.depth}% depth`}
                          value={row.sessions}
                          total={behaviourAnalytics.summary.totalSessions}
                          detail={`${formatPercent(row.percent)} of sessions reached this point`}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <BehaviourList
                    title="Tab engagement"
                    description="Which store tabs customers actively open."
                    rows={behaviourAnalytics.tabEngagement}
                    emptyLabel="No tab engagement recorded yet."
                  />
                  <BehaviourList
                    title="Section engagement"
                    description="Home sections, tabs, and carousels that customers actually see."
                    rows={behaviourAnalytics.sectionEngagement}
                    emptyLabel="No section views recorded yet."
                  />
                </div>

                <BehaviourList
                  title="All tracked behaviours"
                  description="Every behavioural signal grouped by event type."
                  rows={behaviourAnalytics.eventsByType}
                  emptyLabel="No behaviour events recorded yet."
                />
              </>
            ) : (
              <EmptyAnalytics />
            )
          ) : null}

          {activeTab === "intent" ? (
            behaviourAnalytics ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    icon={Target}
                    label="Intent rate"
                    value={behaviourAnalytics.summary.conversionIntentRate}
                    detail="Sessions with search, product, cart, contact, rental, or service intent"
                  />
                  <MetricCard
                    icon={MousePointerClick}
                    label="CTA clicks"
                    value={behaviourAnalytics.ctaClicks.reduce((sum, row) => sum + row.count, 0)}
                    detail={`${formatNumber(behaviourAnalytics.ctaClicks.length)} action types`}
                  />
                  <MetricCard
                    icon={ListTree}
                    label="Carousel actions"
                    value={behaviourAnalytics.carouselEngagement.reduce((sum, row) => sum + row.count, 0)}
                    detail="Scrolls and expansions across storefront carousels"
                  />
                  <MetricCard
                    icon={Search}
                    label="Searches"
                    value={searchSummary?.totalSearches ?? 0}
                    detail={`${formatNumber(searchSummary?.zeroResultSearches ?? 0)} zero-result searches`}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <BehaviourList
                    title="CTA and contact intent"
                    description="Calls, messages, cart actions, service booking, rental requests, and other high-intent clicks."
                    rows={behaviourAnalytics.ctaClicks}
                    emptyLabel="No high-intent CTA clicks recorded yet."
                  />
                  <BehaviourList
                    title="Carousel intent"
                    description="Which storefront rows customers explore beyond the first visible products."
                    rows={behaviourAnalytics.carouselEngagement}
                    emptyLabel="No carousel scrolls or expansions recorded yet."
                  />
                </div>
              </>
            ) : (
              <EmptyAnalytics />
            )
          ) : null}

          {activeTab === "journeys" ? (
            behaviourAnalytics ? (
              <>
                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Most common paths</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      The first six meaningful steps customers take in a session.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    {behaviourAnalytics.journeyPaths.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No journey paths recorded yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {behaviourAnalytics.journeyPaths.map((row) => (
                          <div key={row.path} className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(72px,auto))]">
                            <p className="min-w-0 truncate font-medium text-foreground">{row.path}</p>
                            <div>
                              <p className="font-semibold tabular-nums text-foreground">{formatNumber(row.count)}</p>
                              <p className="text-xs text-muted-foreground">sessions</p>
                            </div>
                            <div>
                              <p className="font-semibold tabular-nums text-foreground">{formatPercent(row.percent)}</p>
                              <p className="text-xs text-muted-foreground">share</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-md border-border">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-sm font-semibold">Recent customer sessions</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Session-level behaviour without storing IP addresses or full user-agent strings.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    {behaviourAnalytics.recentSessions.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No recent sessions recorded yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {behaviourAnalytics.recentSessions.map((session) => (
                          <div key={session.sessionId} className="space-y-3 px-4 py-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {session.firstAction || "Passive browsing session"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDateTime(session.startedAt)} · {session.deviceType} · {formatDuration(session.durationSeconds)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className="rounded-md">
                                  {formatNumber(session.eventCount)} events
                                </Badge>
                                <Badge variant="outline" className="rounded-md">
                                  {formatNumber(session.pageViews)} views
                                </Badge>
                                <Badge variant="outline" className="rounded-md">
                                  {formatPercent(session.maxScrollDepth)} depth
                                </Badge>
                              </div>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {session.journey.length > 0 ? session.journey.join(" -> ") : "No journey steps recorded."}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <EmptyAnalytics />
            )
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
