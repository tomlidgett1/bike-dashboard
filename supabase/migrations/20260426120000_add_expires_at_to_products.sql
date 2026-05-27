-- Listing expiry (used by POST /api/marketplace/listings, bulk import, PATCH listing)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN products.expires_at IS 'When the marketplace listing expires; NULL means no fixed expiry.';

CREATE INDEX IF NOT EXISTS idx_products_expires_at
  ON products(expires_at)
  WHERE expires_at IS NOT NULL;
