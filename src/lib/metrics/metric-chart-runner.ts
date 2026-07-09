import {
  GENIE_LIGHTSPEED_SQL_VIEW,
} from "@/lib/genie/agent/sql-constants";
import {
  getMetricById,
  metricSourceView,
  searchMetrics,
  STORE_METRIC_TIMEZONE,
  type MetricDefinition,
} from "@/lib/metrics/metric-catalog";
import type { GenieChartPayload, GenieTablePayload } from "@/lib/genie/visual-payloads";

export type ResolvedMetricsFromPrompt = {
  metrics: MetricDefinition[];
  assumptions: string[];
  clarification?: string;
};

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function formatPeriodLabel(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: STORE_METRIC_TIMEZONE,
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
    args.measure === "net_sales" ? "SUM(subtotal)" : "SUM(COALESCE(quantity, 0))";
  const segmentPredicate = buildSegmentKeywordPredicate(args.segmentQuery);

  return `
SELECT
  date_trunc('${args.groupBy}', complete_time AT TIME ZONE '${STORE_METRIC_TIMEZONE}') AS period,
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
  seriesLabel?: string;
  sourceLabel?: string;
  freshnessLabel?: string;
}): GenieChartPayload | undefined {
  const xKey = args.xKey ?? "period";
  const yKey = args.yKey ?? "metric_value";
  if (args.rows.length === 0) return undefined;

  return {
    kind: args.kind ?? "line",
    title: args.title,
    subtitle: args.subtitle,
    xKey: "label",
    series: [{
      key: yKey,
      label: args.seriesLabel ?? yKey.replace(/_/g, " "),
      format: args.valueFormat ?? "number",
    }],
    data: args.rows.map((row) => ({
      label: formatPeriodLabel(row[xKey]),
      [yKey]: Number(row[yKey]) || 0,
    })),
    valueFormatter: args.valueFormat ?? "number",
    sourceLabel: args.sourceLabel,
    freshnessLabel: args.freshnessLabel,
  };
}

export function buildMultiMetricTimeseriesChartForRows(args: {
  title: string;
  subtitle?: string;
  rows: Array<Record<string, unknown>>;
  metrics: MetricDefinition[];
  xKey?: string;
  kind?: "line" | "bar";
  sourceLabel?: string;
  freshnessLabel?: string;
}): GenieChartPayload | undefined {
  if (args.rows.length === 0 || args.metrics.length === 0) return undefined;
  const xKey = args.xKey ?? "period";
  const formats = args.metrics.map((metric) => metricValueFormat(metric.id));
  const sharedFormat = formats.every((format) => format === formats[0])
    ? formats[0]
    : "number";

  return {
    kind: args.kind ?? "line",
    title: args.title,
    subtitle: args.subtitle,
    xKey: "label",
    series: args.metrics.map((metric) => ({
      key: metric.id,
      label: metric.label,
      format: metricValueFormat(metric.id),
    })),
    data: args.rows.map((row) => ({
      label: formatPeriodLabel(row[xKey]),
      ...Object.fromEntries(
        args.metrics.map((metric) => {
          const value = row[metric.id];
          if (value == null || value === "") return [metric.id, null];
          const numeric = Number(value);
          return [metric.id, Number.isFinite(numeric) ? numeric : null];
        }),
      ),
    })),
    valueFormatter: sharedFormat,
    sourceLabel: args.sourceLabel,
    freshnessLabel: args.freshnessLabel,
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

export function resolveMetricsFromPrompt(prompt: string): ResolvedMetricsFromPrompt {
  const text = prompt.toLowerCase();
  const metrics: MetricDefinition[] = [];
  const assumptions: string[] = [];
  const addMetric = (id: string) => {
    const metric = getMetricById(id);
    if (metric && !metrics.some((candidate) => candidate.id === metric.id)) {
      metrics.push(metric);
    }
  };

  const matchers: Array<[RegExp, string]> = [
    [/\bgross profit\b/, "gross_profit"],
    [/\bnet sales\b|\brevenue\b/, "net_sales"],
    [/\bgross sales\b/, "gross_sales"],
    [/\bgross margin(?: percent| percentage| %)?\b|\bmargin(?: percent| percentage| %)\b/, "gross_margin_pct"],
    [/\bunits sold\b|\bunits\b/, "units_sold"],
    [/\baov\b|\baverage order(?: value)?\b/, "average_order_value"],
    [/\bsale count\b|\btransactions?\b|\borders?\b/, "sale_count"],
  ];

  for (const [pattern, id] of matchers) {
    if (pattern.test(text)) addMetric(id);
  }

  const textWithoutExplicitSales = text.replace(/\b(?:net|gross)\s+sales\b/g, " ");
  const hasBareSales = /\bsales\b/.test(textWithoutExplicitSales);
  if (
    hasBareSales &&
    !metrics.some((metric) => metric.id === "net_sales" || metric.id === "gross_sales")
  ) {
    const hasProfitContext = metrics.some(
      (metric) => metric.id === "gross_profit" || metric.id === "gross_margin_pct",
    );
    if (hasProfitContext) {
      addMetric("net_sales");
      assumptions.push("Sales means Net Sales (after discounts, excluding tax).");
    } else {
      return {
        metrics: [],
        assumptions,
        clarification:
          "When you say sales, do you mean Net Sales (after discounts, excluding tax) or Gross Sales (including tax)?",
      };
    }
  }

  if (metrics.length === 0) {
    const [fallback] = searchMetrics(prompt, 1);
    if (fallback) metrics.push(fallback);
  }

  return { metrics: metrics.slice(0, 3), assumptions };
}

export function resolveMetricFromPrompt(prompt: string): MetricDefinition | undefined {
  return resolveMetricsFromPrompt(prompt).metrics[0];
}

export function resolveGroupByFromPrompt(prompt: string): "day" | "week" | "month" {
  if (/\bmonth/i.test(prompt)) return "month";
  if (/\bday|daily/i.test(prompt)) return "day";
  return "week";
}

export function resolveDateRangeFromPrompt(prompt: string, endDate: string): { startDate: string; endDate: string; label: string } {
  const end = new Date(`${endDate}T00:00:00Z`);
  const text = prompt.toLowerCase();

  const lastDaysMatch = text.match(/\blast\s+(\d+)\s+days?\b/);
  if (lastDaysMatch) {
    const days = Number(lastDaysMatch[1]);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate,
      label: `last ${days} days`,
    };
  }

  if (/\blast 30 days\b/.test(text)) {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    return { startDate: start.toISOString().slice(0, 10), endDate, label: "last 30 days" };
  }

  if (/\blast 7 days\b|\bthis week\b/.test(text)) {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return { startDate: start.toISOString().slice(0, 10), endDate, label: "last 7 days" };
  }

  const lastMonthsMatch = text.match(/\blast\s+(\d+)\s+months?\b/);
  const months = Math.max(1, Number(lastMonthsMatch?.[1] ?? 6));
  const start = new Date(end);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate,
    label: `last ${months} month${months === 1 ? "" : "s"}`,
  };
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

export function metricsAreCompatibleForCombinedTimeseries(
  metrics: MetricDefinition[],
): boolean {
  if (metrics.length === 0) return false;
  const [first] = metrics;
  const valueFormats = new Set(
    metrics.map((metric) => metricValueFormat(metric.id)),
  );
  return (
    first.source === "lightspeed_sales" &&
    valueFormats.size <= 2 &&
    metrics.every(
      (metric) =>
        metric.source === first.source &&
        metric.dateField === first.dateField &&
        metric.timezone === first.timezone,
    )
  );
}

export function buildMultiCatalogMetricTimeseriesSql(
  metrics: MetricDefinition[],
  args: {
    startDate: string;
    endDate: string;
    groupBy: "day" | "week" | "month";
  },
): string {
  if (!metricsAreCompatibleForCombinedTimeseries(metrics)) {
    throw new Error("Metrics cannot be combined on one governed timeseries.");
  }
  const [first] = metrics;
  const view = metricSourceView(first.source);
  const filters = [
    `${first.dateField} >= ${sqlLiteral(args.startDate)}::date`,
    `${first.dateField} < (${sqlLiteral(args.endDate)}::date + interval '1 day')`,
  ];
  const metricSelects = metrics.map((metric) => {
    const expression =
      metric.defaultFilters.length > 0 && /^(SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(metric.sqlExpression)
        ? `${metric.sqlExpression} FILTER (WHERE ${metric.defaultFilters.join(" AND ")})`
        : metric.sqlExpression;
    return `${expression} AS ${metric.id}`;
  });
  const needsProfitCoverage = metrics.some(
    (metric) =>
      metric.id === "gross_profit" || metric.id === "gross_margin_pct",
  );
  const coverageSelects = needsProfitCoverage
    ? [
        "COUNT(*) FILTER (WHERE cost IS NOT NULL OR profit IS NOT NULL) AS profit_covered_lines",
        "COUNT(*) AS total_sale_lines",
      ]
    : [];

  return `
SELECT
  date_trunc('${args.groupBy}', ${first.dateField} AT TIME ZONE '${first.timezone}') AS period,
  ${[...metricSelects, ...coverageSelects].join(",\n  ")},
  MAX(synced_at) AS data_freshness
FROM ${view}
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
  const resolution = resolveMetricsFromPrompt(prompt);
  return (
    /\b(graph|chart|trend|plot|visuali[sz]e|line)\b/i.test(prompt) &&
    (resolution.metrics.length > 0 || Boolean(resolution.clarification)) &&
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
  metric_id?: string;
  metric_ids?: string[];
  segment_query?: string;
  assumptions?: string[];
  needs_clarification?: boolean;
  suggested_prompts?: Array<{ label: string; prompt: string }>;
  error?: string;
};
