-- Add category sync preferences table
-- This table stores which Lightspeed categories each user wants to sync

CREATE TABLE IF NOT EXISTS public.lightspeed_category_sync_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Lightspeed category reference (stable ID)
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL, -- Stored for display, but we reference by ID
  category_path TEXT, -- Full path like "Bikes > Road Bikes"
  
  -- Sync preferences
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  product_count INTEGER DEFAULT 0, -- How many products in this category
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one preference per user per category
  UNIQUE(user_id, category_id)
);

-- Add indexes for performance
CREATE INDEX idx_category_sync_user ON public.lightspeed_category_sync_preferences(user_id);
CREATE INDEX idx_category_sync_enabled ON public.lightspeed_category_sync_preferences(user_id, is_enabled);

-- Add RLS policies
ALTER TABLE public.lightspeed_category_sync_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own category sync preferences"
  ON public.lightspeed_category_sync_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own category sync preferences"
  ON public.lightspeed_category_sync_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own category sync preferences"
  ON public.lightspeed_category_sync_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own category sync preferences"
  ON public.lightspeed_category_sync_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_category_sync_preferences_updated_at
  BEFORE UPDATE ON public.lightspeed_category_sync_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add category_id column to products table for filtering
-- This links products to their Lightspeed categories
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS category_id TEXT,
ADD COLUMN IF NOT EXISTS category_name TEXT,
ADD COLUMN IF NOT EXISTS category_path TEXT;

-- Add index for category filtering on products
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(user_id, category_id);

COMMENT ON TABLE public.lightspeed_category_sync_preferences IS 'Stores which Lightspeed categories each user wants to sync. Uses category_id as stable reference.';
COMMENT ON COLUMN public.lightspeed_category_sync_preferences.category_id IS 'Lightspeed category ID - stable identifier that does not change';
COMMENT ON COLUMN public.lightspeed_category_sync_preferences.category_name IS 'Display name - can change in Lightspeed, updated on sync';
COMMENT ON COLUMN public.lightspeed_category_sync_preferences.is_enabled IS 'Whether this category should be synced';








