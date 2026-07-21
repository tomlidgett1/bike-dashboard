import type { AnalyticsSourceKey } from "./catalog";

export type AnalyticsVizType = "table" | "pivot" | "bar" | "line" | "metric" | "text";

export type AnalyticsDateTrunc = "day" | "week" | "month" | "quarter" | "year";

export type AnalyticsAggFn =
  | "sum"
  | "avg"
  | "median"
  | "min"
  | "max"
  | "count"
  | "count_distinct"
  | "stddev";

export type AnalyticsFilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_true"
  | "is_false"
  | "is_set"
  | "is_not_set"
  | "on_or_after"
  | "on_or_before"
  | "last_days"
  | "last_weeks"
  | "last_months"
  | "last_years"
  | "since_days"
  | "month_to_date"
  | "this_month"
  | "this_quarter"
  | "between";

export interface AnalyticsDimension {
  column: string;
  truncate?: AnalyticsDateTrunc;
  /** Display format for date dimension labels (short / long / ordinal). */
  dateFormat?: "default" | "short" | "long" | "ordinal";
  /** Row/column order for this dimension. Defaults to ascending. */
  sortDir?: "asc" | "desc";
}

export interface AnalyticsMeasure {
  agg: AnalyticsAggFn;
  /** Column key, or "*" for plain row counts. */
  column: string;
  label?: string;
  /** Last authored formula text (for formula-bar round-trip display). */
  formula?: string;
  /** Display format override for this value ($ / % / number). */
  format?: "currency" | "number" | "percent";
}

export interface AnalyticsFilter {
  id: string;
  column: string;
  op: AnalyticsFilterOp;
  value?: string;
  /** End of range for `between` (and similar dual-value filters). */
  valueTo?: string;
}

export interface AnalyticsElementQuery {
  source: AnalyticsSourceKey;
  /** "aggregate" groups by dimensions; "raw" lists individual rows. */
  mode: "aggregate" | "raw";
  dimensions: AnalyticsDimension[];
  measures: AnalyticsMeasure[];
  /** Columns shown in raw mode. */
  columns: string[];
  filters: AnalyticsFilter[];
  sort?: { key: string; dir: "asc" | "desc" } | null;
  limit: number;
  /**
   * Date dimension label style. Pivot tables need "sortable" labels
   * (e.g. 2026-05) because pivot columns are ordered alphabetically.
   */
  dateLabels?: "pretty" | "sortable";
}

/** Partition of dimension aliases into pivot rows and pivot columns. */
export interface AnalyticsPivotConfig {
  rows: string[];
  columns: string[];
  /**
   * Where the Values container sits (Sigma-style): "columns" spreads each
   * measure under every pivot column; "rows" stacks measures as rows.
   */
  valuesIn?: "rows" | "columns";
}

export interface AnalyticsTextConfig {
  content: string;
  style: "title" | "heading" | "body";
}

/** Font stacks available in Analytics Studio design controls. */
export type AnalyticsFontFamily =
  | "sans"
  | "display"
  | "serif"
  | "mono"
  | "rounded"
  | "handwriting";

export type AnalyticsFontWeight = "normal" | "medium" | "semibold" | "bold";

export type AnalyticsValueSize = "sm" | "md" | "lg" | "xl" | "2xl";

export type AnalyticsLabelSize = "xs" | "sm" | "md";

/** Layout of KPI label vs value. */
export type AnalyticsMetricLayout =
  | "label-above"
  | "label-below"
  | "label-left"
  | "label-right"
  | "value-only"
  | "centered";

/**
 * Visual design for bar / line / metric (KPI) elements.
 * Persisted on the workbook element; omitted fields use defaults.
 */
export interface AnalyticsElementDesign {
  /** Primary accent (KPI value, chart series). */
  color?: string;
  /** Label / secondary text colour. */
  labelColor?: string;
  fontFamily?: AnalyticsFontFamily;
  valueSize?: AnalyticsValueSize;
  labelSize?: AnalyticsLabelSize;
  valueWeight?: AnalyticsFontWeight;
  labelWeight?: AnalyticsFontWeight;
  /** KPI title/value arrangement. */
  metricLayout?: AnalyticsMetricLayout;
  /** Charts: show cartesian grid. Default true. */
  showGrid?: boolean;
}

export type AnalyticsFormatPalette = "green" | "red" | "amber" | "blue";

export type AnalyticsFormatRuleOp = "gt" | "gte" | "lt" | "lte" | "eq" | "contains";

/**
 * Sigma-style conditional formatting rule for pivot tables. Targets a value
 * (measure alias) or a pivot row field (dimension alias).
 */
export interface AnalyticsConditionalFormat {
  id: string;
  target: string;
  /** "rule" = single colour when condition matches; "scale" = colour scale; "bars" = data bars. */
  kind: "rule" | "scale" | "bars";
  palette: AnalyticsFormatPalette;
  /** rule kind only */
  op?: AnalyticsFormatRuleOp;
  value?: string;
}

export interface AnalyticsElementLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Pixel height of one grid row when this layout was written.
   * Used to migrate layouts when the studio row height changes.
   */
  rowPx?: number;
}

export interface AnalyticsWorkbookElement {
  id: string;
  title: string;
  viz: AnalyticsVizType;
  query: AnalyticsElementQuery;
  layout: AnalyticsElementLayout;
  pivot?: AnalyticsPivotConfig;
  text?: AnalyticsTextConfig;
  /** Design options for bar, line, and metric (KPI). */
  design?: AnalyticsElementDesign;
  conditionalFormats?: AnalyticsConditionalFormat[];
}

/** A workbook page — its own canvas of elements, shown as a bottom tab. */
export interface AnalyticsPage {
  id: string;
  name: string;
  elements: AnalyticsWorkbookElement[];
}

export interface AnalyticsWorkbookRecord {
  id: string;
  name: string;
  pages: AnalyticsPage[];
  created_at: string;
  updated_at: string;
}

export const ANALYTICS_QUERY_MAX_LIMIT = 1000;
export const ANALYTICS_QUERY_DEFAULT_LIMIT = 250;
/** Raw Build a Table browse: direct Supabase fetch, not the Genie SQL RPC. */
export const ANALYTICS_RAW_TABLE_DEFAULT_LIMIT = 2000;
export const ANALYTICS_RAW_TABLE_MAX_LIMIT = 5000;

/** Safe SQL / JSON result key — custom Build a Table fields use dotted paths. */
function aliasSafe(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

export function measureAlias(measure: AnalyticsMeasure): string {
  if (measure.agg === "count" && measure.column === "*") return "row_count";
  const base = measure.column === "*" ? "rows" : aliasSafe(measure.column);
  return `${measure.agg === "count_distinct" ? "distinct" : measure.agg}_${base}`;
}

export function dimensionAlias(dimension: AnalyticsDimension): string {
  return dimension.column;
}
