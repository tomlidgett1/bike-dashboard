import {
  compileCalculatedFormulaToSql,
  getCalculatedColumn,
  hasCalculatedColumnCycle,
  isCalculatedColumnKey,
} from "@/lib/table-builder/calculated-columns";
import { getSalesField } from "@/lib/table-builder/sales-fields";
import {
  getAnalyticsColumn,
  isCustomAnalyticsSource,
  parseCustomAnalyticsTableId,
  type AnalyticsColumn,
  type AnalyticsSource,
} from "./catalog";
import {
  ANALYTICS_QUERY_MAX_LIMIT,
  dimensionAlias,
  measureAlias,
  type AnalyticsDateTrunc,
  type AnalyticsElementQuery,
  type AnalyticsFilter,
  type AnalyticsMeasure,
} from "./types";

/**
 * Builds SQL for the read-only execute_lightspeed_genie_sql RPC from a
 * structured element query. Every identifier is checked against the column
 * catalog and every literal is sanitised, so client input never reaches the
 * SQL string unescaped.
 *
 * Custom Build a Table sources read from the shared raw store
 * (genie_api_builder_source_rows) and project typed values out of the nested
 * data JSONB record via each catalog field's path. Formula columns compile to
 * SQL arithmetic at query time; sale-grain tables dedupe to one row per sale.
 */

const DATE_TRUNC_LABELS: Record<AnalyticsDateTrunc, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-MM-DD",
  month: "Mon YYYY",
  quarter: '"Q"Q YYYY',
  year: "YYYY",
};

// Pivot columns are ordered by string comparison, so date labels must sort
// chronologically when compared as text.
const SORTABLE_DATE_TRUNC_LABELS: Record<AnalyticsDateTrunc, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-MM-DD",
  month: "YYYY-MM",
  quarter: 'YYYY "Q"Q',
  year: "YYYY",
};

const SAFE_FIELD_KEY = /^[a-zA-Z0-9_.]+$/;

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, "")}"`;
}

