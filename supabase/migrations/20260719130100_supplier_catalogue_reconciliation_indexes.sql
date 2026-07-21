-- Cover reconciliation foreign keys used during queue/source cleanup.
CREATE INDEX IF NOT EXISTS supplier_catalogue_scrape_urls_product_idx
  ON public.supplier_catalogue_scrape_urls (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS supplier_catalogue_discovery_sources_run_idx
  ON public.supplier_catalogue_discovery_sources (run_id)
  WHERE run_id IS NOT NULL;
