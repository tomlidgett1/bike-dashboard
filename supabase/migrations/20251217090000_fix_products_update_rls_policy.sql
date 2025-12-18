-- ============================================================
-- Fix products table RLS policies for admin operations
-- ============================================================

-- Drop ALL possible update policies that might conflict
DROP POLICY IF EXISTS "Users can update own products" ON products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON products;
DROP POLICY IF EXISTS "Users can update products" ON products;
DROP POLICY IF EXISTS "Admin can update any products" ON products;

-- Create a single clear policy that allows any authenticated user to update any product
-- This is needed for admin operations (approving images, setting hero, etc.)
CREATE POLICY "Authenticated users can update any product"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