function escapeStringLiteral(value: string): string {
  // The executor RPC rejects any SQL containing ";" or comment markers even
  // inside literals, so those characters cannot appear in filter values.
  return value
    .replace(/;/g, "")
    .replace(/--/g, "-")
    .replace(/\/\*|\*\//g, "")
    .replace(/'/g, "''")
    .slice(0, 200);
}

/** `data#>>'{sale,calcTotal}'` accessor for a catalog field path. */
function jsonbPathText(path: string): string | null {
  const parts = path.split(".");
  if (parts.length === 0 || !parts.every((part) => SAFE_FIELD_KEY.test(part))) {
    return null;
  }
  return `data#>>'{${parts.map((part) => escapeStringLiteral(part)).join(",")}}'`;
}

function typedJsonbExpr(path: string, type: AnalyticsColumn["type"]): string | null {
  const accessor = jsonbPathText(path);
  if (!accessor) return null;
  switch (type) {
    case "number":
      return `(NULLIF(${accessor}, ''))::numeric`;
    case "boolean":
      return `(CASE
        WHEN lower(${accessor}) IN ('true', 't', '1', 'yes') THEN TRUE
        WHEN lower(${accessor}) IN ('false', 'f', '0', 'no') THEN FALSE
        ELSE NULL
      END)`;
    case "date":
      return `(NULLIF(${accessor}, ''))::timestamptz`;
    default:
      return `(${accessor})`;
  }
}

const MAX_FORMULA_DEPTH = 6;

/** Compile a formula column to SQL over the raw store's JSONB record. */
function calcColumnSql(
  source: AnalyticsSource,
  calcKey: string,
  depth = 0,
): string | null {
  const calcs = source.calculatedColumns ?? [];
  const grain = source.grain === "sale" ? "sale" : "sale_line";
  if (depth > MAX_FORMULA_DEPTH || hasCalculatedColumnCycle(calcs, grain)) {
    return null;
  }
  const calc = getCalculatedColumn(calcKey, calcs);
  if (!calc || !calc.expression.trim()) return null;

  const compiled = compileCalculatedFormulaToSql(
    calc.expression,
    grain,
    (refKey) => {
      if (isCalculatedColumnKey(refKey)) {
        return calcColumnSql(source, refKey, depth + 1);
      }
      const field = getSalesField(refKey);
      if (!field || field.type !== "number") return null;
      return typedJsonbExpr(field.path, "number");
    },
    { calculatedColumns: calcs, selfKey: calc.key },
  );
  if (!compiled.ok) return null;

  // Match the materialised-row rounding: 2dp for money/number, 6dp percent.
  const scale = calc.format === "percent" ? 6 : 2;
  return `ROUND((${compiled.sql})::numeric, ${scale})`;
}

/** Typed expression for a catalog column (physical or JSONB-backed). */
function columnExpr(source: AnalyticsSource, column: AnalyticsColumn): string | null {
  if (!source.customTableId) {
    return quoteIdent(column.key);
  }
  if (isCalculatedColumnKey(column.key)) {
    return calcColumnSql(source, column.key);
  }
  const field = getSalesField(column.key);
  if (!field) return null;
  return typedJsonbExpr(field.path, column.type);
}

function truncExpr(expr: string, truncate: AnalyticsDateTrunc): string {
  return `date_trunc('${truncate}', ${expr})`;
}

function measureExpr(
  measure: AnalyticsMeasure,
  column: AnalyticsColumn | undefined,
  columnSql: string | undefined,
): string {
  if (measure.agg === "count") {
    if (measure.column === "*") return "COUNT(*)";
    return columnSql ? `COUNT(${columnSql})` : "COUNT(*)";
  }
  if (measure.agg === "count_distinct") {
    return columnSql ? `COUNT(DISTINCT ${columnSql})` : "COUNT(*)";
  }
  if (measure.agg === "median") {
    return `ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${columnSql}))::numeric, 2)`;
  }
  if (measure.agg === "stddev") {
    return `ROUND(COALESCE(STDDEV(${columnSql}), 0)::numeric, 2)`;
  }
  if ((measure.agg === "min" || measure.agg === "max") && column?.type === "date") {
    return `to_char(${measure.agg.toUpperCase()}(${columnSql}), 'YYYY-MM-DD')`;
  }
  const fn = measure.agg.toUpperCase();
  const expr = `${fn}(${columnSql})`;
  if (column?.format === "currency" || measure.agg === "avg") {
    return `ROUND((${expr})::numeric, 2)`;
  }
  return expr;
}

function filterClause(
  source: AnalyticsSource,
  filter: AnalyticsFilter,
): { clause?: string; error?: string } {
  const column = getAnalyticsColumn(source, filter.column);
  if (!column) return { error: `Unknown filter column "${filter.column}".` };

  const ident = columnExpr(source, column);
  if (!ident) return { error: `Invalid column "${filter.column}".` };

  const rawValue = (filter.value ?? "").trim();

  switch (filter.op) {
    case "is_true":
      return column.type === "boolean"
        ? { clause: `${ident} IS TRUE` }
        : { error: `${column.label} is not a true/false column.` };
    case "is_false":
      return column.type === "boolean"
        ? { clause: `${ident} IS NOT TRUE` }
        : { error: `${column.label} is not a true/false column.` };
    case "is_set":
      return { clause: `${ident} IS NOT NULL` };
    case "is_not_set":
      return { clause: `${ident} IS NULL` };
    case "contains":
    case "not_contains": {
      if (column.type !== "text") return { error: `${column.label} does not support "contains".` };
      if (!rawValue) return {};
      const literal = escapeStringLiteral(rawValue).replace(/[%_]/g, "");
      const negate = filter.op === "not_contains" ? "NOT " : "";
      return { clause: `${negate}(${ident} ILIKE '%${literal}%')` };
    }
    case "eq":
    case "neq": {
      if (!rawValue) return {};
      if (column.type === "number") {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) return { error: `"${rawValue}" is not a number.` };
        return { clause: `${ident} ${filter.op === "eq" ? "=" : "<>"} ${numeric}` };
      }
      return {
        clause: `${ident} ${filter.op === "eq" ? "=" : "<>"} '${escapeStringLiteral(rawValue)}'`,
      };
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (!rawValue) return {};
      const op = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[filter.op];
      if (column.type === "number") {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) return { error: `"${rawValue}" is not a number.` };
        return { clause: `${ident} ${op} ${numeric}` };
      }
      if (column.type === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
          return { error: "Dates must be entered as YYYY-MM-DD." };
        }
        return { clause: `${ident} ${op} '${rawValue}'` };
      }
      return { error: `${column.label} does not support numeric comparison.` };
    }
    case "on_or_after":
    case "on_or_before": {
      if (column.type !== "date") return { error: `${column.label} is not a date column.` };
      if (!rawValue) return {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
        return { error: "Dates must be entered as YYYY-MM-DD." };
      }
      return {
        clause:
          filter.op === "on_or_after"
            ? `${ident} >= '${rawValue}'`
            : `${ident} < ('${rawValue}'::date + 1)`,
      };
    }
    case "between": {
      if (column.type !== "date") return { error: `${column.label} is not a date column.` };
      const end = (filter.valueTo ?? "").trim();
      if (!rawValue || !end) return {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return { error: "Dates must be entered as YYYY-MM-DD." };
      }
      if (rawValue > end) {
        return { error: "Between needs a start date on or before the end date." };
      }
      return {
        clause: `${ident} >= '${rawValue}' AND ${ident} < ('${end}'::date + 1)`,
      };
    }
    case "month_to_date": {
      if (column.type !== "date") return { error: `${column.label} is not a date column.` };
      // From the 1st of the current month through now.
      return {
        clause: `${ident} >= date_trunc('month', now()) AND ${ident} < now()`,
      };
    }
    case "this_month": {
      if (column.type !== "date") return { error: `${column.label} is not a date column.` };
      return {
        clause:
          `${ident} >= date_trunc('month', now())`
          + ` AND ${ident} < (date_trunc('month', now()) + interval '1 month')`,
      };
    }
    case "this_quarter": {
      if (column.type !== "date") return { error: `${column.label} is not a date column.` };
      return {
        clause:
          `${ident} >= date_trunc('quarter', now())`
          + ` AND ${ident} < (date_trunc('quarter', now()) + interval '3 months')`,
      };
    }
    case "last_days":
    case "last_weeks":
    case "last_months":
    case "last_years":
    case "since_days": {
      if (column.type !== "date") return { error: `${column.label} is not a date column.` };
      const amount = Math.trunc(Number(rawValue));
      const maxByOp: Record<string, number> = {
        last_days: 3650,
        since_days: 3650,
        last_weeks: 520,
        last_months: 120,
        last_years: 20,
      };
      const max = maxByOp[filter.op] ?? 3650;
      if (!Number.isFinite(amount) || amount < 1 || amount > max) {
        return {
          error: `Enter a number between 1 and ${max}.`,
        };
      }
      const intervalArg =
        filter.op === "last_weeks"
          ? `weeks => ${amount}`
          : filter.op === "last_months"
            ? `months => ${amount}`
            : filter.op === "last_years"
              ? `years => ${amount}`
              : `days => ${amount}`;
      return { clause: `${ident} >= (now() - make_interval(${intervalArg}))` };
    }
    default:
      return { error: "Unsupported filter." };
  }
}

