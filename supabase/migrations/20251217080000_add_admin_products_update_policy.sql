-- ============================================================
-- Add policy to allow authenticated users to update any product
-- This enables admin operations on products they don't own
-- ============================================================

-- Drop existing restrictive update policy
DROP POLICY IF EXISTS "Users can update own products" ON products;

-- Create new policy that allows any authenticated user to update products
-- This is consistent with how product_images table works
CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Note: INSERT still requires user_id = auth.uid()
-- Note: DELETE still requires user_id = auth.uid()
-- This only opens up UPDATE for admin operations

