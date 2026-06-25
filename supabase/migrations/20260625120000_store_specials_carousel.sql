-- ============================================================
-- Specials Carousel — AI-driven, auto-rotating store specials
-- ============================================================
-- A store owner configures a recurring "specials" carousel that rotates a new
-- set of discounted products every day or every week. Discounts are proposed
-- from Lightspeed economics (retail, cost, margin) blended with sell-through
-- (units sold + days since last sold), then curated by AI to fit a chosen
-- strategy. Each rotation = one "cycle"; we keep a pipeline of upcoming cycles
-- so the owner can preview and hand-tune the next 2-3 rotations.
--
-- Storefront rendering reuses the existing carousel system: a single
-- store_categories row (source = 'specials') is the carousel anchor, so it is
-- reorderable on the Carousels page and positionable on the homepage for free.
-- Its product_ids are kept in sync with the active cycle's items (in order).
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Per-store configuration --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_specials_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  is_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Rotation cadence + when (store-local hour) the daily/weekly flip happens.
  cadence TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily', 'weekly')),
  rotation_hour INTEGER NOT NULL DEFAULT 3 CHECK (rotation_hour BETWEEN 0 AND 23),
  -- 0=Mon … 6=Sun. Only meaningful for weekly cadence (the weekday it flips).
  rotation_weekday INTEGER NOT NULL DEFAULT 0 CHECK (rotation_weekday BETWEEN 0 AND 6),
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',

  -- How products are grouped each cycle.
  --  random            → N unrelated products
  --  single_category   → N products from ONE rotating category (e.g. 5 lights)
  --  one_per_category  → 1 product from each of N different categories
  --  clearance         → the most overstocked / slowest movers
  strategy TEXT NOT NULL DEFAULT 'random'
    CHECK (strategy IN ('random', 'single_category', 'one_per_category', 'clearance')),

  -- auto: AI/heuristic fills the cycle. manual: owner hand-picks every product.
  selection_mode TEXT NOT NULL DEFAULT 'auto' CHECK (selection_mode IN ('auto', 'manual')),
  products_per_cycle INTEGER NOT NULL DEFAULT 5 CHECK (products_per_cycle BETWEEN 1 AND 60),
  -- For one_per_category: how many distinct categories to feature.
  category_count INTEGER NOT NULL DEFAULT 5 CHECK (category_count BETWEEN 1 AND 20),

  -- Discount engine knobs.
  min_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 10,
  max_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 50,
  -- Never propose a discount that pushes margin below this floor.
  min_margin_floor_percent NUMERIC(5, 2) NOT NULL DEFAULT 15,
  -- 0..1 — higher discounts harder for slow/stale/high-margin stock.
  discount_aggressiveness NUMERIC(4, 3) NOT NULL DEFAULT 0.5
    CHECK (discount_aggressiveness BETWEEN 0 AND 1),
  -- Days with no sale before a product is considered "stale".
  stale_days_threshold INTEGER NOT NULL DEFAULT 90 CHECK (stale_days_threshold > 0),

  -- No-recycle window: a product cannot reappear for at least this many cycles.
  min_cooldown_cycles INTEGER NOT NULL DEFAULT 4 CHECK (min_cooldown_cycles >= 0),

  -- AI curation toggle (falls back to the deterministic engine when off / no key).
  ai_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Storefront presentation.
  carousel_title TEXT NOT NULL DEFAULT 'Today''s specials',
  carousel_subtitle TEXT,
  -- Anchor row in store_categories (source='specials') used to render + position.
  carousel_category_id UUID REFERENCES public.store_categories(id) ON DELETE SET NULL,

  last_rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT store_specials_discount_range
    CHECK (min_discount_percent >= 0
       AND max_discount_percent <= 100
       AND min_discount_percent <= max_discount_percent)
);

-- 2. Rotations (cycles) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_specials_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Monotonically increasing per store; drives the no-recycle cooldown window.
  cycle_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'expired', 'skipped')),

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,

  -- Snapshots of the config used to build this cycle (config can change later).
  cadence TEXT NOT NULL DEFAULT 'weekly',
  strategy TEXT NOT NULL DEFAULT 'random',
  generated_by TEXT NOT NULL DEFAULT 'heuristic'
    CHECK (generated_by IN ('ai', 'heuristic', 'manual')),
  theme_label TEXT,
  ai_rationale TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,

  activated_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT store_specials_cycles_user_index_key UNIQUE (user_id, cycle_index)
);

CREATE INDEX IF NOT EXISTS store_specials_cycles_user_status_idx
  ON public.store_specials_cycles (user_id, status, starts_at);
CREATE INDEX IF NOT EXISTS store_specials_cycles_user_starts_idx
  ON public.store_specials_cycles (user_id, starts_at DESC);
-- Only one active cycle per store at a time.
CREATE UNIQUE INDEX IF NOT EXISTS store_specials_cycles_one_active_idx
  ON public.store_specials_cycles (user_id)
  WHERE status = 'active';

