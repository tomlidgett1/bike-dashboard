/**
 * Shared raw sales store sync for Build a Table.
 *
 * One dataset per store: every sale line's COMPLETE flattened record
 * ({sale, line, item, customer, payment}) lands in api_builder_source_rows.
 * Saved tables are pure projections over it, so schema edits (columns, grain,
 * formulas) never require a Lightspeed pull — only new sales do.
 *
 * Two kinds of run, resolved automatically:
 * - "full": first-ever pull of the whole history (or explicit rebuild).
 * - "incremental": sales completed since the newest stored row, with an
 *   overlap window — the routine twice-daily refresh.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  createLightspeedClient,
  getLightspeedRetryAfterMs,
  isLightspeedThrottleError,
} from "@/lib/services/lightspeed";
import {
  flattenSalesForTable,
  SALES_TABLE_LOAD_RELATIONS,
} from "@/lib/table-builder/flatten-sales";
import type { ApiBuilderSyncKind, ApiBuilderSyncMode } from "@/lib/table-builder/sync-table";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

const SOURCE = "sales";
const DEFAULT_CHUNK_PAGES = 2;
const MAX_CHUNK_PAGES = 10;
const PAGE_LIMIT = 100;
const UPSERT_CHUNK = 200;
/** Incremental pulls re-fetch this overlap before the newest stored sale. */
const INCREMENTAL_OVERLAP_MS = 15 * 60 * 1000;

export interface SourceSyncState {
  user_id: string;
  source: string;
  sync_status: "idle" | "syncing" | "ready" | "error";
  sync_kind: ApiBuilderSyncKind;
  sync_cursor: string | null;
  sync_sales_fetched: number;
  sync_row_count: number;
  last_synced_at: string | null;
  sync_error: string | null;
  updated_at?: string;
}

export interface SyncSourceResult {
  syncKind: ApiBuilderSyncKind;
  chunkRowsUpserted: number;
  chunkSalesFetched: number;
  /** Total rows stored for the user after this chunk. */
  rowsUpserted: number;
  /** Cumulative sales pulled in this sync run. */
  salesFetched: number;
  pagesFetched: number;
  hitPageLimit: boolean;
  complete: boolean;
  nextCursor: string | null;
  syncStatus: "syncing" | "ready";
  throttled?: boolean;
  retryAfterMs?: number;
}

function validIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function loadState(
  admin: AdminClient,
  userId: string,
): Promise<SourceSyncState | null> {
  const { data } = await admin
    .from("api_builder_source_state")
    .select(
      "user_id, source, sync_status, sync_kind, sync_cursor, sync_sales_fetched, sync_row_count, last_synced_at, sync_error, updated_at",
    )
    .eq("user_id", userId)
    .eq("source", SOURCE)
    .maybeSingle();
  return (data as SourceSyncState | null) ?? null;
}

async function saveState(
  admin: AdminClient,
  userId: string,
  patch: Partial<SourceSyncState>,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("api_builder_source_state").upsert(
    {
      user_id: userId,
      source: SOURCE,
      updated_at: now,
      ...patch,
    },
    { onConflict: "user_id,source" },
  );
  if (error) throw error;
}

