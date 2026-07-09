import assert from "node:assert/strict";
import {
  buildCatalogMetricTimeseriesSql,
  buildMultiCatalogMetricTimeseriesSql,
  buildMultiMetricTimeseriesChartForRows,
  buildProductSegmentTimeseriesSql,
  buildTimeseriesChartForRows,
  extractSegmentQueryFromPrompt,
  looksLikeMetricTimeseriesPrompt,
  looksLikeQuickChartPrompt,
  looksLikeSegmentChartPrompt,
  resolveDateRangeFromPrompt,
  resolveMetricFromPrompt,
  resolveMetricsFromPrompt,
} from "../src/lib/metrics/metric-chart-runner";
import { searchMetrics, getMetricById } from "../src/lib/metrics/metric-catalog";
import { buildGenericSqlChart } from "../src/lib/genie/lightspeed-sql-visual";

const prompt = "show me a graph with total general services sold each week";

assert.equal(extractSegmentQueryFromPrompt(prompt), "general services");
assert.equal(looksLikeSegmentChartPrompt(prompt), true);

const netSalesPrompt = "Build a line chart of net sales by day for the last 30 days";
assert.equal(looksLikeMetricTimeseriesPrompt(netSalesPrompt), true);
assert.equal(looksLikeQuickChartPrompt(netSalesPrompt), true);

const metric = resolveMetricFromPrompt(netSalesPrompt);
assert.ok(metric);
assert.equal(metric?.id, "net_sales");

const range = resolveDateRangeFromPrompt(netSalesPrompt, "2026-07-06");
assert.equal(range.label, "last 30 days");

const catalogSql = buildCatalogMetricTimeseriesSql(metric!, {
  startDate: range.startDate,
  endDate: range.endDate,
  groupBy: "day",
});
assert.match(catalogSql, /date_trunc\('day'/);
assert.match(catalogSql, /SUM\(subtotal\)/);

const multiMetricPrompt =
  "Show me a line chart with gross profit and sales for the last 6 months on one chart with two lines";
const multiResolution = resolveMetricsFromPrompt(multiMetricPrompt);
assert.deepEqual(
  multiResolution.metrics.map((candidate) => candidate.id),
  ["gross_profit", "net_sales"],
);
assert.deepEqual(multiResolution.assumptions, [
  "Sales means Net Sales (after discounts, excluding tax).",
]);
assert.equal(looksLikeMetricTimeseriesPrompt(multiMetricPrompt), true);

const sixMonthRange = resolveDateRangeFromPrompt(multiMetricPrompt, "2026-07-10");
assert.deepEqual(sixMonthRange, {
  startDate: "2026-02-01",
  endDate: "2026-07-10",
  label: "last 6 months",
});

const grossProfitMetric = getMetricById("gross_profit");
const netSalesMetric = getMetricById("net_sales");
assert.ok(grossProfitMetric);
assert.ok(netSalesMetric);

const multiSql = buildMultiCatalogMetricTimeseriesSql(
  [grossProfitMetric!, netSalesMetric!],
  {
    startDate: sixMonthRange.startDate,
    endDate: sixMonthRange.endDate,
    groupBy: "month",
  },
);
assert.match(multiSql, /AS gross_profit/);
assert.match(multiSql, /AS net_sales/);
assert.match(multiSql, /MAX\(synced_at\) AS data_freshness/);
assert.match(
  multiSql,
  /FILTER \(WHERE cost IS NOT NULL OR profit IS NOT NULL\) AS gross_profit/,
);
assert.match(multiSql, /AS profit_covered_lines/);
assert.match(multiSql, /AS total_sale_lines/);
assert.doesNotMatch(
  multiSql,
  /interval '1 day'\) AND cost IS NOT NULL/,
  "gross-profit completeness rules must not remove net-sales rows from the shared period",
);

