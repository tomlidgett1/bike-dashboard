-- Rich Lightspeed inventory mirror for Genie and operational reporting.
CREATE TABLE IF NOT EXISTS public.lightspeed_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  lightspeed_item_id TEXT NOT NULL,
  lightspeed_account_id TEXT,
  product_uuid TEXT,

  system_sku TEXT,
  custom_sku TEXT,
  manufacturer_sku TEXT,
  upc TEXT,
  ean TEXT,
  name TEXT,
  description TEXT,
  model_year TEXT,
  item_type TEXT,
  labor_duration_minutes NUMERIC(12, 4),

  brand_id TEXT,
  brand_name TEXT,
  category_id TEXT,
  category_name TEXT,
  category_path TEXT,
  supplier_id TEXT,
  supplier_name TEXT,
  supplier_archived BOOLEAN,
  supplier_currency_code TEXT,

  default_price NUMERIC(12, 4) DEFAULT 0,
  online_price NUMERIC(12, 4),
  msrp NUMERIC(12, 4),
  default_cost NUMERIC(12, 4) DEFAULT 0,
  avg_cost NUMERIC(12, 4) DEFAULT 0,

  total_qoh NUMERIC(14, 4) DEFAULT 0,
  total_sellable NUMERIC(14, 4) DEFAULT 0,
  backorder NUMERIC(14, 4) DEFAULT 0,
  component_qoh NUMERIC(14, 4) DEFAULT 0,
  component_backorder NUMERIC(14, 4) DEFAULT 0,
  reorder_point NUMERIC(14, 4) DEFAULT 0,
  reorder_level NUMERIC(14, 4) DEFAULT 0,
  on_layaway NUMERIC(14, 4) DEFAULT 0,
  on_special_order NUMERIC(14, 4) DEFAULT 0,
  on_workorder NUMERIC(14, 4) DEFAULT 0,
  on_transfer_in NUMERIC(14, 4) DEFAULT 0,
  on_transfer_out NUMERIC(14, 4) DEFAULT 0,

  is_in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  publish_to_ecom BOOLEAN,
  serialized BOOLEAN,
  discountable BOOLEAN,
  taxable BOOLEAN,
  tax_class_id TEXT,
  tax_class_name TEXT,
  department_id TEXT,
  season_id TEXT,
  default_vendor_id TEXT,
  item_matrix_id TEXT,

  primary_image_url TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  prices JSONB NOT NULL DEFAULT '[]'::jsonb,
  stock_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_item JSONB,
  raw_item_shops JSONB,
  raw_vendor JSONB,
  source_hash TEXT,

  lightspeed_created_at TIMESTAMPTZ,
  lightspeed_updated_at TIMESTAMPTZ,
  inventory_updated_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lightspeed_inventory_user_item_key UNIQUE (user_id, lightspeed_item_id)
);

CREATE INDEX IF NOT EXISTS lightspeed_inventory_user_id_idx ON public.lightspeed_inventory(user_id);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_item_id_idx ON public.lightspeed_inventory(lightspeed_item_id);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_brand_idx ON public.lightspeed_inventory(user_id, brand_name);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_supplier_idx ON public.lightspeed_inventory(user_id, supplier_name);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_category_idx ON public.lightspeed_inventory(user_id, category_path);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_stock_idx ON public.lightspeed_inventory(user_id, is_in_stock, total_qoh DESC);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_sync_batch_idx ON public.lightspeed_inventory(sync_batch_id);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_updated_idx ON public.lightspeed_inventory(user_id, lightspeed_updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_search_idx ON public.lightspeed_inventory
  USING GIN (to_tsvector('simple',
    COALESCE(description, '') || ' ' ||
    COALESCE(system_sku, '') || ' ' ||
    COALESCE(custom_sku, '') || ' ' ||
    COALESCE(upc, '') || ' ' ||
    COALESCE(ean, '') || ' ' ||
    COALESCE(brand_name, '') || ' ' ||
    COALESCE(supplier_name, '') || ' ' ||
    COALESCE(category_path, '')
  ));

CREATE OR REPLACE FUNCTION public.update_lightspeed_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lightspeed_inventory_updated_at ON public.lightspeed_inventory;
CREATE TRIGGER lightspeed_inventory_updated_at
  BEFORE UPDATE ON public.lightspeed_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lightspeed_inventory_updated_at();

ALTER TABLE public.lightspeed_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own Lightspeed inventory mirror" ON public.lightspeed_inventory;
CREATE POLICY "Users can view their own Lightspeed inventory mirror"
  ON public.lightspeed_inventory FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own Lightspeed inventory mirror" ON public.lightspeed_inventory;
CREATE POLICY "Users can update their own Lightspeed inventory mirror"
  ON public.lightspeed_inventory FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.lightspeed_inventory_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sync_batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  total_item_shop_rows INTEGER NOT NULL DEFAULT 0,
  total_unique_items INTEGER NOT NULL DEFAULT 0,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  rows_created INTEGER NOT NULL DEFAULT 0,
  rows_changed INTEGER NOT NULL DEFAULT 0,
  rows_unchanged INTEGER NOT NULL DEFAULT 0,
  rows_marked_out_of_stock INTEGER NOT NULL DEFAULT 0,
  stock_changed INTEGER NOT NULL DEFAULT 0,
  price_changed INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  hit_page_limit BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lightspeed_inventory_sync_runs_user_started_idx
  ON public.lightspeed_inventory_sync_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS lightspeed_inventory_sync_runs_batch_idx
  ON public.lightspeed_inventory_sync_runs(sync_batch_id);

ALTER TABLE public.lightspeed_inventory_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own Lightspeed inventory sync runs" ON public.lightspeed_inventory_sync_runs;
CREATE POLICY "Users can view their own Lightspeed inventory sync runs"
  ON public.lightspeed_inventory_sync_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.genie_lightspeed_inventory AS
SELECT
  user_id,
  lightspeed_item_id AS item_id,
  system_sku,
  custom_sku,
  manufacturer_sku,
  upc,
  ean,
  description,
  brand_name,
  supplier_name,
  category_name,
  category_path,
  default_price,
  online_price,
  msrp,
  default_cost,
  avg_cost,
  total_qoh,
  total_sellable,
  backorder,
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
  lightspeed_created_at,
  lightspeed_updated_at,
  inventory_updated_at,
  last_synced_at
FROM public.lightspeed_inventory;

COMMENT ON TABLE public.lightspeed_inventory IS 'Rich Lightspeed current inventory mirror used for Genie and store operations. Full ItemShop inventory rows stay current every 10 minutes; is_in_stock is derived from current total_qoh.';
COMMENT ON COLUMN public.lightspeed_inventory.brand_name IS 'Lightspeed Manufacturer.name stored as first-class brand text.';
COMMENT ON COLUMN public.lightspeed_inventory.supplier_name IS 'Lightspeed Vendor.name for the item defaultVendorID.';
COMMENT ON COLUMN public.lightspeed_inventory.source_hash IS 'Stable hash of the Lightspeed fields used to count diffs between sync runs.';
