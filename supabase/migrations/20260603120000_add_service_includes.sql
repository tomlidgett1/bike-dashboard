-- Add "includes" dot-points to store_services
-- includes: list of bullet points describing exactly what the service covers
--           (e.g. "Full drivetrain clean & degrease", "Gears indexed & brakes adjusted").
--           Rendered as the checklist on the storefront service cards.

ALTER TABLE store_services
  ADD COLUMN IF NOT EXISTS includes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN store_services.includes IS 'Bullet points of what the service includes, shown as a checklist on storefront service cards';
