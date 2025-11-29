-- ============================================================
-- Add Account Type and Bicycle Store Approval Fields
-- ============================================================
-- This migration adds two new fields to the users table:
-- 1. account_type: User's selected account type during signup (individual or bicycle_store)
-- 2. bicycle_store: Admin-controlled boolean flag for verifying legitimate bicycle stores

-- Add account_type column
-- Stores the user's choice during signup: 'individual' or 'bicycle_store'
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'individual';

-- Add bicycle_store column
-- Always defaults to false; only admins can set to true after verification
ALTER TABLE users ADD COLUMN IF NOT EXISTS bicycle_store BOOLEAN NOT NULL DEFAULT false;

-- Add check constraint to ensure account_type has valid values
ALTER TABLE users ADD CONSTRAINT valid_account_type 
  CHECK (account_type IN ('individual', 'bicycle_store'));

-- Create index for faster queries filtering by bicycle stores
CREATE INDEX IF NOT EXISTS users_bicycle_store_idx ON users(bicycle_store) WHERE bicycle_store = true;

-- Add helpful comments
COMMENT ON COLUMN users.account_type IS 'User-selected account type during signup (individual or bicycle_store)';
COMMENT ON COLUMN users.bicycle_store IS 'Admin-approved bicycle store flag (always false until admin verifies)';

