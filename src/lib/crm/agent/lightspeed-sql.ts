// Validated read-only Lightspeed SQL executor for the CRM campaign agent.
//
// Mirrors the Genie SQL surface (same tenant-scoped views + RPC,
// execute_lightspeed_genie_sql) with the same validation rules — see
// src/lib/genie/agent/tools.ts for the original. Kept lean here so the CRM
// agent doesn't pull in Genie's 10k-line tool module.

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW,
  GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
  GENIE_LIGHTSPEED_SQL_RPC,
  GENIE_LIGHTSPEED_SQL_VIEW,
} from "@/lib/genie/agent/sql-constants";

const CRM_SQL_DEFAULT_LIMIT = 200;
const CRM_SQL_MAX_LIMIT = 1000;

export type CrmSqlResult = {
  status: "ok" | "rejected" | "error";
  purpose: string;
  rows?: Array<Record<string, string | number | boolean | null>>;
  row_count?: number;
  limit_applied?: boolean;
  error?: string;
  allowed_views?: string[];
  available_columns?: Record<string, string[]>;
};

function normalizeSql(sql: string): string {
  return sql
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\bpublic\.lightspeed_sales_report_lines\b/gi, `public.${GENIE_LIGHTSPEED_SQL_VIEW}`)
    .replace(/(^|[^.\w])lightspeed_sales_report_lines\b/gi, `$1${GENIE_LIGHTSPEED_SQL_VIEW}`)
    .replace(/\bpublic\.lightspeed_inventory\b/gi, `public.${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}`)
    .replace(/(^|[^.\w])lightspeed_inventory\b/gi, `$1${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}`);
}

function scrubStringLiterals(sql: string): string {
  return sql.replace(/'([^']|'')*'/g, "''");
}

function validateSql(sql: string): string | null {
  const scrubbed = scrubStringLiterals(sql);

  if (!sql.trim()) return "SQL query is required.";
  if (/;/.test(sql)) return "Only one SQL statement is allowed.";
  if (/(\/\*|--)/.test(sql)) return "SQL comments are not allowed.";
  if (!/^\s*(select|with)\s/i.test(sql)) return "Only SELECT/WITH read queries are allowed.";
  if (/`[^`]+`/.test(sql)) {
    return "Use PostgreSQL SQL, not MySQL: backtick-quoted identifiers are not supported.";
  }
  if (/\b(date_format|str_to_date|ifnull|curdate|date_sub|date_add|timestampdiff|datediff|from_unixtime|unix_timestamp)\s*\(/i.test(scrubbed)) {
    return "Use PostgreSQL SQL, not MySQL functions. Prefer date_trunc, to_char, coalesce, current_date, interval literals, and extract.";
  }
  if (/\binterval\s+\d+\s+(day|week|month|year|hour|minute|second)s?\b/i.test(scrubbed)) {
    return "Use PostgreSQL interval syntax, e.g. interval '1 day' or interval '1 month'.";
  }
  if (/\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|copy|call|do|execute|merge|vacuum|analyze|refresh|listen|notify|set|reset|show|lock|begin|commit|rollback)\b/i.test(scrubbed)) {
    return "Mutating or administrative SQL is not allowed.";
  }
  if (!new RegExp(`\\b(public\\.)?(${GENIE_LIGHTSPEED_SQL_VIEW}|${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW})\\b`, "i").test(scrubbed)) {
    return `Query must read from ${GENIE_LIGHTSPEED_SQL_VIEW} or ${GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW}.`;
  }
  if (/\b(raw_sale|raw_line|raw_item|raw_item_shops|raw_vendor|source_hash|user_id|access_token|refresh_token|encrypted|password|secret)\b/i.test(scrubbed)) {
    return "Query references restricted columns or secrets.";
  }

  return null;
}

function safeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function coerceRows(value: unknown): Array<Record<string, string | number | boolean | null>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, cell]) => [key, safeCell(cell)])));
}

export async function runCrmLightspeedSql(
  userId: string,
  args: { purpose: string; sql: string; limit?: number },
): Promise<CrmSqlResult> {
  const sql = normalizeSql(args.sql);

  const validationError = validateSql(sql);
  if (validationError) {
    return {
      status: "rejected",
      purpose: args.purpose,
      error: validationError,
      allowed_views: [GENIE_LIGHTSPEED_SQL_VIEW, GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW],
      available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
    };
  }

  const limit = Number.isFinite(args.limit)
    ? Math.min(Math.max(Math.trunc(args.limit ?? CRM_SQL_DEFAULT_LIMIT), 1), CRM_SQL_MAX_LIMIT)
    : CRM_SQL_DEFAULT_LIMIT;

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc(GENIE_LIGHTSPEED_SQL_RPC, {
    p_sql: sql,
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    return {
      status: "error",
      purpose: args.purpose,
      error: error.message,
      allowed_views: [GENIE_LIGHTSPEED_SQL_VIEW, GENIE_LIGHTSPEED_INVENTORY_SQL_VIEW],
      available_columns: GENIE_LIGHTSPEED_SQL_AVAILABLE_COLUMNS,
    };
  }

  const result = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const rows = coerceRows(result.rows);
  return {
    status: "ok",
    purpose: args.purpose,
    rows,
    row_count: typeof result.row_count === "number" ? result.row_count : rows.length,
    limit_applied: Boolean(result.limit_applied),
  };
}
