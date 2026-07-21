-- pg_trgm lives in the extensions schema on this project.
-- search_supplier_catalogue had search_path = public only, so similarity() failed.
ALTER FUNCTION public.search_supplier_catalogue(TEXT, JSONB, INTEGER)
  SET search_path = public, extensions;
