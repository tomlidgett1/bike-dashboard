-- ============================================================
-- Store Homepage (Landing Page) Configuration
-- ============================================================
-- Adds a single JSONB column on `users` that stores the full
-- configuration for a bicycle store's public landing page ("Home"
-- tab): hero, highlights, featured collections, story, gallery,
-- services teaser, visit-us block, theme accent and section order.
--
-- A landing page is a singleton per store, so a flexible JSONB blob
-- matches the existing convention (opening_hours, social_links) and
-- lets the structure evolve without schema churn.
--
-- No new RLS is required: `users` already has a public SELECT policy
-- ("Public can view store listings") for marketplace browsing and an
-- owner-only UPDATE policy, which together cover read + write of this
-- column. Empty default '{}' means every store renders a beautiful
-- default home built from its existing profile data until customised.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS homepage_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.homepage_config IS
  'Bicycle store landing-page configuration (hero, highlights, collections, story, gallery, services, visit, theme, section order). Rendered on the public store profile Home tab. Empty {} falls back to defaults derived from the store profile.';
