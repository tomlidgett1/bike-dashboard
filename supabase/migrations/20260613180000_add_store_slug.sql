-- SEO-friendly storefront slugs.
--
-- Public storefronts are served at /marketplace/store/{store_slug}. The raw
-- user_id still resolves and is permanently redirected to the slug URL, so
-- existing links and crawl equity consolidate onto one canonical address.
--
-- Slugs are derived from business_name, kept unique, and auto-maintained by a
-- trigger so new stores (and renames) get a slug without any app changes.
--
-- Safe to apply while the current code is live: the app reads store_slug
-- defensively and falls back to user_id when it's null.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS store_slug text;

-- Uniqueness only across populated slugs (many NULLs allowed).
CREATE UNIQUE INDEX IF NOT EXISTS users_store_slug_key
  ON public.users (store_slug)
  WHERE store_slug IS NOT NULL;

-- Turn arbitrary text into a clean URL slug: lowercase, non-alphanumerics → "-",
-- trimmed, empty → NULL. (No unaccent dependency; accents collapse to hyphens.)
CREATE OR REPLACE FUNCTION public.slugify_store_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(BOTH '-' FROM
      regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')
    ),
  '');
$$;

-- One-time backfill for existing bicycle stores. Deduplicates within this batch
-- by appending -2, -3, … to colliding slugs. Re-runnable: only fills blanks.
WITH cleaned AS (
  SELECT user_id, public.slugify_store_name(business_name) AS slug
  FROM public.users
  WHERE account_type = 'bicycle_store'
    AND bicycle_store = true
    AND (store_slug IS NULL OR store_slug = '')
    AND public.slugify_store_name(business_name) IS NOT NULL
),
ranked AS (
  SELECT user_id, slug,
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY user_id) AS rn
  FROM cleaned
)
UPDATE public.users u
SET store_slug = CASE WHEN r.rn = 1 THEN r.slug ELSE r.slug || '-' || r.rn END
FROM ranked r
WHERE u.user_id = r.user_id;

-- Keep slugs maintained going forward (only assigns when blank, so manual
-- overrides stick). Fires only for store accounts and only on the relevant cols.
CREATE OR REPLACE FUNCTION public.assign_store_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  IF NEW.account_type = 'bicycle_store' AND COALESCE(NEW.bicycle_store, false) = true THEN
    IF NEW.store_slug IS NULL OR NEW.store_slug = '' THEN
      base := public.slugify_store_name(NEW.business_name);
      IF base IS NULL THEN base := 'store'; END IF;
      candidate := base;
      WHILE EXISTS (
        SELECT 1 FROM public.users
        WHERE store_slug = candidate AND user_id <> NEW.user_id
      ) LOOP
        n := n + 1;
        candidate := base || '-' || n;
      END LOOP;
      NEW.store_slug := candidate;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_store_slug ON public.users;
CREATE TRIGGER trg_assign_store_slug
  BEFORE INSERT OR UPDATE OF business_name, account_type, bicycle_store ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_store_slug();
