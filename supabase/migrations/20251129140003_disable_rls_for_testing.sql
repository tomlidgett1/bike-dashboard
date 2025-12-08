-- ============================================================
-- Temporarily Disable RLS for Testing
-- This allows us to isolate whether RLS is still causing issues
-- ============================================================

-- Disable RLS on all recommendation tables
ALTER TABLE user_interactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_cache DISABLE ROW LEVEL SECURITY;

-- Add comment noting this is temporary
COMMENT ON TABLE user_interactions IS 'RLS DISABLED FOR TESTING - Re-enable in production!';

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'RLS has been disabled on recommendation tables for testing';
  RAISE NOTICE 'Remember to re-enable with: ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;';
END $$;





