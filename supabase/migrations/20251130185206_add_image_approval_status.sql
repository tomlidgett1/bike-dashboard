-- ============================================================
-- Add Approval Status to Product Images
-- ============================================================
-- Adds approval workflow for AI-discovered images before publishing

-- Add approval_status column to product_images
ALTER TABLE product_images 
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Update existing images to be approved (they were auto-approved before this system)
UPDATE product_images SET approval_status = 'approved' WHERE approval_status IS NULL;

-- Add index for filtering by approval status
CREATE INDEX IF NOT EXISTS idx_product_images_approval_status 
  ON product_images(canonical_product_id, approval_status);

-- Add index for pending images specifically (most common admin query)
CREATE INDEX IF NOT EXISTS idx_product_images_pending 
  ON product_images(canonical_product_id, created_at DESC)
  WHERE approval_status = 'pending';

-- ============================================================
-- Update RLS Policies for Admin Access
-- ============================================================

-- Drop and recreate the public view policy to exclude pending images from marketplace
DROP POLICY IF EXISTS "Public can view product images" ON product_images;

CREATE POLICY "Public can view approved product images"
  ON product_images FOR SELECT
  USING (approval_status = 'approved');

-- Authenticated users can view all images (including pending for admin panel)
CREATE POLICY "Authenticated users can view all product images"
  ON product_images FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Helper Functions
-- ============================================================

-- Function to count approved images for a product
CREATE OR REPLACE FUNCTION count_approved_images(p_canonical_product_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER 
  FROM product_images 
  WHERE canonical_product_id = p_canonical_product_id 
    AND approval_status = 'approved';
$$ LANGUAGE sql STABLE;

-- Function to get products with pending images
CREATE OR REPLACE FUNCTION get_products_with_pending_images(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  normalized_name TEXT,
  upc TEXT,
  category TEXT,
  manufacturer TEXT,
  pending_count BIGINT,
  approved_count BIGINT,
  total_count BIGINT
) AS $$
  SELECT 
    cp.id,
    cp.normalized_name,
    cp.upc,
    cp.category,
    cp.manufacturer,
    COUNT(*) FILTER (WHERE pi.approval_status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE pi.approval_status = 'approved') as approved_count,
    COUNT(*) as total_count
  FROM canonical_products cp
  INNER JOIN product_images pi ON pi.canonical_product_id = cp.id
  WHERE pi.approval_status IN ('pending', 'approved')
  GROUP BY cp.id, cp.normalized_name, cp.upc, cp.category, cp.manufacturer
  HAVING COUNT(*) FILTER (WHERE pi.approval_status = 'pending') > 0
  ORDER BY COUNT(*) FILTER (WHERE pi.approval_status = 'pending') DESC, cp.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON COLUMN product_images.approval_status IS 'Approval status for AI-discovered images: pending (awaiting review), approved (live on marketplace), rejected (not suitable)';
COMMENT ON FUNCTION get_products_with_pending_images IS 'Returns products that have pending images awaiting admin approval';










