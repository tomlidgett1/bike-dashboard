import assert from "node:assert/strict";
import {
  buildCatalogMetricTimeseriesSql,
  buildProductSegmentTimeseriesSql,
  buildTimeseriesChartForRows,
  extractSegmentQueryFromPrompt,
  looksLikeMetricTimeseriesPrompt,
  looksLikeQuickChartPrompt,
  looksLikeSegmentChartPrompt,
  resolveDateRangeFromPrompt,
  resolveMetricFromPrompt,
} from "../src/lib/metrics/metric-chart-runner";
import { searchMetrics, getMetricById } from "../src/lib/metrics/metric-catalog";

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
assert.match(catalogSql, /SUM\(total\)/);

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

console.log("metrics chart tests passed");
