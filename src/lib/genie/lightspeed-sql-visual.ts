import type { GenieChartPayload } from "@/components/genie/genie-chart";
import type { GenieTablePayload } from "@/components/genie/genie-data-table";
import {
  buildPivotTableFromRows,
  type GeniePivotTableConfig,
  type GeniePivotTablePayload,
} from "@/lib/genie/pivot-table";
import type { VisualValueFormat } from "@/lib/genie/visual-format";

export const GENIE_LIGHTSPEED_SQL_VIEW = "genie_lightspeed_sales_report_lines";
export const GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW = "genie_lightspeed_inventory";
export const GENIE_LIGHTSPEED_SQL_RPC = "execute_lightspeed_genie_sql";
export const GENIE_LIGHTSPEED_SQL_DEFAULT_LIMIT = 500;
export const GENIE_LIGHTSPEED_SQL_MAX_LIMIT = 1000;

export type SqlResultRow = Record<string, string | number | boolean | null>;

export interface LightspeedSqlVisualArgs {
  table_title?: string;
  table_subtitle?: string;
  pivot_table?: GeniePivotTableConfig;
  chart_kind?: "bar" | "line";
  chart_title?: string;
  chart_subtitle?: string;
  chart_x_key?: string;
  chart_y_keys?: string[];
  value_format?: VisualValueFormat;
}

export type DashboardSqlVisualType = "chart" | "table" | "pivot";

function scrubSqlStringLiterals(sql: string): string {
  return sql.replace(/'([^']|'')*'/g, "''");
}

export function normalizeLightspeedReportSql(sql: string): string {
  return sql
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\bpublic\.lightspeed_sales_report_lines\b/gi, `public.${GENIE_LIGHTSPEED_SQL_VIEW}`)
    .replace(/(^|[^.\w])lightspeed_sales_report_lines\b/gi, `$1${GENIE_LIGHTSPEED_SQL_VIEW}`)
    .replace(/\bpublic\.lightspeed_inventory\b/gi, `public.${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}`)
    .replace(/(^|[^.\w])lightspeed_inventory\b/gi, `$1${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}`);
}

export function validateLightspeedReportSql(sql: string): string | null {
  const scrubbed = scrubSqlStringLiterals(sql);

  if (!sql.trim()) return "SQL query is required.";
  if (/;/.test(sql)) return "Only one SQL statement is allowed.";
  if (/(\/\*|--)/.test(sql)) return "SQL comments are not allowed.";
  if (!/^\s*(select|with)\s/i.test(sql)) return "Only SELECT/WITH read queries are allowed.";
  if (
    /\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|copy|call|do|execute|merge|vacuum|analyze|refresh|listen|notify|set|reset|show|lock|begin|commit|rollback)\b/i.test(
      scrubbed,
    )
  ) {
    return "Mutating or administrative SQL is not allowed.";
  }
  if (/\b(public\.)?lightspeed_sales_report_lines\b/i.test(scrubbed)) {
    return `Use ${GENIE_LIGHTSPEED_SQL_VIEW}, not the raw Lightspeed sales table.`;
  }
  if (/\b(public\.)?lightspeed_inventory\b/i.test(scrubbed)) {
    return `Use ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}, not the raw Lightspeed inventory table.`;
  }
  if (
    !new RegExp(
      `\\b(public\\.)?(${GENIE_LIGHTSPEED_SQL_VIEW}|${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW})\\b`,
      "i",
    ).test(scrubbed)
  ) {
    return `Query must read from ${GENIE_LIGHTSPEED_SQL_VIEW} or ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}.`;
  }
  if (
    /\b(raw_sale|raw_line|raw_item|raw_item_shops|raw_vendor|source_hash|user_id|access_token|refresh_token|encrypted|password|secret)\b/i.test(
      scrubbed,
    )
  ) {
    return "Query references restricted columns or secrets.";
  }

  return null;
}

export function clampSqlLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return GENIE_LIGHTSPEED_SQL_DEFAULT_LIMIT;
  return Math.min(
    Math.max(Math.trunc(value ?? GENIE_LIGHTSPEED_SQL_DEFAULT_LIMIT), 1),
    GENIE_LIGHTSPEED_SQL_MAX_LIMIT,
  );
}

function safeSqlCellValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function safeSqlTableCellValue(value: unknown): string | number | null {
  const safeValue = safeSqlCellValue(value);
  if (typeof safeValue === "boolean") return safeValue ? "Yes" : "No";
  return safeValue;
}

export function coerceSqlRows(value: unknown): SqlResultRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, cell]) => [key, safeSqlCellValue(cell)]),
      ),
    );
}

function sqlColumnLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferSqlValueFormat(key: string): VisualValueFormat | undefined {
  if (/(margin|percent|pct|rate)/i.test(key)) return "percent";
  if (/(sales|sale|revenue|subtotal|total|cost|profit|discount|retail|value|amount|price|avg|average)/i.test(key)) {
    return "currency";
  }
  if (/(count|qty|quantity|units|rank|number)/i.test(key)) return "number";
  return undefined;
}

export function buildGenericSqlTable(
  rows: SqlResultRow[],
  visual: LightspeedSqlVisualArgs | undefined,
  limitApplied: boolean,
): GenieTablePayload | undefined {
  if (rows.length === 0) return undefined;
  const keys = Object.keys(rows[0] ?? {}).slice(0, 24);
  if (keys.length === 0) return undefined;

  const subtitleParts = [visual?.table_subtitle];
  if (limitApplied) subtitleParts.push("row limit reached");

  return {
    title: visual?.table_title?.trim() || "Lightspeed SQL Results",
    subtitle: subtitleParts.filter(Boolean).join(" · ") || undefined,
    columns: keys.map((key) => ({
      key,
      label: sqlColumnLabel(key),
      align: typeof rows[0]?.[key] === "number" ? "right" : "left",
      format: inferSqlValueFormat(key),
    })),
    rows: rows
      .slice(0, 250)
      .map((row) =>
        Object.fromEntries(keys.map((key) => [key, safeSqlTableCellValue(row[key])])),
      ),
  };
}

export function buildGenericSqlChart(
  rows: SqlResultRow[],
  visual: LightspeedSqlVisualArgs | undefined,
): GenieChartPayload | undefined {
  if (!visual?.chart_kind || !visual.chart_x_key || !visual.chart_y_keys?.length || rows.length === 0) {
    return undefined;
  }

  const xKey = visual.chart_x_key;
  const yKeys = visual.chart_y_keys
    .filter((key) => rows.some((row) => typeof row[key] === "number"))
    .slice(0, 5);
  if (yKeys.length === 0) return undefined;

  return {
    kind: visual.chart_kind,
    title: visual.chart_title?.trim() || "Lightspeed Chart",
    subtitle: visual.chart_subtitle?.trim() || undefined,
    xKey: "label",
    series: yKeys.map((key) => ({ key, label: sqlColumnLabel(key) })),
    data: rows.slice(0, 120).map((row) => ({
      label: String(row[xKey] ?? ""),
      ...Object.fromEntries(
        yKeys.map((key) => [
          key,
          typeof row[key] === "number" ? row[key] : Number(row[key]) || 0,
        ]),
      ),
    })),
    valueFormatter: visual.value_format ?? inferSqlValueFormat(yKeys[0]),
  };
}

export function buildPivotSqlTable(
  rows: SqlResultRow[],
  visual: LightspeedSqlVisualArgs | undefined,
  limitApplied: boolean,
): GeniePivotTablePayload | undefined {
  if (!visual?.pivot_table) return undefined;
  return buildPivotTableFromRows(rows, visual.pivot_table, { limitApplied });
}

export function buildSqlVisualPayload(
  rows: SqlResultRow[],
  visual: LightspeedSqlVisualArgs | undefined,
  visualType: DashboardSqlVisualType,
  limitApplied: boolean,
): GenieChartPayload | GenieTablePayload | GeniePivotTablePayload | undefined {
  if (visualType === "pivot") {
    return buildPivotSqlTable(rows, visual, limitApplied);
  }
  if (visualType === "chart") {
    return buildGenericSqlChart(rows, visual);
  }
  return buildGenericSqlTable(rows, visual, limitApplied);
}
