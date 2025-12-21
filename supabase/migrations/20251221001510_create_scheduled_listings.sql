-- ============================================================
-- Scheduled Listings Table for Admin Scheduled Uploads
-- ============================================================
-- Stores listings prepared by admins to be published at a scheduled time
-- for any user on the platform.

CREATE TABLE IF NOT EXISTS scheduled_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Admin who created this scheduled listing
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Target user who will own the listing when published
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- Listing data (complete form data from AI analysis)
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Images (uploaded URLs and variants)
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Product reference (set after publishing)
  published_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  
  -- Status constraint
  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'published', 'cancelled', 'failed')
  )
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_scheduled_listings_admin_user ON scheduled_listings(admin_user_id);
CREATE INDEX idx_scheduled_listings_target_user ON scheduled_listings(target_user_id);
CREATE INDEX idx_scheduled_listings_status ON scheduled_listings(status);
CREATE INDEX idx_scheduled_listings_scheduled_for ON scheduled_listings(scheduled_for);

-- Composite index for the cron job query (pending listings due for publishing)
CREATE INDEX idx_scheduled_listings_pending_due ON scheduled_listings(status, scheduled_for)
  WHERE status = 'pending';

-- ============================================================
-- Updated At Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_scheduled_listings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_listings_updated_at
  BEFORE UPDATE ON scheduled_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_listings_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE scheduled_listings ENABLE ROW LEVEL SECURITY;

-- Admin users can view all scheduled listings
-- For now, using email check (tom@lidgett.net) as the admin identifier
-- This matches the pattern used in other admin endpoints

CREATE POLICY "Admins can view all scheduled listings"
  ON scheduled_listings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'tom@lidgett.net'
    )
  );

CREATE POLICY "Admins can insert scheduled listings"
  ON scheduled_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'tom@lidgett.net'
    )
  );

CREATE POLICY "Admins can update scheduled listings"
  ON scheduled_listings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'tom@lidgett.net'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'tom@lidgett.net'
    )
  );

CREATE POLICY "Admins can delete scheduled listings"
  ON scheduled_listings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'tom@lidgett.net'
    )
  );

-- Service role bypass for edge function processing
CREATE POLICY "Service role can manage scheduled listings"
  ON scheduled_listings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON scheduled_listings TO authenticated;
GRANT ALL ON scheduled_listings TO service_role;

-- Add helpful comments
COMMENT ON TABLE scheduled_listings IS 'Admin-managed scheduled listings that publish at a specified time for any user';
COMMENT ON COLUMN scheduled_listings.admin_user_id IS 'The admin user who created and scheduled this listing';
COMMENT ON COLUMN scheduled_listings.target_user_id IS 'The user who will own the listing when it is published';
COMMENT ON COLUMN scheduled_listings.scheduled_for IS 'The date/time when this listing should be published';
COMMENT ON COLUMN scheduled_listings.form_data IS 'Complete listing form data including AI-analysed fields';
COMMENT ON COLUMN scheduled_listings.images IS 'Array of uploaded image objects with URLs and variants';

