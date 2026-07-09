import "server-only";

import { getStoreToday } from "@/lib/genie/agent/runtime";
import type { GenieTablePayload } from "@/lib/genie/visual-payloads";
import {
  buildMultiCatalogMetricTimeseriesSql,
  buildMultiMetricTimeseriesChartForRows,
  buildProductSegmentTimeseriesSql,
  buildTimeseriesChartForRows,
  extractSegmentQueryFromPrompt,
  formatPeriodLabel,
  looksLikeMetricTimeseriesPrompt,
  metricValueFormat,
  metricsAreCompatibleForCombinedTimeseries,
  resolveDateRangeFromPrompt,
  resolveGroupByFromPrompt,
  resolveMetricsFromPrompt,
  type QuickChartResponse,
} from "@/lib/metrics/metric-chart-runner";
import {
  STORE_METRIC_TIMEZONE,
  type MetricDefinition,
} from "@/lib/metrics/metric-catalog";
import { executeMetricSqlForUser } from "@/lib/metrics/metric-sql-executor";

export type GovernedQuickChartResult =
  | {
      status: "ok";
      response: QuickChartResponse;
      rowCount: number;
    }
  | {
      status: "clarify";
      response: QuickChartResponse;
    }
  | {
      status: "fallback";
      reason: string;
      sql?: string;
    };

function formatMetricValue(value: number, metricId: string): string {
  const format = metricValueFormat(metricId);
  if (format === "currency") {
    return value.toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    });
  }
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString("en-AU", { maximumFractionDigits: 1 });
}

