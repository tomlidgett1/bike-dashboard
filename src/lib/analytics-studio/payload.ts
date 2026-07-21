import type { GenieChartPayload, GenieTablePayload } from "@/lib/genie/visual-payloads";
import {
  buildPivotTableFromRows,
  type GeniePivotTablePayload,
} from "@/lib/genie/pivot-table";
import {
  formatVisualDate,
  type VisualDateFormat,
  type VisualValueFormat,
} from "@/lib/genie/visual-format";
import type { SqlResultRow } from "@/lib/genie/lightspeed-sql-visual";
import { getAnalyticsColumn } from "./catalog";
import { isCalculatedColumnKey } from "@/lib/table-builder/calculated-columns";
import { getSalesField } from "@/lib/table-builder/sales-fields";
import {
  dimensionAlias,
  measureAlias,
  type AnalyticsMeasure,
  type AnalyticsWorkbookElement,
} from "./types";

function dimensionDateFormat(
  element: AnalyticsWorkbookElement,
  dimensionKey: string,
): VisualDateFormat {
  const dimension = element.query.dimensions.find(
    (entry) => dimensionAlias(entry) === dimensionKey || entry.column === dimensionKey,
  );
  return dimension?.dateFormat ?? "default";
}

function formatDimensionLabel(
  element: AnalyticsWorkbookElement,
  dimensionKey: string,
  raw: string,
): string {
  const format = dimensionDateFormat(element, dimensionKey);
  if (format === "default" || !raw) return raw;
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) return formatVisualDate(raw, format);
  return raw;
}

const AGG_LABELS: Record<AnalyticsMeasure["agg"], string> = {
  sum: "Sum of",
  avg: "Avg",
  median: "Median",
  min: "Min",
  max: "Max",
  count: "Count of",
  count_distinct: "Unique",
  stddev: "Std dev of",
};

export function measureLabel(
  element: AnalyticsWorkbookElement,
  measure: AnalyticsMeasure,
): string {
  if (measure.label?.trim()) return measure.label.trim();
  if (measure.column === "*") return "Row count";
  const column = getAnalyticsColumn(element.query.source, measure.column);
  const fieldLabel =
    column?.label
    ?? getSalesField(measure.column)?.label
    ?? measure.column;
  return `${AGG_LABELS[measure.agg]} ${fieldLabel}`;
}

export function measureFormat(
  element: AnalyticsWorkbookElement,
  measure: AnalyticsMeasure,
): VisualValueFormat | undefined {
  if (measure.format) return measure.format;
  if (measure.agg === "count" || measure.agg === "count_distinct") return "number";
  const column =
    measure.column === "*" ? undefined : getAnalyticsColumn(element.query.source, measure.column);
  // Min/Max of a date column yields a date string, not a number.
  if (column?.type === "date") return undefined;
  return column?.format ?? "number";
}

interface ResultColumnMeta {
  key: string;
  label: string;
  align: "left" | "right";
  format?: VisualValueFormat;
  dateFormat?: VisualDateFormat;
}

