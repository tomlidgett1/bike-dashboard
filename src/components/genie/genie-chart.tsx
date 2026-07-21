"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Download, LineChart as LineChartIcon } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { downloadChartCardAsPng } from "@/lib/utils/genie-visual-export";
import type {
  GenieChartPayload,
  GenieChartPoint,
  GenieChartSeries,
} from "@/lib/genie/visual-payloads";
import type { VisualValueFormat } from "@/lib/genie/visual-format";

export type { GenieChartPayload, GenieChartPoint, GenieChartSeries };

const FALLBACK_SERIES_COLORS = [
  "#0B6E99",
  "#0F7B6C",
  "#D9730D",
  "#6940A5",
  "#AD1A72",
  "#787774",
];

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

function resolveSeriesColor(series: GenieChartSeries, index: number): string {
  const color = series.color?.trim();
  if (color && (/^#/.test(color) || /^rgba?\(/i.test(color) || /^[a-z]+$/i.test(color))) {
    return color;
  }
  return FALLBACK_SERIES_COLORS[index % FALLBACK_SERIES_COLORS.length]!;
}

export type GenieChartAppearance = {
  accentColor?: string;
  axisColor?: string;
  fontFamily?: string;
  showGrid?: boolean;
  tickFontSize?: number;
};

export function GenieChart({
  chart,
  variant = "chat",
  embedded = false,
  showExport = true,
  className,
  appearance,
}: {
  chart: GenieChartPayload;
  variant?: "chat" | "panel" | "dashboard";
  embedded?: boolean;
  showExport?: boolean;
  className?: string;
  appearance?: GenieChartAppearance;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const accessibilityTableId = React.useId();
  const [isExporting, setIsExporting] = React.useState(false);
  const isLineChart = chart.kind === "line";
  const ChartIcon = isLineChart ? LineChartIcon : BarChart3;
  const isPanel = variant === "panel";
  const isDashboard = variant === "dashboard";
  const isEmpty =
    chart.series.length === 0
    || chart.data.length === 0
    || !hasRenderableChartValues(chart);

  const seriesMeta = React.useMemo(
    () =>
      chart.series.map((item, index) => {
        const withAccent =
          index === 0 && appearance?.accentColor?.trim()
            ? { ...item, color: appearance.accentColor.trim() }
            : item;
        return {
          ...withAccent,
          color: resolveSeriesColor(withAccent, index),
          format: withAccent.format ?? chart.valueFormatter,
        };
      }),
    [appearance?.accentColor, chart.series, chart.valueFormatter],
  );

  const axisTick = React.useMemo(
    () => ({
      fill: appearance?.axisColor?.trim() || "#737373",
      fontSize: appearance?.tickFontSize ?? 11,
      fontFamily: appearance?.fontFamily,
    }),
    [appearance?.axisColor, appearance?.fontFamily, appearance?.tickFontSize],
  );
  const showGrid = appearance?.showGrid !== false;

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    for (const item of seriesMeta) {
      config[item.key] = {
        label: item.label,
        color: item.color,
      };
    }
    return config;
  }, [seriesMeta]);

  const chartData = React.useMemo(
    () =>
      chart.data.map((point) => {
        const row: Record<string, string | number | null> = { label: point.label };
        for (const series of seriesMeta) {
          row[series.key] = coerceChartNumber(point[series.key]);
        }
        return row;
      }),
    [chart.data, seriesMeta],
  );

  const seriesFormats = seriesMeta.map((item) => item.format);
  const axisFormats = seriesFormats.filter(
    (format, index) => seriesFormats.indexOf(format) === index,
  );
  const useSecondaryAxis = axisFormats.length > 1;
  const primaryFormat = axisFormats[0] ?? chart.valueFormatter;
  const secondaryFormat = axisFormats[1];
  const isSingleSeries = seriesMeta.length === 1;
  const showBarLabels = !isLineChart && isSingleSeries && chartData.length <= 8;
  const rotateLabels =
    !isLineChart
    && chart.data.some((point) => point.label.length > 10 || /\d{4}-\d{2}-\d{2}/.test(point.label));

  const averageValue = React.useMemo(() => {
    if (!isLineChart || !isSingleSeries || chartData.length < 4) return null;
    const key = seriesMeta[0]?.key;
    if (!key) return null;
    const values = chartData
      .map((row) => row[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [chartData, isLineChart, isSingleSeries, seriesMeta]);

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

  const yAxisSharedProps = {
    tickLine: false as const,
    axisLine: false as const,
    width: 48,
    tick: axisTick,
  };

  const chartBody = (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        // Explicit height floor so Recharts can measure; card clips overflow (no nested scroll).
        embedded ? "h-full min-h-[180px]" : isPanel || isDashboard ? "h-[220px]" : "h-[280px]",
      )}
      style={appearance?.fontFamily ? { fontFamily: appearance.fontFamily } : undefined}
    >
      {!isEmpty ? (
        <ChartContainer
          config={chartConfig}
          className="h-full min-h-[180px] w-full !aspect-auto [&_.recharts-cartesian-axis-tick_text]:fill-gray-500"
          role="img"
          aria-label={`${chart.title}${chart.subtitle ? `. ${chart.subtitle}` : ""}`}
          aria-describedby={accessibilityTableId}
          initialDimension={{ width: 640, height: 220 }}
        >
          {isLineChart ? (
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: seriesMeta.length > 1 ? 28 : 12,
                right: useSecondaryAxis ? 48 : 16,
                left: 4,
                bottom: 4,
              }}
            >
              {showGrid ? (
                <CartesianGrid vertical={false} stroke="#e5e5e5" strokeOpacity={0.72} />
              ) : null}
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
                tickFormatter={(value) => chartLabel(String(value))}
                tick={axisTick}
              />
              <YAxis
                yAxisId="left"
                {...yAxisSharedProps}
                tickFormatter={(value) => formatAxisValue(Number(value), primaryFormat)}
              />
              {useSecondaryAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  {...yAxisSharedProps}
                  tickFormatter={(value) => formatAxisValue(Number(value), secondaryFormat)}
                />
              ) : null}
              <ChartTooltip
                cursor={{ stroke: "#d4d4d4", strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, name) => {
                      const series = seriesMeta.find((item) => item.key === name);
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            {series?.label ?? String(name)}
                          </span>
                          <span className="font-medium tabular-nums text-foreground">
                            {formatVisualValue(
                              typeof value === "number" || typeof value === "string"
                                ? value
                                : null,
                              series?.format ?? chart.valueFormatter,
                            )}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              {seriesMeta.length > 1 ? (
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{
                    fontSize: axisTick.fontSize,
                    color: axisTick.fill,
                    fontFamily: axisTick.fontFamily,
                  }}
                />
              ) : null}
              {averageValue != null ? (
                <ReferenceLine
                  yAxisId="left"
                  y={averageValue}
                  stroke="#a3a3a3"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "avg",
                    position: "insideTopRight",
                    fill: "#a3a3a3",
                    fontSize: 10,
                  }}
                />
              ) : null}
              {seriesMeta.map((series) => {
                const yAxisId =
                  useSecondaryAxis && series.format !== primaryFormat ? "right" : "left";
                return (
                  <Line
                    key={series.key}
                    yAxisId={yAxisId}
                    type="monotone"
                    dataKey={series.key}
                    name={series.key}
                    stroke={`var(--color-${series.key})`}
                    strokeWidth={3}
                    dot={chartData.length <= 18 ? { r: 3, strokeWidth: 0 } : false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive
                    animationDuration={500}
                  />
                );
              })}
            </LineChart>
          ) : (
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: seriesMeta.length > 1 ? 28 : showBarLabels ? 20 : 12,
                right: useSecondaryAxis ? 48 : 12,
                left: 4,
                bottom: rotateLabels ? 18 : 4,
              }}
            >
              {showGrid ? (
                <CartesianGrid vertical={false} stroke="#e5e5e5" strokeOpacity={0.72} />
              ) : null}
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={12}
                interval="preserveStartEnd"
                angle={rotateLabels ? -32 : 0}
                textAnchor={rotateLabels ? "end" : "middle"}
                height={rotateLabels ? 48 : 28}
                tickFormatter={(value) => chartLabel(String(value))}
                tick={axisTick}
              />
              <YAxis
                yAxisId="left"
                {...yAxisSharedProps}
                tickFormatter={(value) => formatAxisValue(Number(value), primaryFormat)}
              />
              {useSecondaryAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  {...yAxisSharedProps}
                  tickFormatter={(value) => formatAxisValue(Number(value), secondaryFormat)}
                />
              ) : null}
              <ChartTooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    formatter={(value, name) => {
                      const series = seriesMeta.find((item) => item.key === name);
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            {series?.label ?? String(name)}
                          </span>
                          <span className="font-medium tabular-nums text-foreground">
                            {formatVisualValue(
                              typeof value === "number" || typeof value === "string"
                                ? value
                                : null,
                              series?.format ?? chart.valueFormatter,
                            )}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              {seriesMeta.length > 1 ? (
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{
                    fontSize: axisTick.fontSize,
                    color: axisTick.fill,
                    fontFamily: axisTick.fontFamily,
                  }}
                />
              ) : null}
              {seriesMeta.map((series) => {
                const yAxisId =
                  useSecondaryAxis && series.format !== primaryFormat ? "right" : "left";
                return (
                  <Bar
                    key={series.key}
                    yAxisId={yAxisId}
                    dataKey={series.key}
                    name={series.key}
                    fill={`var(--color-${series.key})`}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                    isAnimationActive
                    animationDuration={500}
                  >
                    {showBarLabels ? (
                      <LabelList
                        dataKey={series.key}
                        position="top"
                        className="fill-gray-500"
                        fontSize={10}
                        formatter={(value) =>
                          formatVisualValue(
                            typeof value === "number" || typeof value === "string"
                              ? value
                              : null,
                            series.format ?? chart.valueFormatter,
                          )
                        }
                      />
                    ) : null}
                  </Bar>
                );
              })}
            </BarChart>
          )}
        </ChartContainer>
      ) : null}

      <table id={accessibilityTableId} className="sr-only">
        <caption>
          {chart.title}. {chart.subtitle ?? ""} {chart.sourceLabel ?? ""}{" "}
          {chart.freshnessLabel ?? ""}
        </caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {chart.series.map((series) => (
              <th key={series.key} scope="col">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.data.slice(0, 50).map((point, index) => (
            <tr key={`${point.label}-${index}`}>
              <th scope="row">{point.label}</th>
              {chart.series.map((series) => (
                <td key={series.key}>
                  {formatVisualValue(
                    point[series.key] as string | number | null | undefined,
                    series.format ?? chart.valueFormatter,
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {isEmpty ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground">
          No chart data
        </div>
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <div ref={cardRef} className={cn("h-full min-h-0 w-full overflow-hidden", className)}>
        {chartBody}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        "w-full min-w-0 max-w-full border border-border/70 bg-background shadow-sm",
        isPanel || isDashboard ? "rounded-md p-3" : "rounded-md p-4",
        className,
      )}
    >
      <div className={cn("flex items-center justify-between gap-3", isPanel || isDashboard ? "mb-2" : "mb-3")}>
        <div className="flex min-w-0 items-start gap-2">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center bg-gray-100 text-gray-600",
              isPanel || isDashboard ? "h-6 w-6 rounded-md" : "h-8 w-8 rounded-md",
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
            {chart.sourceLabel || chart.freshnessLabel ? (
              <p className={cn("mt-1 text-muted-foreground", isPanel || isDashboard ? "text-[10px] leading-snug" : "text-[11px]")}>
                {[chart.sourceLabel, chart.freshnessLabel].filter(Boolean).join(" · ")}
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