export interface BuiltElementSql {
  sql: string;
  /** Result column keys in display order. */
  keys: string[];
}

function resolveSource(
  query: AnalyticsElementQuery,
  sourceOverride?: AnalyticsSource,
): { source?: AnalyticsSource; error?: string } {
  if (sourceOverride) {
    if (!isCustomAnalyticsSource(sourceOverride.key) || !sourceOverride.customTableId) {
      return { error: "Analytics New only supports tables from Build a Table." };
    }
    return { source: sourceOverride };
  }

  if (isCustomAnalyticsSource(query.source)) {
    const tableId = parseCustomAnalyticsTableId(query.source);
    if (!tableId) return { error: "Invalid custom table source." };
    return {
      error: "Custom table source must be resolved from the saved table definition.",
    };
  }

  return {
    error: "Analytics New only supports tables from Build a Table.",
  };
}

function fromClause(source: AnalyticsSource): { sql?: string; error?: string } {
  if (!source.customTableId) {
    return { sql: `public.${source.view}` };
  }
  const tableId = parseCustomAnalyticsTableId(source.key);
  if (!tableId || tableId !== source.customTableId) {
    return { error: "Invalid custom table id." };
  }
  // Shared raw store (tenant-scoped by the view). Sale-grain tables collapse
  // line rows to one arbitrary row per sale — sale-level fields are identical
  // on every line of the same sale.
  if (source.grain === "sale") {
    return {
      sql: `(SELECT DISTINCT ON (sale_id) * FROM public.${source.view}) AS _yj_sale_rows`,
    };
  }
  return { sql: `public.${source.view}` };
}

