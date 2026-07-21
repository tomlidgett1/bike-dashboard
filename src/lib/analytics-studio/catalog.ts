import type { VisualValueFormat } from "@/lib/genie/visual-format";
import { normaliseCalculatedColumns } from "@/lib/table-builder/calculated-columns";
import { getSalesField } from "@/lib/table-builder/sales-fields";
import type {
  CalculatedColumn,
  SavedApiTable,
  TableBuilderGrain,
} from "@/lib/table-builder/types";

/**
 * Column catalog for the Analytics workbook builder. Every identifier the UI
 * can reference (and the server will interpolate into SQL) must exist here —
 * the SQL builder rejects anything outside this whitelist.
 *
 * Analytics New only uses custom sources (`custom_<uuid>`): saved Build a Table
 * definitions materialised into genie_api_builder_table_rows. Builtin sales /
 * inventory catalogs remain for reference but are not selectable in the UI.
 */

export type BuiltinAnalyticsSourceKey = "sales" | "inventory";

/** Builtin key, or `custom_<uuid>` for a saved API table. */
export type AnalyticsSourceKey = BuiltinAnalyticsSourceKey | (string & {});

export type AnalyticsColumnType = "text" | "number" | "date" | "boolean";

export interface AnalyticsColumn {
  key: string;
  label: string;
  type: AnalyticsColumnType;
  /** Preferred display format when this column is used as a measure. */
  format?: VisualValueFormat;
  /** Hide from dimension pickers (high-cardinality ids kept for counting). */
  idLike?: boolean;
}

export interface AnalyticsSource {
  key: AnalyticsSourceKey;
  label: string;
  description: string;
  view: string;
  /** Column used for relative date filters and default time series. */
  defaultDateColumn?: string;
  columns: AnalyticsColumn[];
  /** Present when this source is a saved Build a Table definition. */
  customTableId?: string;
  /** Row grain of the saved table (projections dedupe per sale for "sale"). */
  grain?: TableBuilderGrain;
  /** Formula columns compiled to SQL at query time. */
  calculatedColumns?: CalculatedColumn[];
  /** Shared source sync metadata (Lightspeed pull). */
  lastSyncedAt?: string | null;
  syncStatus?: string | null;
  syncRowCount?: number | null;
  syncError?: string | null;
}

/** Shared raw store view — all custom tables project over this. */
export const CUSTOM_ANALYTICS_VIEW = "genie_api_builder_source_rows";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBuiltinAnalyticsSource(
  key: string,
): key is BuiltinAnalyticsSourceKey {
  return key === "sales" || key === "inventory";
}

export function isCustomAnalyticsSource(key: string): boolean {
  return key.startsWith("custom_");
}

export function customAnalyticsSourceKey(tableId: string): AnalyticsSourceKey {
  return `custom_${tableId}`;
}

export function parseCustomAnalyticsTableId(key: string): string | null {
  if (!key.startsWith("custom_")) return null;
  const id = key.slice("custom_".length);
  return UUID_RE.test(id) ? id : null;
}

export const ANALYTICS_SOURCES: Record<BuiltinAnalyticsSourceKey, AnalyticsSource> = {
  sales: {
    key: "sales",
    label: "Sales lines",
    description: "Every Lightspeed sale line — revenue, cost, profit, item, customer and staff detail.",
    view: "genie_lightspeed_sales_report_lines",
    defaultDateColumn: "complete_time",
    columns: [
      { key: "complete_time", label: "Sale date", type: "date" },
      { key: "ticket_number", label: "Ticket #", type: "text", idLike: true },
      { key: "sale_id", label: "Sale ID", type: "text", idLike: true },
      { key: "employee_name", label: "Staff member", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "sku", label: "SKU", type: "text", idLike: true },
      { key: "description", label: "Item", type: "text" },
      { key: "customer_full_name", label: "Customer", type: "text" },
      { key: "customer_id", label: "Customer ID", type: "text", idLike: true },
      { key: "quantity", label: "Quantity", type: "number", format: "number" },
      { key: "retail", label: "Retail price", type: "number", format: "currency" },
      { key: "subtotal", label: "Subtotal", type: "number", format: "currency" },
      { key: "discount", label: "Discount", type: "number", format: "currency" },
      { key: "total", label: "Total", type: "number", format: "currency" },
      { key: "cost", label: "Cost", type: "number", format: "currency" },
      { key: "profit", label: "Profit", type: "number", format: "currency" },
      { key: "margin_pct", label: "Margin %", type: "number", format: "percent" },
    ],
  },
  inventory: {
    key: "inventory",
    label: "Inventory",
    description: "The live Lightspeed product mirror — pricing, stock on hand, brand, category and supplier.",
    view: "genie_lightspeed_inventory",
    defaultDateColumn: "lightspeed_created_at",
    columns: [
      { key: "name", label: "Product", type: "text" },
      { key: "brand_name", label: "Brand", type: "text" },
      { key: "category_name", label: "Category", type: "text" },
      { key: "category_path", label: "Category path", type: "text" },
      { key: "supplier_name", label: "Supplier", type: "text" },
      { key: "item_type", label: "Item type", type: "text" },
      { key: "system_sku", label: "System SKU", type: "text", idLike: true },
      { key: "custom_sku", label: "Custom SKU", type: "text", idLike: true },
      { key: "manufacturer_sku", label: "Manufacturer SKU", type: "text", idLike: true },
      { key: "item_id", label: "Item ID", type: "text", idLike: true },
      { key: "model_year", label: "Model year", type: "number", format: "number" },
      { key: "default_price", label: "Default price", type: "number", format: "currency" },
      { key: "online_price", label: "Online price", type: "number", format: "currency" },
      { key: "msrp", label: "MSRP", type: "number", format: "currency" },
      { key: "default_cost", label: "Default cost", type: "number", format: "currency" },
      { key: "avg_cost", label: "Average cost", type: "number", format: "currency" },
      { key: "total_qoh", label: "Qty on hand", type: "number", format: "number" },
      { key: "total_sellable", label: "Qty sellable", type: "number", format: "number" },
      { key: "backorder", label: "Backorder", type: "number", format: "number" },
      { key: "reorder_point", label: "Reorder point", type: "number", format: "number" },
      { key: "reorder_level", label: "Reorder level", type: "number", format: "number" },
      { key: "on_layaway", label: "On layaway", type: "number", format: "number" },
      { key: "on_special_order", label: "On special order", type: "number", format: "number" },
      { key: "on_workorder", label: "On workorder", type: "number", format: "number" },
      { key: "is_in_stock", label: "In stock", type: "boolean" },
      { key: "archived", label: "Archived", type: "boolean" },
      { key: "publish_to_ecom", label: "Published online", type: "boolean" },
      { key: "serialized", label: "Serialised", type: "boolean" },
      { key: "discountable", label: "Discountable", type: "boolean" },
      { key: "taxable", label: "Taxable", type: "boolean" },
      { key: "lightspeed_created_at", label: "Created in Lightspeed", type: "date" },
      { key: "lightspeed_updated_at", label: "Updated in Lightspeed", type: "date" },
    ],
  },
};

