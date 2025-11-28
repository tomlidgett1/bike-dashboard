-- Add sync status tracking
-- This table tracks ongoing syncs so users can see progress even if they navigate away

CREATE TABLE IF NOT EXISTS public.active_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Sync state
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed, cancelled
  phase TEXT NOT NULL DEFAULT 'init',
  message TEXT,
  progress INTEGER DEFAULT 0,
  
  -- Details
  category_ids TEXT[],
  items_with_stock INTEGER DEFAULT 0,
  items_synced INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Only one active sync per user
  CONSTRAINT one_sync_per_user UNIQUE(user_id)
);

-- Add indexes
CREATE INDEX idx_active_syncs_user ON public.active_syncs(user_id);
CREATE INDEX idx_active_syncs_status ON public.active_syncs(user_id, status);

-- Enable RLS
ALTER TABLE public.active_syncs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own active syncs"
  ON public.active_syncs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own active syncs"
  ON public.active_syncs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own active syncs"
  ON public.active_syncs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own active syncs"
  ON public.active_syncs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_active_syncs_updated_at
  BEFORE UPDATE ON public.active_syncs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.active_syncs IS 'Tracks ongoing sync operations so progress persists across page navigation';

