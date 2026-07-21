-- Canonical Yellow Jersey marketplace taxonomy and assignment contract.
-- The category table is the source of truth. Existing category text columns
-- remain as indexed projections for marketplace reads and search.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.marketplace_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.marketplace_categories(id) ON DELETE RESTRICT,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  slug TEXT NOT NULL CHECK (BTRIM(slug) <> ''),
  path_slug TEXT NOT NULL UNIQUE CHECK (BTRIM(path_slug) <> ''),
  aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (level = 1 AND parent_id IS NULL)
    OR (level IN (2, 3) AND parent_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_categories_root_slug_idx
  ON public.marketplace_categories(slug)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_categories_sibling_slug_idx
  ON public.marketplace_categories(parent_id, slug)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketplace_categories_parent_order_idx
  ON public.marketplace_categories(parent_id, sort_order, name)
  WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION public.marketplace_category_slug(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT TRIM(
    BOTH '-'
    FROM LOWER(
      REGEXP_REPLACE(
        REPLACE(COALESCE(value, ''), '&', ' and '),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    )
  );
$$;

WITH taxonomy(level1, level2, level3, path_order) AS (
  VALUES
    ('Bicycles', 'Road', NULL, 1),
    ('Bicycles', 'Gravel', NULL, 2),
    ('Bicycles', 'Mountain', 'XC', 3),
    ('Bicycles', 'Mountain', 'Trail', 4),
    ('Bicycles', 'Mountain', 'Enduro', 5),
    ('Bicycles', 'Mountain', 'Downhill', 6),
    ('Bicycles', 'Hybrid / Fitness', NULL, 7),
    ('Bicycles', 'Commuter / City', NULL, 8),
    ('Bicycles', 'Folding', NULL, 9),
    ('Bicycles', 'Cargo', NULL, 10),
    ('Bicycles', 'Touring', NULL, 11),
    ('Bicycles', 'Track / Fixie', NULL, 12),
    ('Bicycles', 'Cyclocross', NULL, 13),
    ('Bicycles', 'Time Trial / Triathlon', NULL, 14),
    ('Bicycles', 'BMX', 'Race', 15),
    ('Bicycles', 'BMX', 'Freestyle', 16),
    ('Bicycles', 'Kids', 'Balance', 17),
    ('Bicycles', 'Kids', '12–16 inch', 18),
    ('Bicycles', 'Kids', '20–24 inch', 19),
    ('E-Bikes', 'E-Road', NULL, 20),
    ('E-Bikes', 'E-Gravel', NULL, 21),
    ('E-Bikes', 'E-MTB', 'Hardtail', 22),
    ('E-Bikes', 'E-MTB', 'Full Suspension', 23),
    ('E-Bikes', 'E-Commuter / City', NULL, 24),
    ('E-Bikes', 'E-Hybrid', NULL, 25),
    ('E-Bikes', 'E-Cargo', NULL, 26),
    ('E-Bikes', 'E-Folding', NULL, 27),
    ('Frames & Framesets', 'Road Frameset', NULL, 28),
    ('Frames & Framesets', 'Gravel Frameset', NULL, 29),
    ('Frames & Framesets', 'MTB Hardtail Frame', NULL, 30),
    ('Frames & Framesets', 'MTB Full Suspension Frame', NULL, 31),
    ('Frames & Framesets', 'E-Bike Frame', NULL, 32),
    ('Frames & Framesets', 'Other Frames', NULL, 33),
    ('Wheels & Tyres', 'Road Wheelsets', NULL, 34),
    ('Wheels & Tyres', 'Gravel Wheelsets', NULL, 35),
    ('Wheels & Tyres', 'MTB Wheelsets', NULL, 36),
    ('Wheels & Tyres', 'Tyres', 'Road', 37),
    ('Wheels & Tyres', 'Tyres', 'Gravel / CX', 38),
    ('Wheels & Tyres', 'Tyres', 'MTB', 39),
    ('Wheels & Tyres', 'Tubes', NULL, 40),
    ('Wheels & Tyres', 'Tubeless', 'Sealant / Valves / Tape', 41),
    ('Drivetrain', 'Groupsets', NULL, 42),
    ('Drivetrain', 'Cranksets', NULL, 43),
    ('Drivetrain', 'Cassettes', NULL, 44),
    ('Drivetrain', 'Derailleurs', 'Front', 45),
    ('Drivetrain', 'Derailleurs', 'Rear', 46),
    ('Drivetrain', 'Chains', NULL, 47),
    ('Drivetrain', 'Bottom Brackets', NULL, 48),
    ('Drivetrain', 'Power Meters', NULL, 49),
    ('Brakes', 'Disc Brakes', 'Complete Sets', 50),
    ('Brakes', 'Disc Brakes', 'Calipers', 51),
    ('Brakes', 'Disc Brakes', 'Rotors', 52),
    ('Brakes', 'Brake Pads', NULL, 53),
    ('Brakes', 'Levers', NULL, 54),
    ('Cockpit', 'Handlebars', 'Road', 55),
    ('Cockpit', 'Handlebars', 'MTB / DH', 56),
    ('Cockpit', 'Handlebars', 'Gravel / Flared', 57),
    ('Cockpit', 'Stems', NULL, 58),
    ('Cockpit', 'Headsets', NULL, 59),
    ('Cockpit', 'Bar Tape & Grips', NULL, 60),
    ('Seat & Seatposts', 'Saddles', NULL, 61),
    ('Seat & Seatposts', 'Seatposts', NULL, 62),
    ('Seat & Seatposts', 'Dropper Posts', NULL, 63),
    ('Pedals', 'Clipless Pedals', NULL, 64),
    ('Pedals', 'Flat Pedals', NULL, 65),
    ('Pedals', 'Pedal Accessories', NULL, 66),
    ('Accessories', 'Helmets', NULL, 67),
    ('Accessories', 'Lights', 'Front', 68),
    ('Accessories', 'Lights', 'Rear', 69),
    ('Accessories', 'Lights', 'Sets', 70),
    ('Accessories', 'Pumps', 'Floor', 71),
    ('Accessories', 'Pumps', 'Mini / Hand', 72),
    ('Accessories', 'Locks', NULL, 73),
    ('Accessories', 'Bags', 'On-Bike', 74),
    ('Accessories', 'Bags', 'Off-Bike', 75),
    ('Accessories', 'Racks & Panniers', NULL, 76),
    ('Accessories', 'Mudguards / Fenders', NULL, 77),
    ('Accessories', 'Bottles & Cages', NULL, 78),
    ('Accessories', 'Child Seats & Trailers', NULL, 79),
    ('Accessories', 'Car Racks', NULL, 80),
    ('Apparel', 'Jerseys', NULL, 81),
    ('Apparel', 'Shorts & Bibs', NULL, 82),
    ('Apparel', 'Jackets & Gilets', NULL, 83),
    ('Apparel', 'Gloves', NULL, 84),
    ('Apparel', 'Shoes', 'Road', 85),
    ('Apparel', 'Shoes', 'MTB / Gravel', 86),
    ('Apparel', 'Casual Clothing', NULL, 87),
    ('Protection', 'Knee & Elbow Pads', NULL, 88),
    ('Protection', 'Body Armor', NULL, 89),
    ('Maintenance & Workshop', 'Tools', NULL, 90),
    ('Maintenance & Workshop', 'Cleaning', NULL, 91),
    ('Maintenance & Workshop', 'Lubricants & Grease', NULL, 92),
    ('Maintenance & Workshop', 'Repair Kits', NULL, 93),
    ('Maintenance & Workshop', 'Workstands', NULL, 94),
    ('Tech & Electronics', 'Bike Computers', NULL, 95),
    ('Tech & Electronics', 'Smart Trainers', NULL, 96),
    ('Tech & Electronics', 'Heart Rate Monitors', NULL, 97),
    ('Tech & Electronics', 'Cameras', NULL, 98),
    ('Tech & Electronics', 'E-Bike Batteries & Chargers', NULL, 99),
    ('Nutrition', 'Energy Gels & Chews', NULL, 100),
    ('Nutrition', 'Bars', NULL, 101),
    ('Nutrition', 'Drink Mixes & Electrolytes', NULL, 102),
    ('Shop Services', 'Bike Service', 'Basic / Bronze', 103),
    ('Shop Services', 'Bike Service', 'Intermediate / Silver', 104),
    ('Shop Services', 'Bike Service', 'Premium / Gold', 105),
    ('Shop Services', 'Bike Fitting', NULL, 106),
    ('Shop Services', 'Suspension Service', NULL, 107),
    ('Marketplace Specials', 'Verified Bikes', NULL, 108),
    ('Marketplace Specials', 'Certified Pre-Owned', NULL, 109),
    ('Marketplace Specials', 'Clearance', NULL, 110)
),
level1_rows AS (
  SELECT level1, MIN(path_order) AS sort_order
  FROM taxonomy
  GROUP BY level1
)
INSERT INTO public.marketplace_categories(name, slug, path_slug, level, sort_order)
SELECT
  level1,
  public.marketplace_category_slug(level1),
  public.marketplace_category_slug(level1),
  1,
  ROW_NUMBER() OVER (ORDER BY sort_order)::INTEGER
FROM level1_rows
ON CONFLICT (path_slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

WITH taxonomy(level1, level2, level3, path_order) AS (
  VALUES
    ('Bicycles', 'Road', NULL, 1), ('Bicycles', 'Gravel', NULL, 2),
    ('Bicycles', 'Mountain', 'XC', 3), ('Bicycles', 'Mountain', 'Trail', 4),
    ('Bicycles', 'Mountain', 'Enduro', 5), ('Bicycles', 'Mountain', 'Downhill', 6),
    ('Bicycles', 'Hybrid / Fitness', NULL, 7), ('Bicycles', 'Commuter / City', NULL, 8),
    ('Bicycles', 'Folding', NULL, 9), ('Bicycles', 'Cargo', NULL, 10),
    ('Bicycles', 'Touring', NULL, 11), ('Bicycles', 'Track / Fixie', NULL, 12),
    ('Bicycles', 'Cyclocross', NULL, 13), ('Bicycles', 'Time Trial / Triathlon', NULL, 14),
    ('Bicycles', 'BMX', 'Race', 15), ('Bicycles', 'BMX', 'Freestyle', 16),
    ('Bicycles', 'Kids', 'Balance', 17), ('Bicycles', 'Kids', '12–16 inch', 18),
    ('Bicycles', 'Kids', '20–24 inch', 19), ('E-Bikes', 'E-Road', NULL, 20),
    ('E-Bikes', 'E-Gravel', NULL, 21), ('E-Bikes', 'E-MTB', 'Hardtail', 22),
    ('E-Bikes', 'E-MTB', 'Full Suspension', 23), ('E-Bikes', 'E-Commuter / City', NULL, 24),
    ('E-Bikes', 'E-Hybrid', NULL, 25), ('E-Bikes', 'E-Cargo', NULL, 26),
    ('E-Bikes', 'E-Folding', NULL, 27), ('Frames & Framesets', 'Road Frameset', NULL, 28),
    ('Frames & Framesets', 'Gravel Frameset', NULL, 29), ('Frames & Framesets', 'MTB Hardtail Frame', NULL, 30),
    ('Frames & Framesets', 'MTB Full Suspension Frame', NULL, 31), ('Frames & Framesets', 'E-Bike Frame', NULL, 32),
    ('Frames & Framesets', 'Other Frames', NULL, 33), ('Wheels & Tyres', 'Road Wheelsets', NULL, 34),
    ('Wheels & Tyres', 'Gravel Wheelsets', NULL, 35), ('Wheels & Tyres', 'MTB Wheelsets', NULL, 36),
    ('Wheels & Tyres', 'Tyres', 'Road', 37), ('Wheels & Tyres', 'Tyres', 'Gravel / CX', 38),
    ('Wheels & Tyres', 'Tyres', 'MTB', 39), ('Wheels & Tyres', 'Tubes', NULL, 40),
    ('Wheels & Tyres', 'Tubeless', 'Sealant / Valves / Tape', 41), ('Drivetrain', 'Groupsets', NULL, 42),
    ('Drivetrain', 'Cranksets', NULL, 43), ('Drivetrain', 'Cassettes', NULL, 44),
    ('Drivetrain', 'Derailleurs', 'Front', 45), ('Drivetrain', 'Derailleurs', 'Rear', 46),
    ('Drivetrain', 'Chains', NULL, 47), ('Drivetrain', 'Bottom Brackets', NULL, 48),
    ('Drivetrain', 'Power Meters', NULL, 49), ('Brakes', 'Disc Brakes', 'Complete Sets', 50),
    ('Brakes', 'Disc Brakes', 'Calipers', 51), ('Brakes', 'Disc Brakes', 'Rotors', 52),
    ('Brakes', 'Brake Pads', NULL, 53), ('Brakes', 'Levers', NULL, 54),
    ('Cockpit', 'Handlebars', 'Road', 55), ('Cockpit', 'Handlebars', 'MTB / DH', 56),
    ('Cockpit', 'Handlebars', 'Gravel / Flared', 57), ('Cockpit', 'Stems', NULL, 58),
    ('Cockpit', 'Headsets', NULL, 59), ('Cockpit', 'Bar Tape & Grips', NULL, 60),
    ('Seat & Seatposts', 'Saddles', NULL, 61), ('Seat & Seatposts', 'Seatposts', NULL, 62),
    ('Seat & Seatposts', 'Dropper Posts', NULL, 63), ('Pedals', 'Clipless Pedals', NULL, 64),
    ('Pedals', 'Flat Pedals', NULL, 65), ('Pedals', 'Pedal Accessories', NULL, 66),
    ('Accessories', 'Helmets', NULL, 67), ('Accessories', 'Lights', 'Front', 68),
    ('Accessories', 'Lights', 'Rear', 69), ('Accessories', 'Lights', 'Sets', 70),
    ('Accessories', 'Pumps', 'Floor', 71), ('Accessories', 'Pumps', 'Mini / Hand', 72),
    ('Accessories', 'Locks', NULL, 73), ('Accessories', 'Bags', 'On-Bike', 74),
    ('Accessories', 'Bags', 'Off-Bike', 75), ('Accessories', 'Racks & Panniers', NULL, 76),
    ('Accessories', 'Mudguards / Fenders', NULL, 77), ('Accessories', 'Bottles & Cages', NULL, 78),
    ('Accessories', 'Child Seats & Trailers', NULL, 79), ('Accessories', 'Car Racks', NULL, 80),
    ('Apparel', 'Jerseys', NULL, 81), ('Apparel', 'Shorts & Bibs', NULL, 82),
    ('Apparel', 'Jackets & Gilets', NULL, 83), ('Apparel', 'Gloves', NULL, 84),
    ('Apparel', 'Shoes', 'Road', 85), ('Apparel', 'Shoes', 'MTB / Gravel', 86),
    ('Apparel', 'Casual Clothing', NULL, 87), ('Protection', 'Knee & Elbow Pads', NULL, 88),
    ('Protection', 'Body Armor', NULL, 89), ('Maintenance & Workshop', 'Tools', NULL, 90),
    ('Maintenance & Workshop', 'Cleaning', NULL, 91), ('Maintenance & Workshop', 'Lubricants & Grease', NULL, 92),
    ('Maintenance & Workshop', 'Repair Kits', NULL, 93), ('Maintenance & Workshop', 'Workstands', NULL, 94),
    ('Tech & Electronics', 'Bike Computers', NULL, 95), ('Tech & Electronics', 'Smart Trainers', NULL, 96),
    ('Tech & Electronics', 'Heart Rate Monitors', NULL, 97), ('Tech & Electronics', 'Cameras', NULL, 98),
    ('Tech & Electronics', 'E-Bike Batteries & Chargers', NULL, 99), ('Nutrition', 'Energy Gels & Chews', NULL, 100),
    ('Nutrition', 'Bars', NULL, 101), ('Nutrition', 'Drink Mixes & Electrolytes', NULL, 102),
    ('Shop Services', 'Bike Service', 'Basic / Bronze', 103), ('Shop Services', 'Bike Service', 'Intermediate / Silver', 104),
    ('Shop Services', 'Bike Service', 'Premium / Gold', 105), ('Shop Services', 'Bike Fitting', NULL, 106),
    ('Shop Services', 'Suspension Service', NULL, 107), ('Marketplace Specials', 'Verified Bikes', NULL, 108),
    ('Marketplace Specials', 'Certified Pre-Owned', NULL, 109), ('Marketplace Specials', 'Clearance', NULL, 110)
),
level2_rows AS (
  SELECT level1, level2, MIN(path_order) AS sort_order
  FROM taxonomy
  GROUP BY level1, level2
)
INSERT INTO public.marketplace_categories(parent_id, name, slug, path_slug, level, sort_order)
SELECT
  parent.id,
  rows.level2,
  public.marketplace_category_slug(rows.level2),
  parent.path_slug || '/' || public.marketplace_category_slug(rows.level2),
  2,
  ROW_NUMBER() OVER (PARTITION BY rows.level1 ORDER BY rows.sort_order)::INTEGER
FROM level2_rows rows
JOIN public.marketplace_categories parent
  ON parent.level = 1
 AND parent.name = rows.level1
ON CONFLICT (path_slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

WITH taxonomy(level1, level2, level3, path_order) AS (
  VALUES
    ('Bicycles', 'Mountain', 'XC', 3), ('Bicycles', 'Mountain', 'Trail', 4),
    ('Bicycles', 'Mountain', 'Enduro', 5), ('Bicycles', 'Mountain', 'Downhill', 6),
    ('Bicycles', 'BMX', 'Race', 15), ('Bicycles', 'BMX', 'Freestyle', 16),
    ('Bicycles', 'Kids', 'Balance', 17), ('Bicycles', 'Kids', '12–16 inch', 18),
    ('Bicycles', 'Kids', '20–24 inch', 19), ('E-Bikes', 'E-MTB', 'Hardtail', 22),
    ('E-Bikes', 'E-MTB', 'Full Suspension', 23), ('Wheels & Tyres', 'Tyres', 'Road', 37),
    ('Wheels & Tyres', 'Tyres', 'Gravel / CX', 38), ('Wheels & Tyres', 'Tyres', 'MTB', 39),
    ('Wheels & Tyres', 'Tubeless', 'Sealant / Valves / Tape', 41),
    ('Drivetrain', 'Derailleurs', 'Front', 45), ('Drivetrain', 'Derailleurs', 'Rear', 46),
    ('Brakes', 'Disc Brakes', 'Complete Sets', 50), ('Brakes', 'Disc Brakes', 'Calipers', 51),
    ('Brakes', 'Disc Brakes', 'Rotors', 52), ('Cockpit', 'Handlebars', 'Road', 55),
    ('Cockpit', 'Handlebars', 'MTB / DH', 56), ('Cockpit', 'Handlebars', 'Gravel / Flared', 57),
    ('Accessories', 'Lights', 'Front', 68), ('Accessories', 'Lights', 'Rear', 69),
    ('Accessories', 'Lights', 'Sets', 70), ('Accessories', 'Pumps', 'Floor', 71),
    ('Accessories', 'Pumps', 'Mini / Hand', 72), ('Accessories', 'Bags', 'On-Bike', 74),
    ('Accessories', 'Bags', 'Off-Bike', 75), ('Apparel', 'Shoes', 'Road', 85),
    ('Apparel', 'Shoes', 'MTB / Gravel', 86), ('Shop Services', 'Bike Service', 'Basic / Bronze', 103),
    ('Shop Services', 'Bike Service', 'Intermediate / Silver', 104),
    ('Shop Services', 'Bike Service', 'Premium / Gold', 105)
),
level3_rows AS (
  SELECT level1, level2, level3, path_order,
         ROW_NUMBER() OVER (PARTITION BY level1, level2 ORDER BY path_order)::INTEGER AS sort_order
  FROM taxonomy
)
INSERT INTO public.marketplace_categories(parent_id, name, slug, path_slug, level, sort_order)
SELECT
  parent.id,
  rows.level3,
  public.marketplace_category_slug(rows.level3),
  parent.path_slug || '/' || public.marketplace_category_slug(rows.level3),
  3,
  rows.sort_order
FROM level3_rows rows
JOIN public.marketplace_categories level1
  ON level1.level = 1
 AND level1.name = rows.level1
JOIN public.marketplace_categories parent
  ON parent.level = 2
 AND parent.parent_id = level1.id
 AND parent.name = rows.level2
ON CONFLICT (path_slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public marketplace taxonomy is readable" ON public.marketplace_categories;
CREATE POLICY "Public marketplace taxonomy is readable"
  ON public.marketplace_categories
  FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

GRANT SELECT ON public.marketplace_categories TO anon, authenticated;

ALTER TABLE public.canonical_products
  ADD COLUMN IF NOT EXISTS marketplace_category_id UUID
    REFERENCES public.marketplace_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS categorisation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS categorisation_source TEXT,
  ADD COLUMN IF NOT EXISTS categorisation_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS categorisation_error TEXT,
  ADD COLUMN IF NOT EXISTS categorisation_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS categorised_at TIMESTAMPTZ;

ALTER TABLE public.canonical_products
  DROP CONSTRAINT IF EXISTS canonical_products_categorisation_status_check;

ALTER TABLE public.canonical_products
  ADD CONSTRAINT canonical_products_categorisation_status_check
  CHECK (categorisation_status IN ('pending', 'processing', 'classified', 'needs_review', 'failed'));

ALTER TABLE public.canonical_products
  DROP CONSTRAINT IF EXISTS canonical_products_categorisation_confidence_check;

ALTER TABLE public.canonical_products
  ADD CONSTRAINT canonical_products_categorisation_confidence_check
  CHECK (
    categorisation_confidence IS NULL
    OR categorisation_confidence BETWEEN 0 AND 1
  );

CREATE INDEX IF NOT EXISTS canonical_products_category_node_idx
  ON public.canonical_products(marketplace_category_id)
  WHERE marketplace_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS canonical_products_categorisation_queue_idx
  ON public.canonical_products(categorisation_status, created_at)
  WHERE categorisation_status <> 'classified';

CREATE OR REPLACE FUNCTION public.resolve_marketplace_category_id(
  p_level1 TEXT,
  p_level2 TEXT,
  p_level3 TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(level3.id, level2.id)
  FROM public.marketplace_categories level1
  JOIN public.marketplace_categories level2
    ON level2.parent_id = level1.id
   AND level2.level = 2
   AND level2.is_active = TRUE
  LEFT JOIN public.marketplace_categories level3
    ON level3.parent_id = level2.id
   AND level3.level = 3
   AND level3.is_active = TRUE
   AND LOWER(level3.name) = LOWER(BTRIM(COALESCE(p_level3, '')))
  WHERE level1.level = 1
    AND level1.is_active = TRUE
    AND LOWER(level1.name) = LOWER(BTRIM(p_level1))
    AND LOWER(level2.name) = LOWER(BTRIM(p_level2))
    AND (
      NULLIF(BTRIM(COALESCE(p_level3, '')), '') IS NULL
      OR level3.id IS NOT NULL
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_marketplace_category_id(TEXT, TEXT, TEXT)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.infer_marketplace_category_id(
  p_name TEXT,
  p_provider_category TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  haystack TEXT := LOWER(COALESCE(p_name, '') || ' ' || COALESCE(p_provider_category, ''));
  category_id UUID;
BEGIN
  -- Only return high-confidence deterministic matches. Ambiguous products stay
  -- pending for AI or manual review rather than being forced into "Other".
  IF haystack ~ '\m(bike fit|bike fitting)\M' THEN
    RETURN public.resolve_marketplace_category_id('Shop Services', 'Bike Fitting');
  ELSIF haystack ~ '\m(suspension service|fork service|shock service)\M' THEN
    RETURN public.resolve_marketplace_category_id('Shop Services', 'Suspension Service');
  ELSIF haystack ~ '\m(bike service|workshop service|tune[ -]?up)\M' THEN
    RETURN public.resolve_marketplace_category_id('Shop Services', 'Bike Service');
  ELSIF haystack ~ '\m(e[- ]?bike|electric bike|electric bicycle)\M' THEN
    IF haystack ~ '\m(mtb|mountain)\M' THEN
      RETURN public.resolve_marketplace_category_id(
        'E-Bikes',
        'E-MTB',
        CASE WHEN haystack ~ '\m(full suspension|dually)\M' THEN 'Full Suspension' ELSE 'Hardtail' END
      );
    ELSIF haystack ~ '\mgravel\M' THEN
      RETURN public.resolve_marketplace_category_id('E-Bikes', 'E-Gravel');
    ELSIF haystack ~ '\mroad\M' THEN
      RETURN public.resolve_marketplace_category_id('E-Bikes', 'E-Road');
    ELSIF haystack ~ '\mcargo\M' THEN
      RETURN public.resolve_marketplace_category_id('E-Bikes', 'E-Cargo');
    ELSIF haystack ~ '\mfold(ing|able)?\M' THEN
      RETURN public.resolve_marketplace_category_id('E-Bikes', 'E-Folding');
    ELSIF haystack ~ '\m(commuter|city)\M' THEN
      RETURN public.resolve_marketplace_category_id('E-Bikes', 'E-Commuter / City');
    END IF;
    RETURN public.resolve_marketplace_category_id('E-Bikes', 'E-Hybrid');
  ELSIF haystack ~ '\m(frameset|frame set|bike frame|bicycle frame)\M' THEN
    IF haystack ~ '\mgravel\M' THEN
      RETURN public.resolve_marketplace_category_id('Frames & Framesets', 'Gravel Frameset');
    ELSIF haystack ~ '\mroad\M' THEN
      RETURN public.resolve_marketplace_category_id('Frames & Framesets', 'Road Frameset');
    ELSIF haystack ~ '\m(full suspension|dually)\M' THEN
      RETURN public.resolve_marketplace_category_id('Frames & Framesets', 'MTB Full Suspension Frame');
    ELSIF haystack ~ '\m(mtb|mountain|hardtail)\M' THEN
      RETURN public.resolve_marketplace_category_id('Frames & Framesets', 'MTB Hardtail Frame');
    END IF;
    RETURN public.resolve_marketplace_category_id('Frames & Framesets', 'Other Frames');
  ELSIF haystack ~ '\m(tyre|tire)\M' THEN
    IF haystack ~ '\m(mtb|mountain)\M' THEN
      RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'Tyres', 'MTB');
    ELSIF haystack ~ '\m(gravel|cyclocross|cx)\M' THEN
      RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'Tyres', 'Gravel / CX');
    END IF;
    RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'Tyres', 'Road');
  ELSIF haystack ~ '\m(inner tube|tube)\M' THEN
    RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'Tubes');
  ELSIF haystack ~ '\m(tubeless|sealant|rim tape|valve)\M' THEN
    RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'Tubeless', 'Sealant / Valves / Tape');
  ELSIF haystack ~ '\m(wheelset|wheel set|wheels)\M' THEN
    IF haystack ~ '\m(mtb|mountain)\M' THEN
      RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'MTB Wheelsets');
    ELSIF haystack ~ '\mgravel\M' THEN
      RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'Gravel Wheelsets');
    END IF;
    RETURN public.resolve_marketplace_category_id('Wheels & Tyres', 'Road Wheelsets');
  ELSIF haystack ~ '\m(groupset|group set)\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Groupsets');
  ELSIF haystack ~ '\m(crankset|crank set|cranks)\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Cranksets');
  ELSIF haystack ~ '\mcassette\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Cassettes');
  ELSIF haystack ~ '\m(front derailleur|fd)\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Derailleurs', 'Front');
  ELSIF haystack ~ '\m(rear derailleur|rd)\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Derailleurs', 'Rear');
  ELSIF haystack ~ '\m(chain)\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Chains');
  ELSIF haystack ~ '\m(bottom bracket)\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Bottom Brackets');
  ELSIF haystack ~ '\m(power meter)\M' THEN
    RETURN public.resolve_marketplace_category_id('Drivetrain', 'Power Meters');
  ELSIF haystack ~ '\m(brake pad|brake pads)\M' THEN
    RETURN public.resolve_marketplace_category_id('Brakes', 'Brake Pads');
  ELSIF haystack ~ '\m(rotor|disc rotor)\M' THEN
    RETURN public.resolve_marketplace_category_id('Brakes', 'Disc Brakes', 'Rotors');
  ELSIF haystack ~ '\m(caliper)\M' THEN
    RETURN public.resolve_marketplace_category_id('Brakes', 'Disc Brakes', 'Calipers');
  ELSIF haystack ~ '\m(disc brake|brake set)\M' THEN
    RETURN public.resolve_marketplace_category_id('Brakes', 'Disc Brakes', 'Complete Sets');
  ELSIF haystack ~ '\m(brake lever|levers)\M' THEN
    RETURN public.resolve_marketplace_category_id('Brakes', 'Levers');
  ELSIF haystack ~ '\m(handlebar|handlebars)\M' THEN
    IF haystack ~ '\m(mtb|mountain|downhill|dh)\M' THEN
      RETURN public.resolve_marketplace_category_id('Cockpit', 'Handlebars', 'MTB / DH');
    ELSIF haystack ~ '\m(gravel|flared)\M' THEN
      RETURN public.resolve_marketplace_category_id('Cockpit', 'Handlebars', 'Gravel / Flared');
    END IF;
    RETURN public.resolve_marketplace_category_id('Cockpit', 'Handlebars', 'Road');
  ELSIF haystack ~ '\m(stem)\M' THEN
    RETURN public.resolve_marketplace_category_id('Cockpit', 'Stems');
  ELSIF haystack ~ '\m(headset)\M' THEN
    RETURN public.resolve_marketplace_category_id('Cockpit', 'Headsets');
  ELSIF haystack ~ '\m(bar tape|grips?)\M' THEN
    RETURN public.resolve_marketplace_category_id('Cockpit', 'Bar Tape & Grips');
  ELSIF haystack ~ '\m(dropper post)\M' THEN
    RETURN public.resolve_marketplace_category_id('Seat & Seatposts', 'Dropper Posts');
  ELSIF haystack ~ '\m(seatpost|seat post)\M' THEN
    RETURN public.resolve_marketplace_category_id('Seat & Seatposts', 'Seatposts');
  ELSIF haystack ~ '\m(saddle)\M' THEN
    RETURN public.resolve_marketplace_category_id('Seat & Seatposts', 'Saddles');
  ELSIF haystack ~ '\m(flat pedal)\M' THEN
    RETURN public.resolve_marketplace_category_id('Pedals', 'Flat Pedals');
  ELSIF haystack ~ '\m(clipless pedal)\M' THEN
    RETURN public.resolve_marketplace_category_id('Pedals', 'Clipless Pedals');
  ELSIF haystack ~ '\m(pedal|cleat)\M' THEN
    RETURN public.resolve_marketplace_category_id('Pedals', 'Pedal Accessories');
  ELSIF haystack ~ '\mhelmet\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Helmets');
  ELSIF haystack ~ '\m(bike light|front light|headlight)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Lights', 'Front');
  ELSIF haystack ~ '\m(rear light|tail light)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Lights', 'Rear');
  ELSIF haystack ~ '\m(light set)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Lights', 'Sets');
  ELSIF haystack ~ '\m(floor pump|track pump)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Pumps', 'Floor');
  ELSIF haystack ~ '\m(mini pump|hand pump)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Pumps', 'Mini / Hand');
  ELSIF haystack ~ '\mlock\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Locks');
  ELSIF haystack ~ '\m(pannier|bike rack)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Racks & Panniers');
  ELSIF haystack ~ '\m(mudguard|fender)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Mudguards / Fenders');
  ELSIF haystack ~ '\m(bottle cage|water bottle)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Bottles & Cages');
  ELSIF haystack ~ '\m(car rack|bike carrier)\M' THEN
    RETURN public.resolve_marketplace_category_id('Accessories', 'Car Racks');
  ELSIF haystack ~ '\m(jersey)\M' THEN
    RETURN public.resolve_marketplace_category_id('Apparel', 'Jerseys');
  ELSIF haystack ~ '\m(bib shorts|bibs|cycling shorts)\M' THEN
    RETURN public.resolve_marketplace_category_id('Apparel', 'Shorts & Bibs');
  ELSIF haystack ~ '\m(jacket|gilet|vest)\M' THEN
    RETURN public.resolve_marketplace_category_id('Apparel', 'Jackets & Gilets');
  ELSIF haystack ~ '\m(glove|gloves)\M' THEN
    RETURN public.resolve_marketplace_category_id('Apparel', 'Gloves');
  ELSIF haystack ~ '\m(road shoes|road shoe)\M' THEN
    RETURN public.resolve_marketplace_category_id('Apparel', 'Shoes', 'Road');
  ELSIF haystack ~ '\m(mtb shoes|mountain bike shoes|gravel shoes)\M' THEN
    RETURN public.resolve_marketplace_category_id('Apparel', 'Shoes', 'MTB / Gravel');
  ELSIF haystack ~ '\m(knee pad|elbow pad)\M' THEN
    RETURN public.resolve_marketplace_category_id('Protection', 'Knee & Elbow Pads');
  ELSIF haystack ~ '\m(body armor|body armour)\M' THEN
    RETURN public.resolve_marketplace_category_id('Protection', 'Body Armor');
  ELSIF haystack ~ '\m(workstand|work stand)\M' THEN
    RETURN public.resolve_marketplace_category_id('Maintenance & Workshop', 'Workstands');
  ELSIF haystack ~ '\m(cleaner|cleaning|degreaser)\M' THEN
    RETURN public.resolve_marketplace_category_id('Maintenance & Workshop', 'Cleaning');
  ELSIF haystack ~ '\m(lube|lubricant|grease)\M' THEN
    RETURN public.resolve_marketplace_category_id('Maintenance & Workshop', 'Lubricants & Grease');
  ELSIF haystack ~ '\m(repair kit|puncture kit|patch kit)\M' THEN
    RETURN public.resolve_marketplace_category_id('Maintenance & Workshop', 'Repair Kits');
  ELSIF haystack ~ '\m(tool|wrench|spanner)\M' THEN
    RETURN public.resolve_marketplace_category_id('Maintenance & Workshop', 'Tools');
  ELSIF haystack ~ '\m(bike computer|cycling computer|gps computer)\M' THEN
    RETURN public.resolve_marketplace_category_id('Tech & Electronics', 'Bike Computers');
  ELSIF haystack ~ '\m(smart trainer|indoor trainer)\M' THEN
    RETURN public.resolve_marketplace_category_id('Tech & Electronics', 'Smart Trainers');
  ELSIF haystack ~ '\m(heart rate monitor)\M' THEN
    RETURN public.resolve_marketplace_category_id('Tech & Electronics', 'Heart Rate Monitors');
  ELSIF haystack ~ '\m(e[- ]?bike battery|e[- ]?bike charger)\M' THEN
    RETURN public.resolve_marketplace_category_id('Tech & Electronics', 'E-Bike Batteries & Chargers');
  ELSIF haystack ~ '\m(gel|energy chew)\M' THEN
    RETURN public.resolve_marketplace_category_id('Nutrition', 'Energy Gels & Chews');
  ELSIF haystack ~ '\m(energy bar|protein bar)\M' THEN
    RETURN public.resolve_marketplace_category_id('Nutrition', 'Bars');
  ELSIF haystack ~ '\m(electrolyte|drink mix)\M' THEN
    RETURN public.resolve_marketplace_category_id('Nutrition', 'Drink Mixes & Electrolytes');
  ELSIF haystack ~ '\m(bicycle|bike)\M' THEN
    IF haystack ~ '\m(gravel)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Gravel');
    ELSIF haystack ~ '\m(mountain|mtb)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Mountain');
    ELSIF haystack ~ '\m(bmx)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'BMX');
    ELSIF haystack ~ '\m(kids|children|balance)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Kids');
    ELSIF haystack ~ '\m(cargo)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Cargo');
    ELSIF haystack ~ '\m(folding)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Folding');
    ELSIF haystack ~ '\m(cyclocross|cx)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Cyclocross');
    ELSIF haystack ~ '\m(triathlon|time trial|tt bike)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Time Trial / Triathlon');
    ELSIF haystack ~ '\m(commuter|city)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Commuter / City');
    ELSIF haystack ~ '\m(touring)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Touring');
    ELSIF haystack ~ '\m(track|fixie|fixed gear)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Track / Fixie');
    ELSIF haystack ~ '\m(hybrid|fitness)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Hybrid / Fitness');
    ELSIF haystack ~ '\m(road)\M' THEN
      RETURN public.resolve_marketplace_category_id('Bicycles', 'Road');
    END IF;
  END IF;

  RETURN category_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.infer_marketplace_category_id(TEXT, TEXT)
  TO authenticated;

