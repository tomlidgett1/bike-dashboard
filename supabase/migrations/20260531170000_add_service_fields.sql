-- Enrich store_services with pricing, duration, and highlight flag
-- price:            optional price (e.g. 89.99)
-- price_from:       when true renders "From $X" instead of "$X"
-- duration_minutes: estimated job time (nil = not shown)
-- highlight:        featured/promoted service — shown larger at top of section

ALTER TABLE store_services
  ADD COLUMN IF NOT EXISTS price            numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_from       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS highlight        boolean NOT NULL DEFAULT false;
