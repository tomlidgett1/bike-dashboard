import { tool } from "@openai/agents";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW,
  GENIE_LIGHTSPEED_SQL_VIEW,
} from "@/lib/genie/agent/sql-constants";
import { getWebTrackingAnalytics } from "@/lib/store/web-tracking-analytics";
import {
  getMetricById,
  metricSourceView,
  searchMetrics,
  type MetricDefinition,
} from "@/lib/metrics/metric-catalog";
import type { Emit, VisualPrefs } from "@/lib/genie/agent/tools";
import type { GenieChartPayload, GenieTablePayload } from "@/lib/genie/visual-payloads";
import { getStoreToday } from "@/lib/genie/agent/runtime";

export const METRIC_CATALOG_TOOL_NAMES = [
  "search_metrics",
  "get_metric_definition",
  "get_dimensions_for_metric",
  "check_data_freshness",
  "run_metric_query",
  "run_segment_breakdown",
  "run_product_segment_timeseries",
] as const;

import {
  buildProductSegmentTimeseriesSql,
  buildTimeseriesChartForRows,
  formatPeriodLabel,
  sqlLiteral,
} from "@/lib/metrics/metric-chart-runner";
import { executeMetricSqlForUser } from "@/lib/metrics/metric-sql-executor";

function defaultLookbackStartDate(endDate: string, months = 6): string {
  const end = new Date(`${endDate}T00:00:00`);
  end.setMonth(end.getMonth() - months);
  return end.toISOString().slice(0, 10);
}

function emitMetricChart(
  emit: Emit,
  prefs: VisualPrefs,
  chart: GenieChartPayload | undefined,
) {
  if (prefs.chart && chart) {
    emit({ event: "chart", chart });
  }
}

function emitMetricTable(
  emit: Emit,
  prefs: VisualPrefs,
  table: GenieTablePayload | undefined,
) {
  if (prefs.table && table) {
    emit({ event: "table", table });
  }
}

function buildTimeseriesChart(args: {
  title: string;
  subtitle?: string;
  rows: Array<Record<string, unknown>>;
  xKey?: string;
  yKey?: string;
  kind?: "line" | "bar";
  valueFormat?: "number" | "currency" | "percent";
}): GenieChartPayload | undefined {
  return buildTimeseriesChartForRows(args);
}

async function executeMetricSql(userId: string, sql: string, limit = 500) {
  return executeMetricSqlForUser(userId, sql, limit);
}

function buildSalesMetricSql(
  metric: MetricDefinition,
  args: {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    groupByTime?: "day" | "week" | "month";
  },
): string {
  const view = GENIE_LIGHTSPEED_SQL_VIEW;
  const filters = [
    `${metric.dateField} >= ${sqlLiteral(args.startDate)}::date`,
    `${metric.dateField} < (${sqlLiteral(args.endDate)}::date + interval '1 day')`,
    ...metric.defaultFilters,
  ];

  const selectParts: string[] = [];
  const groupParts: string[] = [];

  if (args.groupByTime) {
    const trunc = args.groupByTime === "week" ? "week" : args.groupByTime === "month" ? "month" : "day";
    selectParts.push(
      `date_trunc('${trunc}', ${metric.dateField} AT TIME ZONE '${metric.timezone}') AS period`,
    );
    groupParts.push(`date_trunc('${trunc}', ${metric.dateField} AT TIME ZONE '${metric.timezone}')`);
  }

  for (const dimension of args.dimensions ?? []) {
    if (metric.validDimensions.includes(dimension)) {
      selectParts.push(dimension);
      groupParts.push(dimension);
    }
  }

  selectParts.push(`${metric.sqlExpression} AS metric_value`);

  const groupClause = groupParts.length ? `GROUP BY ${groupParts.join(", ")}` : "";
  const orderClause = groupParts.length ? `ORDER BY ${groupParts[0]} ASC` : "";

  return `
SELECT ${selectParts.join(", ")}
FROM ${view}
WHERE ${filters.join(" AND ")}
${groupClause}
${orderClause}
`.trim();
}

function buildInventoryMetricSql(metric: MetricDefinition, dimensions?: string[]): string {
  const view = GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW;
  const filters = metric.defaultFilters;
  const selectParts: string[] = [];
  const groupParts: string[] = [];

  for (const dimension of dimensions ?? []) {
    if (metric.validDimensions.includes(dimension)) {
      selectParts.push(dimension);
      groupParts.push(dimension);
    }
  }

  selectParts.push(`${metric.sqlExpression} AS metric_value`);

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const groupClause = groupParts.length ? `GROUP BY ${groupParts.join(", ")}` : "";
  const orderClause = groupParts.length ? `ORDER BY metric_value DESC` : "";

  return `
SELECT ${selectParts.join(", ")}
FROM ${view}
${whereClause}
${groupClause}
${orderClause}
`.trim();
}

