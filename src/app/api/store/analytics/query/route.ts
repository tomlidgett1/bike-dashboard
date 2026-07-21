import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  clampSqlLimit,
  coerceSqlRows,
  GENIE_LIGHTSPEED_SQL_RPC,
  validateLightspeedReportSql,
} from "@/lib/genie/lightspeed-sql-visual";
import { buildElementSql } from "@/lib/analytics-studio/sql-builder";
import {
  analyticsSourceFromApiTable,
  getAnalyticsColumn,
  isCustomAnalyticsSource,
  parseCustomAnalyticsTableId,
} from "@/lib/analytics-studio/catalog";
import {
  normaliseCalculatedColumns,
  projectTableRows,
} from "@/lib/table-builder";
import {
  ANALYTICS_QUERY_DEFAULT_LIMIT,
  ANALYTICS_RAW_TABLE_DEFAULT_LIMIT,
  ANALYTICS_RAW_TABLE_MAX_LIMIT,
  type AnalyticsElementQuery,
} from "@/lib/analytics-studio/types";
import type { SavedApiTable } from "@/lib/table-builder/types";
import type { SqlResultRow } from "@/lib/genie/lightspeed-sql-visual";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorised. Please log in." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return {
      error: NextResponse.json(
        { error: "Analytics is only available to verified bicycle stores." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id };
}

function clampRawLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return ANALYTICS_RAW_TABLE_DEFAULT_LIMIT;
  return Math.min(
    Math.max(Math.trunc(value as number), 1),
    ANALYTICS_RAW_TABLE_MAX_LIMIT,
  );
}

/**
 * Raw Build a Table browse: project columns straight from the shared raw
 * store (api_builder_source_rows). Avoids the Genie SQL RPC (and its 1000-row
 * hard cap) for simple table views. Formula columns are evaluated in JS with
 * the same engine the builder preview uses.
 */
