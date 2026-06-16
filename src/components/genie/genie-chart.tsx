"use client";

import * as React from "react";
import { BarChart3, Download, LineChart as LineChartIcon } from "lucide-react";
import * as echarts from "echarts/core";
import {
  BarChart as EChartsBarChart,
  LineChart as EChartsLineChart,
  type BarSeriesOption,
  type LineSeriesOption,
} from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  type DataZoomComponentOption,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption, ECharts } from "echarts/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadChartCardAsPng } from "@/lib/utils/genie-visual-export";
import type {
  GenieChartPayload,
  GenieChartPoint,
  GenieChartSeries,
} from "@/lib/genie/visual-payloads";
import type { VisualValueFormat } from "@/lib/genie/visual-format";

echarts.use([
  EChartsBarChart,
  EChartsLineChart,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
]);

/** Series colour at a given alpha, for gradient area fills. Falls back to null for non-hex/rgb colours so callers can use a flat fill. */
function colorWithAlpha(color: string, alpha: number): string | null {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgb\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) {
    const parts = rgb[1].split(",").slice(0, 3).map((s) => s.trim());
    if (parts.length === 3) return `rgba(${parts.join(", ")}, ${alpha})`;
  }
  return null;
}

export type { GenieChartPayload, GenieChartPoint, GenieChartSeries };

type GenieChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | DataZoomComponentOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>;

interface GenieChartTheme {
  background: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  seriesColors: string[];
}

const FALLBACK_SERIES_COLORS = [
  "#0B6E99",
  "#0F7B6C",
  "#D9730D",
  "#6940A5",
  "#AD1A72",
  "#787774",
];

const DEFAULT_CHART_THEME: GenieChartTheme = {
  background: "#ffffff",
  border: "#e5e5e5",
  foreground: "#171717",
  mutedForeground: "#737373",
  seriesColors: FALLBACK_SERIES_COLORS,
};

