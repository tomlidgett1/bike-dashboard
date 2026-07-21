-- Faster durable crawls: table-backed URL queue + hero image enrichment tracking

-- ------------------------------------------------------------
-- Per-run product URL queue (avoids huge JSONB checkpoints at 100k scale)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_scrape_urls (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL
    REFERENCES public.supplier_catalogue_scrape_runs(id) ON DELETE CASCADE,
  catalogue_id UUID NOT NULL
    REFERENCES public.supplier_catalogues(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  category_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scraping', 'done', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_catalogue_scrape_urls_run_url_uidx
  ON public.supplier_catalogue_scrape_urls (run_id, url);

CREATE INDEX IF NOT EXISTS supplier_catalogue_scrape_urls_claim_idx
  ON public.supplier_catalogue_scrape_urls (run_id, status, id)
  WHERE status = 'pending';

ALTER TABLE public.supplier_catalogue_scrape_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_catalogue_scrape_urls_deny_client_access
  ON public.supplier_catalogue_scrape_urls
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.supplier_catalogue_scrape_urls TO service_role;

-- ------------------------------------------------------------
-- Shared image asset cache (dedupe by source URL hash)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_image_assets (
  source_url_hash TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  cdn_url TEXT NOT NULL,
  bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplier_catalogue_image_assets_cdn_idx
  ON public.supplier_catalogue_image_assets (cdn_url);

ALTER TABLE public.supplier_catalogue_image_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_catalogue_image_assets_deny_client_access
  ON public.supplier_catalogue_image_assets
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.supplier_catalogue_image_assets TO service_role;

-- ------------------------------------------------------------
-- Product image enrichment columns (hero-only by default)
-- ------------------------------------------------------------
ALTER TABLE public.supplier_catalogue_products
  ADD COLUMN IF NOT EXISTS hero_image_source_url TEXT,
  ADD COLUMN IF NOT EXISTS image_enrichment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS image_enrichment_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_enrichment_error TEXT;

ALTER TABLE public.supplier_catalogue_products
  DROP CONSTRAINT IF EXISTS supplier_catalogue_products_image_enrichment_status_check;

ALTER TABLE public.supplier_catalogue_products
  ADD CONSTRAINT supplier_catalogue_products_image_enrichment_status_check
  CHECK (
    image_enrichment_status IN (
      'pending',
      'processing',
      'hosted',
      'failed',
      'skipped'
    )
  );

CREATE INDEX IF NOT EXISTS supplier_catalogue_products_image_pending_idx
  ON public.supplier_catalogue_products (catalogue_id, image_enrichment_status, updated_at)
  WHERE image_enrichment_status IN ('pending', 'failed');

-- Backfill status for existing rows
UPDATE public.supplier_catalogue_products
SET
  hero_image_source_url = COALESCE(hero_image_source_url, hero_image_url),
  image_enrichment_status = CASE
    WHEN hero_image_url IS NULL OR btrim(hero_image_url) = '' THEN 'skipped'
    WHEN hero_image_url ~* 'res\.cloudinary\.com/' THEN 'hosted'
    ELSE 'pending'
  END
WHERE image_enrichment_status = 'pending'
  AND (
    hero_image_source_url IS NULL
    OR hero_image_url IS NULL
    OR hero_image_url ~* 'res\.cloudinary\.com/'
  );
