-- ============================================================
-- Add Category-Specific Fields to Products Table
-- ============================================================
-- Adds fields for bicycles, parts, and apparel to support
-- detailed marketplace listings with AI-populated specifications

-- ============================================================
-- Bike-Specific Fields
-- ============================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS frame_size TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS frame_material TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS bike_type TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS groupset TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS wheel_size TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS suspension_type TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS bike_weight TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS color_primary TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS color_secondary TEXT;

-- ============================================================
-- Part-Specific Fields
-- ============================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS part_type_detail TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS compatibility_notes TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS material TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS weight TEXT;

-- ============================================================
-- Apparel-Specific Fields
-- ============================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS size TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS gender_fit TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS apparel_material TEXT;

-- ============================================================
-- Indexes for Common Filters
-- ============================================================

-- Bike indexes
CREATE INDEX IF NOT EXISTS idx_products_frame_size 
  ON products(frame_size) 
  WHERE frame_size IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_bike_type 
  ON products(bike_type) 
  WHERE bike_type IS NOT NULL;

-- Part indexes
CREATE INDEX IF NOT EXISTS idx_products_part_type 
  ON products(part_type_detail) 
  WHERE part_type_detail IS NOT NULL;

-- Apparel indexes
CREATE INDEX IF NOT EXISTS idx_products_size 
  ON products(size) 
  WHERE size IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_gender_fit 
  ON products(gender_fit) 
  WHERE gender_fit IS NOT NULL;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON COLUMN products.frame_size IS 'Frame size for bicycles (e.g., 54cm, Medium, Large)';
COMMENT ON COLUMN products.frame_material IS 'Frame material for bicycles (e.g., Carbon, Aluminium, Steel, Titanium)';
COMMENT ON COLUMN products.bike_type IS 'Type of bicycle (e.g., Road, Mountain, Gravel, Hybrid)';
COMMENT ON COLUMN products.groupset IS 'Groupset/drivetrain (e.g., Shimano 105, SRAM Force)';
COMMENT ON COLUMN products.wheel_size IS 'Wheel size (e.g., 700c, 29", 27.5")';
COMMENT ON COLUMN products.suspension_type IS 'Suspension type (e.g., None, Front, Full)';
COMMENT ON COLUMN products.bike_weight IS 'Weight of the bicycle (e.g., 8.5kg, 18lbs)';
COMMENT ON COLUMN products.color_primary IS 'Primary colour of the product';
COMMENT ON COLUMN products.color_secondary IS 'Secondary colour of the product';

COMMENT ON COLUMN products.part_type_detail IS 'Detailed part type (e.g., Rear Derailleur, Crankset, Carbon Handlebars)';
COMMENT ON COLUMN products.compatibility_notes IS 'Compatibility information for parts (e.g., "Fits Shimano 11-speed")';
COMMENT ON COLUMN products.material IS 'Material composition for parts (e.g., Carbon, Aluminium, Steel)';
COMMENT ON COLUMN products.weight IS 'Weight of the part (e.g., 250g, 1.2kg)';

COMMENT ON COLUMN products.size IS 'Size for apparel/parts (e.g., XS, S, M, L, XL, 42 EU)';
COMMENT ON COLUMN products.gender_fit IS 'Gender fit for apparel (e.g., Men''s, Women''s, Unisex)';
COMMENT ON COLUMN products.apparel_material IS 'Material composition for apparel (e.g., Merino Wool, Polyester, Gore-Tex)';



