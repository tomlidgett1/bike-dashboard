-- Allow buyers to view products they have purchased
-- This is needed because:
-- 1. The default RLS only allows product owners to view their products
-- 2. The "public can view active products" policy doesn't work if is_active=false after sale
-- 3. Buyers need to see product details on their order history page

CREATE POLICY "Buyers can view products they purchased"
  ON products FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT product_id 
      FROM purchases 
      WHERE buyer_id = auth.uid()
    )
  );

-- Also allow sellers to view products in their sales (in case they lost ownership somehow)
CREATE POLICY "Sellers can view products in their sales"
  ON products FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT product_id 
      FROM purchases 
      WHERE seller_id = auth.uid()
    )
  );

