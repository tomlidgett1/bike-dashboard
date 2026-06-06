DROP VIEW IF EXISTS public.genie_lightspeed_inventory;

CREATE VIEW public.genie_lightspeed_inventory
WITH (security_barrier = true) AS
SELECT
  lightspeed_item_id AS item_id,
  lightspeed_account_id AS account_id,
  product_uuid,
  system_sku,
  custom_sku,
  manufacturer_sku,
  upc,
  ean,
  name,
  description,
  model_year,
  item_type,
  labor_duration_minutes,
  brand_id,
  brand_name,
  category_id,
  category_name,
  category_path,
  supplier_id,
  supplier_name,
  supplier_archived,
  supplier_currency_code,
  default_price,
  online_price,
  msrp,
  default_cost,
  avg_cost,
  total_qoh,
  total_sellable,
  backorder,
  component_qoh,
  component_backorder,
  reorder_point,
  reorder_level,
  on_layaway,
  on_special_order,
  on_workorder,
  on_transfer_in,
  on_transfer_out,
  is_in_stock,
  archived,
  publish_to_ecom,
  serialized,
  discountable,
  taxable,
  tax_class_id,
  tax_class_name,
  department_id,
  season_id,
  default_vendor_id,
  item_matrix_id,
  primary_image_url,
  images,
  prices,
  stock_data,
  lightspeed_created_at,
  lightspeed_updated_at,
  inventory_updated_at,
  first_seen_at,
  last_seen_at,
  last_synced_at,
  created_at,
  updated_at
FROM public.lightspeed_inventory
WHERE user_id = NULLIF(current_setting('app.current_lightspeed_user_id', true), '')::UUID;

COMMENT ON VIEW public.genie_lightspeed_inventory IS
  'Read-only, tenant-scoped Lightspeed inventory mirror for Genie SQL analysis. The execute_lightspeed_genie_sql RPC sets app.current_lightspeed_user_id before querying this view.';

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

  IF v_scrubbed_sql !~* '(^|[^[:alnum:]_])(public\.)?(genie_lightspeed_sales_report_lines|genie_lightspeed_inventory)([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'Query must read from genie_lightspeed_sales_report_lines or genie_lightspeed_inventory';
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