const multiChart = buildMultiMetricTimeseriesChartForRows({
  title: "Gross Profit and Net Sales by month",
  subtitle: "1 Feb 2026 to 10 Jul 2026",
  rows: [
    {
      period: "2026-02-01T00:00:00.000Z",
      gross_profit: 1000,
      net_sales: 5000,
    },
    {
      period: "2026-03-01T00:00:00.000Z",
      gross_profit: 1200,
      net_sales: 5200,
    },
  ],
  metrics: [grossProfitMetric!, netSalesMetric!],
  kind: "line",
  sourceLabel: "Lightspeed sales mirror",
});
assert.ok(multiChart);
assert.equal(multiChart?.series.length, 2);
assert.equal(multiChart?.series[0]?.format, "currency");
assert.equal(multiChart?.data[0]?.gross_profit, 1000);
assert.equal(multiChart?.data[0]?.net_sales, 5000);
assert.equal(multiChart?.sourceLabel, "Lightspeed sales mirror");

const missingProfitChart = buildMultiMetricTimeseriesChartForRows({
  title: "Missing profit coverage",
  rows: [{ period: "2026-02-01T00:00:00.000Z", gross_profit: null, net_sales: 5000 }],
  metrics: [grossProfitMetric!, netSalesMetric!],
});
assert.equal(
  missingProfitChart?.data[0]?.gross_profit,
  null,
  "missing metric values must remain gaps instead of becoming zero",
);

const bareSalesResolution = resolveMetricsFromPrompt("Show me a line chart of sales last month");
assert.equal(bareSalesResolution.metrics.length, 0);
assert.equal(
  bareSalesResolution.clarification,
  "When you say sales, do you mean Net Sales (after discounts, excluding tax) or Gross Sales (including tax)?",
);

const sql = buildProductSegmentTimeseriesSql({
  segmentQuery: "general service",
  startDate: "2025-12-01",
  endDate: "2026-07-06",
  groupBy: "week",
  measure: "units_sold",
});

assert.match(sql, /date_trunc\('week'/);
assert.match(sql, /genie_lightspeed_sales_report_lines/);
assert.match(sql, /general/);
assert.match(sql, /service/);

const chart = buildTimeseriesChartForRows({
  title: "General service units by week",
  rows: [
    { period: "2026-01-05T00:00:00.000Z", metric_value: 12, sale_lines: 14 },
    { period: "2026-01-12T00:00:00.000Z", metric_value: 9, sale_lines: 10 },
  ],
  kind: "line",
  valueFormat: "number",
});

assert.ok(chart);
assert.equal(chart?.kind, "line");
assert.equal(chart?.data.length, 2);
assert.equal(chart?.data[0]?.metric_value, 12);

const unitsMetric = getMetricById("units_sold");
assert.ok(unitsMetric);
assert.ok(searchMetrics("units sold").some((metric) => metric.id === "units_sold"));

assert.equal(getMetricById("net_sales")?.sqlExpression, "SUM(subtotal)");
assert.equal(getMetricById("gross_sales")?.sqlExpression, "SUM(total)");
assert.match(getMetricById("gross_profit")?.sqlExpression ?? "", /subtotal/);
assert.equal(getMetricById("net_sales")?.timezone, "Australia/Brisbane");

const mixedFormatChart = buildGenericSqlChart(
  [
    { period: "2026-06", net_sales: "12000.50", units_sold: "42" },
    { period: "2026-07", net_sales: "13800.25", units_sold: "48" },
  ],
  {
    chart_kind: "line",
    chart_x_key: "period",
    chart_y_keys: ["net_sales", "units_sold"],
  },
);
assert.ok(mixedFormatChart);
assert.equal(mixedFormatChart?.series.length, 2);
assert.deepEqual(
  mixedFormatChart?.series.map((series) => series.format),
  ["currency", "number"],
);
assert.equal(mixedFormatChart?.valueFormatter, undefined);
assert.equal(mixedFormatChart?.data[0]?.net_sales, 12000.5);

console.log("metrics chart tests passed");
