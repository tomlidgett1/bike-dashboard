"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { GenieChart } from "@/components/genie/genie-chart";
import { GenieDataTable } from "@/components/genie/genie-data-table";
import { formatVisualValue } from "@/lib/genie/visual-format";
import {
  analyticsChartTickFontSize,
  analyticsFontFamilyCss,
  analyticsLabelSizeClass,
  analyticsValueSizeClass,
  analyticsWeightClass,
} from "@/lib/analytics-studio/design";
import {
  buildElementChartPayload,
  buildElementMetric,
  buildElementTablePayload,
} from "@/lib/analytics-studio/payload";
import { buildAnalyticsPivotGrid } from "@/lib/analytics-studio/pivot";
import type { AnalyticsWorkbookElement } from "@/lib/analytics-studio/types";
import { cn } from "@/lib/utils";
import { AnalyticsPivotTable } from "./analytics-pivot-table";
import type { ElementDataState } from "./use-element-data";

const TEXT_STYLES: Record<string, string> = {
  title: "text-2xl font-semibold leading-none text-gray-900",
  heading: "text-lg font-semibold leading-tight text-gray-800",
  body: "text-sm leading-snug text-gray-700",
};

export function ElementRenderer({
  element,
  data,
  onRenameMeasure,
}: {
  element: AnalyticsWorkbookElement;
  data: ElementDataState;
  onRenameMeasure?: (measureKey: string, label: string) => void;
}) {
  if (element.viz === "text") {
    const style = element.text?.style ?? "heading";
    const content = element.text?.content?.trim();
    return (
      <div className="flex h-full min-h-0 items-center px-1.5">
        <p
          className={cn(
            "min-w-0 truncate",
            TEXT_STYLES[style] ?? TEXT_STYLES.heading,
            !content && "text-gray-300",
          )}
        >
          {content || "Empty text: write something in the panel"}
        </p>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertCircle className="h-5 w-5 text-gray-400" />
        <p className="max-w-xs text-xs text-gray-600">{data.error}</p>
      </div>
    );
  }

  if (data.isLoading) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center">
        <p className="text-xs text-gray-500">
          No rows match this query yet. Adjust the source, measures or filters on the right.
        </p>
      </div>
    );
  }

  if (element.viz === "metric") {
    const metric = buildElementMetric(element, data.rows);
    if (!metric) {
      return <ConfigHint text="Add a measure to show a big number." />;
    }
    return <MetricView element={element} metric={metric} />;
  }

  if (element.viz === "pivot") {
    const grid = buildAnalyticsPivotGrid(element, data.rows);
    if (!grid) {
      return (
        <ConfigHint text="Pivot tables need at least one value, plus a pivot row (or the Values container moved to rows)." />
      );
    }
    return <AnalyticsPivotTable grid={grid} onRenameMeasure={onRenameMeasure} />;
  }

  if (element.viz === "bar" || element.viz === "line") {
    const chart = buildElementChartPayload(element, data.rows);
    if (!chart) {
      return <ConfigHint text="Charts need at least one dimension (x-axis) and one measure (y-axis)." />;
    }
    const design = element.design;
    return (
      <GenieChart
        chart={chart}
        variant="dashboard"
        embedded
        appearance={{
          accentColor: design?.color,
          axisColor: design?.labelColor,
          fontFamily: analyticsFontFamilyCss(design?.fontFamily),
          showGrid: design?.showGrid,
          tickFontSize: analyticsChartTickFontSize(design?.labelSize),
        }}
      />
    );
  }

  const table = buildElementTablePayload(
    element,
    data.rows,
    data.limitApplied,
    data.totalRowCount,
  );
  return <GenieDataTable table={table} variant="dashboard" embedded showCsvDownload={false} />;
}

function MetricView({
  element,
  metric,
}: {
  element: AnalyticsWorkbookElement;
  metric: {
    value: number | string | null;
    label: string;
    format?: "currency" | "number" | "percent";
  };
}) {
  const design = element.design;
  const layout = design?.metricLayout ?? "label-above";
  const fontFamily = analyticsFontFamilyCss(design?.fontFamily);
  const valueColor = design?.color?.trim() || "#111827";
  const labelColor = design?.labelColor?.trim() || "#6b7280";
  const formatted =
    metric.value === null || metric.value === ""
      ? "—"
      : formatVisualValue(metric.value, metric.format);

  const labelEl = (
    <p
      className={cn(
        "font-medium uppercase tracking-wide",
        analyticsLabelSizeClass(design?.labelSize),
        analyticsWeightClass(design?.labelWeight ?? "medium"),
      )}
      style={{ color: labelColor, fontFamily }}
    >
      {metric.label}
    </p>
  );

  const valueEl = (
    <p
      className={cn(
        "truncate tabular-nums leading-none",
        analyticsValueSizeClass(design?.valueSize),
        analyticsWeightClass(design?.valueWeight),
      )}
      style={{ color: valueColor, fontFamily }}
    >
      {formatted}
    </p>
  );

  if (layout === "value-only") {
    return (
      <div className="flex h-full min-h-[100px] items-center px-4 py-2">
        {valueEl}
      </div>
    );
  }

  if (layout === "label-left") {
    return (
      <div className="flex h-full min-h-[100px] items-center gap-3 px-4 py-2">
        <div className="min-w-0 shrink-0">{labelEl}</div>
        <div className="min-w-0 flex-1">{valueEl}</div>
      </div>
    );
  }

  if (layout === "label-right") {
    return (
      <div className="flex h-full min-h-[100px] items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">{valueEl}</div>
        <div className="min-w-0 shrink-0">{labelEl}</div>
      </div>
    );
  }

  if (layout === "label-below") {
    return (
      <div
        className={cn(
          "flex h-full min-h-[100px] flex-col justify-center px-4 py-2",
          "gap-1.5",
        )}
      >
        {valueEl}
        {labelEl}
      </div>
    );
  }

  if (layout === "centered") {
    return (
      <div className="flex h-full min-h-[100px] flex-col items-center justify-center gap-1.5 px-4 py-2 text-center">
        {labelEl}
        {valueEl}
      </div>
    );
  }

  // label-above (default)
  return (
    <div className="flex h-full min-h-[100px] flex-col justify-center gap-1 px-4 py-2">
      {labelEl}
      {valueEl}
    </div>
  );
}

function ConfigHint({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center">
      <p className="text-xs text-gray-500">{text}</p>
    </div>
  );
}
