-- ============================================================
-- Global shared supplier catalogue + fast NL search RPC
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- supplier_catalogues (platform-owned B2B sources)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_catalogues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  login_url TEXT NOT NULL,
  credential_ciphertext TEXT NOT NULL DEFAULT '',
  scrape_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'discovering', 'crawling', 'ready', 'error')),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT
    CHECK (last_run_status IS NULL OR last_run_status IN ('running', 'succeeded', 'failed')),
  last_run_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  product_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_catalogues_base_url_uidx
  ON public.supplier_catalogues (lower(base_url));

CREATE INDEX IF NOT EXISTS supplier_catalogues_status_idx
  ON public.supplier_catalogues (status, updated_at DESC);

DROP TRIGGER IF EXISTS supplier_catalogues_updated_at
  ON public.supplier_catalogues;
CREATE TRIGGER supplier_catalogues_updated_at
  BEFORE UPDATE ON public.supplier_catalogues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_catalogues ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_catalogues_deny_client_access
  ON public.supplier_catalogues
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.supplier_catalogues TO service_role;

COMMENT ON TABLE public.supplier_catalogues IS
  'Platform-curated B2B supplier sources for the shared supplier catalogue. Credentials are service-role only.';

-- ------------------------------------------------------------
-- supplier_catalogue_scrape_runs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id UUID NOT NULL
    REFERENCES public.supplier_catalogues(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'discovering', 'crawling', 'enriching', 'succeeded', 'failed', 'cancelled')),
  phase TEXT NOT NULL DEFAULT 'queued',
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  products_found INTEGER NOT NULL DEFAULT 0,
  products_upserted INTEGER NOT NULL DEFAULT 0,
  images_processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplier_catalogue_scrape_runs_catalogue_idx
  ON public.supplier_catalogue_scrape_runs (catalogue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_catalogue_scrape_runs_status_idx
  ON public.supplier_catalogue_scrape_runs (status, created_at DESC);

DROP TRIGGER IF EXISTS supplier_catalogue_scrape_runs_updated_at
  ON public.supplier_catalogue_scrape_runs;
CREATE TRIGGER supplier_catalogue_scrape_runs_updated_at
  BEFORE UPDATE ON public.supplier_catalogue_scrape_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_catalogue_scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_catalogue_scrape_runs_deny_client_access
  ON public.supplier_catalogue_scrape_runs
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.supplier_catalogue_scrape_runs TO service_role;

-- ------------------------------------------------------------
-- supplier_catalogue_products (canonical shared rows)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id UUID NOT NULL
    REFERENCES public.supplier_catalogues(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  supplier_product_id TEXT NOT NULL,
  supplier_sku TEXT,
  upc TEXT,
  ean TEXT,
  source_url TEXT NOT NULL,

  name TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  category_path TEXT[] NOT NULL DEFAULT '{}'::text[],
  product_type TEXT,

  audience TEXT NOT NULL DEFAULT 'unknown'
    CHECK (audience IN ('kids', 'mens', 'womens', 'unisex', 'unknown')),
  audience_raw TEXT,

  cost_price NUMERIC(12, 2),
  retail_price NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'AUD',
  price_confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (price_confidence IN ('known', 'inferred', 'unknown')),

  stock_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (stock_status IN ('in_stock', 'out_of_stock', 'unknown')),
  stock_quantity NUMERIC(12, 2),
  stock_raw TEXT,

  sizes TEXT[] NOT NULL DEFAULT '{}'::text[],
  colours TEXT[] NOT NULL DEFAULT '{}'::text[],
  variant_summary JSONB NOT NULL DEFAULT '[]'::jsonb,

  hero_image_url TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}'::text[],

  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  search_text TEXT NOT NULL DEFAULT '',

  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.supplier_catalogue_products_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text := trim(
    both ' ' FROM
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.brand, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.product_type, '') || ' ' ||
    coalesce(NEW.audience, '') || ' ' ||
    coalesce(NEW.audience_raw, '') || ' ' ||
    coalesce(NEW.supplier_name, '') || ' ' ||
    coalesce(NEW.supplier_sku, '') || ' ' ||
    coalesce(NEW.upc, '') || ' ' ||
    coalesce(NEW.ean, '') || ' ' ||
    coalesce(array_to_string(NEW.category_path, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.sizes, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.colours, ' '), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_catalogue_products_search_text
  ON public.supplier_catalogue_products;
CREATE TRIGGER supplier_catalogue_products_search_text
  BEFORE INSERT OR UPDATE OF
    name, brand, description, product_type, audience, audience_raw,
    supplier_name, supplier_sku, upc, ean, category_path, sizes, colours
  ON public.supplier_catalogue_products
  FOR EACH ROW
  EXECUTE FUNCTION public.supplier_catalogue_products_search_text();

CREATE UNIQUE INDEX IF NOT EXISTS supplier_catalogue_products_uidx
  ON public.supplier_catalogue_products (catalogue_id, supplier_product_id);

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_catalogue_idx
  ON public.supplier_catalogue_products (catalogue_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_supplier_name_idx
  ON public.supplier_catalogue_products (supplier_name);

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_brand_idx
  ON public.supplier_catalogue_products (brand)
  WHERE brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_audience_idx
  ON public.supplier_catalogue_products (audience);

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_stock_idx
  ON public.supplier_catalogue_products (stock_status);

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_fts_idx
  ON public.supplier_catalogue_products
  USING gin (to_tsvector('english', search_text));

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_trgm_idx
  ON public.supplier_catalogue_products
  USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_name_trgm_idx
  ON public.supplier_catalogue_products
  USING gin (name gin_trgm_ops);

DROP TRIGGER IF EXISTS supplier_catalogue_products_updated_at
  ON public.supplier_catalogue_products;
CREATE TRIGGER supplier_catalogue_products_updated_at
  BEFORE UPDATE ON public.supplier_catalogue_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_catalogue_products ENABLE ROW LEVEL SECURITY;

-- Verified bike stores (and active store members) can read products only
CREATE POLICY supplier_catalogue_products_store_select
  ON public.supplier_catalogue_products
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'bicycle_store'
        AND u.bicycle_store IS TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.store_memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

GRANT SELECT ON TABLE public.supplier_catalogue_products TO authenticated;
GRANT ALL ON TABLE public.supplier_catalogue_products TO service_role;

COMMENT ON TABLE public.supplier_catalogue_products IS
  'Global shared supplier catalogue. One row per product with aggregated sizes/colours.';

-- ------------------------------------------------------------
-- Helper: is the caller a verified bike store or store member?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_bike_store_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.user_id = (SELECT auth.uid())
          AND u.account_type = 'bicycle_store'
          AND u.bicycle_store IS TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.store_memberships m
        WHERE m.user_id = (SELECT auth.uid())
          AND m.status = 'active'
      )
    );
$$;

-- ------------------------------------------------------------
-- search_supplier_catalogue
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_supplier_catalogue(
  query_text TEXT,
  filters JSONB DEFAULT '{}'::jsonb,
  result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  product_id UUID,
  relevance_score DOUBLE PRECISION,
  name TEXT,
  brand TEXT,
  supplier_name TEXT,
  audience TEXT,
  product_type TEXT,
  sizes TEXT[],
  colours TEXT[],
  cost_price NUMERIC,
  retail_price NUMERIC,
  currency TEXT,
  stock_status TEXT,
  stock_quantity NUMERIC,
  hero_image_url TEXT,
  source_url TEXT,
  category_path TEXT[],
  supplier_sku TEXT,
  upc TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  cleaned TEXT := trim(coalesce(query_text, ''));
  lim INTEGER := GREATEST(1, LEAST(coalesce(result_limit, 50), 200));
  filter_audience TEXT := nullif(lower(trim(coalesce(filters->>'audience', ''))), '');
  filter_brand TEXT := nullif(lower(trim(coalesce(filters->>'brand', ''))), '');
  filter_product_type TEXT := nullif(lower(trim(coalesce(filters->>'productType', ''))), '');
  filter_colour TEXT := nullif(lower(trim(coalesce(filters->>'colour', ''))), '');
  filter_size TEXT := nullif(lower(trim(coalesce(filters->>'size', ''))), '');
  filter_in_stock BOOLEAN := coalesce((filters->>'inStockOnly')::boolean, false);
  filter_supplier TEXT := nullif(lower(trim(coalesce(filters->>'supplier', ''))), '');
  ts_query tsquery;
BEGIN
  IF NOT private.is_bike_store_operator() THEN
    RAISE EXCEPTION 'not authorised to search supplier catalogue'
      USING ERRCODE = '42501';
  END IF;

  IF cleaned = '' THEN
    RETURN;
  END IF;

  BEGIN
    ts_query := websearch_to_tsquery('english', cleaned);
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('english', cleaned);
  END;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    (
      coalesce(ts_rank(to_tsvector('english', p.search_text), ts_query), 0) * 10
      + coalesce(similarity(p.name, cleaned), 0) * 6
      + coalesce(similarity(p.search_text, cleaned), 0) * 2
      + CASE
          WHEN filter_audience IS NOT NULL AND p.audience = filter_audience THEN 4
          ELSE 0
        END
      + CASE
          WHEN filter_brand IS NOT NULL AND lower(coalesce(p.brand, '')) = filter_brand THEN 5
          WHEN filter_brand IS NOT NULL AND (
            lower(coalesce(p.brand, '')) LIKE '%' || filter_brand || '%'
            OR lower(p.name) LIKE '%' || filter_brand || '%'
          ) THEN 2.5
          ELSE 0
        END
      + CASE
          WHEN filter_product_type IS NOT NULL
            AND (
              lower(coalesce(p.product_type, '')) LIKE '%' || filter_product_type || '%'
              OR lower(p.name) LIKE '%' || filter_product_type || '%'
              OR lower(array_to_string(p.category_path, ' ')) LIKE '%' || filter_product_type || '%'
            )
          THEN 3.5
          ELSE 0
        END
      + CASE
          WHEN filter_colour IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(p.colours) AS c
              WHERE lower(c) LIKE '%' || filter_colour || '%'
            )
          THEN 2.5
          ELSE 0
        END
      + CASE
          WHEN filter_size IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(p.sizes) AS s
              WHERE lower(s) LIKE '%' || filter_size || '%'
            )
          THEN 2
          ELSE 0
        END
      + CASE
          WHEN filter_supplier IS NOT NULL
            AND lower(p.supplier_name) LIKE '%' || filter_supplier || '%'
          THEN 2
          ELSE 0
        END
      + CASE WHEN p.stock_status = 'in_stock' THEN 0.75 ELSE 0 END
      + CASE WHEN p.hero_image_url IS NOT NULL THEN 0.25 ELSE 0 END
    )::double precision AS relevance_score,
    p.name,
    p.brand,
    p.supplier_name,
    p.audience,
    p.product_type,
    p.sizes,
    p.colours,
    p.cost_price,
    p.retail_price,
    p.currency,
    p.stock_status,
    p.stock_quantity,
    p.hero_image_url,
    p.source_url,
    p.category_path,
    p.supplier_sku,
    p.upc
  FROM public.supplier_catalogue_products p
  WHERE
    (
      to_tsvector('english', p.search_text) @@ ts_query
      OR p.search_text ILIKE '%' || cleaned || '%'
      OR similarity(p.name, cleaned) > 0.15
      OR similarity(p.search_text, cleaned) > 0.12
    )
    AND (filter_audience IS NULL OR p.audience = filter_audience)
    AND (
      filter_brand IS NULL
      OR lower(coalesce(p.brand, '')) LIKE '%' || filter_brand || '%'
      OR lower(p.name) LIKE '%' || filter_brand || '%'
      OR lower(p.search_text) LIKE '%' || filter_brand || '%'
    )
    AND (
      filter_product_type IS NULL
      OR lower(coalesce(p.product_type, '')) LIKE '%' || filter_product_type || '%'
      OR lower(p.name) LIKE '%' || filter_product_type || '%'
      OR lower(array_to_string(p.category_path, ' ')) LIKE '%' || filter_product_type || '%'
    )
    AND (
      filter_colour IS NULL
      OR EXISTS (
        SELECT 1
        FROM unnest(p.colours) AS c
        WHERE lower(c) LIKE '%' || filter_colour || '%'
      )
    )
    AND (
      filter_size IS NULL
      OR EXISTS (
        SELECT 1
        FROM unnest(p.sizes) AS s
        WHERE lower(s) LIKE '%' || filter_size || '%'
      )
    )
    AND (
      filter_supplier IS NULL
      OR lower(p.supplier_name) LIKE '%' || filter_supplier || '%'
    )
    AND (NOT filter_in_stock OR p.stock_status = 'in_stock')
  ORDER BY relevance_score DESC, p.name ASC
  LIMIT lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_supplier_catalogue(TEXT, JSONB, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_supplier_catalogue(TEXT, JSONB, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.search_supplier_catalogue IS
  'Fast ranked supplier catalogue search: FTS + trigram + structured filter boosts.';

GRANT EXECUTE ON FUNCTION private.is_bike_store_operator() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_bike_store_operator() TO service_role;
