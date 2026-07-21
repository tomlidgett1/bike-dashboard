import {
  formatVisualDate,
  formatVisualValue,
  type VisualDateFormat,
} from "@/lib/genie/visual-format";
import type { SqlResultRow } from "@/lib/genie/lightspeed-sql-visual";
import { measureFormat, measureLabel } from "./payload";
import {
  dimensionAlias,
  measureAlias,
  type AnalyticsConditionalFormat,
  type AnalyticsFormatPalette,
  type AnalyticsWorkbookElement,
} from "./types";
import { getAnalyticsColumn } from "./catalog";
import { getSalesField } from "@/lib/table-builder/sales-fields";

const PALETTE_RGB: Record<AnalyticsFormatPalette, string> = {
  green: "16,185,129",
  red: "239,68,68",
  amber: "245,158,11",
  blue: "59,130,246",
};

function paletteColor(palette: AnalyticsFormatPalette, alpha: number): string {
  return `rgba(${PALETTE_RGB[palette] ?? PALETTE_RGB.green},${alpha.toFixed(3)})`;
}

function ruleMatchesNumber(format: AnalyticsConditionalFormat, value: number): boolean {
  const threshold = Number(format.value);
  if (!Number.isFinite(threshold)) return false;
  switch (format.op) {
    case "gt": return value > threshold;
    case "gte": return value >= threshold;
    case "lt": return value < threshold;
    case "lte": return value <= threshold;
    case "eq": return value === threshold;
    default: return false;
  }
}

function ruleMatchesText(format: AnalyticsConditionalFormat, value: string): boolean {
  const needle = (format.value ?? "").trim().toLowerCase();
  if (!needle) return false;
  const haystack = value.toLowerCase();
  if (format.op === "contains") return haystack.includes(needle);
  if (format.op === "eq") return haystack === needle;
  return false;
}

/**
 * Sigma-style pivot grid: fields in Pivot rows / Pivot columns plus a movable
 * Values container (multiple measures, rendered under columns or as rows).
 * Built client-side from the already-grouped SQL result.
 */

const MAX_ROW_GROUPS = 60;
const MAX_COLUMN_GROUPS = 16;

export interface AnalyticsPivotCell {
  text: string;
  align: "left" | "right";
  /** Row-header cell (row field value or measure label). */
  header?: boolean;
  rowSpan?: number;
  /** Logical column index (accounts for rowspan omissions in later rows). */
  colIndex: number;
  /** Sticky on horizontal scroll (all non-metric columns). */
  frozen?: boolean;
  /** When set, double-click renames this measure (measureAlias). */
  measureKey?: string;
  /** Conditional formatting: cell background colour. */
  background?: string;
  /** Conditional formatting: data bar (fraction 0..1 of the cell width). */
  bar?: { fraction: number; color: string };
}

export interface AnalyticsPivotGrid {
  headers: Array<{
    label: string;
    align: "left" | "right";
    frozen?: boolean;
    /** When set, double-click renames this measure (measureAlias). */
    measureKey?: string;
  }>;
  rows: AnalyticsPivotCell[][];
  /** How many leading columns stay fixed while metrics scroll. */
  frozenColumnCount: number;
  truncated: boolean;
}

/** Prettify sortable date labels for display, honouring an optional format override. */
function prettyLabel(raw: string, dateFormat: VisualDateFormat = "default"): string {
  if (!raw) return "—";

  if (dateFormat !== "default") {
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) {
      return formatVisualDate(raw, dateFormat);
    }
    // Quarter labels from SQL: "2025 Q1"
    const quarter = raw.match(/^(\d{4}) (Q\d)$/);
    if (quarter) {
      if (dateFormat === "long") return `${quarter[2]} ${quarter[1]}`;
      return `${quarter[2]} ${quarter[1]}`;
    }
  }

  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-AU", {
      month: "short",
      year: "numeric",
    });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  const quarter = raw.match(/^(\d{4}) (Q\d)$/);
  if (quarter) return `${quarter[2]} ${quarter[1]}`;
  return raw;
}

