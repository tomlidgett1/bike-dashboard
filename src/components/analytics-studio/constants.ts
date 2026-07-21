import type {
  AnalyticsAggFn,
  AnalyticsDateTrunc,
  AnalyticsElementLayout,
  AnalyticsElementQuery,
  AnalyticsFilterOp,
  AnalyticsMeasure,
  AnalyticsVizType,
  AnalyticsWorkbookElement,
} from "@/lib/analytics-studio/types";
import {
  ANALYTICS_QUERY_DEFAULT_LIMIT,
  ANALYTICS_RAW_TABLE_DEFAULT_LIMIT,
} from "@/lib/analytics-studio/types";
import type {
  AnalyticsColumnType,
  AnalyticsSource,
  AnalyticsSourceKey,
} from "@/lib/analytics-studio/catalog";
import { measureToFormula } from "@/lib/analytics-studio/formula";

export const VIZ_LABELS: Record<AnalyticsVizType, string> = {
  table: "Table",
  pivot: "Pivot table",
  bar: "Bar chart",
  line: "Line chart",
  metric: "Big number",
  text: "Text",
};

export const AGG_OPTIONS: Array<{ value: AnalyticsAggFn; label: string }> = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "median", label: "Median" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "count", label: "Count" },
  { value: "count_distinct", label: "Count unique" },
  { value: "stddev", label: "Std deviation" },
];

/** Aggregations that only make sense on numeric columns. */
export const NUMERIC_ONLY_AGGS: AnalyticsAggFn[] = ["sum", "avg", "median", "stddev"];

