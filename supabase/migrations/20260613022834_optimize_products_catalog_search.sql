-- Dashboard catalogue search for store-owned product management.
-- The public marketplace search only covered active marketplace listings; this
-- path covers the full owner catalogue, including hidden products and SKU terms.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS catalog_search_text TEXT GENERATED ALWAYS AS (
  LOWER(
    COALESCE(display_name, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(custom_sku, '') || ' ' ||
    COALESCE(system_sku, '') || ' ' ||
    COALESCE(lightspeed_item_id, '') || ' ' ||
    COALESCE(manufacturer_name, '') || ' ' ||
    COALESCE(brand, '') || ' ' ||
    COALESCE(model, '') || ' ' ||
    COALESCE(category_name, '') || ' ' ||
    COALESCE(full_category_path, '') || ' ' ||
    COALESCE(marketplace_category, '') || ' ' ||
    COALESCE(marketplace_subcategory, '') || ' ' ||
    COALESCE(marketplace_level_3_category, '') || ' ' ||
    COALESCE(model_year, '') || ' ' ||
    COALESCE(listing_status, '') || ' ' ||
    COALESCE(listing_source, '')
  )
) STORED;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS catalog_search_vector TSVECTOR GENERATED ALWAYS AS (
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(display_name, '')), 'A') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(description, '')), 'A') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(custom_sku, '')), 'A') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(system_sku, '')), 'A') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(lightspeed_item_id, '')), 'A') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(manufacturer_name, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(brand, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(model, '')), 'B') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(category_name, '')), 'C') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(full_category_path, '')), 'C') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(marketplace_category, '')), 'C') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(marketplace_subcategory, '')), 'C') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(marketplace_level_3_category, '')), 'C') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(model_year, '')), 'D') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(listing_status, '')), 'D') ||
  SETWEIGHT(TO_TSVECTOR('simple', COALESCE(listing_source, '')), 'D')
) STORED;

CREATE INDEX IF NOT EXISTS idx_products_catalog_search_vector
  ON public.products USING GIN (catalog_search_vector);

CREATE INDEX IF NOT EXISTS idx_products_catalog_search_text_trgm
  ON public.products USING GIN (catalog_search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_user_created_at
  ON public.products (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_user_category_name
  ON public.products (user_id, category_name)
  WHERE category_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_user_manufacturer_name
  ON public.products (user_id, manufacturer_name)
  WHERE manufacturer_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_user_products_catalog(
  p_user_id UUID,
  p_search TEXT,
  p_limit INTEGER DEFAULT 10000
)
RETURNS TABLE (
  product_id UUID,
  relevance REAL
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cleaned TEXT;
  v_tokens TEXT[];
  v_tsquery TSQUERY;
BEGIN
  v_cleaned := TRIM(REGEXP_REPLACE(LOWER(COALESCE(p_search, '')), '[^[:alnum:]]+', ' ', 'g'));
  v_tokens := ARRAY(
    SELECT value
    FROM REGEXP_SPLIT_TO_TABLE(v_cleaned, '\s+') AS token(value)
    WHERE LENGTH(value) >= 2
  );

  IF COALESCE(ARRAY_LENGTH(v_tokens, 1), 0) = 0 THEN
    RETURN;
  END IF;

  v_tsquery := TO_TSQUERY(
    'simple',
    ARRAY_TO_STRING(
      ARRAY(
        SELECT QUOTE_LITERAL(value) || ':*'
        FROM UNNEST(v_tokens) AS token(value)
      ),
      ' & '
    )
  );

  RETURN QUERY
  SELECT
    p.id AS product_id,
    (
      TS_RANK_CD('{0.05, 0.1, 0.4, 1.0}'::REAL[], p.catalog_search_vector, v_tsquery) * 100
      + CASE WHEN LOWER(COALESCE(p.display_name, '')) = v_cleaned THEN 60 ELSE 0 END
      + CASE WHEN LOWER(COALESCE(p.description, '')) = v_cleaned THEN 50 ELSE 0 END
      + CASE
          WHEN LOWER(COALESCE(p.custom_sku, '')) = v_cleaned
            OR LOWER(COALESCE(p.system_sku, '')) = v_cleaned
            OR LOWER(COALESCE(p.lightspeed_item_id, '')) = v_cleaned
          THEN 55 ELSE 0
        END
      + CASE WHEN LOWER(COALESCE(p.display_name, '')) LIKE v_cleaned || '%' THEN 25 ELSE 0 END
      + CASE WHEN LOWER(COALESCE(p.description, '')) LIKE v_cleaned || '%' THEN 20 ELSE 0 END
      + GREATEST(
          SIMILARITY(COALESCE(p.display_name, ''), v_cleaned),
          SIMILARITY(COALESCE(p.description, ''), v_cleaned),
          SIMILARITY(COALESCE(p.catalog_search_text, ''), v_cleaned)
        ) * 12
    )::REAL AS relevance
  FROM public.products p
  WHERE p.user_id = p_user_id
    AND (
      p.catalog_search_vector @@ v_tsquery
      OR p.catalog_search_text ILIKE '%' || v_cleaned || '%'
      OR p.catalog_search_text % v_cleaned
    )
  ORDER BY relevance DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10000), 10000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_user_products_catalog(UUID, TEXT, INTEGER) TO authenticated;

COMMENT ON COLUMN public.products.catalog_search_text IS 'Lowercase dashboard catalogue search text across product names, SKUs, brands, categories, status, and source.';
COMMENT ON COLUMN public.products.catalog_search_vector IS 'Weighted full-text vector for store-owner product catalogue search.';
COMMENT ON FUNCTION public.search_user_products_catalog(UUID, TEXT, INTEGER) IS 'Ranked owner catalogue search for the Products dashboard, including inactive products and SKU identifiers.';
