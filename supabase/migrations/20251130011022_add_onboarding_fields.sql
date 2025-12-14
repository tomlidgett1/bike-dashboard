-- ============================================================
-- Add Onboarding Fields to Users Table
-- ============================================================
-- This migration adds fields to support the enhanced onboarding flow:
-- 1. first_name: Individual user's first name
-- 2. last_name: Individual user's last name
-- 3. preferences: JSONB column for storing personalization answers
-- 4. onboarding_completed: Boolean flag to track onboarding completion

-- Add first_name column (for individual users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';

-- Add last_name column (for individual users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';

-- Add preferences column (stores personalization data as JSONB)
-- Structure: {
--   riding_styles: string[],
--   preferred_brands: string[],
--   experience_level: string,
--   budget_range: string,
--   interests: string[]
-- }
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add onboarding_completed column
-- Defaults to false; set to true after user completes onboarding
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- Create index on onboarding_completed for faster queries
CREATE INDEX IF NOT EXISTS users_onboarding_completed_idx ON users(onboarding_completed) WHERE onboarding_completed = false;

-- Create GIN index on preferences for efficient JSONB queries
CREATE INDEX IF NOT EXISTS users_preferences_idx ON users USING GIN (preferences);

-- Add helpful comments
COMMENT ON COLUMN users.first_name IS 'Individual user first name (collected during onboarding)';
COMMENT ON COLUMN users.last_name IS 'Individual user last name (collected during onboarding)';
COMMENT ON COLUMN users.preferences IS 'User personalization preferences stored as JSONB (riding styles, brands, experience, budget, interests)';
COMMENT ON COLUMN users.onboarding_completed IS 'Flag indicating whether user has completed onboarding flow';










