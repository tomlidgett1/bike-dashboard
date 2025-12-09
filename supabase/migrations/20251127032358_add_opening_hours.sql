-- Add opening_hours column to users table
-- Stores opening hours as JSONB for flexibility
ALTER TABLE users ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{
  "monday": {"open": "09:00", "close": "17:00", "closed": false},
  "tuesday": {"open": "09:00", "close": "17:00", "closed": false},
  "wednesday": {"open": "09:00", "close": "17:00", "closed": false},
  "thursday": {"open": "09:00", "close": "17:00", "closed": false},
  "friday": {"open": "09:00", "close": "17:00", "closed": false},
  "saturday": {"open": "10:00", "close": "16:00", "closed": false},
  "sunday": {"open": "10:00", "close": "16:00", "closed": true}
}'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN users.opening_hours IS 'Store opening hours in JSONB format. Structure: {"day": {"open": "HH:MM", "close": "HH:MM", "closed": boolean}}';

-- Create index for JSONB queries (optional, for future queries)
CREATE INDEX IF NOT EXISTS users_opening_hours_idx ON users USING GIN (opening_hours);