export async function syncApiBuilderSource(params: {
  userId: string;
  admin?: AdminClient;
  /** Lightspeed pages to pull in this request (default 2). */
  maxPages?: number;
  /** "auto" resumes cursors, then picks incremental vs full. */
  mode?: ApiBuilderSyncMode;
}): Promise<SyncSourceResult> {
  const admin = params.admin ?? createServiceRoleClient();
  const maxPages = Math.min(
    Math.max(params.maxPages ?? DEFAULT_CHUNK_PAGES, 1),
    MAX_CHUNK_PAGES,
  );
  const requested: ApiBuilderSyncMode = params.mode ?? "auto";

  const state = await loadState(admin, params.userId);

  let startCursor =
    typeof state?.sync_cursor === "string" && state.sync_cursor.trim()
      ? state.sync_cursor.trim()
      : null;
  let salesFetchedTotal = Math.max(0, Number(state?.sync_sales_fetched) || 0);
  let rowsTotal = Math.max(0, Number(state?.sync_row_count) || 0);

  // ---- Resolve what this run actually is ---------------------------------
  let syncKind: ApiBuilderSyncKind;
  let sinceIso: string | null = null;

  if (requested !== "full" && startCursor) {
    // Resume the in-flight run from its saved cursor (the cursor URL already
    // carries any completeTime window for incremental runs).
    syncKind = state?.sync_kind === "incremental" ? "incremental" : "full";
  } else {
    startCursor = null;
    // A full run interrupted before finishing must restart as full — its rows
    // were wiped, so an incremental pull would leave holes.
    const inFlightFull =
      state?.sync_status === "syncing" && state.sync_kind !== "incremental";
    const canIncremental =
      !inFlightFull && Boolean(state?.last_synced_at) && rowsTotal > 0;
    syncKind =
      requested === "full" ? "full" : canIncremental ? "incremental" : "full";

    if (syncKind === "incremental") {
      const { data: newestRow } = await admin
        .from("api_builder_source_rows")
        .select("complete_time")
        .eq("user_id", params.userId)
        .eq("source", SOURCE)
        .not("complete_time", "is", null)
        .order("complete_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      const baseline =
        validIsoOrNull(newestRow?.complete_time)
        ?? validIsoOrNull(state?.last_synced_at);
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
      .from("api_builder_source_rows")
      .delete()
      .eq("user_id", params.userId)
      .eq("source", SOURCE);

    salesFetchedTotal = 0;
    rowsTotal = 0;
    await saveState(admin, params.userId, {
      sync_status: "syncing",
      sync_kind: "full",
      sync_error: null,
      sync_cursor: null,
      sync_sales_fetched: 0,
      sync_row_count: 0,
    });
  } else if (freshStart) {
    salesFetchedTotal = 0;
    await saveState(admin, params.userId, {
      sync_status: "syncing",
      sync_kind: "incremental",
      sync_error: null,
      sync_cursor: null,
      sync_sales_fetched: 0,
    });
  } else {
    await saveState(admin, params.userId, {
      sync_status: "syncing",
      sync_error: null,
    });
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

    // Full flattened record per sale line (line/item parts empty for
    // zero-line sales) — projection happens at query time.
    const flat = flattenSalesForTable(sales, "sale_line");

    const now = new Date().toISOString();
    const records = flat.map((row, index) => {
      const salePart = row.sale as { saleID?: unknown; completeTime?: unknown };
      const linePart = row.line as { saleLineID?: unknown } | undefined;
      const saleIdRaw = salePart?.saleID;
      const saleId =
        saleIdRaw != null && String(saleIdRaw).trim() !== ""
          ? String(saleIdRaw)
          : `unknown-${index}`;
      const saleLineIdRaw = linePart?.saleLineID;
      const saleLineId =
        saleLineIdRaw != null && String(saleLineIdRaw).trim() !== ""
          ? String(saleLineIdRaw)
          : null;

      return {
        user_id: params.userId,
        source: SOURCE,
        sale_id: saleId,
        sale_line_id: saleLineId,
        complete_time: validIsoOrNull(salePart?.completeTime),
        data: row,
        updated_at: now,
      };
    });

    // Replace any existing rows for these sales (safe on retried chunks and
    // for the incremental overlap window).
    const saleIds = Array.from(new Set(records.map((record) => record.sale_id)));
    for (let i = 0; i < saleIds.length; i += UPSERT_CHUNK) {
      const chunkIds = saleIds.slice(i, i + UPSERT_CHUNK);
      const { error: deleteError } = await admin
        .from("api_builder_source_rows")
        .delete()
        .eq("user_id", params.userId)
        .eq("source", SOURCE)
        .in("sale_id", chunkIds);
      if (deleteError) throw deleteError;
    }

    for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
      const chunk = records.slice(i, i + UPSERT_CHUNK);
      const { error: insertError } = await admin
        .from("api_builder_source_rows")
        .insert(chunk);
      if (insertError) throw insertError;
    }

    const complete = !hitPageLimit || !nextCursor;
    salesFetchedTotal += sales.length;

    const { count: rowCount, error: countError } = await admin
      .from("api_builder_source_rows")
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.userId)
      .eq("source", SOURCE);
    if (countError) throw countError;
    rowsTotal = rowCount ?? rowsTotal + records.length;

    const syncStatus = complete ? "ready" : "syncing";
    await saveState(admin, params.userId, {
      sync_status: syncStatus,
      sync_kind: syncKind,
      sync_error: null,
      sync_cursor: complete ? null : nextCursor,
      sync_row_count: rowsTotal,
      sync_sales_fetched: salesFetchedTotal,
      last_synced_at: now,
    });

    return {
      syncKind,
      chunkRowsUpserted: records.length,
      chunkSalesFetched: sales.length,
      rowsUpserted: rowsTotal,
      salesFetched: salesFetchedTotal,
      pagesFetched,
      hitPageLimit,
      complete,
      nextCursor: complete ? null : nextCursor,
      syncStatus,
    };
  } catch (error) {
    if (isLightspeedThrottleError(error)) {
      const retryAfterMs = getLightspeedRetryAfterMs(error, 15_000);
      await saveState(admin, params.userId, {
        sync_status: "syncing",
        sync_kind: syncKind,
        sync_error: null,
        sync_cursor: startCursor,
        sync_row_count: rowsTotal,
        sync_sales_fetched: salesFetchedTotal,
      });

      return {
        syncKind,
        chunkRowsUpserted: 0,
        chunkSalesFetched: 0,
        rowsUpserted: rowsTotal,
        salesFetched: salesFetchedTotal,
        pagesFetched: 0,
        hitPageLimit: true,
        complete: false,
        nextCursor: startCursor,
        syncStatus: "syncing",
        throttled: true,
        retryAfterMs,
      };
    }

    const message = error instanceof Error ? error.message : "Sync failed";
    await saveState(admin, params.userId, {
      sync_status: "error",
      sync_error: message,
    });
    throw error;
  }
}

/**
 * Server-side loop: pull chunks (waiting through throttles) until the source
 * is fully synced or the deadline passes. Used by the cron and backfills.
 */
export async function runApiBuilderSourceSyncToCompletion(params: {
  userId: string;
  admin?: AdminClient;
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
  let last: SyncSourceResult | null = null;

  while (Date.now() < deadline) {
    const result = await syncApiBuilderSource({
      userId: params.userId,
      admin,
      maxPages: params.maxPages,
      mode,
    });
    chunks += 1;
    last = result;
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
