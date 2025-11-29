-- Add foreign key constraint from products.user_id to users.user_id
-- This allows PostgREST to join products and users tables

-- First, check if any products have invalid user_ids
-- (This should not happen in practice, but just to be safe)
DO $$
BEGIN
  -- Clean up any orphaned products (if any exist)
  DELETE FROM products 
  WHERE user_id NOT IN (SELECT user_id FROM users);
END $$;

-- Add the foreign key constraint (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_user_id_fkey'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON DELETE CASCADE; -- If a user is deleted, their products are deleted
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT products_user_id_fkey ON products IS 
  'Foreign key relationship to users table, enabling PostgREST joins for marketplace queries';

