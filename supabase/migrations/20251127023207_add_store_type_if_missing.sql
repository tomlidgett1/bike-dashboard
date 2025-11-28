-- Add store_type column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'store_type'
  ) THEN
    ALTER TABLE users ADD COLUMN store_type TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

