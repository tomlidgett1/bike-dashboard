-- Shared raw sales store for Build a Table.
--
-- Instead of each saved table materialising its own copy of Lightspeed sales,
-- one raw dataset per store holds the COMPLETE flattened record for every sale
-- line (sale / line / item / customer / payment parts as nested JSONB). Saved
-- tables become pure projections over it: adding a column, editing a formula,
-- or creating another table needs no Lightspeed pull at all.

CREATE TABLE IF NOT EXISTS public.api_builder_source_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'sales',
  -- One row per sale line; sale_line_id is NULL for sales with no lines.
  sale_id TEXT NOT NULL,
  sale_line_id TEXT,
  complete_time TIMESTAMPTZ,
  -- Nested flat record: {sale:{...}, line:{...}, item:{...}, customer:{...}, payment:{...}}
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT api_builder_source_rows_source_check CHECK (source IN ('sales'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_builder_source_rows_identity
  ON public.api_builder_source_rows (user_id, source, sale_id, COALESCE(sale_line_id, ''));

CREATE INDEX IF NOT EXISTS idx_api_builder_source_rows_user_time
  ON public.api_builder_source_rows (user_id, complete_time DESC);

CREATE INDEX IF NOT EXISTS idx_api_builder_source_rows_user_sale
  ON public.api_builder_source_rows (user_id, sale_id);

ALTER TABLE public.api_builder_source_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own api builder source rows" ON public.api_builder_source_rows;
CREATE POLICY "Users manage own api builder source rows"
  ON public.api_builder_source_rows
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.api_builder_source_rows IS
  'Shared raw Lightspeed sales store per user. Complete flattened sale-line records; Build a Table definitions project over this at query time.';

-- Per-store sync state (replaces per-table sync bookkeeping).
CREATE TABLE IF NOT EXISTS public.api_builder_source_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'sales',
  sync_status TEXT NOT NULL DEFAULT 'idle',
  sync_kind TEXT NOT NULL DEFAULT 'full',
  sync_cursor TEXT,
  sync_sales_fetched INTEGER NOT NULL DEFAULT 0,
  sync_row_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source),
  CONSTRAINT api_builder_source_state_source_check CHECK (source IN ('sales')),
  CONSTRAINT api_builder_source_state_status_check
    CHECK (sync_status IN ('idle', 'syncing', 'ready', 'error')),
  CONSTRAINT api_builder_source_state_kind_check
    CHECK (sync_kind IN ('full', 'incremental'))
);

ALTER TABLE public.api_builder_source_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own api builder source state" ON public.api_builder_source_state;
CREATE POLICY "Users read own api builder source state"
  ON public.api_builder_source_state
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.api_builder_source_state IS
  'Sync progress for the shared Build a Table raw store. Written by the server sync engine; read-only for users.';

-- Tenant-scoped view for the Analytics SQL executor.
DROP VIEW IF EXISTS public.genie_api_builder_source_rows;
CREATE VIEW public.genie_api_builder_source_rows
WITH (security_barrier = true) AS
SELECT
  sale_id,
  sale_line_id,
  complete_time,
  data,
  created_at,
  updated_at
FROM public.api_builder_source_rows
WHERE user_id = NULLIF(current_setting('app.current_lightspeed_user_id', true), '')::UUID
  AND source = 'sales';

COMMENT ON VIEW public.genie_api_builder_source_rows IS
  'Read-only, tenant-scoped shared raw sales rows for Analytics. Nested flat record in data JSONB (sale/line/item/customer/payment).';

-- Allow the Genie SQL RPC to read the shared source rows.
CREATE OR REPLACE FUNCTION public.execute_lightspeed_genie_sql(
  p_sql TEXT,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sql TEXT;
  v_scrubbed_sql TEXT;
  v_limit INTEGER;
  v_rows JSONB;
  v_row_count INTEGER;
BEGIN
  v_sql := BTRIM(COALESCE(p_sql, ''));
  v_sql := regexp_replace(v_sql, ';\s*$', '');
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);

  IF v_sql = '' THEN
    RAISE EXCEPTION 'SQL query is required';
  END IF;

  IF v_sql ~ ';' THEN
    RAISE EXCEPTION 'Only one SQL statement is allowed';
  END IF;

  IF v_sql ~ '(/\*|--)' THEN
    RAISE EXCEPTION 'SQL comments are not allowed';
  END IF;

  IF v_sql !~* '^\s*(select|with)\s' THEN
    RAISE EXCEPTION 'Only SELECT/WITH read queries are allowed';
  END IF;

  v_scrubbed_sql := regexp_replace(v_sql, '''([^'']|'''')*''', '''''', 'g');

  IF v_scrubbed_sql ~* '(^|[^[:alnum:]_])(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|copy|call|do|execute|merge|vacuum|analyze|refresh|listen|notify|set|reset|show|lock|begin|commit|rollback)([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Mutating or administrative SQL is not allowed';
  END IF;

  IF v_scrubbed_sql ~* '(^|[^[:alnum:]_])(public\.)?lightspeed_sales_report_lines([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Use genie_lightspeed_sales_report_lines, not the raw Lightspeed sales table';
  END IF;

  IF v_scrubbed_sql ~* '(^|[^[:alnum:]_])(public\.)?lightspeed_inventory([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Use genie_lightspeed_inventory, not the raw Lightspeed inventory table';
  END IF;

  IF v_scrubbed_sql ~* '(^|[^[:alnum:]_])(public\.)?api_builder_table_rows([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Use genie_api_builder_table_rows, not the raw api builder rows table';
  END IF;

  IF v_scrubbed_sql ~* '(^|[^[:alnum:]_])(public\.)?api_builder_source_rows([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Use genie_api_builder_source_rows, not the raw api builder source table';
  END IF;

  IF v_scrubbed_sql !~* '(^|[^[:alnum:]_])(public\.)?(genie_lightspeed_sales_report_lines|genie_lightspeed_inventory|genie_api_builder_table_rows|genie_api_builder_source_rows)([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Query must read from genie_lightspeed_sales_report_lines, genie_lightspeed_inventory, genie_api_builder_table_rows, or genie_api_builder_source_rows';
  END IF;

  IF v_scrubbed_sql ~* '(^|[^[:alnum:]_])(raw_sale|raw_line|raw_item|raw_item_shops|raw_vendor|source_hash|user_id|access_token|refresh_token|encrypted|password|secret)([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Query references restricted columns or secrets';
  END IF;

  PERFORM set_config('app.current_lightspeed_user_id', p_user_id::TEXT, true);

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(_yj_limited)), ''[]''::jsonb), COUNT(*)::integer
       FROM (SELECT * FROM (%s) AS _yj_inner LIMIT %s) AS _yj_limited',
    v_sql,
    v_limit
  )
  INTO v_rows, v_row_count;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'row_count', COALESCE(v_row_count, 0),
    'limit', v_limit,
    'limit_applied', COALESCE(v_row_count, 0) >= v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_lightspeed_genie_sql(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_lightspeed_genie_sql(TEXT, UUID, INTEGER) TO service_role;
