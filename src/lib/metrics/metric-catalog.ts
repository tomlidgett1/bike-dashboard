import {
  GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW,
  GENIE_LIGHTSPEED_SQL_VIEW,
} from "@/lib/genie/agent/sql-constants";

export type MetricSource = "lightspeed_sales" | "lightspeed_inventory" | "storefront_analytics";

export type MetricSensitivity = "public" | "internal" | "finance";

export interface MetricDefinition {
  id: string;
  label: string;
  owner: string;
  description: string;
  source: MetricSource;
  grain: string;
  sqlExpression: string;
  dateField: string;
  timezone: string;
  defaultFilters: string[];
  validDimensions: string[];
  caveats: string[];
  freshnessSlaHours: number;
  sensitivity: MetricSensitivity;
  exampleQuestions: string[];
  commonMisinterpretations: string[];
}

export const STORE_METRIC_TIMEZONE = "Australia/Brisbane";

export const METRIC_CATALOG: MetricDefinition[] = [
  {
    id: "net_sales",
    label: "Net Sales",
    owner: "Finance",
    description: "Sum of sale line subtotals after discounts and excluding tax. Primary revenue metric for POS sales.",
    source: "lightspeed_sales",
    grain: "sale_line_id",
    sqlExpression: "SUM(subtotal)",
    dateField: "complete_time",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: ["subtotal IS NOT NULL"],
    validDimensions: ["category", "employee_name", "customer_full_name"],
    caveats: ["Includes discounted lines and excludes tax. Does not include cancelled/refunded-only tickets unless present in mirror."],
    freshnessSlaHours: 24,
    sensitivity: "finance",
    exampleQuestions: [
      "What was net sales last week?",
      "Why did revenue drop compared to the prior week?",
    ],
    commonMisinterpretations: [
      "Not the same as gross sales including tax.",
      "Not storefront page views or marketplace GMV.",
    ],
  },
  {
    id: "gross_sales",
    label: "Gross Sales",
    owner: "Finance",
    description: "Sum of completed sale line totals including tax.",
    source: "lightspeed_sales",
    grain: "sale_line_id",
    sqlExpression: "SUM(total)",
    dateField: "complete_time",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: ["total IS NOT NULL"],
    validDimensions: ["category", "employee_name", "customer_full_name"],
    caveats: ["Includes tax, so it exceeds net sales when tax is present."],
    freshnessSlaHours: 24,
    sensitivity: "finance",
    exampleQuestions: ["Show gross vs net sales this month"],
    commonMisinterpretations: ["Not recognised accounting revenue."],
  },
  {
    id: "gross_profit",
    label: "Gross Profit",
    owner: "Finance",
    description: "Net sales minus cost of goods on sale lines.",
    source: "lightspeed_sales",
    grain: "sale_line_id",
    sqlExpression: "SUM(COALESCE(profit, subtotal - COALESCE(cost, 0)))",
    dateField: "complete_time",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: ["cost IS NOT NULL OR profit IS NOT NULL"],
    validDimensions: ["category", "employee_name"],
    caveats: ["Margin accuracy depends on cost uploads in Lightspeed."],
    freshnessSlaHours: 24,
    sensitivity: "finance",
    exampleQuestions: ["Which categories drove gross profit this month?"],
    commonMisinterpretations: ["Not net profit after operating expenses."],
  },
  {
    id: "gross_margin_pct",
    label: "Gross Margin %",
    owner: "Finance",
    description: "Gross profit divided by net sales.",
    source: "lightspeed_sales",
    grain: "sale_line_id",
    sqlExpression:
      "CASE WHEN SUM(subtotal) = 0 THEN NULL ELSE 100.0 * SUM(COALESCE(profit, subtotal - COALESCE(cost, 0))) / NULLIF(SUM(subtotal), 0) END",
    dateField: "complete_time",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: [],
    validDimensions: ["category"],
    caveats: ["Sensitive to missing cost records."],
    freshnessSlaHours: 24,
    sensitivity: "finance",
    exampleQuestions: ["Why did margin deteriorate last month?"],
    commonMisinterpretations: ["Not markup on cost; this is margin on revenue."],
  },
  {
    id: "sale_count",
    label: "Sale Count",
    owner: "Operations",
    description: "Distinct completed sale tickets in the period.",
    source: "lightspeed_sales",
    grain: "sale_id",
    sqlExpression: "COUNT(DISTINCT sale_id)",
    dateField: "complete_time",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: ["sale_id IS NOT NULL"],
    validDimensions: ["category", "employee_name"],
    caveats: [],
    freshnessSlaHours: 24,
    sensitivity: "internal",
    exampleQuestions: ["How many transactions did we do this week?"],
    commonMisinterpretations: ["Not the same as units sold."],
  },
  {
    id: "average_order_value",
    label: "Average Order Value",
    owner: "Finance",
    description: "Gross sales including tax divided by distinct sale tickets.",
    source: "lightspeed_sales",
    grain: "sale_id",
    sqlExpression: "SUM(total) / NULLIF(COUNT(DISTINCT sale_id), 0)",
    dateField: "complete_time",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: [],
    validDimensions: ["category", "employee_name"],
    caveats: [],
    freshnessSlaHours: 24,
    sensitivity: "internal",
    exampleQuestions: ["Did AOV change week on week?"],
    commonMisinterpretations: ["Not average line value."],
  },
  {
    id: "units_sold",
    label: "Units Sold",
    owner: "Merchandising",
    description: "Sum of quantities on sale lines.",
    source: "lightspeed_sales",
    grain: "sale_line_id",
    sqlExpression: "SUM(COALESCE(quantity, 0))",
    dateField: "complete_time",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: [],
    validDimensions: ["category", "description", "sku"],
    caveats: [],
    freshnessSlaHours: 24,
    sensitivity: "internal",
    exampleQuestions: ["Top products by units sold this month"],
    commonMisinterpretations: [],
  },
  {
    id: "store_views",
    label: "Store Views",
    owner: "Marketing",
    description: "Distinct storefront page views from web analytics.",
    source: "storefront_analytics",
    grain: "session",
    sqlExpression: "distinct_viewers",
    dateField: "event_date",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: [],
    validDimensions: ["device_type"],
    caveats: ["Requires storefront tracking events. Bot traffic may be filtered upstream."],
    freshnessSlaHours: 4,
    sensitivity: "internal",
    exampleQuestions: ["How is storefront traffic trending?"],
    commonMisinterpretations: ["Not POS foot traffic or sale count."],
  },
  {
    id: "product_views",
    label: "Product Views",
    owner: "Marketing",
    description: "Product detail page views on the storefront.",
    source: "storefront_analytics",
    grain: "event",
    sqlExpression: "product_views",
    dateField: "event_date",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: [],
    validDimensions: ["device_type", "product_id"],
    caveats: [],
    freshnessSlaHours: 4,
    sensitivity: "internal",
    exampleQuestions: ["Which products get the most views?"],
    commonMisinterpretations: ["Views are not purchases."],
  },
  {
    id: "inventory_value",
    label: "Inventory Value (Cost)",
    owner: "Operations",
    description: "On-hand quantity multiplied by average cost for sellable inventory.",
    source: "lightspeed_inventory",
    grain: "item_id",
    sqlExpression: "SUM(COALESCE(total_sellable, total_qoh, 0) * COALESCE(avg_cost, default_cost, 0))",
    dateField: "inventory_updated_at",
    timezone: STORE_METRIC_TIMEZONE,
    defaultFilters: ["archived = false", "is_in_stock = true"],
    validDimensions: ["category_name", "brand_name", "supplier_name"],
    caveats: ["Snapshot metric, not time-series unless grouped by sync date."],
    freshnessSlaHours: 24,
    sensitivity: "finance",
    exampleQuestions: ["What is our stock value by category?"],
    commonMisinterpretations: ["Uses cost not retail value."],
  },
];

export function getMetricById(id: string): MetricDefinition | undefined {
  return METRIC_CATALOG.find((metric) => metric.id === id);
}

export function searchMetrics(query: string, limit = 8): MetricDefinition[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return METRIC_CATALOG.slice(0, limit);
  }

  const scored = METRIC_CATALOG.map((metric) => {
    const haystack = [
      metric.id,
      metric.label,
      metric.description,
      ...metric.exampleQuestions,
      ...metric.validDimensions,
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const token of tokens) {
      if (metric.id.includes(token)) score += 8;
      if (metric.label.toLowerCase().includes(token)) score += 6;
      if (haystack.includes(token)) score += 2;
    }
    return { metric, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.metric);
}

export function metricSourceView(source: MetricSource): string | null {
  switch (source) {
    case "lightspeed_sales":
      return GENIE_LIGHTSPEED_SQL_VIEW;
    case "lightspeed_inventory":
      return GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW;
    default:
      return null;
  }
}

export function formatMetricCatalogForPrompt(): string {
  return METRIC_CATALOG.map(
    (metric) =>
      `- ${metric.id}: ${metric.label} — ${metric.description} (source: ${metric.source}, grain: ${metric.grain})`,
  ).join("\n");
}
