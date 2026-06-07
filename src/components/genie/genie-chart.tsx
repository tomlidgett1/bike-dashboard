"use client";

import * as React from "react";
import { BarChart3, Download, LineChart as LineChartIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { VisualValueFormat } from "@/components/genie/genie-data-table";
import { downloadChartCardAsPng } from "@/lib/utils/genie-visual-export";

export interface GenieChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface GenieChartPoint {
  label: string;
  [key: string]: string | number | null;
}

export interface GenieChartPayload {
  kind: "bar" | "line";
  title: string;
  subtitle?: string;
  xKey: "label";
  series: GenieChartSeries[];
  data: GenieChartPoint[];
  valueFormatter?: VisualValueFormat;
}

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

export function GenieChart({
  chart,
  embedded = false,
  showExport = true,
  className,
}: {
  chart: GenieChartPayload;
  embedded?: boolean;
  showExport?: boolean;
  className?: string;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const isLineChart = chart.kind === "line";
  const ChartIcon = isLineChart ? LineChartIcon : BarChart3;
  const config = chart.series.reduce<ChartConfig>((acc, series, index) => {
    acc[series.key] = {
      label: series.label,
      color: series.color ?? `var(--chart-${(index % 5) + 1})`,
    };
    return acc;
  }, {});

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
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", embedded ? "h-full min-h-[180px]" : "h-[260px]")}
    >
      {isLineChart ? (
        <LineChart accessibilityLayer data={chart.data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={chart.xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={chart.data.length > 7 ? "preserveStartEnd" : 0}
            tickFormatter={(value) => chartLabel(String(value))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={58}
            tickFormatter={(value) => formatAxisValue(Number(value), chart.valueFormatter)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => String(value)}
                formatter={(value, name) => (
                  <>
                    <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                    <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                      {formatVisualValue(Number(value), chart.valueFormatter)}
                    </span>
                  </>
                )}
              />
            }
          />
          {chart.series.map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              stroke={`var(--color-${series.key})`}
              strokeWidth={2.5}
              dot={chart.data.length <= 18 ? { r: 3 } : false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      ) : (
        <BarChart accessibilityLayer data={chart.data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={chart.xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={chart.data.length > 7 ? "preserveStartEnd" : 0}
            tickFormatter={(value) => chartLabel(String(value))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={58}
            tickFormatter={(value) => formatAxisValue(Number(value), chart.valueFormatter)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => String(value)}
                formatter={(value, name) => (
                  <>
                    <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                    <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                      {formatVisualValue(Number(value), chart.valueFormatter)}
                    </span>
                  </>
                )}
              />
            }
          />
          {chart.series.map((series) => (
            <Bar key={series.key} dataKey={series.key} fill={`var(--color-${series.key})`} radius={[10, 10, 0, 0]} />
          ))}
        </BarChart>
      )}
    </ChartContainer>
  );

  if (embedded) {
    return (
      <div ref={cardRef} className={cn("flex h-full min-h-0 flex-col", className)}>
        {chartBody}
      </div>
    );
  }

  return (
    <div ref={cardRef} className={cn("w-full rounded-3xl border border-border/70 bg-background p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <ChartIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight text-foreground">{chart.title}</p>
            {chart.subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{chart.subtitle}</p>
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
