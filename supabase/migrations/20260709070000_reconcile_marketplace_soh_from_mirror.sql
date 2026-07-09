-- ============================================================
-- Marketplace SOH reconcile from lightspeed_inventory mirror
--
-- Fixes drift where products.qoh / is_active lagged Lightspeed because
-- update-inventory-stock only applied InventoryLog deltas after a watermark
-- that the inventory mirror cron also advanced.
--
-- Match key: lightspeed_item_id (never SKU / title).
-- ============================================================

CREATE OR REPLACE FUNCTION public.reconcile_marketplace_soh_from_mirror(
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE (
  user_id uuid,
  products_updated integer,
  delisted integer,
  relisted integer,
  cache_updated integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_now timestamptz := NOW();
  v_batch_id text;
  v_products_updated integer;
  v_delisted integer;
  v_relisted integer;
  v_cache_updated integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 5000;
  END IF;

  FOR v_user IN
    SELECT lc.user_id
    FROM lightspeed_connections lc
    WHERE lc.status = 'connected'
      AND (p_user_id IS NULL OR lc.user_id = p_user_id)
  LOOP
    v_batch_id := v_user::text || '-' || v_now::text;
    v_products_updated := 0;
    v_delisted := 0;
    v_relisted := 0;
    v_cache_updated := 0;

    -- Skip users with no enabled marketplace categories.
    IF NOT EXISTS (
      SELECT 1
      FROM lightspeed_category_sync_preferences pref
      WHERE pref.user_id = v_user
        AND pref.is_enabled = TRUE
    ) THEN
      CONTINUE;
    END IF;

    WITH candidates AS (
      SELECT
        p.id AS product_id,
        p.user_id,
        p.description,
        COALESCE(NULLIF(p.system_sku, ''), NULLIF(p.custom_sku, '')) AS product_sku,
        p.lightspeed_item_id,
        p.lightspeed_category_id,
        COALESCE(p.qoh, 0) AS old_qoh,
        COALESCE(p.sellable, 0) AS old_sellable,
        COALESCE(p.is_active, FALSE) AS old_is_active,
        COALESCE(li.total_qoh, 0)::integer AS new_qoh,
        COALESCE(li.total_sellable, 0)::integer AS new_sellable,
        CASE
          WHEN COALESCE(li.total_qoh, 0)::integer <= 0 THEN FALSE
          WHEN COALESCE(p.qoh, 0) <= 0 AND COALESCE(li.total_qoh, 0)::integer > 0 THEN TRUE
          ELSE COALESCE(p.is_active, FALSE)
        END AS new_is_active
      FROM products p
      INNER JOIN lightspeed_inventory li
        ON li.user_id = p.user_id
       AND li.lightspeed_item_id = p.lightspeed_item_id
      INNER JOIN lightspeed_category_sync_preferences pref
        ON pref.user_id = p.user_id
       AND pref.category_id = p.lightspeed_category_id
       AND pref.is_enabled = TRUE
      WHERE p.user_id = v_user
        AND p.lightspeed_item_id ~ '^[0-9]+$'
        AND (
          COALESCE(p.qoh, 0) IS DISTINCT FROM COALESCE(li.total_qoh, 0)::integer
          OR COALESCE(p.sellable, 0) IS DISTINCT FROM COALESCE(li.total_sellable, 0)::integer
          OR COALESCE(p.is_active, FALSE) IS DISTINCT FROM (
            CASE
              WHEN COALESCE(li.total_qoh, 0)::integer <= 0 THEN FALSE
              WHEN COALESCE(p.qoh, 0) <= 0 AND COALESCE(li.total_qoh, 0)::integer > 0 THEN TRUE
              ELSE COALESCE(p.is_active, FALSE)
            END
          )
        )
      ORDER BY p.id
      LIMIT p_limit
    ),
    updated_products AS (
      UPDATE products p
      SET
        qoh = c.new_qoh,
        sellable = c.new_sellable,
        is_active = c.new_is_active,
        last_synced_at = v_now,
        updated_at = v_now
      FROM candidates c
      WHERE p.id = c.product_id
      RETURNING
        p.id,
        c.description,
        c.product_sku,
        c.lightspeed_item_id,
        c.lightspeed_category_id,
        c.old_qoh,
        c.new_qoh,
        c.old_sellable,
        c.new_sellable,
        c.old_is_active,
        c.new_is_active
    ),
    logged AS (
      INSERT INTO inventory_stock_update_logs (
        user_id,
        product_id,
        product_name,
        product_sku,
        lightspeed_item_id,
        lightspeed_category_id,
        old_qoh,
        new_qoh,
        qoh_change,
        old_sellable,
        new_sellable,
        old_is_active,
        new_is_active,
        sync_type,
        sync_source,
        metadata
      )
      SELECT
        v_user,
        u.id,
        u.description,
        u.product_sku,
        u.lightspeed_item_id,
        u.lightspeed_category_id,
        u.old_qoh,
        u.new_qoh,
        u.new_qoh - u.old_qoh,
        u.old_sellable,
        u.new_sellable,
        u.old_is_active,
        u.new_is_active,
        'auto',
        'update-inventory-stock',
        jsonb_build_object(
          'batch_id', v_batch_id,
          'reconcile_source', 'lightspeed_inventory',
          'match_key', 'lightspeed_item_id'
        )
      FROM updated_products u
      RETURNING
        id,
        old_is_active,
        new_is_active
    ),
    cache_touch AS (
      UPDATE products_all_ls pals
      SET
        total_qoh = u.new_qoh,
        total_sellable = u.new_sellable,
        last_synced_at = v_now
      FROM updated_products u
      WHERE pals.user_id = v_user
        AND pals.lightspeed_item_id = u.lightspeed_item_id
      RETURNING pals.id
    )
    SELECT
      (SELECT COUNT(*) FROM updated_products),
      (SELECT COUNT(*) FROM logged WHERE old_is_active IS TRUE AND new_is_active IS FALSE),
      (SELECT COUNT(*) FROM logged WHERE old_is_active IS FALSE AND new_is_active IS TRUE),
      (SELECT COUNT(*) FROM cache_touch)
    INTO v_products_updated, v_delisted, v_relisted, v_cache_updated;

    UPDATE lightspeed_connections
    SET last_sync_at = v_now
    WHERE lightspeed_connections.user_id = v_user;

    user_id := v_user;
    products_updated := COALESCE(v_products_updated, 0);
    delisted := COALESCE(v_delisted, 0);
    relisted := COALESCE(v_relisted, 0);
    cache_updated := COALESCE(v_cache_updated, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.reconcile_marketplace_soh_from_mirror(uuid, integer) IS
  'Reconcile marketplace products.qoh/sellable/is_active from lightspeed_inventory by lightspeed_item_id.';

GRANT EXECUTE ON FUNCTION public.reconcile_marketplace_soh_from_mirror(uuid, integer) TO service_role;
