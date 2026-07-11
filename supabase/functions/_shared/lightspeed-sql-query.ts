import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const ALLOWED_LIGHTSPEED_SQL_VIEWS = [
  'private.nest_brand_lightspeed_sale_analytics_v',
  'private.nest_brand_lightspeed_sale_line_analytics_v',
  'private.nest_brand_lightspeed_inventory_v',
  'private.nest_brand_lightspeed_workorder_analytics_v',
] as const;

type ValidationResult =
  | { ok: true; normalizedSql: string; limit: number }
  | { ok: false; error: string };

export function validateLightspeedAnalyticsSql(sql: string, limit?: number): ValidationResult {
  const normalizedSql = sql.trim();
  const rowLimit = Math.max(1, Math.min(limit ?? 50, 200));
  if (!normalizedSql) return { ok: false, error: 'SQL query is required.' };

  const lowered = normalizedSql.toLowerCase();

  if (!/^\s*(with|select)\b/i.test(normalizedSql)) {
    return { ok: false, error: 'Only SELECT or CTE queries are allowed.' };
  }
  if (normalizedSql.includes(';')) {
    return { ok: false, error: 'Semicolons are not allowed.' };
  }
  if (normalizedSql.includes('--') || normalizedSql.includes('/*') || normalizedSql.includes('*/')) {
    return { ok: false, error: 'SQL comments are not allowed.' };
  }
  if (!normalizedSql.includes('{{brand_key}}')) {
    return { ok: false, error: 'Query must include the {{brand_key}} placeholder.' };
  }

  const forbiddenKeywordRe =
    /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|comment|analyze|vacuum|refresh|notify|listen|unlisten|execute|prepare|deallocate|merge|do|call)\b/i;
  if (forbiddenKeywordRe.test(normalizedSql)) {
    return { ok: false, error: 'Only read-only analytics queries are allowed.' };
  }

  const forbiddenSchemaRe = /\b(pg_catalog|information_schema|auth\.|storage\.|graphql|cron\.|net\.)\b/i;
  if (forbiddenSchemaRe.test(lowered)) {
    return { ok: false, error: 'System schemas are not allowed.' };
  }

  if (/\bpublic\./i.test(lowered)) {
    return { ok: false, error: 'Queries must use private analytics views only.' };
  }

  if (
    /\bnest_brand_lightspeed_sale\b(?!_analytics_v)/i.test(lowered) ||
    /\bnest_brand_lightspeed_sale_line\b(?!_analytics_v)/i.test(lowered) ||
    /\bnest_brand_lightspeed_item\b(?!_inventory_v)/i.test(lowered) ||
    /\bnest_brand_lightspeed_workorder\b(?!_analytics_v)/i.test(lowered)
  ) {
    return { ok: false, error: 'Operational Lightspeed tables are not allowed; use analytics views only.' };
  }

  const touchesAllowedView = ALLOWED_LIGHTSPEED_SQL_VIEWS.some((view) => lowered.includes(view));
  if (!touchesAllowedView) {
    return {
      ok: false,
      error: `Query must reference one of the approved analytics views: ${ALLOWED_LIGHTSPEED_SQL_VIEWS.join(', ')}`,
    };
  }

  return { ok: true, normalizedSql, limit: rowLimit };
}

export async function executeLightspeedAnalyticsSql(
  supabase: SupabaseClient,
  brandKey: string,
  sql: string,
  limit?: number,
): Promise<{ rows: Record<string, unknown>[]; rowCount: number; limitApplied: number }> {
  const validation = validateLightspeedAnalyticsSql(sql, limit);
  if (!validation.ok) throw new Error(validation.error);

  const { data, error } = await supabase.rpc('nest_brand_lightspeed_sql_query', {
    p_brand_key: brandKey,
    p_sql: validation.normalizedSql,
    p_limit: validation.limit,
  });
  if (error) throw new Error(`SQL analytics query failed: ${error.message}`);

  const payload = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(payload.rows)
    ? (payload.rows as Record<string, unknown>[])
    : [];
  const rowCount = typeof payload.row_count === 'number'
    ? payload.row_count
    : Number(payload.row_count ?? rows.length) || rows.length;
  const limitApplied = typeof payload.limit_applied === 'number'
    ? payload.limit_applied
    : validation.limit;

  return { rows, rowCount, limitApplied };
}