export const DATE_TRUNC_OPTIONS: Array<{ value: AnalyticsDateTrunc; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export type FilterOpValueKind = "none" | "text" | "number" | "date" | "date_range";

export const FILTER_OPS_BY_TYPE: Record<
  AnalyticsColumnType,
  Array<{
    value: AnalyticsFilterOp;
    label: string;
    needsValue: boolean;
    valueKind?: FilterOpValueKind;
  }>
> = {
  text: [
    { value: "contains", label: "contains", needsValue: true, valueKind: "text" },
    { value: "not_contains", label: "doesn't contain", needsValue: true, valueKind: "text" },
    { value: "eq", label: "is exactly", needsValue: true, valueKind: "text" },
    { value: "neq", label: "is not", needsValue: true, valueKind: "text" },
    { value: "is_set", label: "is set", needsValue: false, valueKind: "none" },
    { value: "is_not_set", label: "is empty", needsValue: false, valueKind: "none" },
  ],
  number: [
    { value: "eq", label: "=", needsValue: true, valueKind: "number" },
    { value: "neq", label: "≠", needsValue: true, valueKind: "number" },
    { value: "gt", label: ">", needsValue: true, valueKind: "number" },
    { value: "gte", label: "≥", needsValue: true, valueKind: "number" },
    { value: "lt", label: "<", needsValue: true, valueKind: "number" },
    { value: "lte", label: "≤", needsValue: true, valueKind: "number" },
  ],
  date: [
    { value: "month_to_date", label: "month to date", needsValue: false, valueKind: "none" },
    { value: "this_month", label: "this month", needsValue: false, valueKind: "none" },
    { value: "this_quarter", label: "this quarter", needsValue: false, valueKind: "none" },
    { value: "last_days", label: "last N days", needsValue: true, valueKind: "number" },
    { value: "last_weeks", label: "last N weeks", needsValue: true, valueKind: "number" },
    { value: "last_months", label: "last N months", needsValue: true, valueKind: "number" },
    { value: "last_years", label: "last N years", needsValue: true, valueKind: "number" },
    { value: "since_days", label: "since N days ago", needsValue: true, valueKind: "number" },
    { value: "between", label: "between", needsValue: true, valueKind: "date_range" },
    { value: "on_or_after", label: "on or after", needsValue: true, valueKind: "date" },
    { value: "on_or_before", label: "on or before", needsValue: true, valueKind: "date" },
  ],
  boolean: [
    { value: "is_true", label: "is yes", needsValue: false, valueKind: "none" },
    { value: "is_false", label: "is no", needsValue: false, valueKind: "none" },
  ],
};

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultQuery(source: AnalyticsSourceKey, viz: AnalyticsVizType): AnalyticsElementQuery {
  const base: AnalyticsElementQuery = {
    source,
    mode: "aggregate",
    dimensions: [],
    measures: [],
    columns: [],
    filters: [],
    sort: null,
    limit: ANALYTICS_QUERY_DEFAULT_LIMIT,
  };

  if (viz === "text") return base;

  // Custom Build a Table sources: start empty so the editor can pick from
  // that table's columns (defaults are filled when the source is selected).
  if (typeof source === "string" && source.startsWith("custom_")) {
    if (viz === "metric") {
      return { ...base, measures: [{ agg: "count", column: "*" }], limit: 1 };
    }
    if (viz === "table") {
      return { ...base, mode: "raw", columns: [] };
    }
    return {
      ...base,
      measures: [{ agg: "count", column: "*" }],
      limit: viz === "bar" ? 20 : ANALYTICS_QUERY_DEFAULT_LIMIT,
    };
  }

  if (source === "sales") {
    if (viz === "pivot") {
      return {
        ...base,
        dimensions: [
          { column: "category" },
          { column: "complete_time", truncate: "month" },
        ],
        measures: [{ agg: "sum", column: "total" }],
        // Pivots cap at 16 columns, so start on the last 12 months rather
        // than the oldest months in the mirror.
        filters: [{ id: createId(), column: "complete_time", op: "last_days", value: "365" }],
        dateLabels: "sortable",
        limit: 1000,
      };
    }
    if (viz === "line") {
      return {
        ...base,
        dimensions: [{ column: "complete_time", truncate: "month" }],
        measures: [{ agg: "sum", column: "total" }],
      };
    }
    if (viz === "metric") {
      return { ...base, measures: [{ agg: "sum", column: "total" }], limit: 1 };
    }
    return {
      ...base,
      dimensions: [{ column: "category" }],
      measures: [
        { agg: "sum", column: "total" },
        { agg: "sum", column: "profit" },
      ],
      limit: viz === "bar" ? 20 : ANALYTICS_QUERY_DEFAULT_LIMIT,
    };
  }

  if (viz === "pivot") {
    return {
      ...base,
      dimensions: [{ column: "category_name" }, { column: "brand_name" }],
      measures: [{ agg: "sum", column: "total_qoh" }],
      dateLabels: "sortable",
      limit: 1000,
    };
  }
  if (viz === "line") {
    return {
      ...base,
      dimensions: [{ column: "lightspeed_created_at", truncate: "month" }],
      measures: [{ agg: "count", column: "*" }],
    };
  }
  if (viz === "metric") {
    return { ...base, measures: [{ agg: "sum", column: "total_qoh" }], limit: 1 };
  }
  return {
    ...base,
    dimensions: [{ column: "category_name" }],
    measures: [
      { agg: "count", column: "*" },
      { agg: "sum", column: "total_qoh" },
    ],
    limit: viz === "bar" ? 20 : ANALYTICS_QUERY_DEFAULT_LIMIT,
  };
}

/** Must match ROW_HEIGHT in analytics-studio.tsx. */
export const ANALYTICS_GRID_ROW_PX = 24;
/** Layouts saved before the finer grid used 72px rows. */
export const ANALYTICS_GRID_LEGACY_ROW_PX = 72;

/** Scale legacy layouts so existing workbooks keep the same pixel size. */
export function normalizeElementLayout(
  layout: AnalyticsElementLayout,
): AnalyticsElementLayout {
  const from = layout.rowPx ?? ANALYTICS_GRID_LEGACY_ROW_PX;
  if (from === ANALYTICS_GRID_ROW_PX) {
    return { ...layout, rowPx: ANALYTICS_GRID_ROW_PX };
  }
  const scale = from / ANALYTICS_GRID_ROW_PX;
  return {
    x: layout.x,
    w: layout.w,
    y: Math.round(layout.y * scale),
    h: Math.max(1, Math.round(layout.h * scale)),
    rowPx: ANALYTICS_GRID_ROW_PX,
  };
}

const DEFAULT_SIZES: Record<AnalyticsVizType, { w: number; h: number }> = {
  table: { w: 6, h: 15 },
  pivot: { w: 8, h: 15 },
  bar: { w: 6, h: 12 },
  line: { w: 6, h: 12 },
  metric: { w: 3, h: 6 },
  // Two rows (~48px): compact titles; can resize down to one row (~24px).
  text: { w: 12, h: 2 },
};

export function createElement(
  viz: AnalyticsVizType,
  source: AnalyticsSourceKey,
  y: number,
): AnalyticsWorkbookElement {
  const query = defaultQuery(source, viz);
  return {
    id: createId(),
    title: `New ${VIZ_LABELS[viz].toLowerCase()}`,
    viz,
    query,
    layout: { x: 0, y, ...DEFAULT_SIZES[viz], rowPx: ANALYTICS_GRID_ROW_PX },
    ...(viz === "pivot"
      ? {
          pivot: {
            rows: [query.dimensions[0]?.column ?? ""].filter(Boolean),
            columns: [query.dimensions[1]?.column ?? ""].filter(Boolean),
            valuesIn: "columns" as const,
          },
        }
      : {}),
    ...(viz === "text"
      ? { title: "Text", text: { content: "New title", style: "title" as const } }
      : {}),
  };
}

/**
 * Creates a workbook element seeded from a synced Build a Table source,
 * including columns so raw tables query immediately.
 */
export function createElementFromSource(
  viz: AnalyticsVizType,
  source: AnalyticsSource,
  y: number,
): AnalyticsWorkbookElement {
  const element = createElement(viz, source.key, y);
  if (viz === "text") return element;

  const dateCol = source.defaultDateColumn;
  const firstNumber = source.columns.find((column) => column.type === "number");
  const firstText = source.columns.find(
    (column) => column.type === "text" && !column.idLike,
  );
  const columnKeys = source.columns.slice(0, 24).map((column) => column.key);

  const withFormula = (measure: AnalyticsMeasure): AnalyticsMeasure => ({
    ...measure,
    formula: measureToFormula(measure, source),
  });

  if (viz === "table") {
    return {
      ...element,
      title: source.label,
      query: {
        ...element.query,
        source: source.key,
        mode: "raw",
        columns: columnKeys,
        dimensions: [],
        measures: [],
        filters: [],
        sort: null,
        limit: ANALYTICS_RAW_TABLE_DEFAULT_LIMIT,
      },
      layout: { x: 0, y, w: 12, h: 18, rowPx: ANALYTICS_GRID_ROW_PX },
    };
  }

  if (viz === "metric") {
    return {
      ...element,
      title: source.label,
      query: {
        ...element.query,
        source: source.key,
        measures: [
          withFormula(
            firstNumber
              ? { agg: "sum", column: firstNumber.key }
              : { agg: "count", column: "*" },
          ),
        ],
        dimensions: [],
        columns: [],
        limit: 1,
      },
    };
  }

  if (viz === "pivot") {
    const rowKey = firstText?.key ?? source.columns.find((c) => !c.idLike)?.key;
    const colKey = dateCol;
    return {
      ...element,
      title: source.label,
      query: {
        ...element.query,
        source: source.key,
        dimensions: [
          ...(rowKey ? [{ column: rowKey }] : []),
          ...(colKey ? [{ column: colKey, truncate: "month" as const }] : []),
        ],
        measures: [
          withFormula(
            firstNumber
              ? { agg: "sum", column: firstNumber.key }
              : { agg: "count", column: "*" },
          ),
        ],
        columns: [],
        dateLabels: "sortable",
        limit: 1000,
      },
      pivot: {
        rows: rowKey ? [rowKey] : [],
        columns: colKey ? [colKey] : [],
        valuesIn: "columns",
      },
    };
  }

  return {
    ...element,
    title: source.label,
    query: {
      ...element.query,
      source: source.key,
      dimensions: dateCol
        ? [{ column: dateCol, truncate: "month" as const }]
        : firstText
          ? [{ column: firstText.key }]
          : [],
      measures: [
        withFormula(
          firstNumber
            ? { agg: "sum", column: firstNumber.key }
            : { agg: "count", column: "*" },
        ),
      ],
      columns: [],
      limit: viz === "bar" ? 20 : ANALYTICS_QUERY_DEFAULT_LIMIT,
    },
  };
}

export function createPage(name: string, elements: AnalyticsWorkbookElement[] = []) {
  return { id: createId(), name, elements };
}

export function duplicateElement(
  element: AnalyticsWorkbookElement,
  y: number,
): AnalyticsWorkbookElement {
  return {
    ...structuredClone(element),
    id: createId(),
    title: `${element.title} copy`,
    layout: { ...element.layout, x: 0, y },
  };
}
