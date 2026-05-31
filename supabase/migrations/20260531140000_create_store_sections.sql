-- Store Sections
-- A section is a named grouping that contains multiple category carousels.
-- Example: "Nutrition" section containing "Clif", "GU", and "Specials" carousels.

CREATE TABLE IF NOT EXISTS store_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE store_sections ENABLE ROW LEVEL SECURITY;

-- Owners can do everything
CREATE POLICY "store_sections_owner_all"
  ON store_sections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public can read active sections (for public store profile pages)
CREATE POLICY "store_sections_public_read"
  ON store_sections FOR SELECT
  USING (is_active = true);

-- Link categories to sections (nullable — NULL means standalone / ungrouped)
ALTER TABLE store_categories ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES store_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_store_categories_section_id ON store_categories(section_id);

-- updated_at trigger for store_sections
CREATE OR REPLACE FUNCTION update_store_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER store_sections_updated_at
  BEFORE UPDATE ON store_sections
  FOR EACH ROW EXECUTE FUNCTION update_store_sections_updated_at();