-- 3. Products within a cycle --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_specials_cycle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.store_specials_cycles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lightspeed_item_id TEXT,

  -- Sort order within the carousel (owner can drag to reorder).
  position INTEGER NOT NULL DEFAULT 0,

  -- Economics snapshot at generation time (shown in the preview table).
  retail NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  soh NUMERIC(12, 2) NOT NULL DEFAULT 0,
  last_sold_at TIMESTAMPTZ,
  days_since_sold INTEGER,
  units_sold_90d NUMERIC(12, 2) NOT NULL DEFAULT 0,
  units_sold_300d NUMERIC(12, 2) NOT NULL DEFAULT 0,
  margin_percent NUMERIC(6, 2),

  -- Discount proposal + final value (final differs after a manual override).
  proposed_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  proposed_sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  final_discount_percent NUMERIC(5, 2),

  ai_reason TEXT,
  source TEXT NOT NULL DEFAULT 'heuristic'
    CHECK (source IN ('ai', 'heuristic', 'manual')),
  -- Pinned: manually added/kept — protected when a cycle is regenerated.
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  -- Removed: manually excluded — kept as a tombstone so regen won't re-add it.
  is_removed BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT store_specials_cycle_items_cycle_product_key UNIQUE (cycle_id, product_id)
);

CREATE INDEX IF NOT EXISTS store_specials_cycle_items_cycle_idx
  ON public.store_specials_cycle_items (cycle_id, position);
CREATE INDEX IF NOT EXISTS store_specials_cycle_items_user_product_idx
  ON public.store_specials_cycle_items (user_id, product_id);

-- 4. Mark which product discounts are owned by the specials engine ------------
-- Lets rotation safely clear ONLY specials-applied discounts without touching
-- discounts a store set by hand.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_specials_discount BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS products_specials_discount_idx
  ON public.products (user_id)
  WHERE is_specials_discount = true;

-- 5. Allow the 'specials' carousel source ------------------------------------
ALTER TABLE public.store_categories
  DROP CONSTRAINT IF EXISTS store_categories_source_check;

ALTER TABLE public.store_categories
  ADD CONSTRAINT store_categories_source_check
    CHECK (source IN ('lightspeed', 'custom', 'brand', 'uber', 'specials', 'display_override'));

COMMENT ON COLUMN public.store_categories.source IS
  'Source of category: lightspeed, custom, brand, uber, specials, or display_override.';

-- 6. updated_at triggers ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_store_specials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS store_specials_config_updated_at ON public.store_specials_config;
CREATE TRIGGER store_specials_config_updated_at
  BEFORE UPDATE ON public.store_specials_config
  FOR EACH ROW EXECUTE FUNCTION public.update_store_specials_updated_at();

DROP TRIGGER IF EXISTS store_specials_cycles_updated_at ON public.store_specials_cycles;
CREATE TRIGGER store_specials_cycles_updated_at
  BEFORE UPDATE ON public.store_specials_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_store_specials_updated_at();

DROP TRIGGER IF EXISTS store_specials_cycle_items_updated_at ON public.store_specials_cycle_items;
CREATE TRIGGER store_specials_cycle_items_updated_at
  BEFORE UPDATE ON public.store_specials_cycle_items
  FOR EACH ROW EXECUTE FUNCTION public.update_store_specials_updated_at();

-- 7. Row level security -------------------------------------------------------
ALTER TABLE public.store_specials_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_specials_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_specials_cycle_items ENABLE ROW LEVEL SECURITY;

-- Config
DROP POLICY IF EXISTS "Owners manage their specials config" ON public.store_specials_config;
CREATE POLICY "Owners manage their specials config"
  ON public.store_specials_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages specials config" ON public.store_specials_config;
CREATE POLICY "Service role manages specials config"
  ON public.store_specials_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Cycles
DROP POLICY IF EXISTS "Owners manage their specials cycles" ON public.store_specials_cycles;
CREATE POLICY "Owners manage their specials cycles"
  ON public.store_specials_cycles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages specials cycles" ON public.store_specials_cycles;
CREATE POLICY "Service role manages specials cycles"
  ON public.store_specials_cycles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Cycle items
DROP POLICY IF EXISTS "Owners manage their specials cycle items" ON public.store_specials_cycle_items;
CREATE POLICY "Owners manage their specials cycle items"
  ON public.store_specials_cycle_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages specials cycle items" ON public.store_specials_cycle_items;
CREATE POLICY "Service role manages specials cycle items"
  ON public.store_specials_cycle_items FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.store_specials_config IS
  'Per-store configuration for the AI-driven auto-rotating specials carousel.';
COMMENT ON TABLE public.store_specials_cycles IS
  'One row per specials rotation. A pipeline of upcoming cycles is kept so owners can preview/tune the next rotations; cron promotes upcoming → active → expired.';
COMMENT ON TABLE public.store_specials_cycle_items IS
  'Products within a specials cycle, with the Lightspeed economics snapshot and the proposed/final discount used to drive storefront sale pricing.';
COMMENT ON COLUMN public.products.is_specials_discount IS
  'True when the live discount on this product was applied by the specials engine; lets rotation clear only specials discounts and never hand-set ones.';
