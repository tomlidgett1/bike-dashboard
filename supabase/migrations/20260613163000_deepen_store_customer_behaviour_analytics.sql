-- Deep customer behaviour analytics for public store profiles.
-- Keeps the existing privacy-aware event stream, but expands it beyond
-- page/product views into intent, navigation, scroll, CTA, and journey events.

ALTER TABLE store_analytics_events
  DROP CONSTRAINT IF EXISTS store_analytics_events_event_type_check;

ALTER TABLE store_analytics_events
  ADD CONSTRAINT store_analytics_events_event_type_check
  CHECK (
    event_type IN (
      'store_page_view',
      'product_view',
      'product_impression',
      'tab_select',
      'cta_click',
      'section_view',
      'scroll_depth',
      'carousel_scroll',
      'carousel_expand',
      'category_filter',
      'sort_change',
      'search_focus',
      'search_clear',
      'hours_open',
      'contact_click',
      'message_open',
      'message_submit',
      'collection_open',
      'service_view',
      'service_book_click',
      'rental_view',
      'rental_availability_open',
      'rental_date_select',
      'rental_request_submit',
      'product_click',
      'add_to_cart_click',
      'buy_now_click'
    )
  );

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_store_session_time
  ON store_analytics_events(store_owner_id, session_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_store_event_time
  ON store_analytics_events(store_owner_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_metadata_gin
  ON store_analytics_events USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_tab_time
  ON store_analytics_events(store_owner_id, (metadata ->> 'tab'), occurred_at DESC)
  WHERE event_type = 'tab_select';

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_section_time
  ON store_analytics_events(store_owner_id, (metadata ->> 'section'), occurred_at DESC)
  WHERE event_type = 'section_view';

CREATE INDEX IF NOT EXISTS idx_store_analytics_events_action_time
  ON store_analytics_events(store_owner_id, (metadata ->> 'action'), occurred_at DESC)
  WHERE event_type IN (
    'cta_click',
    'contact_click',
    'message_open',
    'message_submit',
    'service_book_click',
    'rental_request_submit',
    'add_to_cart_click',
    'buy_now_click'
  );

COMMENT ON COLUMN store_analytics_events.metadata IS
  'Structured behaviour payload for public storefront analytics. Stores coarse UI context only: tab, section, action, label, scroll depth, carousel/category identifiers, result counts, and similar non-PII signals.';
