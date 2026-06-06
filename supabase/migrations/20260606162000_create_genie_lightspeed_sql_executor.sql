CREATE OR REPLACE VIEW public.genie_lightspeed_sales_report_lines
WITH (security_barrier = true) AS
SELECT
  sale_id,
  sale_line_id,
  ticket_number,
  complete_time,
  line_time,
  employee_id,
  employee_name,
  category_id,
  category,
  item_id,
  sku,
  description,
  quantity,
  retail,
  subtotal,
  discount,
  total,
  customer_id,
  customer_full_name,
  cost,
  profit,
  margin_pct,
  synced_at,
  created_at,
  updated_at
FROM public.lightspeed_sales_report_lines
WHERE user_id = NULLIF(current_setting('app.current_lightspeed_user_id', true), '')::UUID;

COMMENT ON VIEW public.genie_lightspeed_sales_report_lines IS
  'Read-only, tenant-scoped Lightspeed sales report view for Genie SQL analysis. The execute_lightspeed_report_sql RPC sets app.current_lightspeed_user_id before querying this view.';

CREATE OR REPLACE FUNCTION public.execute_lightspeed_report_sql(
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
  v_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), current_user);
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'execute_lightspeed_report_sql can only be called with the service role';
  END IF;

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

  IF v_scrubbed_sql ~* '\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|copy|call|do|execute|merge|vacuum|analyze|refresh|listen|notify|set|reset|show|lock|begin|commit|rollback)\b' THEN
    RAISE EXCEPTION 'Mutating or administrative SQL is not allowed';
  END IF;

  IF v_scrubbed_sql ~* '\b(public\.)?lightspeed_sales_report_lines\b' THEN
    RAISE EXCEPTION 'Use genie_lightspeed_sales_report_lines, not the raw Lightspeed sales table';
  END IF;

  IF v_scrubbed_sql !~* '\b(public\.)?genie_lightspeed_sales_report_lines\b' THEN
    RAISE EXCEPTION 'Query must read from genie_lightspeed_sales_report_lines';
  END IF;

  IF v_scrubbed_sql ~* '\b(raw_sale|raw_line|access_token|refresh_token|encrypted|password|secret)\b' THEN
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

REVOKE ALL ON FUNCTION public.execute_lightspeed_report_sql(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_lightspeed_report_sql(TEXT, UUID, INTEGER) TO service_role;
