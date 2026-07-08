import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildCatalogMetricTimeseriesSql,
  buildProductSegmentTimeseriesSql,
  buildTimeseriesChartForRows,
  extractSegmentQueryFromPrompt,
  formatPeriodLabel,
  looksLikeMetricTimeseriesPrompt,
  metricValueFormat,
  resolveDateRangeFromPrompt,
  resolveGroupByFromPrompt,
  resolveMetricFromPrompt,
} from "@/lib/metrics/metric-chart-runner";
import { executeMetricSqlForUser } from "@/lib/metrics/metric-sql-executor";
import { getStoreToday } from "@/lib/genie/agent/runtime";

export const dynamic = "force-dynamic";

function defaultLookbackStartDate(endDate: string, months = 6): string {
  const end = new Date(`${endDate}T00:00:00`);
  end.setMonth(end.getMonth() - months);
  return end.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .single();

    if (!profile?.bicycle_store || profile.account_type !== "bicycle_store") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const endDate = getStoreToday();
    const groupBy = resolveGroupByFromPrompt(prompt);

    // Catalog metric timeseries (e.g. net sales by day)
    if (looksLikeMetricTimeseriesPrompt(prompt)) {
      const metric = resolveMetricFromPrompt(prompt);
      if (!metric || metric.source === "storefront_analytics") {
        return NextResponse.json({ error: "Could not resolve metric for this chart." }, { status: 400 });
      }

      const range = resolveDateRangeFromPrompt(prompt, endDate);
      const sql = buildCatalogMetricTimeseriesSql(metric, {
        startDate: range.startDate,
        endDate: range.endDate,
        groupBy,
      });

      const result = await executeMetricSqlForUser(user.id, sql, 200);
      if (result.status === "error") {
        return NextResponse.json({ error: result.error, sql }, { status: 500 });
      }

      const title = `${metric.label} by ${groupBy}`;
      const valueFormat = metricValueFormat(metric.id);
      const chart = buildTimeseriesChartForRows({
        title,
        subtitle: `${range.startDate} to ${range.endDate}`,
        rows: result.rows,
        kind: /\bbar\b/i.test(prompt) ? "bar" : "line",
        valueFormat,
      });

      const total = result.rows.reduce((sum, row) => sum + (Number(row.metric_value) || 0), 0);
      const formattedTotal =
        valueFormat === "currency"
          ? total.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })
          : valueFormat === "percent"
            ? `${total.toFixed(1)}%`
            : total.toLocaleString("en-AU");

      const content = result.rows.length
        ? `${metric.label} for **${range.label}** (${range.startDate} to ${range.endDate}). Total: **${formattedTotal}**. The chart is in the Evidence panel — pin it to your dashboard if you want to keep it.`
        : `No ${metric.label.toLowerCase()} data was found for ${range.label}. Check that Lightspeed sales are synced for this store.`;

      return NextResponse.json({
        content,
        chart,
        table: {
          title,
          subtitle: `${range.startDate} to ${range.endDate}`,
          columns: [
            { key: "period", label: "Period" },
            {
              key: "metric_value",
              label: metric.label,
              align: "right",
              format: valueFormat,
            },
          ],
          rows: result.rows.map((row) => ({
            period: formatPeriodLabel(row.period),
            metric_value: Number(row.metric_value) || 0,
          })),
        },
        sql,
        metric_id: metric.id,
      });
    }

    // Product/service segment timeseries
    const segmentQuery =
      typeof body?.segment_query === "string" && body.segment_query.trim()
        ? body.segment_query.trim()
        : extractSegmentQueryFromPrompt(prompt);

    if (!segmentQuery) {
      return NextResponse.json({ error: "Could not determine chart subject." }, { status: 400 });
    }

    const startDate = defaultLookbackStartDate(endDate, 6);
    const measure = /\brevenue|sales|\$/i.test(prompt) ? "net_sales" : "units_sold";

    const sql = buildProductSegmentTimeseriesSql({
      segmentQuery,
      startDate,
      endDate,
      groupBy,
      measure,
    });

    const result = await executeMetricSqlForUser(user.id, sql, 200);
    if (result.status === "error") {
      return NextResponse.json({ error: result.error, sql }, { status: 500 });
    }

    const title = `${segmentQuery} ${measure === "units_sold" ? "units" : "net sales"} by ${groupBy}`;
    const chart = buildTimeseriesChartForRows({
      title,
      subtitle: `${startDate} to ${endDate}`,
      rows: result.rows,
      kind: "line",
      valueFormat: measure === "net_sales" ? "currency" : "number",
    });

    const total = result.rows.reduce((sum, row) => sum + (Number(row.metric_value) || 0), 0);
    const content = result.rows.length
      ? `Here is a ${groupBy}ly line chart for **${segmentQuery}** (${measure === "units_sold" ? "units sold" : "net sales"}) from ${startDate} to ${endDate}. Total: ${total.toLocaleString("en-AU")}.`
      : `No matching sales were found for "${segmentQuery}" in the last 6 months. The store may label this category differently in Lightspeed — try a broader term like "service".`;

    return NextResponse.json({
      content,
      chart,
      table: {
        title,
        subtitle: `${startDate} to ${endDate}`,
        columns: [
          { key: "period", label: "Period" },
          {
            key: "metric_value",
            label: measure === "units_sold" ? "Units sold" : "Net sales",
            align: "right",
            format: measure === "net_sales" ? "currency" : "number",
          },
          { key: "sale_lines", label: "Sale lines", align: "right", format: "number" },
        ],
        rows: result.rows.map((row) => ({
          period: formatPeriodLabel(row.period),
          metric_value: Number(row.metric_value) || 0,
          sale_lines: Number(row.sale_lines) || 0,
        })),
      },
      sql,
      segment_query: segmentQuery,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
