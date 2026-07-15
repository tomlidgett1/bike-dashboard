-- Customer search must match substrings on name fields, not only trigram
-- similarity. Trigram-only matching missed exact name lookups such as
-- "Tom Lidgett" when similarity fell below the default threshold.

CREATE OR REPLACE FUNCTION crm_search_customers(
  p_store_id UUID,
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
  p_cursor_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF store_customers
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT customer.*
  FROM store_customers customer
  WHERE customer.store_id = p_store_id
    AND customer.status = 'active'
    AND (
      NULLIF(BTRIM(p_query), '') IS NULL
      OR LOWER(customer.display_name) % LOWER(BTRIM(p_query))
      OR LOWER(customer.display_name) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
      OR LOWER(COALESCE(customer.first_name, '')) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
      OR LOWER(COALESCE(customer.last_name, '')) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
      OR LOWER(
        CONCAT_WS(' ', customer.first_name, customer.last_name)
      ) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
      OR LOWER(COALESCE(customer.primary_email, '')) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
      OR (
        crm_normalize_phone(p_query) IS NOT NULL
        AND crm_normalize_phone(customer.primary_phone)
          LIKE '%' || crm_normalize_phone(p_query) || '%'
      )
      OR EXISTS (
        SELECT 1
        FROM store_customer_bikes bike
        WHERE bike.store_id = customer.store_id
          AND bike.customer_id = customer.id
          AND (
            LOWER(COALESCE(bike.serial_number, '')) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
            OR LOWER(CONCAT_WS(' ', bike.brand, bike.model)) LIKE '%' || LOWER(BTRIM(p_query)) || '%'
          )
      )
    )
    AND (
      p_filter = 'all'
      OR (p_filter = 'vip' AND customer.lifecycle_stage = 'vip')
      OR (p_filter = 'at_risk' AND customer.lifecycle_stage = 'at_risk')
      OR (p_filter = 'no_email' AND customer.primary_email IS NULL)
      OR (
        p_filter = 'opted_in'
        AND EXISTS (
          SELECT 1
          FROM store_customer_consents consent
          WHERE consent.store_id = customer.store_id
            AND consent.customer_id = customer.id
            AND consent.channel = 'email'
            AND consent.purpose = 'marketing'
            AND consent.status = 'granted'
            AND consent.withdrawn_at IS NULL
            AND (consent.expires_at IS NULL OR consent.expires_at > NOW())
        )
      )
    )
    AND (
      p_cursor_updated_at IS NULL
      OR (customer.updated_at, customer.id) < (p_cursor_updated_at, p_cursor_id)
    )
  ORDER BY customer.updated_at DESC, customer.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;