function formatVisualValue(value: string | number | null | undefined, format?: VisualValueFormat) {
  if (value == null || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);

  if (format === "currency" && Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  if (format === "percent" && Number.isFinite(numeric)) {
    return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(numeric)}%`;
  }

  if (Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(numeric);
  }

  return String(value);
}

function formatAxisValue(value: number, format?: VisualValueFormat) {
  if (format === "percent") {
    return `${new Intl.NumberFormat("en-AU", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)}%`;
  }

  return new Intl.NumberFormat("en-AU", {
    style: format === "currency" ? "currency" : undefined,
    currency: format === "currency" ? "AUD" : undefined,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function chartLabel(value: string) {
  return value.length > 20 ? `${value.slice(0, 19)}…` : value;
}

function isCanvasSafeColor(value: string) {
  return (
    /^#(?:[\da-f]{3,8})$/i.test(value)
    || /^rgba?\(/i.test(value)
    || /^hsla?\(/i.test(value)
    || /^[a-z]+$/i.test(value)
  );
}

function resolveCssColor(style: CSSStyleDeclaration, value: string | undefined, fallback: string) {
  if (!value) return fallback;

  const trimmed = value.trim();
  const varMatch = /^var\((--[^),\s]+)(?:,\s*([^)]+))?\)$/.exec(trimmed);
  if (!varMatch) return isCanvasSafeColor(trimmed) ? trimmed : fallback;

  const resolved = style.getPropertyValue(varMatch[1]).trim() || varMatch[2]?.trim() || fallback;
  return isCanvasSafeColor(resolved) ? resolved : fallback;
}

function readChartTheme(element: HTMLElement, series: GenieChartSeries[]): GenieChartTheme {
  const style = getComputedStyle(element);
  const paletteVars = [
    "--notion-blue",
    "--notion-green",
    "--notion-orange",
    "--notion-purple",
    "--notion-pink",
    "--notion-gray",
  ];

  return {
    background: resolveCssColor(style, "var(--background)", DEFAULT_CHART_THEME.background),
    border: resolveCssColor(style, "var(--border)", DEFAULT_CHART_THEME.border),
    foreground: resolveCssColor(style, "var(--foreground)", DEFAULT_CHART_THEME.foreground),
    mutedForeground: resolveCssColor(style, "var(--muted-foreground)", DEFAULT_CHART_THEME.mutedForeground),
    seriesColors: series.map((item, index) =>
      resolveCssColor(
        style,
        item.color ?? `var(${paletteVars[index % paletteVars.length]})`,
        FALLBACK_SERIES_COLORS[index % FALLBACK_SERIES_COLORS.length],
      ),
    ),
  };
}

function coerceChartNumber(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "—") return null;

  const isAccountingNegative = /^\(.*\)$/.test(trimmed);
  const suffix = /([kmb])\s*%?\)?$/i.exec(trimmed)?.[1]?.toLowerCase();
  const multiplier =
    suffix === "k"
      ? 1_000
      : suffix === "m"
        ? 1_000_000
        : suffix === "b"
          ? 1_000_000_000
          : 1;
  const normalised = trimmed
    .replace(/^\((.*)\)$/, "$1")
    .replace(/[−–—]/g, "-")
    .replace(/[^0-9.-]/g, "");
  const numeric = Number(normalised);
  return Number.isFinite(numeric)
    ? (isAccountingNegative ? -numeric : numeric) * multiplier
    : null;
}

function hasRenderableChartValues(chart: GenieChartPayload) {
  return chart.series.some((series) =>
    chart.data.some((point) => coerceChartNumber(point[series.key]) != null),
  );
}

function buildChartOption(chart: GenieChartPayload, theme: GenieChartTheme): GenieChartOption {
  const showLegend = chart.series.length > 1;
  const showDataZoom = chart.data.length > 14;
  const labels = chart.data.map((point) => point.label);
  const isSingleSeries = chart.series.length === 1;
  const showEndLabel = chart.kind === "line" && isSingleSeries && chart.data.length > 1;
  const labelFormatter: NonNullable<BarSeriesOption["label"]>["formatter"] = (params) =>
    formatVisualValue((params as { value?: number | string | null }).value ?? null, chart.valueFormatter);
  const series = chart.series.map<BarSeriesOption | LineSeriesOption>((item, index) => {
    const data = chart.data.map((point) => coerceChartNumber(point[item.key]));
    const color = theme.seriesColors[index];

    if (chart.kind === "line") {
      const gradientTop = colorWithAlpha(color, 0.22);
      const gradientBottom = colorWithAlpha(color, 0.01);
      return {
        type: "line",
        name: item.label,
        data,
        smooth: true,
        connectNulls: true,
        symbol: chart.data.length <= 18 ? "circle" : "none",
        symbolSize: 6,
        lineStyle: {
          width: 3,
        },
        itemStyle: {
          color,
        },
        areaStyle: isSingleSeries
          ? gradientTop && gradientBottom
            ? {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: gradientTop },
                    { offset: 1, color: gradientBottom },
                  ],
                },
              }
            : { opacity: 0.1 }
          : undefined,
        // Pin the latest value at the end of the line so the current figure reads at a glance.
        endLabel: isSingleSeries && chart.data.length > 1
          ? {
              show: true,
              color: theme.foreground,
              fontSize: 11,
              fontWeight: 600,
              formatter: labelFormatter,
            }
          : undefined,
        // A faint average reference line gives instant "above/below normal" context.
        markLine: isSingleSeries && chart.data.length >= 4
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { type: "dashed", color: theme.mutedForeground, opacity: 0.45, width: 1 },
              label: {
                show: true,
                position: "insideEndTop",
                formatter: "avg",
                color: theme.mutedForeground,
                fontSize: 10,
              },
              data: [{ type: "average", name: "Average" }],
            }
          : undefined,
        emphasis: {
          focus: "series",
        },
      };
    }

    return {
      type: "bar",
      name: item.label,
      data,
      barMaxWidth: 38,
      barMinHeight: 2,
      itemStyle: {
        color,
        borderRadius: [6, 6, 0, 0],
      },
      // Print the value above each bar when there's room (few, single-series bars).
      label: isSingleSeries && chart.data.length <= 8
        ? {
            show: true,
            position: "top",
            color: theme.mutedForeground,
            fontSize: 10,
            formatter: labelFormatter,
          }
        : undefined,
      emphasis: {
        focus: "series",
      },
    };
  });

  return {
    color: theme.seriesColors,
    animationDuration: 520,
    animationEasing: "quarticOut",
    textStyle: {
      color: theme.foreground,
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      appendToBody: true,
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: {
        color: theme.foreground,
        fontSize: 12,
      },
      valueFormatter: (value) =>
        formatVisualValue(typeof value === "number" || typeof value === "string" ? value : null, chart.valueFormatter),
      axisPointer: {
        type: chart.kind === "bar" ? "shadow" : "line",
      },
    },
    legend: showLegend
      ? {
          type: "scroll",
          top: 0,
          right: 0,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: {
            color: theme.mutedForeground,
            fontSize: 11,
          },
          pageIconColor: theme.foreground,
          pageIconInactiveColor: theme.border,
          pageTextStyle: {
            color: theme.mutedForeground,
          },
        }
      : undefined,
    grid: {
      top: showLegend ? 34 : 12,
      right: showEndLabel ? 52 : 14,
      bottom: showDataZoom ? 42 : 12,
      left: 10,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: theme.mutedForeground,
        fontSize: 11,
        hideOverlap: true,
        formatter: (value: string) => chartLabel(String(value)),
      },
    },
    yAxis: {
      type: "value",
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        lineStyle: {
          color: theme.border,
          opacity: 0.72,
        },
      },
      axisLabel: {
        color: theme.mutedForeground,
        fontSize: 11,
        formatter: (value: number) => formatAxisValue(Number(value), chart.valueFormatter),
      },
    },
    dataZoom: showDataZoom
      ? [
          {
            type: "inside",
            throttle: 50,
          },
          {
            type: "slider",
            height: 18,
            bottom: 4,
            borderColor: theme.border,
            fillerColor: "rgba(11, 110, 153, 0.12)",
            handleStyle: {
              color: theme.background,
              borderColor: theme.mutedForeground,
            },
            moveHandleStyle: {
              color: theme.mutedForeground,
            },
            textStyle: {
              color: theme.mutedForeground,
              fontSize: 10,
            },
          },
        ]
      : undefined,
    series,
  };
}

export function GenieChart({
  chart,
  variant = "chat",
  embedded = false,
  showExport = true,
  className,
}: {
  chart: GenieChartPayload;
  variant?: "chat" | "panel" | "dashboard";
  embedded?: boolean;
  showExport?: boolean;
  className?: string;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const chartElementRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<ECharts | null>(null);
  const [theme, setTheme] = React.useState<GenieChartTheme>(DEFAULT_CHART_THEME);
  const [isExporting, setIsExporting] = React.useState(false);
  const isLineChart = chart.kind === "line";
  const ChartIcon = isLineChart ? LineChartIcon : BarChart3;
  const isPanel = variant === "panel";
  const isDashboard = variant === "dashboard";
  const isEmpty = chart.series.length === 0 || chart.data.length === 0 || !hasRenderableChartValues(chart);
  const option = React.useMemo(() => buildChartOption(chart, theme), [chart, theme]);

  const refreshTheme = React.useCallback(() => {
    if (!chartElementRef.current) return;
    setTheme(readChartTheme(chartElementRef.current, chart.series));
  }, [chart.series]);

  React.useEffect(() => {
    const element = chartElementRef.current;
    if (!element) return;

    const instance = echarts.init(element, undefined, { renderer: "canvas" });
    chartInstanceRef.current = instance;

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => instance.resize())
      : null;
    resizeObserver?.observe(element);

    const handleResize = () => instance.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      instance.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    refreshTheme();

    const observer = new MutationObserver(refreshTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

    return () => observer.disconnect();
  }, [refreshTheme]);

  React.useEffect(() => {
    const instance = chartInstanceRef.current;
    if (!instance) return;
    instance.setOption(option, true);
    instance.resize();
  }, [option]);

  const handleDownloadPng = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await downloadChartCardAsPng({
        cardEl: cardRef.current,
        title: chart.title,
        subtitle: chart.subtitle,
      });
    } catch {
      // Chart may still be rendering.
    } finally {
      setIsExporting(false);
    }
  };

  const chartBody = (
    <div
      className={cn(
        "relative w-full",
        embedded ? "h-full min-h-[180px]" : isPanel || isDashboard ? "h-[220px]" : "h-[280px]",
      )}
    >
      <div
        ref={chartElementRef}
        data-genie-echart
        className="h-full w-full"
        role="img"
        aria-label={`${chart.title}${chart.subtitle ? `. ${chart.subtitle}` : ""}`}
      />
      {isEmpty ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground">
          No chart data
        </div>
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <div ref={cardRef} className={cn("flex h-full min-h-0 flex-col", className)}>
        {chartBody}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        "w-full border border-border/70 bg-background shadow-sm",
        isPanel || isDashboard ? "rounded-md p-3" : "rounded-3xl p-4",
        className,
      )}
    >
      <div className={cn("flex items-center justify-between gap-3", isPanel || isDashboard ? "mb-2" : "mb-3")}>
        <div className="flex min-w-0 items-start gap-2">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center bg-primary/12 text-primary",
              isPanel || isDashboard ? "h-6 w-6 rounded-md" : "h-8 w-8 rounded-2xl",
            )}
          >
            <ChartIcon className={cn(isPanel || isDashboard ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate font-semibold leading-tight text-foreground", (isPanel || isDashboard) && "text-sm")}>
              {chart.title}
            </p>
            {chart.subtitle ? (
              <p className={cn("mt-0.5 text-muted-foreground", isPanel || isDashboard ? "text-[11px] leading-snug" : "text-xs")}>
                {chart.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showExport ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="h-8 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label={`Download ${chart.title} as PNG`}
            >
              <Download className="h-3.5 w-3.5" />
              PNG
            </Button>
          ) : null}
        </div>
      </div>
      {chartBody}
    </div>
  );
}
