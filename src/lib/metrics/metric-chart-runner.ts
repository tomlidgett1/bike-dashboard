import {
  GENIE_LIGHTSPEED_SQL_VIEW,
} from "@/lib/genie/agent/sql-constants";
import { getMetricById, searchMetrics, type MetricDefinition } from "@/lib/metrics/metric-catalog";
import type { GenieChartPayload, GenieTablePayload } from "@/lib/genie/visual-payloads";

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function formatPeriodLabel(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

export function buildSegmentKeywordPredicate(segmentQuery: string): string {
  const tokens = segmentQuery
    .toLowerCase()
    .replace(/[^a-z0-9'\-\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

  if (tokens.length === 0) {
    return `(description ILIKE '%service%' OR category ILIKE '%service%')`;
  }

  const clauses = tokens.map(
    (token) =>
      `(description ILIKE ${sqlLiteral(`%${token}%`)} OR category ILIKE ${sqlLiteral(`%${token}%`)})`,
  );
  return clauses.join(" AND ");
}

export function buildProductSegmentTimeseriesSql(args: {
  segmentQuery: string;
  startDate: string;
  endDate: string;
  groupBy: "day" | "week" | "month";
  measure: "units_sold" | "net_sales";
}): string {
  const measureExpression =
    args.measure === "net_sales" ? "SUM(total)" : "SUM(COALESCE(quantity, 0))";
  const segmentPredicate = buildSegmentKeywordPredicate(args.segmentQuery);

  return `
SELECT
  date_trunc('${args.groupBy}', complete_time AT TIME ZONE 'Australia/Melbourne') AS period,
  ${measureExpression} AS metric_value,
  COUNT(*) AS sale_lines
FROM ${GENIE_LIGHTSPEED_SQL_VIEW}
WHERE complete_time >= ${sqlLiteral(args.startDate)}::date
  AND complete_time < (${sqlLiteral(args.endDate)}::date + interval '1 day')
  AND ${segmentPredicate}
GROUP BY 1
ORDER BY 1 ASC
`.trim();
}

export function buildTimeseriesChartForRows(args: {
  title: string;
  subtitle?: string;
  rows: Array<Record<string, unknown>>;
  xKey?: string;
  yKey?: string;
  kind?: "line" | "bar";
  valueFormat?: "number" | "currency" | "percent";
}): GenieChartPayload | undefined {
  const xKey = args.xKey ?? "period";
  const yKey = args.yKey ?? "metric_value";
  if (args.rows.length === 0) return undefined;

  return {
    kind: args.kind ?? "line",
    title: args.title,
    subtitle: args.subtitle,
    xKey: "label",
    series: [{ key: yKey, label: yKey.replace(/_/g, " ") }],
    data: args.rows.map((row) => ({
      label: formatPeriodLabel(row[xKey]),
      [yKey]: Number(row[yKey]) || 0,
    })),
    valueFormatter: args.valueFormat ?? "number",
  };
}

export function extractSegmentQueryFromPrompt(prompt: string): string {
  const text = prompt.trim();
  const quoted = text.match(/["']([^"']+)["']/);
  if (quoted?.[1]) return quoted[1].trim();

  const serviceMatch = text.match(
    /\b(?:total\s+)?((?:general|full|major|minor|standard|basic)\s+services?)\b/i,
  );
  if (serviceMatch?.[1]) return serviceMatch[1].trim();

  const looseServiceMatch = text.match(
    /\b(?:with\s+)?(?:total\s+)?([a-z]+(?:\s+[a-z]+){0,2}\s+services?)\b/i,
  );
  if (looseServiceMatch?.[1]) {
    return looseServiceMatch[1].replace(/^(with|total)\s+/i, "").trim();
  }

  if (/\bservice/i.test(text)) return "general service";
  if (/\brepair/i.test(text)) return "repair";
  return "";
}

export function resolveMetricFromPrompt(prompt: string): MetricDefinition | undefined {
  const text = prompt.toLowerCase();
  const directIds = [
    "net_sales",
    "gross_sales",
    "gross_profit",
    "gross_margin_pct",
    "sale_count",
    "average_order_value",
    "units_sold",
  ] as const;

  for (const id of directIds) {
    const metric = getMetricById(id);
    if (!metric) continue;
    if (text.includes(id.replace(/_/g, " "))) return metric;
  }

  if (/\bnet sales\b|\brevenue\b/.test(text)) return getMetricById("net_sales");
  if (/\bgross sales\b/.test(text)) return getMetricById("gross_sales");
  if (/\bgross profit\b/.test(text)) return getMetricById("gross_profit");
  if (/\bmargin\b/.test(text)) return getMetricById("gross_margin_pct");
  if (/\bunits sold\b|\bunits\b/.test(text)) return getMetricById("units_sold");
  if (/\baov\b|\baverage order\b/.test(text)) return getMetricById("average_order_value");
  if (/\bsale count\b|\btransactions?\b|\borders?\b/.test(text)) return getMetricById("sale_count");

  const results = searchMetrics(prompt, 1);
  return results[0];
}

export function resolveGroupByFromPrompt(prompt: string): "day" | "week" | "month" {
  if (/\bmonth/i.test(prompt)) return "month";
  if (/\bday|daily/i.test(prompt)) return "day";
  return "week";
}

export function resolveDateRangeFromPrompt(prompt: string, endDate: string): { startDate: string; endDate: string; label: string } {
  const end = new Date(`${endDate}T00:00:00`);
  const text = prompt.toLowerCase();

  const lastDaysMatch = text.match(/\blast\s+(\d+)\s+days?\b/);
  if (lastDaysMatch) {
    const days = Number(lastDaysMatch[1]);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate,
      label: `last ${days} days`,
    };
  }

  if (/\blast 30 days\b/.test(text)) {
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return { startDate: start.toISOString().slice(0, 10), endDate, label: "last 30 days" };
  }

  if (/\blast 7 days\b|\bthis week\b/.test(text)) {
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { startDate: start.toISOString().slice(0, 10), endDate, label: "last 7 days" };
  }

  const start = new Date(end);
  start.setMonth(start.getMonth() - 6);
  return { startDate: start.toISOString().slice(0, 10), endDate, label: "last 6 months" };
}

export function buildCatalogMetricTimeseriesSql(
  metric: MetricDefinition,
  args: {
    startDate: string;
    endDate: string;
    groupBy: "day" | "week" | "month";
  },
): string {
  const filters = [
    `${metric.dateField} >= ${sqlLiteral(args.startDate)}::date`,
    `${metric.dateField} < (${sqlLiteral(args.endDate)}::date + interval '1 day')`,
    ...metric.defaultFilters,
  ];

  return `
SELECT
  date_trunc('${args.groupBy}', ${metric.dateField} AT TIME ZONE '${metric.timezone}') AS period,
  ${metric.sqlExpression} AS metric_value
FROM ${GENIE_LIGHTSPEED_SQL_VIEW}
WHERE ${filters.join(" AND ")}
GROUP BY 1
ORDER BY 1 ASC
`.trim();
}

export function metricValueFormat(metricId: string): "number" | "currency" | "percent" {
  if (/margin|percent|pct/i.test(metricId)) return "percent";
  if (/sales|profit|revenue|value|aov|order_value/i.test(metricId)) return "currency";
  return "number";
}

export function looksLikeSegmentChartPrompt(prompt: string): boolean {
  return (
    /\b(graph|chart|trend|plot|visuali[sz]e|line)\b/i.test(prompt) &&
    /\b(service|repair|sold|units|general|product|category)\b/i.test(prompt) &&
    Boolean(extractSegmentQueryFromPrompt(prompt))
  );
}

export function looksLikeMetricTimeseriesPrompt(prompt: string): boolean {
  return (
    /\b(graph|chart|trend|plot|visuali[sz]e|line)\b/i.test(prompt) &&
    Boolean(resolveMetricFromPrompt(prompt)) &&
    !extractSegmentQueryFromPrompt(prompt)
  );
}

export function looksLikeQuickChartPrompt(prompt: string): boolean {
  return looksLikeSegmentChartPrompt(prompt) || looksLikeMetricTimeseriesPrompt(prompt);
}

export type QuickChartResponse = {
  content: string;
  chart?: GenieChartPayload;
  table?: GenieTablePayload;
  sql?: string;
  segment_query?: string;
  error?: string;
};
