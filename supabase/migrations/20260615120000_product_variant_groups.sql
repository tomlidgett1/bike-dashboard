-- ============================================================
-- Product Variants / Matrix
-- ============================================================
-- Lets a store turn several separate listings that are really the
-- same product in different sizes/colours/frame sizes into ONE
-- master product with selectable variants. Local-first; optional
-- write-back to Lightspeed as an ItemMatrix.
--
--   detection_runs       -- one AI scan over a chosen product scope
--   detection_candidates -- a suggested variant group awaiting review
--   variant_groups       -- an approved+applied group of real products
--   variant_options      -- e.g. Size, Colour, Frame Size  (attribute1..3)
--   variant_values       -- e.g. Small / Medium / Black / 54cm
--   variant_group_items  -- links existing products into a group (no copy)
--   audit_logs           -- who detected/approved/applied/synced/failed
-- ============================================================

-- 1. Detection runs ------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variant_detection_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','ready','failed','cancelled')),
  scope            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {categories[], brands[], all_products}
  products_total   integer NOT NULL DEFAULT 0,
  buckets_total    integer NOT NULL DEFAULT 0,
  buckets_done     integer NOT NULL DEFAULT 0,
  candidates_total integer NOT NULL DEFAULT 0,
  phase            text,                                  -- preparing|analysing|building|ready
  message          text,
  error_message    text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {buckets:[...]} working set for the job
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

