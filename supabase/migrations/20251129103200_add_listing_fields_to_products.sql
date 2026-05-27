-- ============================================================
-- Add Listing Fields to Products Table
-- ============================================================
-- Adds fields to distinguish between Lightspeed synced products
-- and manual marketplace listings

-- Add listing_source column to identify the source of the product
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS listing_source TEXT DEFAULT 'lightspeed';

-- Add listing_type column for marketplace categorization
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS listing_type TEXT;

-- Add listing_status column for marketplace visibility
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS listing_status TEXT;

-- Product detail fields used by marketplace product pages
ALTER TABLE products
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS condition_rating TEXT,
ADD COLUMN IF NOT EXISTS condition_details TEXT,
ADD COLUMN IF NOT EXISTS wear_notes TEXT,
ADD COLUMN IF NOT EXISTS usage_estimate TEXT,
ADD COLUMN IF NOT EXISTS purchase_location TEXT,
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS service_history TEXT,
ADD COLUMN IF NOT EXISTS upgrades_modifications TEXT,
ADD COLUMN IF NOT EXISTS reason_for_selling TEXT,
ADD COLUMN IF NOT EXISTS is_negotiable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS included_accessories TEXT,
ADD COLUMN IF NOT EXISTS seller_contact_preference TEXT,
ADD COLUMN IF NOT EXISTS seller_phone TEXT,
ADD COLUMN IF NOT EXISTS seller_email TEXT;

-- Create index for filtering by listing_source
CREATE INDEX IF NOT EXISTS idx_products_listing_source 
  ON products(listing_source) 
  WHERE listing_source IS NOT NULL;

-- Create composite index for marketplace queries
CREATE INDEX IF NOT EXISTS idx_products_listing_status_source 
  ON products(listing_status, listing_source) 
  WHERE listing_status IS NOT NULL;

-- Add comments
COMMENT ON COLUMN products.listing_source IS 'Source of the product: "lightspeed" for synced inventory, "manual" for marketplace listings';
COMMENT ON COLUMN products.listing_type IS 'Type of marketplace listing (e.g., bicycle, part, accessory)';
COMMENT ON COLUMN products.listing_status IS 'Status of marketplace listing (e.g., active, draft, sold, expired)';