-- Recover any existing valid canonical assignments before enforcing projection.
UPDATE public.canonical_products canonical
SET marketplace_category_id = public.resolve_marketplace_category_id(
      canonical.marketplace_category,
      canonical.marketplace_subcategory,
      canonical.marketplace_level_3_category
    ),
    categorisation_status = 'classified',
    categorisation_source = COALESCE(canonical.categorisation_source, 'legacy_backfill'),
    categorisation_confidence = COALESCE(canonical.categorisation_confidence, 1),
    categorised_at = COALESCE(canonical.categorised_at, NOW())
WHERE canonical.marketplace_category_id IS NULL
  AND NULLIF(BTRIM(canonical.marketplace_category), '') IS NOT NULL
  AND NULLIF(BTRIM(canonical.marketplace_subcategory), '') IS NOT NULL
  AND public.resolve_marketplace_category_id(
        canonical.marketplace_category,
        canonical.marketplace_subcategory,
        canonical.marketplace_level_3_category
      ) IS NOT NULL;

-- Recover valid product-level assignments for canonicals that have not yet been
-- categorised. The most common valid linked path wins; ambiguous legacy values
-- remain pending for the classifier.
WITH candidates AS (
  SELECT
    product.canonical_product_id,
    public.resolve_marketplace_category_id(
      product.marketplace_category,
      product.marketplace_subcategory,
      product.marketplace_level_3_category
    ) AS category_id,
    COUNT(*) AS use_count
  FROM public.products product
  JOIN public.canonical_products canonical
    ON canonical.id = product.canonical_product_id
   AND canonical.marketplace_category_id IS NULL
  WHERE product.canonical_product_id IS NOT NULL
    AND NULLIF(BTRIM(product.marketplace_category), '') IS NOT NULL
    AND NULLIF(BTRIM(product.marketplace_subcategory), '') IS NOT NULL
  GROUP BY
    product.canonical_product_id,
    product.marketplace_category,
    product.marketplace_subcategory,
    product.marketplace_level_3_category
),
ranked AS (
  SELECT
    canonical_product_id,
    category_id,
    ROW_NUMBER() OVER (
      PARTITION BY canonical_product_id
      ORDER BY use_count DESC, category_id
    ) AS rank
  FROM candidates
  WHERE category_id IS NOT NULL
)
UPDATE public.canonical_products canonical
SET marketplace_category_id = ranked.category_id,
    categorisation_status = 'classified',
    categorisation_source = 'product_backfill',
    categorisation_confidence = 1,
    categorised_at = NOW()
