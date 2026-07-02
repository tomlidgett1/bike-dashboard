-- Full-store CRM contact stats from all synced Lightspeed sales report lines.
-- Replaces the previous 20k-row JS cap with a single SQL aggregation.

CREATE OR REPLACE FUNCTION public.crm_refresh_contact_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats_updated INT := 0;
  v_contacts_with_ls_id INT := 0;
  v_distinct_customers_in_sales INT := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT COUNT(*)::INT
  INTO v_contacts_with_ls_id
  FROM crm_contacts
  WHERE user_id = p_user_id
    AND lightspeed_customer_id IS NOT NULL;

  WITH per_sale AS (
    SELECT DISTINCT ON (customer_id, sale_id)
      customer_id,
      sale_id,
      GREATEST(COALESCE(total, 0), COALESCE(subtotal, 0)) AS sale_total,
      complete_time
    FROM lightspeed_sales_report_lines
    WHERE user_id = p_user_id
      AND customer_id IS NOT NULL
      AND TRIM(customer_id) <> ''
      AND complete_time IS NOT NULL
      AND sale_line_id NOT LIKE '%:summary'
    ORDER BY customer_id, sale_id, GREATEST(COALESCE(total, 0), COALESCE(subtotal, 0)) DESC
  ),
  agg AS (
    SELECT
      customer_id,
      COUNT(*)::INT AS sale_count,
      ROUND(SUM(sale_total)::NUMERIC, 2) AS total_spend,
      MAX(complete_time) AS last_purchase_at
    FROM per_sale
    GROUP BY customer_id
  ),
  updated AS (
    UPDATE crm_contacts AS c
    SET
      sale_count = a.sale_count,
      total_spend = a.total_spend,
      last_purchase_at = a.last_purchase_at,
      enriched_at = NOW(),
      updated_at = NOW()
    FROM agg AS a
    WHERE c.user_id = p_user_id
      AND c.lightspeed_customer_id = a.customer_id
    RETURNING c.id
  )
  SELECT COUNT(*)::INT INTO v_stats_updated FROM updated;

  SELECT COUNT(*)::INT
  INTO v_distinct_customers_in_sales
  FROM (
    SELECT DISTINCT customer_id
    FROM lightspeed_sales_report_lines
    WHERE user_id = p_user_id
      AND customer_id IS NOT NULL
      AND TRIM(customer_id) <> ''
  ) AS d;

  RETURN jsonb_build_object(
    'statsUpdated', v_stats_updated,
    'skipped', GREATEST(v_contacts_with_ls_id - v_stats_updated, 0),
    'contactsWithLightspeedId', v_contacts_with_ls_id,
    'distinctCustomersInSales', v_distinct_customers_in_sales,
    'salesReportLines',
      (SELECT COUNT(*)::INT FROM lightspeed_sales_report_lines WHERE user_id = p_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_refresh_contact_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_refresh_contact_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_refresh_contact_stats(UUID) TO service_role;