function joinMetricLabels(metrics: MetricDefinition[]): string {
  const labels = metrics.map((metric) => metric.label);
  if (labels.length <= 1) return labels[0] ?? "Metric";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function latestFreshnessLabel(rows: Array<Record<string, unknown>>): string | undefined {
  const timestamps = rows
    .map((row) => Date.parse(String(row.data_freshness ?? "")))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return undefined;
  return `Data synced ${new Intl.DateTimeFormat("en-AU", {
    timeZone: STORE_METRIC_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Math.max(...timestamps)))}`;
}

function profitCoverageLabel(
  metrics: MetricDefinition[],
  rows: Array<Record<string, unknown>>,
): string | undefined {
  if (
    !metrics.some(
      (metric) =>
        metric.id === "gross_profit" || metric.id === "gross_margin_pct",
    )
  ) {
    return undefined;
  }
  const covered = rows.reduce(
    (sum, row) => sum + (Number(row.profit_covered_lines) || 0),
    0,
  );
  const total = rows.reduce(
    (sum, row) => sum + (Number(row.total_sale_lines) || 0),
    0,
  );
  if (total <= 0) return undefined;
  return `Gross profit cost coverage ${((covered / total) * 100).toFixed(1)}% (${covered.toLocaleString("en-AU")} of ${total.toLocaleString("en-AU")} lines)`;
}

function metricTrendSummary(
  metric: MetricDefinition,
  rows: Array<Record<string, unknown>>,
): string {
  const first = Number(rows[0]?.[metric.id]) || 0;
  const last = Number(rows.at(-1)?.[metric.id]) || 0;
  if (rows.length < 2 || first === 0) {
    return `${metric.label} is ${formatMetricValue(last, metric.id)} in the latest period.`;
  }
  const change = ((last - first) / Math.abs(first)) * 100;
  if (Math.abs(change) < 0.05) return `${metric.label} was broadly flat`;
  return `${metric.label} ${change > 0 ? "rose" : "fell"} ${Math.abs(change).toFixed(1)}%`;
}

function buildMetricTable(
  metrics: MetricDefinition[],
  rows: Array<Record<string, unknown>>,
  title: string,
  subtitle: string,
): GenieTablePayload {
  return {
    title,
    subtitle,
    columns: [
      { key: "period", label: "Period" },
      ...metrics.map((metric) => ({
        key: metric.id,
        label: metric.label,
        align: "right" as const,
        format: metricValueFormat(metric.id),
      })),
    ],
    rows: rows.map((row) => ({
      period: formatPeriodLabel(row.period),
      ...Object.fromEntries(
        metrics.map((metric) => [metric.id, Number(row[metric.id]) || 0]),
      ),
    })),
  };
}

export async function runGovernedQuickChart(args: {
  userId: string;
  prompt: string;
  segmentQueryOverride?: string;
}): Promise<GovernedQuickChartResult> {
  const prompt = args.prompt.trim();
  const endDate = getStoreToday();
  const groupBy = resolveGroupByFromPrompt(prompt);
  const range = resolveDateRangeFromPrompt(prompt, endDate);

  if (looksLikeMetricTimeseriesPrompt(prompt)) {
    const resolution = resolveMetricsFromPrompt(prompt);
    if (resolution.clarification) {
      return {
        status: "clarify",
        response: {
          content: resolution.clarification,
          assumptions: resolution.assumptions,
          needs_clarification: true,
          suggested_prompts: [
            {
              label: "Use Net Sales",
              prompt: prompt.replace(/\bsales\b/i, "net sales"),
            },
            {
              label: "Use Gross Sales",
              prompt: prompt.replace(/\bsales\b/i, "gross sales"),
            },
          ],
        },
      };
    }

    const metrics = resolution.metrics;
    if (!metricsAreCompatibleForCombinedTimeseries(metrics)) {
      return {
        status: "fallback",
        reason: "The requested metrics do not share one governed Lightspeed timeseries.",
      };
    }

    const sql = buildMultiCatalogMetricTimeseriesSql(metrics, {
      startDate: range.startDate,
      endDate: range.endDate,
      groupBy,
    });
    const result = await executeMetricSqlForUser(args.userId, sql, 200);
    if (result.status === "error") {
      return { status: "fallback", reason: result.error, sql };
    }

    const metricLabels = joinMetricLabels(metrics);
    const title = `${metricLabels} by ${groupBy}`;
    const subtitle = `${range.startDate} to ${range.endDate} · ${groupBy} buckets · AUD`;
    const freshnessLabel = [
      latestFreshnessLabel(result.rows),
      profitCoverageLabel(metrics, result.rows),
    ].filter(Boolean).join(" · ") || undefined;
    const chart = buildMultiMetricTimeseriesChartForRows({
      title,
      subtitle,
      rows: result.rows,
      metrics,
      kind: /\bbar\b/i.test(prompt) ? "bar" : "line",
      sourceLabel: "Lightspeed sales mirror",
      freshnessLabel,
    });

    const summary = result.rows.length
      ? metrics.map((metric) => metricTrendSummary(metric, result.rows)).join(", while ")
      : "";
    const assumptionText = resolution.assumptions.length
      ? `\n\n${resolution.assumptions.join(" ")}`
      : "";
    const coverageText = profitCoverageLabel(metrics, result.rows);
    const trustText = coverageText ? `\n\n${coverageText}.` : "";
    const content = result.rows.length
      ? `**${summary}.**${assumptionText}${trustText}\n\n${metricLabels} for ${range.label}, grouped by ${groupBy}.`
      : `No ${metricLabels.toLowerCase()} data was found for ${range.label}. Check that Lightspeed sales are synced for this store.${assumptionText}`;

    return {
      status: "ok",
      rowCount: result.row_count,
      response: {
        content,
        chart,
        table: result.rows.length
          ? buildMetricTable(metrics, result.rows, title, subtitle)
          : undefined,
        sql,
        metric_id: metrics.length === 1 ? metrics[0]?.id : undefined,
        metric_ids: metrics.map((metric) => metric.id),
        assumptions: resolution.assumptions,
      },
    };
  }

  const segmentQuery =
    args.segmentQueryOverride?.trim() || extractSegmentQueryFromPrompt(prompt);
  if (!segmentQuery) {
    return { status: "fallback", reason: "Could not determine a governed chart subject." };
  }

  const measure = /\brevenue|sales|\$/i.test(prompt) ? "net_sales" : "units_sold";
  const sql = buildProductSegmentTimeseriesSql({
    segmentQuery,
    startDate: range.startDate,
    endDate: range.endDate,
    groupBy,
    measure,
  });
  const result = await executeMetricSqlForUser(args.userId, sql, 200);
  if (result.status === "error") {
    return { status: "fallback", reason: result.error, sql };
  }

  const metricLabel = measure === "units_sold" ? "Units sold" : "Net sales";
  const title = `${segmentQuery} ${metricLabel.toLowerCase()} by ${groupBy}`;
  const subtitle = `${range.startDate} to ${range.endDate} · ${groupBy} buckets`;
  const baseChart = buildTimeseriesChartForRows({
    title,
    subtitle,
    rows: result.rows,
    kind: "line",
    valueFormat: measure === "net_sales" ? "currency" : "number",
    seriesLabel: metricLabel,
    sourceLabel: "Lightspeed sales mirror",
    freshnessLabel: latestFreshnessLabel(result.rows),
  });
  const chart = baseChart;
  const total = result.rows.reduce(
    (sum, row) => sum + (Number(row.metric_value) || 0),
    0,
  );
  const content = result.rows.length
    ? `**${metricLabel}: ${formatMetricValue(total, measure)} across ${range.label}.**\n\nShowing ${segmentQuery} by ${groupBy}.`
    : `No matching sales were found for "${segmentQuery}" in ${range.label}. The store may label this category differently in Lightspeed; try a broader term such as "service".`;

  return {
    status: "ok",
    rowCount: result.row_count,
    response: {
      content,
      chart,
      table: result.rows.length
        ? {
            title,
            subtitle,
            columns: [
              { key: "period", label: "Period" },
              {
                key: "metric_value",
                label: metricLabel,
                align: "right",
                format: measure === "net_sales" ? "currency" : "number",
              },
              {
                key: "sale_lines",
                label: "Sale lines",
                align: "right",
                format: "number",
              },
            ],
            rows: result.rows.map((row) => ({
              period: formatPeriodLabel(row.period),
              metric_value: Number(row.metric_value) || 0,
              sale_lines: Number(row.sale_lines) || 0,
            })),
          }
        : undefined,
      sql,
      metric_id: measure,
      metric_ids: [measure],
      segment_query: segmentQuery,
    },
  };
}

/** Serialises governed chart results for LLM narration (not shown to the user). */
export function buildGovernedChartNarrationGrounding(response: QuickChartResponse): string {
  const lines: string[] = [];

  if (response.chart) {
    const { chart } = response;
    lines.push(`Chart title: ${chart.title}`);
    if (chart.subtitle) lines.push(`Period: ${chart.subtitle}`);
    if (chart.freshnessLabel) lines.push(chart.freshnessLabel);
    if (chart.sourceLabel) lines.push(`Source: ${chart.sourceLabel}`);
    if (chart.series.length > 0) {
      lines.push(`Series: ${chart.series.map((series) => series.label).join(", ")}`);
    }
    if (chart.data.length > 0) {
      lines.push("Values by period:");
      for (const point of chart.data) {
        const values = chart.series
          .map((series) => {
            const raw = point[series.key];
            return `${series.label}=${raw ?? "n/a"}`;
          })
          .join(", ");
        lines.push(`  ${point.label}: ${values}`);
      }
    }
  }

  if (response.table) {
    lines.push(`Table: ${response.table.title}`);
    if (response.table.subtitle) lines.push(response.table.subtitle);
  }

  if (response.metric_ids?.length) {
    lines.push(`Metric IDs: ${response.metric_ids.join(", ")}`);
  }
  if (response.segment_query) {
    lines.push(`Segment filter: ${response.segment_query}`);
  }
  if (response.assumptions?.length) {
    lines.push(`Assumptions: ${response.assumptions.join(" ")}`);
  }

  return lines.join("\n");
}