FROM ranked
WHERE ranked.canonical_product_id = canonical.id
  AND ranked.rank = 1
  AND canonical.marketplace_category_id IS NULL;

UPDATE public.canonical_products canonical
SET marketplace_category_id = public.infer_marketplace_category_id(
      canonical.normalized_name,
      canonical.category
    ),
    categorisation_status = 'classified',
    categorisation_source = 'deterministic_backfill',
    categorisation_confidence = 0.95,
    categorised_at = NOW()
WHERE canonical.marketplace_category_id IS NULL
  AND public.infer_marketplace_category_id(
        canonical.normalized_name,
        canonical.category
      ) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_canonical_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  selected public.marketplace_categories%ROWTYPE;
  parent public.marketplace_categories%ROWTYPE;
  root public.marketplace_categories%ROWTYPE;
BEGIN
  IF NEW.marketplace_category_id IS NULL THEN
    IF NEW.categorisation_status = 'classified' THEN
      RAISE EXCEPTION 'A classified canonical product requires a marketplace category';
    END IF;

    NEW.marketplace_category := NULL;
    NEW.marketplace_subcategory := NULL;
    NEW.marketplace_level_3_category := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO selected
  FROM public.marketplace_categories
  WHERE id = NEW.marketplace_category_id
    AND is_active = TRUE;

  IF NOT FOUND OR selected.level NOT IN (2, 3) THEN
    RAISE EXCEPTION 'Canonical category must be an active L2 or L3 category';
  END IF;

  SELECT * INTO parent
  FROM public.marketplace_categories
  WHERE id = selected.parent_id
    AND is_active = TRUE;

  IF selected.level = 2 THEN
    IF parent.level <> 1 THEN
      RAISE EXCEPTION 'Invalid L2 marketplace category parent';
    END IF;
    NEW.marketplace_category := parent.name;
    NEW.marketplace_subcategory := selected.name;
    NEW.marketplace_level_3_category := NULL;
  ELSE
    SELECT * INTO root
    FROM public.marketplace_categories
    WHERE id = parent.parent_id
      AND is_active = TRUE;

    IF parent.level <> 2 OR root.level <> 1 THEN
      RAISE EXCEPTION 'Invalid L3 marketplace category ancestry';
    END IF;
    NEW.marketplace_category := root.name;
    NEW.marketplace_subcategory := parent.name;
    NEW.marketplace_level_3_category := selected.name;
  END IF;

  NEW.categorisation_status := 'classified';
  NEW.categorisation_error := NULL;
  NEW.categorised_at := COALESCE(NEW.categorised_at, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_canonical_category_before_write
  ON public.canonical_products;

CREATE TRIGGER project_canonical_category_before_write
  BEFORE INSERT OR UPDATE OF
    marketplace_category_id,
    marketplace_category,
    marketplace_subcategory,
    marketplace_level_3_category,
    categorisation_status
  ON public.canonical_products
  FOR EACH ROW
  EXECUTE FUNCTION public.project_canonical_category();

CREATE OR REPLACE FUNCTION public.project_product_category_from_canonical()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  canonical public.canonical_products%ROWTYPE;
BEGIN
  -- Preserve product-level categories when there is no canonical link yet.
  IF NEW.canonical_product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO canonical
  FROM public.canonical_products
  WHERE id = NEW.canonical_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical product % does not exist', NEW.canonical_product_id;
  END IF;

  -- Only project when the canonical has been classified. Do not wipe valid
  -- product categories while the canonical is still pending review.
  IF NULLIF(BTRIM(canonical.marketplace_category), '') IS NULL
     OR NULLIF(BTRIM(canonical.marketplace_subcategory), '') IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.marketplace_category := canonical.marketplace_category;
  NEW.marketplace_subcategory := canonical.marketplace_subcategory;
  NEW.marketplace_level_3_category := canonical.marketplace_level_3_category;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_categories_after_canonical_link ON public.products;
DROP TRIGGER IF EXISTS project_product_category_before_write ON public.products;

CREATE TRIGGER project_product_category_before_write
  BEFORE INSERT OR UPDATE OF
    canonical_product_id,
    marketplace_category,
    marketplace_subcategory,
    marketplace_level_3_category
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.project_product_category_from_canonical();

CREATE OR REPLACE FUNCTION public.propagate_canonical_category_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.marketplace_category IS DISTINCT FROM OLD.marketplace_category
     OR NEW.marketplace_subcategory IS DISTINCT FROM OLD.marketplace_subcategory
     OR NEW.marketplace_level_3_category IS DISTINCT FROM OLD.marketplace_level_3_category
     OR NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    UPDATE public.products
    SET marketplace_category = NEW.marketplace_category,
        marketplace_subcategory = NEW.marketplace_subcategory,
        marketplace_level_3_category = NEW.marketplace_level_3_category,
        display_name = COALESCE(NEW.display_name, products.description),
        updated_at = NOW()
    WHERE canonical_product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-project and propagate every recovered assignment now that the validation
-- triggers are installed.
UPDATE public.canonical_products
SET marketplace_category_id = marketplace_category_id
WHERE marketplace_category_id IS NOT NULL;

COMMENT ON TABLE public.marketplace_categories IS
  'Canonical Yellow Jersey category tree. Products reference the deepest applicable L2 or L3 node through canonical_products.';
COMMENT ON COLUMN public.canonical_products.marketplace_category_id IS
  'Deepest valid canonical taxonomy node. L1/L2/L3 text fields are derived projections.';
COMMENT ON COLUMN public.canonical_products.categorisation_status IS
  'Classification lifecycle: pending, processing, classified, needs_review, or failed.';
