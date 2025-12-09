-- ============================================================
-- Allow Authenticated Users to Delete AI-Discovered Images
-- ============================================================
-- Fixes issue where admins can't delete images during QA completion

-- Drop the restrictive delete policy
DROP POLICY IF EXISTS "Users can delete own product images" ON product_images;

-- Create new policy: authenticated users can delete any image
-- (needed for admin QA workflow to clean up non-approved images)
CREATE POLICY "Authenticated users can delete product images"
  ON product_images FOR DELETE
  TO authenticated
  USING (true);

-- Keep service role policy
-- (already exists, no need to recreate)

COMMENT ON POLICY "Authenticated users can delete product images" ON product_images 
IS 'Allows admin users to delete any product image during QA workflow, including AI-discovered images';