async function fetchStorefrontMetric(
  userId: string,
  metricId: string,
  startDate: string,
  endDate: string,
) {
  const admin = createServiceRoleClient();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);

  const [web, summary] = await Promise.all([
    getWebTrackingAnalytics(admin, userId),
    admin.rpc("get_store_analytics_summary", {
      p_store_owner_id: userId,
      p_days: Math.min(days, 90),
    }),
  ]);

  const summaryData = summary.data as {
    summary?: Record<string, number>;
    daily?: Array<{ date: string; distinct_viewers?: number; product_views?: number }>;
  } | null;

  if (metricId === "store_views") {
    return {
      status: "ok" as const,
      metric_value: summaryData?.summary?.distinct_viewers ?? web.rolling7Days.totalDistinctViewers ?? 0,
      period_label: `${startDate} to ${endDate}`,
      daily: summaryData?.daily?.map((row) => ({
        period: row.date,
        metric_value: row.distinct_viewers ?? 0,
      })),
    };
  }

  if (metricId === "product_views") {
    return {
      status: "ok" as const,
      metric_value: summaryData?.summary?.product_views ?? 0,
      period_label: `${startDate} to ${endDate}`,
      daily: summaryData?.daily?.map((row) => ({
        period: row.date,
        metric_value: row.product_views ?? 0,
      })),
    };
  }

  return { status: "error" as const, error: "Unsupported storefront metric." };
}

