-- Persist Serper image search results per canonical product so the optimise
-- workbench can skip repeat Serper calls for the same category.

ALTER TABLE canonical_products
ADD COLUMN IF NOT EXISTS serper_candidates JSONB,
ADD COLUMN IF NOT EXISTS serper_candidates_search_query TEXT,
ADD COLUMN IF NOT EXISTS serper_candidates_fetched_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS serper_ai_selection JSONB;

COMMENT ON COLUMN canonical_products.serper_candidates IS
  'Cached Serper image candidate list for the optimise workbench';
COMMENT ON COLUMN canonical_products.serper_candidates_search_query IS
  'Search query used when serper_candidates were fetched';
COMMENT ON COLUMN canonical_products.serper_candidates_fetched_at IS
  'When serper_candidates were last fetched from Serper';
COMMENT ON COLUMN canonical_products.serper_ai_selection IS
  'Cached AI shortlist: selectedCandidates, selectedUrls, primaryUrl, reasoning';

CREATE INDEX IF NOT EXISTS idx_canonical_products_serper_cache_fetched
  ON canonical_products (serper_candidates_fetched_at DESC NULLS LAST)
  WHERE serper_candidates IS NOT NULL;
