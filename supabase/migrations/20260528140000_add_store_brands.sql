-- Store brands: lets bike stores showcase the brands they stock
-- Displayed as a logo strip on the public store profile page

CREATE TABLE IF NOT EXISTS store_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_brands_user_id_idx ON store_brands(user_id);

ALTER TABLE store_brands ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read any store's brands (public store profiles)
CREATE POLICY "Anyone can read active store brands"
  ON store_brands FOR SELECT
  USING (is_active = true);

-- Store owners can manage their own brands
CREATE POLICY "Store owners can manage their brands"
  ON store_brands FOR ALL
  USING (auth.uid() = user_id);