async function checkFreshnessForUser(userId: string) {
  const admin = createServiceRoleClient();
  const issues: Array<{
    type: string;
    table: string;
    last_updated: string | null;
    impact: string;
  }> = [];

  const { data: salesFreshness } = await admin
    .from("lightspeed_sales_report_lines")
    .select("synced_at")
    .eq("user_id", userId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const salesSyncedAt = salesFreshness?.synced_at as string | null;
  if (salesSyncedAt) {
    const hoursAgo = (Date.now() - new Date(salesSyncedAt).getTime()) / 3_600_000;
    if (hoursAgo > 24) {
      issues.push({
        type: "freshness",
        table: "lightspeed_sales_report_lines",
        last_updated: salesSyncedAt,
        impact: "Sales and margin analysis may be stale.",
      });
    }
  } else {
    issues.push({
      type: "missing_data",
      table: "lightspeed_sales_report_lines",
      last_updated: null,
      impact: "No Lightspeed sales mirror found for this store.",
    });
  }

  const { data: analyticsFreshness } = await admin
    .from("store_analytics_events")
    .select("created_at")
    .eq("store_owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const analyticsAt = analyticsFreshness?.created_at as string | null;
  if (analyticsAt) {
    const hoursAgo = (Date.now() - new Date(analyticsAt).getTime()) / 3_600_000;
    if (hoursAgo > 4) {
      issues.push({
        type: "freshness",
        table: "store_analytics_events",
        last_updated: analyticsAt,
        impact: "Storefront traffic metrics may be incomplete.",
      });
    }
  }

  return {
    data_quality_status: issues.length ? "warning" : "ok",
    issues,
    safe_to_answer: issues.every((issue) => issue.type !== "missing_data"),
  };
}

export function buildMetricCatalogTools(userId: string, emit: Emit, visualPrefs: VisualPrefs) {
  const emitStatus = (phase: string, text: string) => {
    emit({ event: "status", phase, text });
  };

  return [
    tool({
      name: "search_metrics",
      description:
        "Search the approved metric catalog by business term. Always call this before running analysis to ground revenue, margin, traffic, or inventory questions in governed definitions.",
      parameters: z.object({
        query: z.string().describe("Business term, e.g. revenue, margin, traffic, units sold"),
        limit: z.number().int().min(1).max(12).optional(),
      }),
      async execute({ query, limit }) {
        emitStatus("metrics", `Searching metric catalog for "${query.trim()}"`);
        const results = searchMetrics(query, limit ?? 8);
        return {
          count: results.length,
          metrics: results.map((metric) => ({
            id: metric.id,
            label: metric.label,
            description: metric.description,
            source: metric.source,
            owner: metric.owner,
          })),
        };
      },
    }),
    tool({
      name: "get_metric_definition",
      description:
        "Fetch the full approved definition for a catalog metric id, including expression, grain, filters, dimensions, and caveats.",
      parameters: z.object({
        metric_id: z.string().min(1),
      }),
      async execute({ metric_id }) {
        const metric = getMetricById(metric_id);
        if (!metric) {
          return { found: false, metric_id, message: "Unknown metric id. Call search_metrics first." };
        }
        emitStatus("metrics", `Loaded definition for ${metric.label}`);
        return {
          found: true,
          metric: {
            id: metric.id,
            label: metric.label,
            owner: metric.owner,
            description: metric.description,
            source: metric.source,
            grain: metric.grain,
            sql_expression: metric.sqlExpression,
            date_field: metric.dateField,
            timezone: metric.timezone,
            default_filters: metric.defaultFilters,
            valid_dimensions: metric.validDimensions,
            caveats: metric.caveats,
            freshness_sla_hours: metric.freshnessSlaHours,
            common_misinterpretations: metric.commonMisinterpretations,
            source_view: metricSourceView(metric.source),
          },
        };
      },
    }),
    tool({
      name: "get_dimensions_for_metric",
      description: "List valid breakdown dimensions for a catalog metric.",
      parameters: z.object({
        metric_id: z.string().min(1),
      }),
      async execute({ metric_id }) {
        const metric = getMetricById(metric_id);
        if (!metric) return { found: false, metric_id };
        return {
          found: true,
          metric_id,
          dimensions: metric.validDimensions,
        };
      },
    }),
    tool({
      name: "check_data_freshness",
      description:
        "Run data quality checks before answering. Returns freshness warnings for sales mirror and storefront analytics.",
      parameters: z.object({}),
      async execute() {
        emitStatus("metrics", "Checking data freshness");
        return checkFreshnessForUser(userId);
      },
    }),
    tool({
      name: "run_metric_query",
      description:
        "Run a governed metric query using approved catalog definitions. Prefer this over freestyle SQL for standard KPI questions.",
      parameters: z.object({
        metric_id: z.string().min(1),
        start_date: z.string().describe("YYYY-MM-DD inclusive"),
        end_date: z.string().describe("YYYY-MM-DD inclusive"),
        dimensions: z.array(z.string()).optional(),
        group_by_time: z.enum(["day", "week", "month"]).optional(),
        purpose: z.string().optional(),
      }),
      async execute(args) {
        const metric = getMetricById(args.metric_id);
        if (!metric) {
          return { status: "error", error: "Unknown metric id." };
        }

        emitStatus("metrics", `Running ${metric.label} query`);

        if (metric.source === "storefront_analytics") {
          return fetchStorefrontMetric(userId, metric.id, args.start_date, args.end_date);
        }

        const sql =
          metric.source === "lightspeed_inventory"
            ? buildInventoryMetricSql(metric, args.dimensions)
            : buildSalesMetricSql(metric, {
                startDate: args.start_date,
                endDate: args.end_date,
                dimensions: args.dimensions,
                groupByTime: args.group_by_time,
              });

        emit({
          event: "analysis_query",
          query: {
            id: randomUUID(),
            at: new Date().toISOString(),
            tool_name: "run_metric_query",
            purpose: args.purpose ?? `${metric.label} query`,
            sql,
            status: "running",
          },
        });

        const result = await executeMetricSql(userId, sql);

        emit({
          event: "analysis_query",
          query: {
            id: randomUUID(),
            at: new Date().toISOString(),
            tool_name: "run_metric_query",
            purpose: args.purpose ?? `${metric.label} query`,
            sql,
            status: result.status === "ok" ? "ok" : "error",
            row_count: result.row_count ?? null,
            error: result.status === "error" ? result.error : null,
          },
        });

        if (result.status === "ok" && args.group_by_time && result.rows.length > 0) {
          const chart = buildTimeseriesChart({
            title: args.purpose ?? `${metric.label} over time`,
            subtitle: `${args.start_date} to ${args.end_date}`,
            rows: result.rows,
            yKey: "metric_value",
            kind: "line",
            valueFormat: /margin|percent|pct/i.test(metric.id) ? "percent" : /sales|profit|value|revenue/i.test(metric.id) ? "currency" : "number",
          });
          emitMetricChart(emit, visualPrefs, chart);
          const table: GenieTablePayload = {
            title: args.purpose ?? `${metric.label} over time`,
            subtitle: `${args.start_date} to ${args.end_date}`,
            columns: [
              { key: "period", label: "Period" },
              { key: "metric_value", label: metric.label, align: "right", format: "number" },
            ],
            rows: result.rows.slice(0, 120).map((row) => ({
              period: formatPeriodLabel(row.period),
              metric_value: Number(row.metric_value) || 0,
            })),
          };
          emitMetricTable(emit, visualPrefs, table);
        }

        return {
          metric_id: metric.id,
          label: metric.label,
          status: result.status,
          row_count: result.row_count ?? 0,
          rows: result.rows.slice(0, 50),
          sql,
        };
      },
    }),
    tool({
      name: "run_segment_breakdown",
      description:
        "Compare a metric between two periods and rank segment contributions to the change. Use for 'why did X change' questions.",
      parameters: z.object({
        metric_id: z.string().min(1),
        current_start: z.string(),
        current_end: z.string(),
        comparison_start: z.string(),
        comparison_end: z.string(),
        dimension: z.string(),
        purpose: z.string().optional(),
      }),
      async execute(args) {
        const metric = getMetricById(args.metric_id);
        if (!metric) return { status: "error", error: "Unknown metric id." };
        if (!metric.validDimensions.includes(args.dimension)) {
          return {
            status: "error",
            error: `Dimension "${args.dimension}" is not valid for ${metric.id}.`,
            valid_dimensions: metric.validDimensions,
          };
        }
        if (metric.source === "storefront_analytics") {
          return {
            status: "error",
            error: "Segment breakdown is not yet supported for storefront metrics. Use run_metric_query with daily grouping.",
          };
        }

        emitStatus("metrics", `Breaking down ${metric.label} by ${args.dimension}`);

        const buildPeriodSql = (start: string, end: string) => `
SELECT ${args.dimension} AS segment, ${metric.sqlExpression} AS metric_value
FROM ${metricSourceView(metric.source)}
WHERE ${metric.dateField} >= ${sqlLiteral(start)}::date
  AND ${metric.dateField} < (${sqlLiteral(end)}::date + interval '1 day')
  ${metric.defaultFilters.length ? `AND ${metric.defaultFilters.join(" AND ")}` : ""}
GROUP BY 1
ORDER BY metric_value DESC
LIMIT 100
`.trim();

        const currentSql = buildPeriodSql(args.current_start, args.current_end);
        const comparisonSql = buildPeriodSql(args.comparison_start, args.comparison_end);

        const [current, comparison] = await Promise.all([
          executeMetricSql(userId, currentSql),
          executeMetricSql(userId, comparisonSql),
        ]);

        if (current.status === "error" || comparison.status === "error") {
          return {
            status: "error",
            error: current.error ?? comparison.error,
          };
        }

        const comparisonMap = new Map<string, number>();
        for (const row of comparison.rows) {
          comparisonMap.set(String(row.segment ?? "Unknown"), Number(row.metric_value) || 0);
        }

        const segments = current.rows.map((row) => {
          const segment = String(row.segment ?? "Unknown");
          const currentValue = Number(row.metric_value) || 0;
          const comparisonValue = comparisonMap.get(segment) ?? 0;
          const absoluteChange = currentValue - comparisonValue;
          return { segment, current_value: currentValue, comparison_value: comparisonValue, absolute_change: absoluteChange };
        });

        const totalChange = segments.reduce((sum, row) => sum + row.absolute_change, 0);
        const ranked = segments
          .map((row) => ({
            ...row,
            contribution_to_total_change:
              totalChange === 0 ? 0 : row.absolute_change / totalChange,
          }))
          .sort((a, b) => Math.abs(b.absolute_change) - Math.abs(a.absolute_change))
          .slice(0, 15);

        const currentTotal = segments.reduce((sum, row) => sum + row.current_value, 0);
        const comparisonTotal = segments.reduce((sum, row) => sum + row.comparison_value, 0);

        return {
          status: "ok",
          metric_id: metric.id,
          label: metric.label,
          dimension: args.dimension,
          current_period: { start: args.current_start, end: args.current_end, total: currentTotal },
          comparison_period: { start: args.comparison_start, end: args.comparison_end, total: comparisonTotal },
          absolute_change: currentTotal - comparisonTotal,
          pct_change: comparisonTotal === 0 ? null : (currentTotal - comparisonTotal) / comparisonTotal,
          top_segments: ranked,
          sql: { current: currentSql, comparison: comparisonSql },
        };
      },
    }),
    tool({
      name: "run_product_segment_timeseries",
      description:
        "Build a weekly/daily/monthly chart for a product or service segment such as 'general service', 'full service', or 'flat repair'. Resolves store-specific naming via description/category filters, runs governed SQL, and emits a chart. Use for graph/chart requests about specific services or product groups.",
      parameters: z.object({
        segment_query: z.string().min(2).describe('Business segment phrase, e.g. "general service", "full service", "bike fit"'),
        start_date: z.string().optional().describe("YYYY-MM-DD inclusive. Defaults to 6 months ago."),
        end_date: z.string().optional().describe("YYYY-MM-DD inclusive. Defaults to today."),
        group_by: z.enum(["day", "week", "month"]).optional().describe("Time bucket. Defaults to week for graph requests."),
        measure: z.enum(["units_sold", "net_sales"]).optional().describe("Defaults to units_sold for service volume charts."),
        chart_title: z.string().optional(),
        purpose: z.string().optional(),
      }),
      async execute(args) {
        const endDate = args.end_date?.trim() || getStoreToday();
        const startDate = args.start_date?.trim() || defaultLookbackStartDate(endDate, 6);
        const groupBy = args.group_by ?? "week";
        const measure = args.measure ?? "units_sold";
        const title =
          args.chart_title?.trim() ||
          `${args.segment_query} ${measure === "units_sold" ? "units" : "sales"} by ${groupBy}`;

        emitStatus("metrics", `Building ${groupBy}ly chart for "${args.segment_query.trim()}"`);

        const sql = buildProductSegmentTimeseriesSql({
          segmentQuery: args.segment_query,
          startDate,
          endDate,
          groupBy,
          measure,
        });

        const queryId = randomUUID();
        emit({
          event: "analysis_query",
          query: {
            id: queryId,
            at: new Date().toISOString(),
            tool_name: "run_product_segment_timeseries",
            purpose: args.purpose ?? title,
            sql,
            status: "running",
          },
        });

        const result = await executeMetricSql(userId, sql, 200);

        emit({
          event: "analysis_query",
          query: {
            id: queryId,
            at: new Date().toISOString(),
            tool_name: "run_product_segment_timeseries",
            purpose: args.purpose ?? title,
            sql,
            status: result.status === "ok" ? "ok" : "error",
            row_count: result.row_count ?? null,
            error: result.status === "error" ? result.error : null,
          },
        });

        if (result.status !== "ok") {
          return { status: "error", error: result.error, sql };
        }

        const rows = result.rows;
        const chart = buildTimeseriesChart({
          title,
          subtitle: `${startDate} to ${endDate} · matched on "${args.segment_query.trim()}"`,
          rows,
          kind: "line",
          valueFormat: measure === "net_sales" ? "currency" : "number",
        });
        emitMetricChart(emit, visualPrefs, chart);

        const table: GenieTablePayload = {
          title,
          subtitle: `${startDate} to ${endDate}`,
          columns: [
            { key: "period", label: "Period" },
            { key: "metric_value", label: measure === "units_sold" ? "Units sold" : "Net sales", align: "right", format: measure === "net_sales" ? "currency" : "number" },
            { key: "sale_lines", label: "Sale lines", align: "right", format: "number" },
          ],
          rows: rows.map((row) => ({
            period: formatPeriodLabel(row.period),
            metric_value: Number(row.metric_value) || 0,
            sale_lines: Number(row.sale_lines) || 0,
          })),
        };
        emitMetricTable(emit, visualPrefs, table);

        return {
          status: "ok",
          segment_query: args.segment_query,
          measure,
          group_by: groupBy,
          row_count: result.row_count ?? rows.length,
          rows: rows.slice(0, 52),
          chart_emitted: Boolean(chart),
          table_emitted: Boolean(table),
          sql,
        };
      },
    }),
  ];
}

export function buildMetricsAgentInstructions(): string {
  return `
METRICS ANALYSIS SURFACE
You are operating in the store Metrics workspace — a governed analysis environment, not a freestyle SQL chatbot.

Required workflow for analytical questions:
1. Classify intent (trend, root cause, ranking, dashboard build, monitor).
2. Call search_metrics then get_metric_definition to ground business terms in approved definitions.
3. Call check_data_freshness before synthesising an answer.
4. Plan 3–8 diagnostic steps (topline, trend, segment breakdown, ranking, outliers).
5. Prefer run_product_segment_timeseries for service/product segment charts (e.g. "general service sold each week").
6. Prefer run_metric_query and run_segment_breakdown for catalog KPIs.
7. Use run_lightspeed_sql_query only when the catalog cannot answer the question — label it as analyst sandbox mode.
8. Always emit a chart when the user asks for a graph, chart, or trend line.
9. Synthesise: answer, driver ranking, confidence, caveats, recommended actions.

Never guess whether "revenue" means gross sales, net sales, or storefront views — resolve via the catalog first.
Timezone for date interpretation: Australia/Melbourne.
`.trim();
}
