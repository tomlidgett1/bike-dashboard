-- ============================================================
-- Product Discounts (percentage-based, optional expiry)
-- ============================================================
-- Adds store-managed discount pricing to products. A store can apply a
-- percentage discount to one or more products (e.g. "50% off all Clif bars"),
-- optionally with an end date after which the discount lapses.
--
-- sale_price is a STORED generated column: it is the discounted price
-- WHENEVER a percentage is set. Whether the discount is *currently live* is a
-- render-time decision (discount_active AND (discount_ends_at IS NULL OR
-- discount_ends_at > now())) because now() is not immutable and cannot live in
-- a generated expression.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Discount inputs ----------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_ends_at TIMESTAMPTZ;

-- Keep percentages sane (0 < pct <= 100). Guarded so re-runs don't error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_discount_percent_range'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_discount_percent_range
      CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100));
  END IF;
END $$;

-- 2. Computed sale price ------------------------------------------------------
-- NULL when no discount percentage is set, otherwise the rounded discounted price.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10, 2)
  GENERATED ALWAYS AS (
    CASE
      WHEN discount_percent IS NOT NULL AND discount_percent > 0
        THEN ROUND(price * (1 - discount_percent / 100.0), 2)
      ELSE NULL
    END
  ) STORED;

-- 3. Index to make "list this store's active discounts" cheap -----------------
CREATE INDEX IF NOT EXISTS products_active_discount_idx
  ON products (user_id)
  WHERE discount_active = true;
