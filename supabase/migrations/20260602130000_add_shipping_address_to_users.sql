-- Add shipping_address to users table so buyers can save their delivery address.
-- Populated automatically after first purchase if not already set.
ALTER TABLE users ADD COLUMN IF NOT EXISTS shipping_address JSONB;