function rawText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function buildAnalyticsPivotGrid(
  element: AnalyticsWorkbookElement,
  rows: SqlResultRow[],
): AnalyticsPivotGrid | null {
  const { query, pivot } = element;
  if (!pivot || query.mode !== "aggregate") return null;

  const dimensionAliases = new Set(query.dimensions.map((dimension) => dimensionAlias(dimension)));
  const rowFields = pivot.rows.filter((key) => dimensionAliases.has(key));
  const columnFields = pivot.columns.filter((key) => dimensionAliases.has(key));
  const measures = query.measures;
  const valuesIn = pivot.valuesIn ?? "columns";

  if (measures.length === 0) return null;
  if (rowFields.length === 0 && valuesIn !== "rows") return null;
  if (rows.length === 0) return null;

  const fieldLabel = (key: string) =>
    getAnalyticsColumn(query.source, key)?.label
    ?? getSalesField(key)?.label
    ?? key;

  const dateFormatForField = (key: string): VisualDateFormat => {
    const dimension = query.dimensions.find((entry) => dimensionAlias(entry) === key);
    return dimension?.dateFormat ?? "default";
  };

  // ----- bucket the grouped SQL rows by pivot row/column keys -----
  const rowGroups = new Map<string, string[]>();
  const columnGroups = new Map<string, string>();
  const cells = new Map<string, SqlResultRow>();

  for (const row of rows) {
    const rowValues = rowFields.map((field) => rawText(row[field]));
    const rowKey = rowValues.join("||");
    const columnKey = columnFields.map((field) => rawText(row[field])).join("||");

    if (!rowGroups.has(rowKey)) rowGroups.set(rowKey, rowValues);
    if (!columnGroups.has(columnKey)) {
      columnGroups.set(
        columnKey,
        columnFields
          .map((field) => prettyLabel(rawText(row[field]), dateFormatForField(field)))
          .join(" · "),
      );
    }
    // Grouped SQL yields one row per bucket; keep the first if duplicated.
    const cellKey = `${rowKey}:::${columnKey}`;
    if (!cells.has(cellKey)) cells.set(cellKey, row);
  }

  const sortDirForField = (key: string): "asc" | "desc" => {
    const dimension = query.dimensions.find((entry) => dimensionAlias(entry) === key);
    return dimension?.sortDir === "desc" ? "desc" : "asc";
  };

  const comparePivotKeys = (a: string, b: string, fields: string[]) => {
    const aParts = a.split("||");
    const bParts = b.split("||");
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index]!;
      const cmp = (aParts[index] ?? "").localeCompare(bParts[index] ?? "", "en-AU");
      if (cmp !== 0) {
        return sortDirForField(field) === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  };

  const sortedRowKeys = [...rowGroups.keys()].sort((a, b) =>
    comparePivotKeys(a, b, rowFields),
  );
  const sortedColumnKeys = [...columnGroups.keys()].sort((a, b) =>
    comparePivotKeys(a, b, columnFields),
  );
  const truncated =
    sortedRowKeys.length > MAX_ROW_GROUPS || sortedColumnKeys.length > MAX_COLUMN_GROUPS;
  const rowKeys = sortedRowKeys.slice(0, MAX_ROW_GROUPS);
  const columnKeys = sortedColumnKeys.slice(0, MAX_COLUMN_GROUPS);

  const measureMeta = measures.map((measure) => ({
    key: measureAlias(measure),
    label: measureLabel(element, measure),
    format: measureFormat(element, measure),
  }));

  // ----- conditional formatting (Sigma-style: single colour / scale / bars) -----
  const conditionalFormats = element.conditionalFormats ?? [];
  const measureFormatRules = conditionalFormats.filter((format) =>
    measureMeta.some((meta) => meta.key === format.target),
  );
  const rowFieldFormatRules = conditionalFormats.filter(
    (format) => format.kind === "rule" && rowFields.includes(format.target),
  );

  // Min/max per measure, needed by colour scales and data bars.
  const measureRanges = new Map<string, { min: number; max: number }>();
  if (measureFormatRules.some((format) => format.kind !== "rule")) {
    for (const row of cells.values()) {
      for (const meta of measureMeta) {
        const raw = row[meta.key];
        const numeric = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(numeric)) continue;
        const range = measureRanges.get(meta.key);
        if (!range) {
          measureRanges.set(meta.key, { min: numeric, max: numeric });
        } else {
          range.min = Math.min(range.min, numeric);
          range.max = Math.max(range.max, numeric);
        }
      }
    }
  }

  const measureDecoration = (
    metaKey: string,
    numeric: number | null,
  ): Pick<AnalyticsPivotCell, "background" | "bar"> => {
    if (numeric === null) return {};
    const out: Pick<AnalyticsPivotCell, "background" | "bar"> = {};
    for (const format of measureFormatRules) {
      if (format.target !== metaKey) continue;
      if (format.kind === "rule") {
        if (ruleMatchesNumber(format, numeric)) {
          out.background = paletteColor(format.palette, 0.22);
        }
        continue;
      }
      const range = measureRanges.get(metaKey);
      const spread = range ? range.max - range.min : 0;
      const t = range ? (spread > 0 ? (numeric - range.min) / spread : 0.5) : 0.5;
      if (format.kind === "scale") {
        out.background = paletteColor(format.palette, 0.05 + 0.4 * t);
      } else {
        out.bar = { fraction: Math.max(0.03, Math.min(1, t)), color: paletteColor(format.palette, 0.28) };
      }
    }
    return out;
  };

  const cellValue = (
    rowKey: string,
    columnKey: string,
    meta: (typeof measureMeta)[number],
  ): { text: string } & Pick<AnalyticsPivotCell, "background" | "bar"> => {
    const row = cells.get(`${rowKey}:::${columnKey}`);
    const value = row?.[meta.key];
    if (value === null || value === undefined || value === "") {
      return { text: "–" };
    }
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      // Non-numeric aggregate results (e.g. min/max of a date) display as-is.
      return { text: prettyLabel(String(value)) };
    }
    return {
      text: formatVisualValue(numeric, meta.format),
      ...measureDecoration(meta.key, numeric),
    };
  };

  const rowHeaderCells = (rowKey: string, rowSpan?: number): AnalyticsPivotCell[] =>
    (rowGroups.get(rowKey) ?? []).map((value, index) => {
      const fieldKey = rowFields[index];
      const matched = rowFieldFormatRules.find(
        (format) => format.target === fieldKey && ruleMatchesText(format, value),
      );
      return {
        text: prettyLabel(value, fieldKey ? dateFormatForField(fieldKey) : "default"),
        align: "left" as const,
        header: true,
        colIndex: index,
        frozen: true,
        ...(matched ? { background: paletteColor(matched.palette, 0.22) } : {}),
        ...(rowSpan && rowSpan > 1 ? { rowSpan } : {}),
      };
    });

  if (valuesIn === "columns") {
    const frozenColumnCount = rowFields.length;
    const headers: AnalyticsPivotGrid["headers"] = [
      ...rowFields.map((field) => ({
        label: fieldLabel(field),
        align: "left" as const,
        frozen: true,
      })),
      ...columnKeys.flatMap((columnKey) =>
        measureMeta.map((meta) => {
          const isBareMeasure = columnFields.length === 0;
          const columnLabel = columnGroups.get(columnKey) ?? "";
          // Always keep each measure's title (including custom renames).
          // Bare: "Sum of Total" / "Sum of Profit".
          // With column fields: "Apr 2026 · Sum of Total".
          return {
            label: isBareMeasure
              ? meta.label
              : `${columnLabel} · ${meta.label}`,
            align: "right" as const,
            // Bare headers are inline-renamable; with column prefixes, rename
            // from the Values list instead.
            measureKey: isBareMeasure ? meta.key : undefined,
          };
        }),
      ),
    ];

    const bodyRows = rowKeys.map((rowKey) => {
      let colIndex = frozenColumnCount;
      return [
        ...rowHeaderCells(rowKey),
        ...columnKeys.flatMap((columnKey) =>
          measureMeta.map((meta) => ({
            ...cellValue(rowKey, columnKey, meta),
            align: "right" as const,
            colIndex: colIndex++,
          })),
        ),
      ];
    });

    return { headers, rows: bodyRows, frozenColumnCount, truncated };
  }

  // ----- values in rows: each measure becomes its own row per group -----
  // Multiple measures need a label column. A single measure puts its title on
  // the value column header instead (previously that header said "Value").
  const includeValueColumn = measureMeta.length > 1 || rowFields.length === 0;
  const frozenColumnCount = rowFields.length + (includeValueColumn ? 1 : 0);
  const singleMeasure = measureMeta.length === 1 ? measureMeta[0]! : null;
  const headers: AnalyticsPivotGrid["headers"] = [
    ...rowFields.map((field) => ({
      label: fieldLabel(field),
      align: "left" as const,
      frozen: true,
    })),
    ...(includeValueColumn
      ? [{
          label: measureMeta.length > 1 ? "Values" : "",
          align: "left" as const,
          frozen: true,
        }]
      : []),
    ...columnKeys.map((columnKey) => {
      const columnLabel = columnGroups.get(columnKey) ?? "";
      if (columnFields.length === 0) {
        return {
          // One measure: title on the metric header. Several measures: titles
          // live in the Values column, so this header stays neutral.
          label: singleMeasure?.label ?? "Value",
          align: "right" as const,
          measureKey: singleMeasure?.key,
        };
      }
      return {
        label: singleMeasure
          ? `${columnLabel} · ${singleMeasure.label}`
          : columnLabel,
        align: "right" as const,
      };
    }),
  ];

  const bodyRows = rowKeys.flatMap((rowKey) =>
    measureMeta.map((meta, measureIndex) => {
      // Row-dimension cells (possibly omitted via rowSpan) occupy 0..n-1;
      // measure labels and metrics always start after them.
      let colIndex = rowFields.length;

      return [
        ...(measureIndex === 0 ? rowHeaderCells(rowKey, measureMeta.length) : []),
        ...(includeValueColumn
          ? [
              {
                text: meta.label,
                align: "left" as const,
                header: true,
                colIndex: colIndex++,
                frozen: true,
                measureKey: meta.key,
              },
            ]
          : []),
        ...columnKeys.map((columnKey) => ({
          ...cellValue(rowKey, columnKey, meta),
          align: "right" as const,
          colIndex: colIndex++,
        })),
      ];
    }),
  );

  return { headers, rows: bodyRows, frozenColumnCount, truncated };
}
