import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runApiBuilderSourceSyncToCompletion } from "@/lib/table-builder/sync-source";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Leave headroom under maxDuration so the last chunk saves its cursor. */
const TIME_BUDGET_MS = 260_000;
/** A store updated this recently while "syncing" has an active client loop. */
const ACTIVE_SYNC_GRACE_MS = 3 * 60 * 1000;
const PAGES_PER_CHUNK = 4;

/**
 * Background refresh of the shared Build a Table raw store (twice daily,
 * Melbourne morning/afternoon). One incremental pull per connected store with
 * saved tables; interrupted runs resume from their cursor.
 */
export async function GET(request: NextRequest) {
  return handleApiBuilderSourceSync(request);
}

export async function POST(request: NextRequest) {
  return handleApiBuilderSourceSync(request);
}

async function handleApiBuilderSourceSync(request: NextRequest) {
  const cronSecret = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorised" },
      { status: 401 },
    );
  }

  try {
    const admin = createServiceRoleClient();
    const deadline = Date.now() + TIME_BUDGET_MS;

    // Secret-gated manual trigger: sync one specific store (used for
    // backfills/admin), regardless of saved tables or the active-sync guard.
    const body = await request.json().catch(() => ({}));
    const explicitUserId =
      typeof body?.userId === "string" && body.userId.trim()
        ? body.userId.trim()
        : null;
    if (explicitUserId) {
      const result = await runApiBuilderSourceSyncToCompletion({
        userId: explicitUserId,
        admin,
        deadlineMs: deadline,
        maxPages: PAGES_PER_CHUNK,
        mode: "auto",
      });
      return NextResponse.json({
        success: true,
        stores_checked: 1,
        synced: result.complete ? 1 : 0,
        partial: result.complete ? 0 : 1,
        skipped: 0,
        failed: 0,
        results: [
          {
            user_id: explicitUserId,
            status: result.complete ? "synced" : "partial",
            sync_kind: result.syncKind,
            sales_fetched: result.salesFetched,
            rows_total: result.rowsUpserted,
          },
        ],
      });
    }

    const { data: connections, error: connectionsError } = await admin
      .from("lightspeed_connections")
      .select("user_id")
      .eq("status", "connected")
      .not("access_token_encrypted", "is", null);
    if (connectionsError) throw connectionsError;
    const connectedUsers = new Set(
      (connections ?? []).map((row) => String(row.user_id)),
    );

    // Only stores that actually built tables need the raw store.
    const { data: tables, error: tablesError } = await admin
      .from("api_builder_tables")
      .select("user_id")
      .eq("source", "sales");
    if (tablesError) throw tablesError;
    const userIds = Array.from(
      new Set((tables ?? []).map((row) => String(row.user_id))),
    ).filter((userId) => connectedUsers.has(userId));

    // Stalest stores first so every store gets refreshed across runs.
    const { data: states, error: statesError } = await admin
      .from("api_builder_source_state")
      .select("user_id, sync_status, updated_at, last_synced_at")
      .eq("source", "sales")
      .in("user_id", userIds.length > 0 ? userIds : ["-"]);
    if (statesError) throw statesError;
    const stateByUser = new Map(
      (states ?? []).map((state) => [String(state.user_id), state]),
    );
    userIds.sort((a, b) => {
      const aTime = Date.parse(stateByUser.get(a)?.last_synced_at ?? "") || 0;
      const bTime = Date.parse(stateByUser.get(b)?.last_synced_at ?? "") || 0;
      return aTime - bTime;
    });

    const results: Array<{
      user_id: string;
      status: "synced" | "partial" | "skipped" | "error";
      sync_kind?: string | null;
      sales_fetched?: number;
      rows_total?: number;
      reason?: string;
    }> = [];

    for (const userId of userIds) {
      if (Date.now() >= deadline) {
        results.push({
          user_id: userId,
          status: "skipped",
          reason: "time budget exhausted",
        });
        continue;
      }
      const state = stateByUser.get(userId);
      const updatedAt = state?.updated_at ? Date.parse(state.updated_at) : 0;
      if (
        state?.sync_status === "syncing"
        && Number.isFinite(updatedAt)
        && Date.now() - updatedAt < ACTIVE_SYNC_GRACE_MS
      ) {
        // A browser loop is actively syncing this store right now — two
        // writers deleting/inserting the same sale rows risks duplicates.
        results.push({
          user_id: userId,
          status: "skipped",
          reason: "sync already in progress",
        });
        continue;
      }

      try {
        const result = await runApiBuilderSourceSyncToCompletion({
          userId,
          admin,
          deadlineMs: deadline,
          maxPages: PAGES_PER_CHUNK,
          mode: "auto",
        });
        results.push({
          user_id: userId,
          status: result.complete ? "synced" : "partial",
          sync_kind: result.syncKind,
          sales_fetched: result.salesFetched,
          rows_total: result.rowsUpserted,
        });
      } catch (error) {
        results.push({
          user_id: userId,
          status: "error",
          reason: error instanceof Error ? error.message : "Sync failed",
        });
      }
    }

    const failed = results.filter((r) => r.status === "error").length;
    return NextResponse.json(
      {
        success: failed === 0,
        stores_checked: userIds.length,
        synced: results.filter((r) => r.status === "synced").length,
        partial: results.filter((r) => r.status === "partial").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed,
        results,
      },
      { status: failed === 0 ? 200 : 207 },
    );
  } catch (error) {
    console.error("[api-builder-tables-sync] cron failed:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "API builder sync cron failed",
      },
      { status: 500 },
    );
  }
}
