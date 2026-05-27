-- ============================================================
-- Setup Cron Job for Inventory Stock Updates
-- Runs every 10 minutes to check for stock changes via InventoryLog
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to call Edge Function
CREATE OR REPLACE FUNCTION trigger_inventory_stock_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Call the Edge Function using pg_net
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL')
      || '/functions/v1/update-inventory-stock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
      )
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Triggered inventory stock update, request ID: %', request_id;
END;
$$;

-- Schedule cron job to run every 10 minutes
SELECT cron.schedule(
  'update-inventory-stock-every-10min',  -- Job name
  '*/10 * * * *',                        -- Every 10 minutes
  $$SELECT trigger_inventory_stock_update()$$
);

-- Note: this reads secrets from Supabase Vault:
-- - SUPABASE_URL
-- - SUPABASE_SERVICE_ROLE_KEY