export function buildElementSql(
  query: AnalyticsElementQuery,
  sourceOverride?: AnalyticsSource,
): { built?: BuiltElementSql; error?: string } {
  const resolved = resolveSource(query, sourceOverride);
  if (resolved.error || !resolved.source) {
    return { error: resolved.error ?? "Unknown data source." };
  }
  const source = resolved.source;

  const from = fromClause(source);
  if (from.error || !from.sql) return { error: from.error ?? "Invalid source view." };

  const limit = Math.min(
    Math.max(Math.trunc(query.limit) || 1, 1),
    ANALYTICS_QUERY_MAX_LIMIT,
  );

  const whereClauses: string[] = [];
  for (const filter of query.filters ?? []) {
    const { clause, error } = filterClause(source, filter);
    if (error) return { error };
    if (clause) whereClauses.push(clause);
  }
  const whereSql = whereClauses.length
    ? ` WHERE ${whereClauses.join(" AND ")}`
    : "";

  const selectParts: string[] = [];
  const keys: string[] = [];
  // Maps a result key to the expression used when ordering by it.
  const orderExprByKey = new Map<string, string>();

  if (query.mode === "raw") {
    const columns = (query.columns ?? []).filter((key) => getAnalyticsColumn(source, key));
    if (columns.length === 0) return { error: "Pick at least one column to show." };
    for (const key of columns.slice(0, 24)) {
      const column = getAnalyticsColumn(source, key)!;
      const expr = columnExpr(source, column);
      if (!expr) return { error: `Invalid column "${key}".` };
      if (column.type === "date") {
        selectParts.push(`to_char(${expr}, 'YYYY-MM-DD HH24:MI') AS ${quoteIdent(key)}`);
      } else {
        selectParts.push(`${expr} AS ${quoteIdent(key)}`);
      }
      keys.push(key);
      orderExprByKey.set(key, expr);
    }
  } else {
    const dimensions = (query.dimensions ?? []).slice(0, 4);
    const measures = (query.measures ?? []).slice(0, 6);
    if (measures.length === 0) return { error: "Add at least one measure." };

    const groupExprs: string[] = [];
    for (const dimension of dimensions) {
      const column = getAnalyticsColumn(source, dimension.column);
      if (!column) return { error: `Unknown dimension "${dimension.column}".` };
      const expr = columnExpr(source, column);
      if (!expr) return { error: `Invalid dimension "${dimension.column}".` };
      const alias = dimensionAlias(dimension);
      if (column.type === "date") {
        const truncate = dimension.truncate ?? "month";
        const truncated = truncExpr(expr, truncate);
        const labels =
          query.dateLabels === "sortable" ? SORTABLE_DATE_TRUNC_LABELS : DATE_TRUNC_LABELS;
        selectParts.push(
          `to_char(${truncated}, '${labels[truncate]}') AS ${quoteIdent(alias)}`,
        );
        groupExprs.push(truncated);
        orderExprByKey.set(alias, truncated);
      } else {
        selectParts.push(`${expr} AS ${quoteIdent(alias)}`);
        groupExprs.push(expr);
        orderExprByKey.set(alias, expr);
      }
      keys.push(alias);
    }

    for (const measure of measures) {
      const column =
        measure.column === "*" ? undefined : getAnalyticsColumn(source, measure.column);
      if (measure.column !== "*" && !column) {
        return { error: `Unknown measure column "${measure.column}".` };
      }
      const aggAllowed =
        !column
        || column.type === "number"
        || ["count", "count_distinct"].includes(measure.agg)
        || (["min", "max"].includes(measure.agg) && column.type === "date");
      if (!aggAllowed) {
        return {
          error: `${column!.label} does not support the "${measure.agg}" aggregation.`,
        };
      }
      const columnSql = column ? columnExpr(source, column) ?? undefined : undefined;
      if (column && !columnSql) return { error: `Invalid measure column "${measure.column}".` };
      const alias = measureAlias(measure);
      const mExpr = measureExpr(measure, column, columnSql);
      selectParts.push(`${mExpr} AS ${quoteIdent(alias)}`);
      keys.push(alias);
      orderExprByKey.set(alias, mExpr);
    }

    const orderKey =
      query.sort?.key && orderExprByKey.has(query.sort.key) ? query.sort.key : undefined;
    const orderSql = orderKey
      ? ` ORDER BY ${orderExprByKey.get(orderKey)} ${query.sort!.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`
      : defaultAggregateOrder(query, source, orderExprByKey, keys);

    const groupSql = groupExprs.length ? ` GROUP BY ${groupExprs.join(", ")}` : "";
    const sql = `SELECT ${selectParts.join(", ")} FROM ${from.sql}${whereSql}${groupSql}${orderSql} LIMIT ${limit}`;
    return { built: { sql, keys } };
  }

  const orderKey =
    query.sort?.key && orderExprByKey.has(query.sort.key) ? query.sort.key : keys[0];
  const orderSql = ` ORDER BY ${orderExprByKey.get(orderKey)} ${query.sort?.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`;
  const sql = `SELECT ${selectParts.join(", ")} FROM ${from.sql}${whereSql}${orderSql} LIMIT ${limit}`;
  return { built: { sql, keys } };
}

function defaultAggregateOrder(
  query: AnalyticsElementQuery,
  source: AnalyticsSource,
  orderExprByKey: Map<string, string>,
  keys: string[],
): string {
  // Time series read chronologically; otherwise rank by the first measure.
  const dateDim = (query.dimensions ?? []).find(
    (dimension) => getAnalyticsColumn(source, dimension.column)?.type === "date",
  );
  if (dateDim) {
    const dir = dateDim.sortDir === "desc" ? "DESC" : "ASC";
    return ` ORDER BY ${orderExprByKey.get(dimensionAlias(dateDim))} ${dir}`;
  }
  const firstMeasure = (query.measures ?? [])[0];
  if (firstMeasure) {
    const alias = measureAlias(firstMeasure);
    if (orderExprByKey.has(alias)) {
      return ` ORDER BY ${orderExprByKey.get(alias)} DESC NULLS LAST`;
    }
  }
  return keys.length ? ` ORDER BY ${orderExprByKey.get(keys[0])} ASC` : "";
}