export function getAnalyticsSource(key: AnalyticsSourceKey): AnalyticsSource | undefined {
  if (isBuiltinAnalyticsSource(key)) return ANALYTICS_SOURCES[key];
  return undefined;
}

export function getAnalyticsColumn(
  source: AnalyticsSourceKey | AnalyticsSource,
  key: string,
): AnalyticsColumn | undefined {
  if (typeof source === "object") {
    return source.columns.find((column) => column.key === key);
  }
  return getAnalyticsSource(source)?.columns.find((column) => column.key === key);
}

function mapFormat(
  format: "currency" | "percent" | "number" | undefined,
): VisualValueFormat | undefined {
  if (format === "currency") return "currency";
  if (format === "percent") return "percent";
  if (format === "number") return "number";
  return undefined;
}

/** Sync metadata for the shared raw store, shown on every custom source. */
export interface AnalyticsSourceSyncInfo {
  lastSyncedAt?: string | null;
  syncStatus?: string | null;
  syncRowCount?: number | null;
  syncError?: string | null;
}

/** Build an Analytics source from a saved Build a Table definition. */
export function analyticsSourceFromApiTable(
  table: SavedApiTable,
  syncInfo?: AnalyticsSourceSyncInfo,
): AnalyticsSource {
  const columns: AnalyticsColumn[] = [];
  const seen = new Set<string>();
  const calculated = normaliseCalculatedColumns(table.calculated_columns);
  const calcByKey = new Map(calculated.map((col) => [col.key, col]));

  for (const key of table.columns ?? []) {
    if (seen.has(key)) continue;
    const calc = calcByKey.get(key);
    if (calc) {
      seen.add(key);
      const customLabel = table.column_labels?.[key]?.trim();
      columns.push({
        key: calc.key,
        label: customLabel || calc.label,
        type: "number",
        format: mapFormat(calc.format),
      });
      continue;
    }
    const field = getSalesField(key);
    if (!field) continue;
    seen.add(key);
    const customLabel = table.column_labels?.[key]?.trim();
    columns.push({
      key: field.key,
      label: customLabel || field.label,
      type: field.type,
      format: mapFormat(field.format),
      idLike: field.idLike,
    });
  }

  // Include calculated columns that were saved but not yet in the ordered list.
  for (const calc of calculated) {
    if (seen.has(calc.key)) continue;
    seen.add(calc.key);
    columns.push({
      key: calc.key,
      label: table.column_labels?.[calc.key]?.trim() || calc.label,
      type: "number",
      format: mapFormat(calc.format),
    });
  }

  const defaultDateColumn = columns.find((c) => c.key === "sale.completeTime")?.key
    ?? columns.find((c) => c.type === "date")?.key;

  return {
    key: customAnalyticsSourceKey(table.id),
    label: table.name || "Custom table",
    description: `Custom ${table.grain === "sale" ? "sales" : "sale lines"} table from Build a Table.`,
    view: CUSTOM_ANALYTICS_VIEW,
    defaultDateColumn,
    columns,
    customTableId: table.id,
    grain: table.grain === "sale" ? "sale" : "sale_line",
    calculatedColumns: calculated,
    lastSyncedAt: syncInfo?.lastSyncedAt ?? table.last_synced_at ?? null,
    syncStatus: syncInfo?.syncStatus ?? table.sync_status ?? null,
    syncRowCount: syncInfo?.syncRowCount ?? table.sync_row_count ?? null,
    syncError: syncInfo?.syncError ?? table.sync_error ?? null,
  };
}
