CREATE TABLE IF NOT EXISTS public.store_supplier_scrapers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  login_url TEXT NOT NULL,
  credential_ciphertext TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'error', 'archived')),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT
    CHECK (last_run_status IS NULL OR last_run_status IN ('running', 'succeeded', 'failed')),
  last_run_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_supplier_scrapers_owner_updated_idx
  ON public.store_supplier_scrapers (owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS store_supplier_scrapers_store_updated_idx
  ON public.store_supplier_scrapers (store_id, updated_at DESC)
  WHERE store_id IS NOT NULL;

DROP TRIGGER IF EXISTS store_supplier_scrapers_updated_at
  ON public.store_supplier_scrapers;
CREATE TRIGGER store_supplier_scrapers_updated_at
  BEFORE UPDATE ON public.store_supplier_scrapers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.store_supplier_scrapers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store managers can read supplier scrapers"
  ON public.store_supplier_scrapers
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (SELECT auth.uid()) = owner_user_id
      OR (SELECT private.can_manage_store(store_id))
    )
  );

CREATE POLICY "Store managers can create supplier scrapers"
  ON public.store_supplier_scrapers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND created_by = (SELECT auth.uid())
    AND (
      (SELECT auth.uid()) = owner_user_id
      OR (SELECT private.can_manage_store(store_id))
    )
  );

CREATE POLICY "Store managers can update supplier scrapers"
  ON public.store_supplier_scrapers
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (SELECT auth.uid()) = owner_user_id
      OR (SELECT private.can_manage_store(store_id))
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (SELECT auth.uid()) = owner_user_id
      OR (SELECT private.can_manage_store(store_id))
    )
  );

CREATE POLICY "Store managers can delete supplier scrapers"
  ON public.store_supplier_scrapers
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (SELECT auth.uid()) = owner_user_id
      OR (SELECT private.can_manage_store(store_id))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.store_supplier_scrapers
  TO authenticated;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_scraper_id UUID
    REFERENCES public.store_supplier_scrapers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_product_id TEXT,
  ADD COLUMN IF NOT EXISTS supplier_source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS products_supplier_scraper_product_uidx
  ON public.products (user_id, supplier_scraper_id, supplier_product_id)
  WHERE supplier_scraper_id IS NOT NULL
    AND supplier_product_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND constraint_name = 'products_listing_source_check'
  ) THEN
    ALTER TABLE public.products DROP CONSTRAINT products_listing_source_check;
  END IF;
END $$;

ALTER TABLE public.products
  ADD CONSTRAINT products_listing_source_check
  CHECK (
    listing_source IN (
      'lightspeed',
      'manual',
      'facebook_import',
      'scheduled',
      'online_catalog',
      'fesports_scrape',
      'supplier_scrape'
    )
  );

COMMENT ON TABLE public.store_supplier_scrapers IS
  'Reusable supplier catalogue scraper definitions with encrypted credentials.';

COMMENT ON COLUMN public.store_supplier_scrapers.credential_ciphertext IS
  'AES-256-GCM encrypted supplier credentials. Plaintext credentials are never stored.';

COMMENT ON COLUMN public.products.supplier_product_id IS
  'Stable supplier product or variant identity used for reviewed repeat imports.';
