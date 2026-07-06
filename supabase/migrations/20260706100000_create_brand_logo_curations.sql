-- Brand logo curation workflow for admin approval of store brand logos

CREATE TABLE IF NOT EXISTS brand_logo_curations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  manufacturer_id TEXT,
  manufacturer_name TEXT,
  brand_key TEXT GENERATED ALWAYS AS (
    COALESCE(manufacturer_id, lower(trim(brand_name)))
  ) STORED,
  product_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'skipped')),
  approved_logo_url TEXT,
  store_brand_id UUID REFERENCES store_brands(id) ON DELETE SET NULL,
  search_query TEXT,
  rejected_urls TEXT[] NOT NULL DEFAULT '{}',
  search_page INTEGER NOT NULL DEFAULT 1,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store_user_id, brand_key)
);

CREATE INDEX IF NOT EXISTS brand_logo_curations_store_user_id_idx
  ON brand_logo_curations(store_user_id);

CREATE INDEX IF NOT EXISTS brand_logo_curations_status_idx
  ON brand_logo_curations(status);

ALTER TABLE brand_logo_curations ENABLE ROW LEVEL SECURITY;

-- Admin workflows use the service-role client; no public policies required.
