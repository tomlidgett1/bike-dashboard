-- ============================================================
-- Fix RLS Policies for user_interactions
-- Allow both authenticated and anonymous tracking
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own interactions" ON user_interactions;
DROP POLICY IF EXISTS "Users can insert own interactions" ON user_interactions;
DROP POLICY IF EXISTS "Service role full access" ON user_interactions;

-- Create new policies that support both authenticated and anonymous users

-- 1. SELECT: Users can view their own interactions, anonymous can't view any
CREATE POLICY "Users can view own interactions"
  ON user_interactions
  FOR SELECT
  USING (
    user_id IS NOT NULL AND auth.uid() = user_id
  );

-- 2. INSERT: Allow authenticated users to insert their own, and allow NULL user_id for anonymous
CREATE POLICY "Users can insert own interactions"
  ON user_interactions
  FOR INSERT
  WITH CHECK (
    user_id IS NULL OR auth.uid() = user_id
  );

-- 3. Service role can do everything (for background jobs)
CREATE POLICY "Service role full access"
  ON user_interactions
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================================
-- Verify policies are working
-- ============================================================

-- Test anonymous insert (should work now)
DO $$
DECLARE
  v_product_id UUID;
BEGIN
  SELECT id INTO v_product_id FROM products WHERE is_active = true LIMIT 1;
  
  IF v_product_id IS NOT NULL THEN
    INSERT INTO user_interactions (
      user_id,
      session_id,
      product_id,
      interaction_type,
      created_at
    ) VALUES (
      NULL, -- Anonymous user
      gen_random_uuid(),
      v_product_id,
      'view',
      NOW()
    );
    RAISE NOTICE 'Anonymous insert test: SUCCESS';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Anonymous insert test: FAILED - %', SQLERRM;
END $$;

-- Comment for reference
COMMENT ON TABLE user_interactions IS 
'Tracks user interactions with products. Supports both authenticated (user_id set) and anonymous (user_id NULL) tracking.';










