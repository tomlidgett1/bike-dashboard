/**
 * Materialise a saved custom API table into api_builder_table_rows for SQL /
 * Analytics querying. Sync runs in small Lightspeed page chunks so callers can
 * keep pulling in the background past rate limits.
 *
 * Two kinds of run:
 * - "full": wipe the table and re-pull the entire sales history. Used for the
 *   first sync and whenever the table schema (grain / columns / formulas)
 *   changed since the rows were built.
 * - "incremental": pull only sales completed since the newest stored row
 *   (with an overlap window), so routine refreshes cost a page or two of API
 *   quota instead of the whole history.
 *
 * Callers normally pass mode "auto" and let the schema signature decide.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  createLightspeedClient,
  getLightspeedRetryAfterMs,
  isLightspeedThrottleError,
} from "@/lib/services/lightspeed";
import {
  flattenSalesForTable,
  normaliseCalculatedColumns,
  projectTableRows,
  SALES_TABLE_LOAD_RELATIONS,
} from "@/lib/table-builder";
import {
  columnsForSync,
  computeApiTableSchemaSignature,
} from "@/lib/table-builder/schema-signature";
import type { SavedApiTable } from "@/lib/table-builder/types";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

/** Pages per HTTP request. Keep small so rate-limits surface between chunks. */
const DEFAULT_CHUNK_PAGES = 2;
const MAX_CHUNK_PAGES = 10;
const PAGE_LIMIT = 100;
const UPSERT_CHUNK = 200;
/** Incremental pulls re-fetch this overlap before the newest stored sale. */
const INCREMENTAL_OVERLAP_MS = 15 * 60 * 1000;

export type ApiBuilderSyncKind = "full" | "incremental";
export type ApiBuilderSyncMode = "auto" | ApiBuilderSyncKind;

export interface SyncTableResult {
  tableId: string;
  /** What this run is actually doing after auto-resolution. */
  syncKind: ApiBuilderSyncKind;
  /** Rows written in this chunk. */
  chunkRowsUpserted: number;
  /** Sales pulled in this chunk. */
  chunkSalesFetched: number;
  /** Total rows stored for the table after this chunk. */
  rowsUpserted: number;
  /** Cumulative sales pulled in this sync run. */
  salesFetched: number;
  pagesFetched: number;
  hitPageLimit: boolean;
  /** False while a next Lightspeed page remains. */
  complete: boolean;
  /** Lightspeed next-page URL when more history remains. */
  nextCursor: string | null;
  columns: string[];
  syncStatus: "syncing" | "ready";
  /** Lightspeed asked us to back off; caller should wait then resume. */
  throttled?: boolean;
  retryAfterMs?: number;
}

function parseCompleteTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function validIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function syncApiBuilderTable(params: {
  userId: string;
  tableId: string;
  admin?: AdminClient;
  /** Lightspeed pages to pull in this request (default 2). */
  maxPages?: number;
  /** How to sync. "auto" resumes cursors and picks incremental vs full. */
  mode?: ApiBuilderSyncMode;
  /** Deprecated: restart=true is equivalent to mode "full". */
  restart?: boolean;
}): Promise<SyncTableResult> {
  const admin = params.admin ?? createServiceRoleClient();
  const maxPages = Math.min(
    Math.max(params.maxPages ?? DEFAULT_CHUNK_PAGES, 1),
    MAX_CHUNK_PAGES,
  );
  const requested: ApiBuilderSyncMode = params.restart
    ? "full"
    : params.mode ?? "auto";

  const { data: table, error: tableError } = await admin
    .from("api_builder_tables")
    .select(
      "id, user_id, name, source, grain, columns, column_labels, calculated_columns, created_at, updated_at, sync_cursor, sync_sales_fetched, sync_row_count, sync_status, sync_kind, sync_columns_signature, last_synced_at",
    )
    .eq("id", params.tableId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (tableError || !table) {
    throw new Error("Table not found.");
  }

  const saved = table as SavedApiTable & {
    sync_cursor?: string | null;
    sync_sales_fetched?: number | null;
    sync_kind?: string | null;
    sync_columns_signature?: string | null;
  };
  if (saved.source !== "sales") {
    throw new Error("Only sales tables can be synced right now.");
  }

  const grain = saved.grain === "sale" ? "sale" : "sale_line";
  const calculatedColumns = normaliseCalculatedColumns(saved.calculated_columns);
  const columns = columnsForSync(
    Array.isArray(saved.columns) ? saved.columns.map(String) : [],
    grain,
    calculatedColumns,
  );

  if (columns.length === 0) {
    throw new Error("Table has no valid columns to sync.");
  }

  const signature = computeApiTableSchemaSignature(saved);
  const signatureMatches = saved.sync_columns_signature === signature;

  let startCursor =
    typeof saved.sync_cursor === "string" && saved.sync_cursor.trim()
      ? saved.sync_cursor.trim()
      : null;
  let salesFetchedTotal = Math.max(0, Number(saved.sync_sales_fetched) || 0);
  let rowsUpsertedTotal = Math.max(0, Number(saved.sync_row_count) || 0);

  // ---- Resolve what this run actually is ---------------------------------
  let syncKind: ApiBuilderSyncKind;
  let sinceIso: string | null = null;

  if (requested !== "full" && startCursor && signatureMatches) {
    // Resume the in-flight run from its saved cursor (the cursor URL already
    // carries any completeTime window for incremental runs).
    syncKind = saved.sync_kind === "incremental" ? "incremental" : "full";
  } else {
    startCursor = null;
    // A full run that was interrupted before finishing must restart as full —
    // its rows were wiped, so an incremental pull would leave holes.
    const inFlightFull =
      saved.sync_status === "syncing" && saved.sync_kind !== "incremental";
    const canIncremental =
      signatureMatches
      && !inFlightFull
      && Boolean(saved.last_synced_at)
      && rowsUpsertedTotal > 0;
    syncKind =
      requested === "full" ? "full" : canIncremental ? "incremental" : "full";

    if (syncKind === "incremental") {
      const { data: newestRow } = await admin
        .from("api_builder_table_rows")
        .select("complete_time")
        .eq("table_id", saved.id)
        .eq("user_id", params.userId)
        .not("complete_time", "is", null)
        .order("complete_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      const baseline =
        validIsoOrNull(newestRow?.complete_time)
        ?? validIsoOrNull(saved.last_synced_at);
      if (!baseline) {
        syncKind = "full";
      } else {
        sinceIso = new Date(
          new Date(baseline).getTime() - INCREMENTAL_OVERLAP_MS,
        ).toISOString();
      }
    }
  }

  const freshStart = !startCursor;

  // ---- Mark run start ----------------------------------------------------
  if (freshStart && syncKind === "full") {
    await admin
      .from("api_builder_table_rows")
      .delete()
      .eq("table_id", saved.id)
      .eq("user_id", params.userId);

    salesFetchedTotal = 0;
    rowsUpsertedTotal = 0;

    await admin
      .from("api_builder_tables")
      .update({
        sync_status: "syncing",
        sync_kind: "full",
        sync_columns_signature: signature,
        sync_error: null,
        sync_cursor: null,
        sync_sales_fetched: 0,
        sync_row_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.id)
      .eq("user_id", params.userId);
  } else if (freshStart) {
    // Incremental fresh start: keep the stored rows, reset per-run counters.
    salesFetchedTotal = 0;
    await admin
      .from("api_builder_tables")
      .update({
        sync_status: "syncing",
        sync_kind: "incremental",
        sync_error: null,
        sync_cursor: null,
        sync_sales_fetched: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.id)
      .eq("user_id", params.userId);
  } else {
    await admin
      .from("api_builder_tables")
      .update({
        sync_status: "syncing",
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.id)
      .eq("user_id", params.userId);
  }

  try {
    const client = createLightspeedClient(params.userId);
    const untilIso = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const { sales, pagesFetched, hitPageLimit, nextCursor } =
      await client.getAllSalesCursor(
        {
          completed: "true",
          archived: "false",
          sort: "-completeTime",
          ...(syncKind === "incremental" && sinceIso
            ? { completeTime: `><,${sinceIso},${untilIso}` }
            : {}),
          load_relations: SALES_TABLE_LOAD_RELATIONS,
        },
        {
          limit: PAGE_LIMIT,
          maxPages,
          startCursor,
        },
      );

    const flat = flattenSalesForTable(sales, grain);
    const projected = projectTableRows(flat, columns, calculatedColumns, grain);

    const now = new Date().toISOString();
    const records = projected.map((row, index) => {
      const saleFromRow = row["sale.saleID"];
      const saleFromFlat = (flat[index]?.sale as { saleID?: unknown } | undefined)
        ?.saleID;
      const saleIdRaw = saleFromRow ?? saleFromFlat;
      const saleId =
        saleIdRaw != null && String(saleIdRaw).trim() !== ""
          ? String(saleIdRaw)
          : `unknown-${index}`;
      const saleLineIdRaw = row["line.saleLineID"];
      const saleLineId =
        grain === "sale_line"
        && saleLineIdRaw != null
        && String(saleLineIdRaw).trim() !== ""
          ? String(saleLineIdRaw)
          : null;

      return {
        table_id: saved.id,
        user_id: params.userId,
        sale_id: saleId,
        sale_line_id: saleLineId,
        complete_time: parseCompleteTime(row["sale.completeTime"]),
        data: row,
        updated_at: now,
      };
    });

    // Replace any existing rows for these sales (safe if a chunk is retried
    // and for the incremental overlap window).
    const saleIds = Array.from(new Set(records.map((record) => record.sale_id)));
    for (let i = 0; i < saleIds.length; i += UPSERT_CHUNK) {
      const chunkIds = saleIds.slice(i, i + UPSERT_CHUNK);
      const { error: deleteError } = await admin
        .from("api_builder_table_rows")
        .delete()
        .eq("table_id", saved.id)
        .eq("user_id", params.userId)
        .in("sale_id", chunkIds);
      if (deleteError) throw deleteError;
    }

    for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
      const chunk = records.slice(i, i + UPSERT_CHUNK);
      const { error: upsertError } = await admin
        .from("api_builder_table_rows")
        .insert(chunk);
      if (upsertError) throw upsertError;
    }

    const complete = !hitPageLimit || !nextCursor;
    salesFetchedTotal += sales.length;

    // Recount after this chunk so progress stays accurate across resume/retry.
    const { count: rowCount, error: countError } = await admin
      .from("api_builder_table_rows")
      .select("id", { count: "exact", head: true })
      .eq("table_id", saved.id)
      .eq("user_id", params.userId);
    if (countError) throw countError;
    rowsUpsertedTotal = rowCount ?? rowsUpsertedTotal + records.length;

    const syncStatus = complete ? "ready" : "syncing";

    await admin
      .from("api_builder_tables")
      .update({
        sync_status: syncStatus,
        sync_kind: syncKind,
        sync_columns_signature: signature,
        sync_error: null,
        sync_cursor: complete ? null : nextCursor,
        sync_row_count: rowsUpsertedTotal,
        sync_sales_fetched: salesFetchedTotal,
        last_synced_at: now,
        updated_at: now,
      })
      .eq("id", saved.id)
      .eq("user_id", params.userId);

    return {
      tableId: saved.id,
      syncKind,
      chunkRowsUpserted: records.length,
      chunkSalesFetched: sales.length,
      rowsUpserted: rowsUpsertedTotal,
      salesFetched: salesFetchedTotal,
      pagesFetched,
      hitPageLimit,
      complete,
      nextCursor: complete ? null : nextCursor,
      columns,
      syncStatus,
    };
  } catch (error) {
    // Rate limits are expected during large pulls. Keep the cursor and let the
    // caller wait, then resume — do not mark the table as failed.
    if (isLightspeedThrottleError(error)) {
      const retryAfterMs = getLightspeedRetryAfterMs(error, 15_000);
      const now = new Date().toISOString();
      await admin
        .from("api_builder_tables")
        .update({
          sync_status: "syncing",
          sync_kind: syncKind,
          sync_error: null,
          sync_cursor: startCursor,
          sync_row_count: rowsUpsertedTotal,
          sync_sales_fetched: salesFetchedTotal,
          updated_at: now,
        })
        .eq("id", saved.id)
        .eq("user_id", params.userId);

      return {
        tableId: saved.id,
        syncKind,
        chunkRowsUpserted: 0,
        chunkSalesFetched: 0,
        rowsUpserted: rowsUpsertedTotal,
        salesFetched: salesFetchedTotal,
        pagesFetched: 0,
        hitPageLimit: true,
        complete: false,
        nextCursor: startCursor,
        columns,
        syncStatus: "syncing",
        throttled: true,
        retryAfterMs,
      };
    }

    const message = error instanceof Error ? error.message : "Sync failed";
    await admin
      .from("api_builder_tables")
      .update({
        sync_status: "error",
        sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.id)
      .eq("user_id", params.userId);
    throw error;
  }
}

/**
 * Server-side loop: pull chunks (waiting through throttles) until the table
 * is fully synced or the deadline passes. Used by the background cron.
 */
export async function runApiBuilderTableSyncToCompletion(params: {
  userId: string;
  tableId: string;
  admin?: AdminClient;
  /** Absolute epoch-ms deadline; stops cleanly with the cursor saved. */
  deadlineMs?: number;
  maxPages?: number;
  mode?: ApiBuilderSyncMode;
}): Promise<{
  complete: boolean;
  syncKind: ApiBuilderSyncKind | null;
  rowsUpserted: number;
  salesFetched: number;
  chunks: number;
}> {
  const admin = params.admin ?? createServiceRoleClient();
  const deadline = params.deadlineMs ?? Date.now() + 240_000;
  let mode: ApiBuilderSyncMode = params.mode ?? "auto";
  let chunks = 0;
  let last: SyncTableResult | null = null;

  while (Date.now() < deadline) {
    const result = await syncApiBuilderTable({
      userId: params.userId,
      tableId: params.tableId,
      admin,
      maxPages: params.maxPages,
      mode,
    });
    chunks += 1;
    last = result;
    // After the first chunk, always resume the run we just started.
    mode = "auto";

    if (result.complete) {
      return {
        complete: true,
        syncKind: result.syncKind,
        rowsUpserted: result.rowsUpserted,
        salesFetched: result.salesFetched,
        chunks,
      };
    }

    const waitMs = result.throttled
      ? Math.min(Math.max(result.retryAfterMs ?? 15_000, 1_000), 60_000)
      : 150;
    if (Date.now() + waitMs >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return {
    complete: false,
    syncKind: last?.syncKind ?? null,
    rowsUpserted: last?.rowsUpserted ?? 0,
    salesFetched: last?.salesFetched ?? 0,
    chunks,
  };
}
