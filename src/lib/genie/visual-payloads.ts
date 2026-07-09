import type { VisualValueFormat } from "@/lib/genie/visual-format";

export interface GenieChartSeries {
  key: string;
  label: string;
  color?: string;
  format?: VisualValueFormat;
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
  sourceLabel?: string;
  freshnessLabel?: string;
}

export interface GenieTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: VisualValueFormat;
}

export interface GenieTablePayload {
  title: string;
  subtitle?: string;
  columns: GenieTableColumn[];
  rows: Array<Record<string, string | number | null>>;
}
