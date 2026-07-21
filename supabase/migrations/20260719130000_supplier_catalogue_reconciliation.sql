-- Supplier catalogue reconciliation and defensible completion tracking.
-- A crawl is only "succeeded" when every discovered URL was ingested and an
-- authoritative supplier total reconciles. Otherwise it remains explicitly
-- coverage_unverified or incomplete.

-- ------------------------------------------------------------
-- Catalogue/run coverage state
-- ------------------------------------------------------------
ALTER TABLE public.supplier_catalogues
  DROP CONSTRAINT IF EXISTS supplier_catalogues_status_check;

ALTER TABLE public.supplier_catalogues
  ADD CONSTRAINT supplier_catalogues_status_check
  CHECK (
    status IN (
      'pending',
      'discovering',
      'crawling',
      'ready',
      'coverage_unverified',
      'incomplete',
      'error'
    )
  );

ALTER TABLE public.supplier_catalogues
  DROP CONSTRAINT IF EXISTS supplier_catalogues_last_run_status_check;

ALTER TABLE public.supplier_catalogues
  ADD CONSTRAINT supplier_catalogues_last_run_status_check
  CHECK (
    last_run_status IS NULL
    OR last_run_status IN (
      'running',
      'succeeded',
      'coverage_unverified',
      'incomplete',
      'failed'
    )
  );

ALTER TABLE public.supplier_catalogues
  ADD COLUMN IF NOT EXISTS coverage_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS authoritative_total INTEGER,
  ADD COLUMN IF NOT EXISTS authoritative_source TEXT,
  ADD COLUMN IF NOT EXISTS coverage_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage_verified_at TIMESTAMPTZ;

ALTER TABLE public.supplier_catalogues
  DROP CONSTRAINT IF EXISTS supplier_catalogues_coverage_status_check;

ALTER TABLE public.supplier_catalogues
  ADD CONSTRAINT supplier_catalogues_coverage_status_check
  CHECK (
    coverage_status IN (
      'unknown',
      'verifying',
      'verified',
      'unverified',
      'incomplete'
    )
  );

ALTER TABLE public.supplier_catalogue_scrape_runs
  DROP CONSTRAINT IF EXISTS supplier_catalogue_scrape_runs_status_check;

ALTER TABLE public.supplier_catalogue_scrape_runs
  ADD CONSTRAINT supplier_catalogue_scrape_runs_status_check
  CHECK (
    status IN (
      'queued',
      'discovering',
      'crawling',
      'enriching',
      'succeeded',
      'coverage_unverified',
      'incomplete',
      'failed',
      'cancelled'
    )
  );

ALTER TABLE public.supplier_catalogue_scrape_runs
  ADD COLUMN IF NOT EXISTS coverage_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS authoritative_total INTEGER,
  ADD COLUMN IF NOT EXISTS authoritative_source TEXT,
  ADD COLUMN IF NOT EXISTS discovered_url_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingested_url_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_url_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unresolved_url_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.supplier_catalogue_scrape_runs
  DROP CONSTRAINT IF EXISTS supplier_catalogue_scrape_runs_coverage_status_check;

ALTER TABLE public.supplier_catalogue_scrape_runs
  ADD CONSTRAINT supplier_catalogue_scrape_runs_coverage_status_check
  CHECK (
    coverage_status IN (
      'unknown',
      'verifying',
      'verified',
      'unverified',
      'incomplete'
    )
  );

-- ------------------------------------------------------------
-- Per-URL retry and reconciliation state
-- ------------------------------------------------------------
ALTER TABLE public.supplier_catalogue_scrape_urls
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS product_id UUID
    REFERENCES public.supplier_catalogue_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discovered_via TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.supplier_catalogue_scrape_urls
  ADD CONSTRAINT supplier_catalogue_scrape_urls_attempt_count_check
  CHECK (attempt_count >= 0 AND max_attempts >= 1);

DROP INDEX IF EXISTS supplier_catalogue_scrape_urls_claim_idx;
CREATE INDEX supplier_catalogue_scrape_urls_claim_idx
  ON public.supplier_catalogue_scrape_urls
  (run_id, status, next_retry_at, attempt_count, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS supplier_catalogue_scrape_urls_terminal_failed_idx
  ON public.supplier_catalogue_scrape_urls (run_id, attempt_count, id)
  WHERE status = 'failed';

-- Existing completed rows can be linked to their canonical product.
UPDATE public.supplier_catalogue_scrape_urls q
SET
  product_id = p.id,
  completed_at = COALESCE(q.completed_at, q.updated_at)
FROM public.supplier_catalogue_products p
WHERE q.status = 'done'
  AND q.product_id IS NULL
  AND p.catalogue_id = q.catalogue_id
  AND p.source_url = q.url;

-- ------------------------------------------------------------
-- Learned discovery sources (sitemaps, JSON APIs, GraphQL, feeds)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_discovery_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id UUID NOT NULL
    REFERENCES public.supplier_catalogues(id) ON DELETE CASCADE,
  run_id UUID
    REFERENCES public.supplier_catalogue_scrape_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('page', 'sitemap', 'api', 'graphql', 'feed', 'export')),
  scope TEXT NOT NULL DEFAULT 'target'
    CHECK (scope IN ('catalogue', 'target')),
  endpoint_url TEXT NOT NULL,
  request_method TEXT NOT NULL DEFAULT 'GET',
  request_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_total INTEGER,
  product_url_count INTEGER NOT NULL DEFAULT 0,
  is_authoritative BOOLEAN NOT NULL DEFAULT FALSE,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'stale', 'failed')),
  last_error TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalogue_id, source_type, endpoint_url)
);

CREATE INDEX IF NOT EXISTS supplier_catalogue_discovery_sources_catalogue_idx
  ON public.supplier_catalogue_discovery_sources
  (catalogue_id, status, is_authoritative DESC, updated_at DESC);

ALTER TABLE public.supplier_catalogue_discovery_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_catalogue_discovery_sources_deny_client_access
  ON public.supplier_catalogue_discovery_sources
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.supplier_catalogue_discovery_sources TO service_role;

DROP TRIGGER IF EXISTS supplier_catalogue_discovery_sources_updated_at
  ON public.supplier_catalogue_discovery_sources;
CREATE TRIGGER supplier_catalogue_discovery_sources_updated_at
  BEFORE UPDATE ON public.supplier_catalogue_discovery_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
