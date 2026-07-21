/**
 * Custom table builder — types for Lightspeed API field tables.
 */

export type TableBuilderSource = "sales";

/** One row per sale, or one row per sale line (with parent sale fields). */
export type TableBuilderGrain = "sale" | "sale_line";

export type TableBuilderFieldType = "text" | "number" | "date" | "boolean";

export type TableBuilderFieldFormat = "currency" | "percent" | "number";

export type TableBuilderEntity =
  | "sale"
  | "saleLine"
  | "salePayment"
  | "customer"
  | "item"
  | "note"
  | "discount"
  | "itemFee";

export interface TableBuilderField {
  /** Stable key stored on saved tables, e.g. `sale.ticketNumber`. */
  key: string;
  /** Dot path into the flattened row object built from the API response. */
  path: string;
  label: string;
  description?: string;
  type: TableBuilderFieldType;
  entity: TableBuilderEntity;
  /** UI section heading. */
  group: string;
  grains: TableBuilderGrain[];
  format?: TableBuilderFieldFormat;
  idLike?: boolean;
}

export type ApiTableSyncStatus = "idle" | "syncing" | "ready" | "error";

/** User-defined formula column stored on a saved table. */
export interface CalculatedColumn {
  /** Stable key, e.g. `calc.gross_profit`. */
  key: string;
  label: string;
  /** Arithmetic expression using [Column] refs, including other formulas, e.g. `[Gross profit] / [Sale subtotal]`. */
  expression: string;
  type: "number";
  format?: TableBuilderFieldFormat;
}

export interface SavedApiTable {
  id: string;
  user_id: string;
  name: string;
  source: TableBuilderSource;
  grain: TableBuilderGrain;
  columns: string[];
  /** Field key -> custom header label. Missing keys use the catalog default. */
  column_labels?: Record<string, string> | null;
  /** Formula columns evaluated at preview/sync time. */
  calculated_columns?: CalculatedColumn[] | null;
  created_at: string;
  updated_at: string;
  last_synced_at?: string | null;
  sync_row_count?: number;
  sync_status?: ApiTableSyncStatus;
  sync_error?: string | null;
  /** Lightspeed next-page URL while background sync is in progress. */
  sync_cursor?: string | null;
  /** Cumulative sales pulled during the current / last sync run. */
  sync_sales_fetched?: number | null;
  /** Whether the current / last run was a full rebuild or incremental pull. */
  sync_kind?: "full" | "incremental" | null;
  /** Schema signature the stored rows were built with (see schema-signature.ts). */
  sync_columns_signature?: string | null;
}

export interface TableBuilderPreviewRow {
  [key: string]: string | number | boolean | null;
}

export interface TableBuilderPreviewResponse {
  success: boolean;
  grain: TableBuilderGrain;
  columns: string[];
  rows: TableBuilderPreviewRow[];
  fetchedSales: number;
  fetchedRows: number;
  error?: string;
}