-- 2. Detection candidates -----------------------------------------
CREATE TABLE IF NOT EXISTS product_variant_detection_candidates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES product_variant_detection_runs(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','applied_local','applied_lightspeed','failed')),
  proposed_master_title text NOT NULL,
  base_title            text,
  brand                 text,
  category_name         text,
  option_types          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{name}]
  items                 jsonb NOT NULL DEFAULT '[]'::jsonb,  -- editable snapshot, see code
  confidence            text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  explanation           text,
  warnings              jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_group_id      uuid,                               -- FK added after groups table
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3. Variant groups -----------------------------------------------
CREATE TABLE IF NOT EXISTS product_variant_groups (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  master_title             text NOT NULL,
  brand                    text,
  category_name            text,
  lightspeed_category_id   text,
  visibility_mode          text NOT NULL DEFAULT 'master_only'
                             CHECK (visibility_mode IN ('master_only','individual_and_master')),
  sync_target              text NOT NULL DEFAULT 'local'
                             CHECK (sync_target IN ('local','lightspeed')),
  lightspeed_status        text NOT NULL DEFAULT 'not_requested'
                             CHECK (lightspeed_status IN ('not_requested','requested','synced','failed')),
  lightspeed_item_matrix_id   text,
  lightspeed_attribute_set_id text,
  lightspeed_synced_item_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  lightspeed_error         text,
  source_candidate_id      uuid REFERENCES product_variant_detection_candidates(id) ON DELETE SET NULL,
  status                   text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_variant_detection_candidates
  ADD CONSTRAINT product_variant_candidates_applied_group_fk
  FOREIGN KEY (applied_group_id) REFERENCES product_variant_groups(id) ON DELETE SET NULL;

-- 4. Variant options (Size / Colour / Frame Size) -----------------
CREATE TABLE IF NOT EXISTS product_variant_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES product_variant_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  position   smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Variant values (Small / Black / 54cm) ------------------------
CREATE TABLE IF NOT EXISTS product_variant_values (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id  uuid NOT NULL REFERENCES product_variant_options(id) ON DELETE CASCADE,
  group_id   uuid NOT NULL REFERENCES product_variant_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value      text NOT NULL,
  position   smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Group items (links existing products — no duplication) -------
CREATE TABLE IF NOT EXISTS product_variant_group_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES product_variant_groups(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_master         boolean NOT NULL DEFAULT false,
  value_assignments jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {option_name: value}
  position          smallint NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, product_id)
);

-- 7. Audit log ----------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variant_audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id     uuid REFERENCES product_variant_groups(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES product_variant_detection_candidates(id) ON DELETE SET NULL,
  run_id       uuid REFERENCES product_variant_detection_runs(id) ON DELETE SET NULL,
  action       text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 8. Additive product columns ------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_group_id        uuid REFERENCES product_variant_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_master_title    text,
  ADD COLUMN IF NOT EXISTS variant_hidden_from_grid boolean NOT NULL DEFAULT false;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS pv_runs_user_created_idx ON product_variant_detection_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pv_runs_user_status_idx  ON product_variant_detection_runs (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS pv_candidates_run_idx     ON product_variant_detection_candidates (run_id);
CREATE INDEX IF NOT EXISTS pv_candidates_user_status_idx ON product_variant_detection_candidates (user_id, status);
CREATE INDEX IF NOT EXISTS pv_groups_user_status_idx ON product_variant_groups (user_id, status);
CREATE INDEX IF NOT EXISTS pv_options_group_idx      ON product_variant_options (group_id);
CREATE INDEX IF NOT EXISTS pv_values_option_idx      ON product_variant_values (option_id);
CREATE INDEX IF NOT EXISTS pv_values_group_idx       ON product_variant_values (group_id);
CREATE INDEX IF NOT EXISTS pv_group_items_group_idx  ON product_variant_group_items (group_id);
CREATE INDEX IF NOT EXISTS pv_group_items_product_idx ON product_variant_group_items (product_id);
CREATE INDEX IF NOT EXISTS pv_audit_user_created_idx ON product_variant_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pv_audit_group_idx        ON product_variant_audit_logs (group_id);
CREATE INDEX IF NOT EXISTS products_variant_group_id_idx ON products (variant_group_id) WHERE variant_group_id IS NOT NULL;

-- ============================================================
-- updated_at triggers (reuse existing update_updated_at_column())
-- ============================================================
CREATE TRIGGER pv_runs_updated_at       BEFORE UPDATE ON product_variant_detection_runs       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER pv_candidates_updated_at BEFORE UPDATE ON product_variant_detection_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER pv_groups_updated_at     BEFORE UPDATE ON product_variant_groups               FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE product_variant_detection_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_detection_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_groups               ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_options              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_values               ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_group_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_audit_logs           ENABLE ROW LEVEL SECURITY;

-- Owner-only admin tables (runs / candidates / audit)
CREATE POLICY "Owners manage their variant detection runs"
  ON product_variant_detection_runs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage their variant candidates"
  ON product_variant_detection_candidates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners read their variant audit logs"
  ON product_variant_audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners append their variant audit logs"
  ON product_variant_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Groups: owners manage everything; public can read ACTIVE groups (storefront)
CREATE POLICY "Owners manage their variant groups"
  ON product_variant_groups FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can view active variant groups"
  ON product_variant_groups FOR SELECT
  USING (status = 'active');

-- Options / values / group items: owners manage; public can read (storefront selector)
CREATE POLICY "Owners manage their variant options"
  ON product_variant_options FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can view variant options"
  ON product_variant_options FOR SELECT USING (true);

CREATE POLICY "Owners manage their variant values"
  ON product_variant_values FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can view variant values"
  ON product_variant_values FOR SELECT USING (true);

CREATE POLICY "Owners manage their variant group items"
  ON product_variant_group_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can view variant group items"
  ON product_variant_group_items FOR SELECT USING (true);

-- ============================================================
-- apply_variant_group(): atomic local creation of a variant group
-- from an approved candidate. SECURITY DEFINER so it can write the
-- group + options + values + items + product flags + audit in one
-- transaction. Guards against products that are missing, owned by a
-- different store, or already in another variant group.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_variant_group(
  p_user_id              uuid,
  p_candidate_id         uuid,
  p_master_title         text,
  p_brand                text,
  p_category_name        text,
  p_lightspeed_category_id text,
  p_visibility_mode      text,
  p_sync_target          text,
  p_options              jsonb,   -- [{name, position, values:[{value, position}]}]
  p_items                jsonb    -- [{product_id, is_master, value_assignments, position}]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id   uuid;
  v_option     jsonb;
  v_option_id  uuid;
  v_value      jsonb;
  v_item       jsonb;
  v_product_id uuid;
  v_is_master  boolean;
  v_conflicts  integer;
BEGIN
  IF p_visibility_mode NOT IN ('master_only','individual_and_master') THEN
    RAISE EXCEPTION 'VARIANT_APPLY_BAD_VISIBILITY: %', p_visibility_mode;
  END IF;

  -- Guard: every product must exist, be owned by this store, and not already be grouped.
  SELECT count(*) INTO v_conflicts
  FROM jsonb_array_elements(p_items) AS arr(item)
  LEFT JOIN products p ON p.id = (arr.item->>'product_id')::uuid
  WHERE p.id IS NULL
     OR p.user_id <> p_user_id
     OR p.variant_group_id IS NOT NULL;

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'VARIANT_APPLY_CONFLICT: % product(s) are missing, not owned by this store, or already in a variant group', v_conflicts;
  END IF;

  INSERT INTO product_variant_groups (
    user_id, master_title, brand, category_name, lightspeed_category_id,
    visibility_mode, sync_target, status, source_candidate_id
  ) VALUES (
    p_user_id, p_master_title, NULLIF(p_brand,''), NULLIF(p_category_name,''), NULLIF(p_lightspeed_category_id,''),
    p_visibility_mode, p_sync_target, 'active', p_candidate_id
  ) RETURNING id INTO v_group_id;

  -- Options + their values
  FOR v_option IN SELECT value FROM jsonb_array_elements(p_options)
  LOOP
    INSERT INTO product_variant_options (group_id, user_id, name, position)
    VALUES (v_group_id, p_user_id, v_option->>'name', COALESCE((v_option->>'position')::smallint, 1))
    RETURNING id INTO v_option_id;

    FOR v_value IN SELECT value FROM jsonb_array_elements(COALESCE(v_option->'values', '[]'::jsonb))
    LOOP
      INSERT INTO product_variant_values (option_id, group_id, user_id, value, position)
      VALUES (v_option_id, v_group_id, p_user_id, v_value->>'value', COALESCE((v_value->>'position')::smallint, 1));
    END LOOP;
  END LOOP;

  -- Items + product flags
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_is_master  := COALESCE((v_item->>'is_master')::boolean, false);

    INSERT INTO product_variant_group_items (group_id, user_id, product_id, is_master, value_assignments, position)
    VALUES (
      v_group_id, p_user_id, v_product_id, v_is_master,
      COALESCE(v_item->'value_assignments', '{}'::jsonb),
      COALESCE((v_item->>'position')::smallint, 0)
    );

    UPDATE products
    SET variant_group_id = v_group_id,
        -- Hide non-master children from grids only when showing a single listing.
        variant_hidden_from_grid = (p_visibility_mode = 'master_only' AND NOT v_is_master),
        -- The master child shows the master title in grids (single-listing mode only).
        variant_master_title = CASE
          WHEN v_is_master AND p_visibility_mode = 'master_only' THEN p_master_title
          ELSE NULL
        END,
        updated_at = now()
    WHERE id = v_product_id;
  END LOOP;

  UPDATE product_variant_detection_candidates
  SET status = 'applied_local', applied_group_id = v_group_id, updated_at = now()
  WHERE id = p_candidate_id AND user_id = p_user_id;

  INSERT INTO product_variant_audit_logs (user_id, group_id, candidate_id, action, detail)
  VALUES (
    p_user_id, v_group_id, p_candidate_id, 'created_local',
    jsonb_build_object(
      'visibility_mode', p_visibility_mode,
      'sync_target', p_sync_target,
      'item_count', jsonb_array_length(p_items)
    )
  );

  RETURN v_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_variant_group(
  uuid, uuid, text, text, text, text, text, text, jsonb, jsonb
) TO authenticated, service_role;
