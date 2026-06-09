import type { GenieChartPayload } from "@/lib/genie/visual-payloads";
import type {
  DashboardSqlVisualType,
  LightspeedSqlVisualArgs,
} from "@/lib/genie/lightspeed-sql-visual";
import type { DashboardWidgetPayload } from "@/lib/dashboard/store-dashboard";

export function visualKey(type: DashboardSqlVisualType, title: string) {
  return `${type}:${title.trim()}`;
}

export function buildSqlVisualArgsFromWidget(
  payload: DashboardWidgetPayload,
  title: string,
): LightspeedSqlVisualArgs {
  switch (payload.type) {
    case "pivot": {
      const table = payload.data;
      return {
        pivot_table: {
          title: table.title,
          row_fields: table.row_fields.map((field) => field.key),
          column_fields: table.column_fields.map((field) => field.key),
          value_field: table.value.field,
          value_format: table.value.format,
          aggregation: table.value.aggregation,
          show_totals: Boolean(table.column_totals || table.rows.some((row) => row.total != null)),
        },
      };
    }
    case "chart": {
      const chart = payload.data;
      return {
        chart_kind: chart.kind,
        chart_title: title,
        chart_subtitle: chart.subtitle,
        chart_x_key: inferChartXKey(chart),
        chart_y_keys: chart.series.map((series) => series.key),
        value_format: chart.valueFormatter,
      };
    }
    case "table": {
      const table = payload.data;
      return {
        table_title: title,
        table_subtitle: table.subtitle,
      };
    }
  }
}

function inferChartXKey(chart: GenieChartPayload): string {
  const seriesKeys = new Set(chart.series.map((series) => series.key));
  const sample = chart.data[0];
  if (!sample) return "label";

  const candidates = Object.keys(sample).filter((key) => key !== "label" && !seriesKeys.has(key));
  if (candidates.length > 0) return candidates[0];

  return "label";
}

export function mergeVisualArgsWithWidget(
  visual: LightspeedSqlVisualArgs | undefined,
  payload: DashboardWidgetPayload,
  title: string,
): LightspeedSqlVisualArgs {
  const rebuilt = buildSqlVisualArgsFromWidget(payload, title);
  return {
    ...rebuilt,
    ...visual,
    pivot_table: visual?.pivot_table ?? rebuilt.pivot_table,
    chart_kind: visual?.chart_kind ?? rebuilt.chart_kind,
    chart_title: title || visual?.chart_title || rebuilt.chart_title,
    chart_subtitle: visual?.chart_subtitle ?? rebuilt.chart_subtitle,
    chart_x_key: visual?.chart_x_key ?? rebuilt.chart_x_key,
    chart_y_keys: visual?.chart_y_keys ?? rebuilt.chart_y_keys,
    table_title: title || visual?.table_title || rebuilt.table_title,
    table_subtitle: visual?.table_subtitle ?? rebuilt.table_subtitle,
    value_format: visual?.value_format ?? rebuilt.value_format,
  };
}

export type DashboardWidgetQuerySource = {
  kind: "lightspeed_sql";
  sql: string;
  purpose: string;
  limit?: number;
  visual?: LightspeedSqlVisualArgs;
  visualType: DashboardSqlVisualType;
};

export function querySourceFromAnalysisQuery(
  query: {
    sql: string | null;
    purpose: string;
    visual?: LightspeedSqlVisualArgs | null;
    limit?: number | null;
  },
  visualType: DashboardSqlVisualType,
): DashboardWidgetQuerySource | undefined {
  if (!query.sql?.trim()) return undefined;
  return {
    kind: "lightspeed_sql",
    sql: query.sql,
    purpose: query.purpose,
    limit: query.limit ?? undefined,
    visual: (query.visual ?? undefined) as LightspeedSqlVisualArgs | undefined,
    visualType,
  };
}
