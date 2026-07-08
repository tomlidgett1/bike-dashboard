import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { GENIE_LIGHTSPEED_SQL_RPC } from "@/lib/genie/agent/sql-constants";

export async function executeMetricSqlForUser(
  userId: string,
  sql: string,
  limit = 500,
) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc(GENIE_LIGHTSPEED_SQL_RPC, {
    p_sql: sql,
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    return { status: "error" as const, error: error.message, rows: [] as Record<string, unknown>[] };
  }

  const payload = (data ?? {}) as { rows?: Record<string, unknown>[]; row_count?: number };
  return {
    status: "ok" as const,
    rows: payload.rows ?? [],
    row_count: payload.row_count ?? payload.rows?.length ?? 0,
  };
}
