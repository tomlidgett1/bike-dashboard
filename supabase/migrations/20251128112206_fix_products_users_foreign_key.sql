-- Fix foreign key relationship between products and users tables
-- Currently products.user_id references auth.users(id)
-- We need it to reference users.user_id instead so PostgREST can join them

-- Step 1: Drop the existing foreign key constraint from products.user_id to auth.users
DO $$
BEGIN
  -- Find and drop the constraint that references auth.users
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'products' 
    AND c.contype = 'f'
    AND c.confrelid = (SELECT oid FROM pg_class WHERE relname = 'users' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth'))
  ) THEN
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_user_id_fkey;
  END IF;
END $$;

-- Step 2: Add the new foreign key constraint from products.user_id to users.user_id
ALTER TABLE products
ADD CONSTRAINT products_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(user_id)
ON DELETE CASCADE;

-- Step 3: Create index for better query performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT products_user_id_fkey ON products IS 
  'Foreign key relationship to users.user_id table, enabling PostgREST joins for marketplace queries';

