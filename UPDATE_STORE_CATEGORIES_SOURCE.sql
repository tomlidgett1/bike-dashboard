-- Update store_categories to allow display_override source type
ALTER TABLE store_categories DROP CONSTRAINT IF EXISTS store_categories_source_check;
ALTER TABLE store_categories ADD CONSTRAINT store_categories_source_check 
  CHECK (source IN ('lightspeed', 'custom', 'display_override'));





