-- ============================================================
-- Fix RLS Policies for ai_image_discovery_queue
-- ============================================================
-- Allow authenticated users to insert and update queue items
-- (needed for admin manual image discovery)

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Authenticated users can view discovery queue" ON ai_image_discovery_queue;

-- Add comprehensive policies for authenticated users
CREATE POLICY "Authenticated users can view discovery queue"
  ON ai_image_discovery_queue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert to discovery queue"
  ON ai_image_discovery_queue FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update discovery queue"
  ON ai_image_discovery_queue FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Authenticated users can insert to discovery queue" ON ai_image_discovery_queue 
  IS 'Allows admin users to manually trigger image discovery by adding items to the queue';

COMMENT ON POLICY "Authenticated users can update discovery queue" ON ai_image_discovery_queue 
  IS 'Allows admin users to reset queue items or update priorities';