async function queryRawCustomTable(params: {
  admin: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  table: SavedApiTable;
  query: AnalyticsElementQuery;
  sourceOverride: ReturnType<typeof analyticsSourceFromApiTable>;
}) {
  const { admin, userId, table, query, sourceOverride } = params;
  const grain = table.grain === "sale" ? "sale" : "sale_line";
  const calculatedColumns = normaliseCalculatedColumns(table.calculated_columns);
  const columnKeys = (query.columns ?? [])
    .filter((key) => getAnalyticsColumn(sourceOverride, key))
    .slice(0, 48);
  if (columnKeys.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one column to show." },
      { status: 400 },
    );
  }

  // Upgrade legacy workbook defaults (250) to the raw-table browse size.
  const requestedLimit =
    !query.limit || query.limit === ANALYTICS_QUERY_DEFAULT_LIMIT
      ? ANALYTICS_RAW_TABLE_DEFAULT_LIMIT
      : query.limit;
  const limit = clampRawLimit(requestedLimit);
  const ascending = query.sort?.dir === "asc";
  // Sale-grain tables collapse line rows per sale, so over-fetch to fill the page.
  const fetchCap = grain === "sale" ? Math.min(limit * 4, 8000) : limit;

  const { data, error, count } = await admin
    .from("api_builder_source_rows")
    .select("sale_id, data", { count: "exact" })
    .eq("user_id", userId)
    .eq("source", "sales")
    .order("complete_time", { ascending, nullsFirst: false })
    .range(0, fetchCap - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const flat: Record<string, unknown>[] = [];
  const seenSales = new Set<string>();
  for (const record of data ?? []) {
    if (grain === "sale" && seenSales.has(record.sale_id)) continue;
    seenSales.add(record.sale_id);
    if (record.data && typeof record.data === "object") {
      flat.push(record.data as Record<string, unknown>);
    }
    if (flat.length >= limit) break;
  }

  const projected = projectTableRows(flat, columnKeys, calculatedColumns, grain);
  const rows: SqlResultRow[] = projected.map((row) => {
    const out: SqlResultRow = {};
    for (const key of columnKeys) {
      out[key] = row[key] ?? null;
    }
    return out;
  });

  const totalLineRows = typeof count === "number" ? count : rows.length;
  const totalRowCount = grain === "sale" ? rows.length : totalLineRows;

  return NextResponse.json({
    ok: true,
    rows,
    rowCount: rows.length,
    totalRowCount,
    limitApplied: false,
    truncated: grain === "sale" ? (data?.length ?? 0) >= fetchCap : totalLineRows > rows.length,
    sql: `select data from api_builder_source_rows order by complete_time ${ascending ? "asc" : "desc"} limit ${limit}`,
    keys: columnKeys,
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth && auth.error) return auth.error;
    const userId = auth.userId!;

    const body = await request.json();
    const query = body?.query as AnalyticsElementQuery | undefined;
    if (!query || typeof query !== "object" || !query.source) {
      return NextResponse.json({ error: "Invalid analytics query." }, { status: 400 });
    }

    // Analytics New only queries tables created in Build a Table.
    if (!isCustomAnalyticsSource(query.source)) {
      return NextResponse.json(
        {
          error:
            "Analytics New only supports tables from Build a Table. Pick a synced table as the data source.",
        },
        { status: 400 },
      );
    }

    const tableId = parseCustomAnalyticsTableId(query.source);
    if (!tableId) {
      return NextResponse.json({ error: "Invalid custom table source." }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: table, error: tableError } = await admin
      .from("api_builder_tables")
      .select(
        "id, user_id, name, source, grain, columns, column_labels, calculated_columns, created_at, updated_at, last_synced_at, sync_row_count, sync_status, sync_error",
      )
      .eq("id", tableId)
      .eq("user_id", userId)
      .maybeSingle();

    if (tableError || !table) {
      return NextResponse.json({ error: "Custom table not found." }, { status: 404 });
    }

    const saved = table as SavedApiTable;

    // Tables are projections over the shared raw store — gate on its state.
    const { data: sourceState } = await admin
      .from("api_builder_source_state")
      .select("sync_status, sync_row_count, last_synced_at, sync_error")
      .eq("user_id", userId)
      .eq("source", "sales")
      .maybeSingle();
    if (!sourceState?.sync_row_count) {
      return NextResponse.json(
        {
          error:
            "Your sales data has not been synced yet. Open Build a Table and click Sync to Analytics.",
        },
        { status: 400 },
      );
    }

    const sourceOverride = analyticsSourceFromApiTable(saved, {
      lastSyncedAt: sourceState.last_synced_at,
      syncStatus: sourceState.sync_status,
      syncRowCount: sourceState.sync_row_count,
      syncError: sourceState.sync_error,
    });
    if (sourceOverride.columns.length === 0) {
      return NextResponse.json(
        { error: "Custom table has no queryable columns." },
        { status: 400 },
      );
    }

    const hasFilters = Array.isArray(query.filters) && query.filters.length > 0;
    // Unfiltered raw tables: cheap JSONB projection from the materialised rows.
    if (query.mode === "raw" && !hasFilters) {
      return queryRawCustomTable({
        admin,
        userId,
        table: saved,
        query,
        sourceOverride,
      });
    }

    const { built, error: buildError } = buildElementSql(query, sourceOverride);
    if (buildError || !built) {
      return NextResponse.json({ error: buildError ?? "Could not build query." }, { status: 400 });
    }

    // Belt and braces: run the generated SQL through the same guardrails the
    // Genie SQL executor enforces before it reaches the database.
    const validationError = validateLightspeedReportSql(built.sql);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const rpcLimit =
      query.mode === "raw"
        ? clampRawLimit(query.limit)
        : clampSqlLimit(query.limit);

    const { data, error } = await admin.rpc(GENIE_LIGHTSPEED_SQL_RPC, {
      p_sql: built.sql,
      p_user_id: userId,
      // Genie RPC still hard-caps at 1000; raw unfiltered uses the direct path above.
      p_limit: Math.min(rpcLimit, 1000),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const rows = coerceSqlRows(result.rows);
    const rowCount = typeof result.row_count === "number" ? result.row_count : rows.length;

    return NextResponse.json({
      ok: true,
      rows,
      rowCount,
      totalRowCount: rowCount,
      limitApplied: query.mode === "raw" ? false : Boolean(result.limit_applied),
      truncated: query.mode === "raw" ? Boolean(result.limit_applied) : false,
      sql: built.sql,
      keys: built.keys,
    });
  } catch (error) {
    console.error("Analytics query error:", error);
    return NextResponse.json({ error: "Failed to run analytics query." }, { status: 500 });
  }
}
