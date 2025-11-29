-- ============================================================
-- Store Services Table
-- ============================================================
-- This table stores services offered by bike stores
-- (e.g., "Full Bicycle Service", "Wheel Truing", etc.)

CREATE TABLE IF NOT EXISTS store_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_store_services_user_id ON store_services(user_id);
CREATE INDEX IF NOT EXISTS idx_store_services_active ON store_services(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_services_order ON store_services(user_id, display_order);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE store_services ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Users can view their own services
CREATE POLICY "Users can view own services"
  ON store_services
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own services
CREATE POLICY "Users can insert own services"
  ON store_services
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own services
CREATE POLICY "Users can update own services"
  ON store_services
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own services
CREATE POLICY "Users can delete own services"
  ON store_services
  FOR DELETE
  USING (auth.uid() = user_id);

-- Public can view active services for verified stores
CREATE POLICY "Public can view active store services"
  ON store_services
  FOR SELECT
  USING (
    is_active = true 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.user_id = store_services.user_id 
      AND users.bicycle_store = true
    )
  );

-- ============================================================
-- Trigger for updated_at
-- ============================================================
CREATE TRIGGER update_store_services_updated_at
  BEFORE UPDATE ON store_services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE store_services IS 'Services offered by bike stores (e.g., repairs, maintenance)';
COMMENT ON COLUMN store_services.name IS 'Service name (e.g., "Full Bicycle Service")';
COMMENT ON COLUMN store_services.description IS 'Optional description of the service';

