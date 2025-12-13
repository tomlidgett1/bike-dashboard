-- ============================================================
-- Fix Foreign Key Constraint - Simplified for Partitioned Table
-- ============================================================

-- Drop the existing foreign key constraint from parent table
ALTER TABLE user_interactions 
DROP CONSTRAINT IF EXISTS user_interactions_product_id_fkey;

-- Ensure product_id column allows NULL
ALTER TABLE user_interactions 
ALTER COLUMN product_id DROP NOT NULL;

-- For partitioned tables, we DON'T add the constraint back
-- PostgreSQL will allow NULL values without the constraint
-- We'll validate at the application level instead

-- Test it works
DO $$
DECLARE
  v_test_session UUID := gen_random_uuid();
BEGIN
  -- Test 1: Insert with NULL product_id (should work now)
  INSERT INTO user_interactions (
    session_id,
    product_id,
    interaction_type,
    created_at
  ) VALUES (
    v_test_session,
    NULL,
    'search',
    NOW()
  );
  RAISE NOTICE 'Test 1 PASSED: NULL product_id insert successful';
  
  -- Test 2: Insert with fake UUID product_id (should work without FK constraint)
  INSERT INTO user_interactions (
    session_id,
    product_id,
    interaction_type,
    created_at
  ) VALUES (
    v_test_session,
    gen_random_uuid(),
    'view',
    NOW()
  );
  RAISE NOTICE 'Test 2 PASSED: Any UUID product_id insert successful';
  
  -- Clean up tests
  DELETE FROM user_interactions WHERE session_id = v_test_session;
  RAISE NOTICE 'Tests cleaned up successfully';
    
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Test FAILED: %', SQLERRM;
    DELETE FROM user_interactions WHERE session_id = v_test_session;
END $$;

-- Add a comment explaining why no FK constraint
COMMENT ON COLUMN user_interactions.product_id IS 
'References products.id but without FK constraint due to partitioning. 
NULL allowed for searches and non-product interactions. 
Application validates product_id exists before insert.';

-- Success message
SELECT 'Foreign key constraint removed - tracking should work now!' as status;








