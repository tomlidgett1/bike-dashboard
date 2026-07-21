import { formatStoreAnalyticsDate } from "@/lib/utils/format-store-analytics-date";

export type PivotAggregation = "sum" | "count" | "avg" | "min" | "max" | "count_distinct";
export type PivotValueFormat = "currency" | "number" | "percent";

export interface GeniePivotTableConfig {
  title?: string;
  subtitle?: string;
  row_fields: string[];
  column_fields?: string[];
  value_field?: string;
  aggregation?: PivotAggregation;
  value_format?: PivotValueFormat;
  show_totals?: boolean;
}

export interface GeniePivotColumn {
  key: string;
  label: string;
}

export interface GeniePivotRow {
  row_key: string;
  row_label: string;
  row_values: Record<string, string>;
  cells: Record<string, number | null>;
  total?: number | null;
}

export interface GeniePivotTablePayload {
  title: string;
  subtitle?: string;
  row_fields: Array<{ key: string; label: string }>;
  column_fields: Array<{ key: string; label: string }>;
  value: {
    field: string;
    label: string;
    format?: PivotValueFormat;
    aggregation: PivotAggregation;
  };
  columns: GeniePivotColumn[];
  rows: GeniePivotRow[];
  column_totals?: Record<string, number | null>;
  grand_total?: number | null;
}

type PivotSourceRow = Record<string, string | number | boolean | null>;

const MAX_PIVOT_ROWS = 50;
const MAX_PIVOT_COLUMNS = 16;

function fieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).trim();
}

function formatAxisPart(value: string): string {
  if (!value || value === "—") return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatStoreAnalyticsDate(value);
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
  }
  if (value.length > 22) {
    return `${value.slice(0, 21)}…`;
  }
  return value;
}

