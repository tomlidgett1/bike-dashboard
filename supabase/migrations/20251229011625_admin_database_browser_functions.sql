-- ============================================================
-- Admin Database Browser Helper Functions
-- ============================================================
-- These functions help the admin database browser page query
-- table metadata from PostgreSQL information schema.
-- ============================================================

-- Function to get all public tables
CREATE OR REPLACE FUNCTION get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY table_name;
$$;

-- Function to get columns for a specific table
CREATE OR REPLACE FUNCTION get_table_columns(p_table_name text)
RETURNS TABLE(
  column_name text,
  data_type text,
  is_nullable text,
  column_default text,
  character_maximum_length integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    column_name::text,
    data_type::text,
    is_nullable::text,
    column_default::text,
    character_maximum_length::integer
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table_name
  ORDER BY ordinal_position;
$$;

-- Grant execute permissions to authenticated users
-- Note: The actual data access is controlled by RLS policies on each table
-- These functions only return metadata about table structure
GRANT EXECUTE ON FUNCTION get_public_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_columns(text) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION get_public_tables() IS 'Returns a list of all public tables in the database. Used by admin database browser.';
COMMENT ON FUNCTION get_table_columns(text) IS 'Returns column metadata for a specific table. Used by admin database browser.';