function resolveRawColumnMeta(sourceKey: string, key: string): ResultColumnMeta {
  const catalog = getAnalyticsColumn(sourceKey, key);
  if (catalog) {
    return {
      key: catalog.key,
      label: catalog.label,
      align: catalog.type === "number" ? "right" : "left",
      format: catalog.type === "number" ? catalog.format : undefined,
    };
  }

  if (isCalculatedColumnKey(key)) {
    const label = key
      .replace(/^calc\./, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    return { key, label, align: "right", format: "currency" };
  }

  const field = getSalesField(key);
  if (field) {
    return {
      key: field.key,
      label: field.label,
      align: field.type === "number" ? "right" : "left",
      format:
        field.type === "number"
          ? field.format === "percent"
            ? "percent"
            : field.format === "number"
              ? "number"
              : "currency"
          : undefined,
    };
  }

  return { key, label: key, align: "left" };
}

export function elementResultColumns(element: AnalyticsWorkbookElement): ResultColumnMeta[] {
  const { query } = element;
  if (query.mode === "raw") {
    return (query.columns ?? []).map((key) => resolveRawColumnMeta(query.source, key));
  }

  const dimensionColumns: ResultColumnMeta[] = query.dimensions.map((dimension) => {
    const column = getAnalyticsColumn(query.source, dimension.column);
    return {
      key: dimensionAlias(dimension),
      label: column?.label ?? dimension.column,
      align: "left" as const,
      dateFormat: dimension.dateFormat,
    };
  });
  const measureColumns: ResultColumnMeta[] = query.measures.map((measure) => ({
    key: measureAlias(measure),
    label: measureLabel(element, measure),
    align: "right" as const,
    format: measureFormat(element, measure),
  }));
  return [...dimensionColumns, ...measureColumns];
}

export function buildElementTablePayload(
  element: AnalyticsWorkbookElement,
  rows: SqlResultRow[],
  limitApplied: boolean,
  totalRowCount?: number,
): GenieTablePayload {
  const columns = elementResultColumns(element);
  const isRaw = element.query.mode === "raw";
  let subtitle: string | undefined;
  if (isRaw) {
    const total = typeof totalRowCount === "number" ? totalRowCount : rows.length;
    if (total > rows.length) {
      subtitle = `Showing latest ${rows.length.toLocaleString()} of ${total.toLocaleString()} rows`;
    }
  } else if (limitApplied) {
    subtitle = "Row limit reached — refine filters to see everything";
  }

  return {
    title: element.title,
    subtitle,
    columns: columns.map(({ key, label, align, format }) => ({
      key,
      label,
      align,
      format,
    })),
    rows: rows.map((row) =>
      Object.fromEntries(
        columns.map(({ key, dateFormat }) => {
          const value = row[key];
          if (typeof value === "boolean") return [key, value ? "Yes" : "No"];
          if (
            dateFormat
            && dateFormat !== "default"
            && (typeof value === "string" || typeof value === "number")
          ) {
            return [key, formatDimensionLabel(element, key, String(value))];
          }
          return [key, value ?? null];
        }),
      ),
    ),
  };
}

export function buildElementChartPayload(
  element: AnalyticsWorkbookElement,
  rows: SqlResultRow[],
): GenieChartPayload | null {
  const { query } = element;
  if (query.mode !== "aggregate" || query.dimensions.length === 0 || query.measures.length === 0) {
    return null;
  }

  const xKey = dimensionAlias(query.dimensions[0]);
  const seriesMeasures = query.measures.slice(0, 5);
  const formats = seriesMeasures.map((measure) => measureFormat(element, measure));
  const sharedFormat = formats.every((format) => format === formats[0]) ? formats[0] : undefined;

  const accent = element.design?.color?.trim() || undefined;

  return {
    kind: element.viz === "line" ? "line" : "bar",
    title: element.title,
    xKey: "label",
    series: seriesMeasures.map((measure, index) => ({
      key: measureAlias(measure),
      label: measureLabel(element, measure),
      format: formats[index],
      ...(index === 0 && accent ? { color: accent } : {}),
    })),
    data: rows.slice(0, 120).map((row) => ({
      label: formatDimensionLabel(element, xKey, String(row[xKey] ?? "")),
      ...Object.fromEntries(
        seriesMeasures.map((measure) => {
          const key = measureAlias(measure);
          const value = row[key];
          const numeric = typeof value === "number" ? value : Number(value);
          return [key, Number.isFinite(numeric) ? numeric : null];
        }),
      ),
    })),
    valueFormatter: sharedFormat,
  };
}

export function buildElementPivotPayload(
  element: AnalyticsWorkbookElement,
  rows: SqlResultRow[],
  limitApplied: boolean,
): GeniePivotTablePayload | null {
  const { query, pivot } = element;
  const measure = query.measures[0];
  if (!pivot || pivot.rows.length === 0 || !measure || query.mode !== "aggregate") return null;

  const dimensionAliases = new Set(query.dimensions.map((dimension) => dimensionAlias(dimension)));
  const rowFields = pivot.rows.filter((key) => dimensionAliases.has(key));
  const columnFields = pivot.columns.filter((key) => dimensionAliases.has(key));
  if (rowFields.length === 0) return null;

  // SQL already grouped the data, so each row/column bucket holds one value —
  // summing inside the pivot builder is an identity pass.
  const payload = buildPivotTableFromRows(
    rows,
    {
      title: element.title,
      row_fields: rowFields,
      column_fields: columnFields,
      value_field: measureAlias(measure),
      aggregation: "sum",
      value_format: measureFormat(element, measure),
    },
    { limitApplied },
  );
  if (!payload) return null;

  const fieldLabels = new Map<string, string>();
  for (const dimension of query.dimensions) {
    const column = getAnalyticsColumn(query.source, dimension.column);
    if (column) fieldLabels.set(dimensionAlias(dimension), column.label);
  }
  return {
    ...payload,
    row_fields: payload.row_fields.map((field) => ({
      ...field,
      label: fieldLabels.get(field.key) ?? field.label,
    })),
    column_fields: payload.column_fields.map((field) => ({
      ...field,
      label: fieldLabels.get(field.key) ?? field.label,
    })),
    value: { ...payload.value, label: measureLabel(element, measure) },
  };
}

export function buildElementMetric(
  element: AnalyticsWorkbookElement,
  rows: SqlResultRow[],
): { value: number | string | null; label: string; format?: VisualValueFormat } | null {
  const measure = element.query.measures[0];
  if (!measure || element.query.mode !== "aggregate") return null;
  const key = measureAlias(measure);
  const raw = rows[0]?.[key];
  const numeric = typeof raw === "number" ? raw : Number(raw);
  const value = Number.isFinite(numeric)
    ? numeric
    : typeof raw === "string" && raw.trim()
      ? raw
      : null;
  return {
    value,
    label: measureLabel(element, measure),
    format: measureFormat(element, measure),
  };
}