function formatAxisLabel(values: string[]): string {
  return values.map(formatAxisPart).join(" · ");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function aggregateValues(values: number[], aggregation: PivotAggregation): number | null {
  if (values.length === 0) return null;
  switch (aggregation) {
    case "sum":
      return values.reduce((sum, value) => sum + value, 0);
    case "count":
      return values.length;
    case "avg":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "count_distinct":
      return new Set(values).size;
    default:
      return null;
  }
}

function inferPivotValueFormat(field: string): PivotValueFormat | undefined {
  if (/(margin|percent|pct|rate)/i.test(field)) return "percent";
  if (/(sales|sale|revenue|subtotal|total|cost|profit|discount|retail|value|amount|price|avg|average)/i.test(field)) {
    return "currency";
  }
  if (/(count|qty|quantity|units|rank|number)/i.test(field)) return "number";
  return undefined;
}

function aggregationLabel(aggregation: PivotAggregation): string {
  switch (aggregation) {
    case "sum":
      return "Sum";
    case "count":
      return "Count";
    case "avg":
      return "Average";
    case "min":
      return "Min";
    case "max":
      return "Max";
    case "count_distinct":
      return "Distinct count";
    default:
      return "Value";
  }
}

export function buildPivotTableFromRows(
  rows: PivotSourceRow[],
  config: GeniePivotTableConfig,
  options?: { limitApplied?: boolean },
): GeniePivotTablePayload | undefined {
  if (rows.length === 0) return undefined;

  const rowFields = (config.row_fields ?? []).filter(Boolean).slice(0, 3);
  if (rowFields.length === 0) return undefined;

  const columnFields = (config.column_fields ?? []).filter(Boolean).slice(0, 2);
  const aggregation = config.aggregation ?? "sum";
  const valueField = config.value_field?.trim()
    || (aggregation === "count" || aggregation === "count_distinct" ? rowFields[0] : "");

  if (!valueField && aggregation !== "count") return undefined;

  const sample = rows[0] ?? {};
  const availableKeys = new Set(Object.keys(sample));
  if (!rowFields.every((field) => availableKeys.has(field))) return undefined;
  if (!columnFields.every((field) => availableKeys.has(field))) return undefined;
  if (valueField && !availableKeys.has(valueField) && aggregation !== "count") return undefined;

  type GroupBucket = {
    rowValues: Record<string, string>;
    rowLabel: string;
    rowKey: string;
    columnKey: string;
    columnLabel: string;
    numericValues: number[];
    distinctValues: Set<string>;
    rowCount: number;
  };

  const groups = new Map<string, GroupBucket>();

  for (const row of rows) {
    const rowValues = Object.fromEntries(
      rowFields.map((field) => [field, cellText(row[field]) || "—"]),
    );
    const rowParts = rowFields.map((field) => rowValues[field]);
    const rowLabel = formatAxisLabel(rowParts);
    const rowKey = rowParts.join("||");

    const columnValues = Object.fromEntries(
      columnFields.map((field) => [field, cellText(row[field]) || "—"]),
    );
    const columnParts = columnFields.map((field) => columnValues[field]);
    const columnLabel = columnFields.length > 0
      ? formatAxisLabel(columnParts)
      : aggregationLabel(aggregation);
    const columnKey = columnFields.length > 0
      ? columnFields.map((field) => columnValues[field]).join("||")
      : "__values__";

    const bucketKey = `${rowKey}:::${columnKey}`;
    const bucket = groups.get(bucketKey) ?? {
      rowValues,
      rowLabel,
      rowKey,
      columnKey,
      columnLabel,
      numericValues: [],
      distinctValues: new Set<string>(),
      rowCount: 0,
    };

    bucket.rowCount += 1;
    if (aggregation === "count_distinct") {
      bucket.distinctValues.add(cellText(row[valueField]) || "—");
    } else if (aggregation === "count") {
      bucket.numericValues.push(1);
    } else {
      const numeric = toNumber(row[valueField]);
      if (numeric !== null) bucket.numericValues.push(numeric);
    }

    groups.set(bucketKey, bucket);
  }

  const bucketValue = (bucket: GroupBucket): number | null => {
    if (aggregation === "count_distinct") return bucket.distinctValues.size;
    if (aggregation === "count") return bucket.rowCount;
    return aggregateValues(bucket.numericValues, aggregation);
  };

  const columnMap = new Map<string, string>();
  for (const bucket of groups.values()) {
    columnMap.set(bucket.columnKey, bucket.columnLabel);
  }

  // Sort by the raw key, not the display label — pretty date labels like
  // "Apr 2018" would otherwise order alphabetically instead of chronologically.
  const sortedColumns = [...columnMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "en-AU"))
    .slice(0, MAX_PIVOT_COLUMNS)
    .map(([key, label]) => ({ key, label }));

  const allowedColumnKeys = new Set(sortedColumns.map((column) => column.key));
  const rowMap = new Map<string, GeniePivotRow>();

  for (const bucket of groups.values()) {
    if (!allowedColumnKeys.has(bucket.columnKey)) continue;

    const existing = rowMap.get(bucket.rowKey) ?? {
      row_key: bucket.rowKey,
      row_label: bucket.rowLabel,
      row_values: bucket.rowValues,
      cells: Object.fromEntries(sortedColumns.map((column) => [column.key, null])),
    };

    existing.cells[bucket.columnKey] = bucketValue(bucket);
    rowMap.set(bucket.rowKey, existing);
  }

  const pivotRows = [...rowMap.values()]
    .sort((a, b) => a.row_key.localeCompare(b.row_key, "en-AU"))
    .slice(0, MAX_PIVOT_ROWS);

  const showTotals = config.show_totals !== false;
  let columnTotals: Record<string, number | null> | undefined;
  let grandTotal: number | null | undefined;

  if (showTotals) {
    columnTotals = Object.fromEntries(
      sortedColumns.map((column) => {
        const values = pivotRows
          .map((row) => row.cells[column.key])
          .filter((value): value is number => typeof value === "number");
        return [column.key, aggregateValues(values, aggregation)];
      }),
    );

    const rowTotals = pivotRows.map((row) => {
      const values = Object.values(row.cells).filter((value): value is number => typeof value === "number");
      return aggregateValues(values, aggregation);
    }).filter((value): value is number => typeof value === "number");

    grandTotal = aggregateValues(rowTotals, aggregation);

    for (const row of pivotRows) {
      const values = Object.values(row.cells).filter((value): value is number => typeof value === "number");
      row.total = aggregateValues(values, aggregation);
    }
  }

  const subtitleParts = [config.subtitle?.trim()];
  if (options?.limitApplied) subtitleParts.push("row limit reached");
  if (rowMap.size > MAX_PIVOT_ROWS) subtitleParts.push(`showing first ${MAX_PIVOT_ROWS} rows`);
  if (columnMap.size > MAX_PIVOT_COLUMNS) subtitleParts.push(`showing first ${MAX_PIVOT_COLUMNS} columns`);

  const valueLabel = valueField
    ? `${aggregationLabel(aggregation)} of ${fieldLabel(valueField)}`
    : aggregationLabel(aggregation);

  return {
    title: config.title?.trim() || "Pivot table",
    subtitle: subtitleParts.filter(Boolean).join(" · ") || undefined,
    row_fields: rowFields.map((key) => ({ key, label: fieldLabel(key) })),
    column_fields: columnFields.map((key) => ({ key, label: fieldLabel(key) })),
    value: {
      field: valueField || rowFields[0],
      label: valueLabel,
      format: config.value_format ?? inferPivotValueFormat(valueField),
      aggregation,
    },
    columns: sortedColumns,
    rows: pivotRows,
    column_totals: columnTotals,
    grand_total: grandTotal,
  };
}
